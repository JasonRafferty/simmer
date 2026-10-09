#!/usr/bin/env python3
"""Stage the public sandhaka Tasty dataset with verified, locally downloaded photos."""
import argparse,collections,concurrent.futures,hashlib,html,http.client,ipaddress,json,math,os,re,socket,sqlite3,time,unicodedata
from pathlib import Path
from urllib.parse import urlparse,urlencode,urlunparse,parse_qsl
from urllib.request import Request,build_opener,HTTPRedirectHandler,HTTPSHandler
from urllib.error import HTTPError
from importlib.util import spec_from_file_location,module_from_spec

spec=spec_from_file_location('archive_import',Path(__file__).with_name('import-archive.py'))
archive_import=module_from_spec(spec);spec.loader.exec_module(archive_import)
def clean(value):
    if not isinstance(value,str):return ''
    for _ in range(2):
        if not any(char in value for char in ['Â','Ã','â']):break
        try:value=value.encode('latin1').decode('utf8')
        except (UnicodeEncodeError,UnicodeDecodeError):break
    return html.unescape(value).strip()
def title_key(value):return re.sub(r'[^\w]+',' ',unicodedata.normalize('NFKD',value).lower(),flags=re.UNICODE).strip()
def allowed(url):
    u=urlparse(url)
    return u.scheme=='https' and u.hostname=='img.buzzfeed.com' and not u.username and u.port in (None,443)
class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not allowed(newurl):raise ValueError('Unexpected photo redirect')
        return super().redirect_request(req,fp,code,msg,headers,newurl)
class PhotoAddress(HTTPSHandler):
    """Optional DNS diagnostic fallback; retains hostname and normal TLS verification."""
    def __init__(self,address):super().__init__();self.address=address
    def https_open(self,req):
        if not allowed(req.full_url):raise ValueError('Unexpected photo host')
        def connect(host,**kwargs):
            connection=http.client.HTTPSConnection(host,**kwargs)
            connection._create_connection=lambda address,timeout=socket._GLOBAL_DEFAULT_TIMEOUT,source_address=None:socket.create_connection((self.address,address[1]),timeout,source_address)
            return connection
        return self.do_open(connect,req,context=self._context)
def stage_recipe(dish,recipe,tags):
    slug=clean(dish.get('recipe_id'));name=clean(dish.get('name'))
    if not re.fullmatch(r'[a-z0-9-]+',slug) or not 1<=len(name)<=180:raise ValueError('invalid_title')
    ingredients=[]
    for item in recipe.get('ingredients',[]):
        # Retain the original quantities: some metric conversions in this dataset disagree.
        ingredient=' '.join(filter(None,[clean(item.get('primary_quantity')),clean(item.get('primary_unit')),clean(item.get('name'))]))
        comment=clean(item.get('comment'))
        if comment:ingredient+=', '+comment
        if not clean(item.get('name')) or len(ingredient)>500:raise ValueError('invalid_ingredients')
        ingredients.append(ingredient)
    steps=recipe.get('instructions',[])
    if not 1<=len(ingredients)<=100 or not isinstance(steps,list) or not steps or not all(clean(s) for s in steps):raise ValueError('incomplete_recipe')
    instructions='\n\n'.join(clean(s) for s in steps)
    if not 30<=len(instructions)<=20000:raise ValueError('invalid_instructions')
    attached=[tags[x] for x in dish.get('tags',[]) if x in tags]
    cuisines=[t['display_name'] for t in attached if t['type']=='cuisine' and t['name'] not in ['seafood','bbq','fusion','soul_food','indigenous']]
    diets=[t['name'].title()+'Diet' for t in attached if t['name'] in ['vegetarian','vegan']]
    def minutes(value):return min(1440,max(0,int(value))) if isinstance(value,(int,float)) and math.isfinite(value) else 0
    return {'providerId':'tasty-'+hashlib.sha256(slug.encode()).hexdigest()[:24],'provider':'Tasty','providerURL':'https://tasty.co/','name':name,'ingredients':ingredients,'instructions':instructions,'servings':2,'yieldUnverified':True,'prep':minutes(dish.get('prep_time')),'cook':minutes(dish.get('cook_time')),'source':'https://tasty.co/recipe/'+slug,'recipeCuisine':cuisines,'recipeCategory':['Dessert'] if any(t['name']=='desserts' for t in attached) else [],'diets':diets,'tagsInferred':False,'datasetURL':'https://github.com/sandhaka/recipes-dataset','datasetLicence':'Repository labelled MIT; underlying Tasty recipe and photo rights remain applicable.'}
