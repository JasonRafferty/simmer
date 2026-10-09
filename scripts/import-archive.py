#!/usr/bin/env python3
"""Import the user-provided Epicurious recipe/image ZIP into a new staging folder."""
import argparse,ast,csv,hashlib,io,json,os,re,struct,zipfile,collections

def jpeg_size(data):
    if not data.startswith(b'\xff\xd8') or not data.endswith(b'\xff\xd9'):return None
    i=2
    while i+4<=len(data):
        if data[i]!=255:i+=1;continue
        while i<len(data) and data[i]==255:i+=1
        if i>=len(data):break
        marker=data[i];i+=1
        if marker in (0xD8,0xD9) or 0xD0<=marker<=0xD7:continue
        if i+2>len(data):break
        length=int.from_bytes(data[i:i+2],'big')
        if length<2 or i+length>len(data):break
        if marker in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF) and length>=7:
            height,width=struct.unpack('>HH',data[i+3:i+7]);return width,height
        if marker==0xDA:break
        i+=length
    return None

def run():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('archive');parser.add_argument('--output',required=True);args=parser.parse_args()
    os.makedirs(args.output,exist_ok=True)
    if os.listdir(args.output):raise SystemExit('Output must be an empty staging directory.')
    images=os.path.join(args.output,'catalogue-images');os.mkdir(images);issues=collections.Counter();count=0;total=0
    with zipfile.ZipFile(args.archive) as z:
        if len(z.infolist())>25000 or sum(i.file_size for i in z.infolist())>1_000_000_000:raise SystemExit('Archive exceeds import limits.')
        for name in z.namelist():
            if name.startswith('/') or '..' in name.replace('\\','/').split('/'):raise SystemExit('Unsafe archive path.')
        csvs=[n for n in z.namelist() if n.lower().endswith('.csv')]
        if len(csvs)!=1:raise SystemExit('Expected exactly one recipe CSV.')
        photos={n.rsplit('/',1)[-1]:n for n in z.namelist() if n.lower().endswith('.jpg')}
        with z.open(csvs[0]) as f,open(os.path.join(args.output,'recipes.jsonl'),'w',encoding='utf-8') as output:
            reader=csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig',newline=''))
            if not {'Title','Ingredients','Instructions','Image_Name'}.issubset(reader.fieldnames or []):raise SystemExit('Unsupported archive columns.')
            for row in reader:
                total+=1;title=(row['Title'] or '').strip();instructions=(row['Instructions'] or '').strip();image_name=(row['Image_Name'] or '').strip()
                if not title or title.lower()=='nan' or len(title)>180:issues['missing_or_invalid_title']+=1;continue
                if not instructions or instructions.lower()=='nan' or len(instructions)<30 or len(instructions)>20000:issues['missing_or_invalid_instructions']+=1;continue
                try:
                    ingredients=ast.literal_eval(row['Ingredients'])
                    if not isinstance(ingredients,list) or not 1<=len(ingredients)<=100 or not all(isinstance(x,str) and x.strip() and len(x)<=500 for x in ingredients):raise ValueError()
                except (ValueError,SyntaxError,TypeError):issues['invalid_ingredients']+=1;continue
                path=photos.get(image_name+'.jpg')
                if not path:issues['missing_photo']+=1;continue
                if z.getinfo(path).file_size>6_000_000:issues['oversized_photo']+=1;continue
                photo=z.read(path);size=jpeg_size(photo)
                if not size or not all(64<=n<=10000 for n in size):issues['invalid_photo']+=1;continue
                filename=hashlib.sha256(photo).hexdigest()+'.jpg'
                with open(os.path.join(images,filename),'wb') as image:image.write(photo)
                # Keep original quantities and instructions. The dataset has no serving counts or timings.
                recipe={'providerId':'epic-'+hashlib.sha256((image_name+'|'+title.casefold()).encode()).hexdigest()[:24],'provider':'Epicurious','providerURL':'https://www.epicurious.com/','name':title,'ingredients':[x.strip() for x in ingredients],'instructions':instructions,'image':'/catalogue-images/'+filename,'servings':2,'yieldUnverified':True,'prep':0,'cook':0,'source':'https://www.epicurious.com/','sourceLabel':'Visit Epicurious','imageName':image_name,'datasetURL':'https://www.kaggle.com/datasets/pes12017000148/food-ingredients-and-recipe-dataset-with-images','datasetLicence':'Uploader labels the dataset CC BY-SA 3.0; original source rights remain applicable.','tagsInferred':True}
                output.write(json.dumps(recipe,ensure_ascii=False)+'\n');count+=1
    report={'rows':total,'eligible':count,'excluded':dict(issues),'archive':os.path.basename(args.archive)}
    with open(os.path.join(args.output,'import-report.json'),'w') as f:json.dump(report,f,indent=2)
    print(json.dumps(report),flush=True)

if __name__=='__main__':run()