def run():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--output',required=True);p.add_argument('--catalogue-root',required=True);p.add_argument('--photo-ip',help='Optional verified public photo-server IP if local DNS is unavailable');a=p.parse_args()
    if a.photo_ip and not ipaddress.ip_address(a.photo_ip).is_global:raise SystemExit('Photo-server address must be public.')
    source=Path(a.input);output=Path(a.output);output.mkdir(parents=True,exist_ok=True);photos=output/'catalogue-images';photos.mkdir(exist_ok=True)
    recipes={r['id']:r for r in json.loads((source/'recipes.json').read_text())};tags={t['id']:t for t in json.loads((source/'tags.json').read_text())};dishes=json.loads((source/'dishes.json').read_text())
    db=sqlite3.connect('file:'+str(Path(a.catalogue_root).resolve()/'catalogue.db')+'?mode=ro',uri=True)
    seen={title_key(json.loads(row[0])['name']) for row in db.execute('SELECT data FROM catalogue')};db.close();excluded=collections.Counter();jobs=[]
    for dish in dishes:
        try:
            recipe=stage_recipe(dish,recipes.get(dish.get('recipe_id'),{}),tags);key=title_key(recipe['name'])
            if key in seen:excluded['duplicate_title']+=1;continue
            url=clean(dish.get('thumbnail_url'))
            if not allowed(url):excluded['missing_or_unsupported_photo']+=1;continue
            seen.add(key);jobs.append((recipe,url))
        except ValueError as e:excluded[str(e)]+=1
    cached={}
    if (output/'recipes.jsonl').exists():
        for line in (output/'recipes.jsonl').read_text().splitlines():
            try:
                row=json.loads(line);image=row.get('image','')
                if re.fullmatch(r'/catalogue-images/[a-f0-9]{64}\.jpg',image) and (output/image.lstrip('/')).is_file():cached[row['providerId']]=image
            except (ValueError,KeyError):continue
    def download(job):
        recipe,url=job;u=urlparse(url);params=dict(parse_qsl(u.query));params.update({'resize':'600:*','output-format':'jpg'});url=urlunparse(u._replace(query=urlencode(params)))
        if recipe['providerId'] in cached:
            recipe['image']=cached[recipe['providerId']];return recipe,None
        for attempt in range(3):
            try:
                handlers=[SafeRedirect()]+([PhotoAddress(a.photo_ip)] if a.photo_ip else [])
                with build_opener(*handlers).open(Request(url,headers={'User-Agent':'SimmerPersonalRecipeImport/1.0','Accept':'image/jpeg'}),timeout=10) as response:
                    data=response.read(6_000_001)
                size=archive_import.jpeg_size(data)
                if len(data)>6_000_000 or not size or not all(64<=n<=10000 for n in size):return None,'invalid_photo'
                name=hashlib.sha256(data).hexdigest()+'.jpg';(photos/name).write_bytes(data);recipe['image']='/catalogue-images/'+name
                return recipe,None
            except HTTPError as error:
                if error.code in (400,401,403,404,410):return None,'unavailable_photo'
                if attempt<2:time.sleep(attempt+1)
            except Exception:
                if attempt<2:time.sleep(attempt+1)
        return None,'unavailable_photo'
    imported=0
    with (output/'recipes.jsonl').open('w') as stream,concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for i,(recipe,error) in enumerate(pool.map(download,jobs),1):
            if error:excluded[error]+=1
            else:stream.write(json.dumps(recipe,ensure_ascii=False)+'\n');imported+=1
            if i%250==0:stream.flush();print(json.dumps({'checked':i,'of':len(jobs),'ready':imported}),flush=True)
    report={'source':'Tasty','rows':len(dishes),'staged':imported,'excluded':dict(excluded),'datasetURL':'https://github.com/sandhaka/recipes-dataset'};(output/'import-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
if __name__=='__main__':run()
