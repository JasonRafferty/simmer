#!/usr/bin/env python3
"""Index user-supplied RecipeNLG candidates; queue a diverse, bounded first batch."""
import argparse,csv,json,sqlite3,random,hashlib,os,re,urllib.parse,collections

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('csv');parser.add_argument('--data-dir',default=os.environ.get('DATA_DIR','data'))
parser.add_argument('--limit',type=int,default=1000)
parser.add_argument('--hosts',default='food.com',help='Comma-separated source hosts approved for retrieval')
args=parser.parse_args()
if not 1<=args.limit<=10000:parser.error('limit must be 1–10000')
hosts=set(args.hosts.lower().split(','));rng=random.Random(42);eligible=0;scanned=0;indexed=0
os.makedirs(args.data_dir,exist_ok=True)
db=sqlite3.connect(os.path.join(args.data_dir,'catalogue.db'),timeout=30)
db.execute('PRAGMA journal_mode=WAL')
db.execute("CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,url TEXT UNIQUE NOT NULL,title TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,priority INTEGER NOT NULL DEFAULT 0)")
if 'priority' not in {r[1] for r in db.execute('PRAGMA table_info(candidates)')}:db.execute('ALTER TABLE candidates ADD COLUMN priority INTEGER NOT NULL DEFAULT 0')
db.execute("CREATE VIRTUAL TABLE IF NOT EXISTS candidate_search USING fts5(id UNINDEXED,title,ingredients,tokenize='unicode61 remove_diacritics 2')")
db.commit()
known_index_ids={row[0] for row in db.execute('SELECT id FROM candidate_search')}
cuisine_words=['italian','indian','chinese','mexican','thai','japanese','greek','french','spanish','korean','vietnamese','lebanese','turkish','moroccan','ethiopian','jamaican','brazilian','portuguese','indonesian','malaysian','filipino','pakistani','persian','egyptian','polish','german','irish','cajun','caribbean','african','middle eastern']
style_patterns={'curries':r'\bcurry|curries|korma|vindaloo\b','stir-fry':r'stir[- ]?fr','salads':r'\bsalad\b','soups':r'\bsoup|broth|chowder\b','stews':r'\bstew|tagine|casserole\b','grill':r'\bgrill|barbecue|bbq|kebab\b','noodles':r'\bnoodles?|ramen|pho\b','rice':r'\brisotto|biryani|paella|rice\b','wraps':r'\btacos?|wraps?|burritos?\b','pasta':r'\bpasta|spaghetti|lasagn[ae]|penne\b','fish':r'\bsalmon|cod|fish|prawn|shrimp\b','vegetables':r'\blentil|chickpea|aubergine|eggplant|vegetarian|vegan\b','pizza':r'\bpizza\b','pies':r'\bpie|pastry|tart\b','sandwiches':r'\bburger|sandwich\b'}
# Keep a bounded reservoir per bucket; pick round-robin so large buckets cannot dominate.
reservoirs=collections.defaultdict(list);seen=collections.Counter();batch=[]
def flush():
    global indexed
    with db:
        for entry,ingredients in batch:
            inserted=db.execute("INSERT OR IGNORE INTO candidates(id,url,title,data,status) VALUES(?,?,?,?,'unprocessed')",entry).rowcount
            if inserted:
                db.execute('INSERT INTO candidate_search(id,title,ingredients) VALUES(?,?,?)',(entry[0],entry[2],' '.join(ingredients)));indexed+=1;known_index_ids.add(entry[0])
            elif entry[0] not in known_index_ids:
                db.execute('INSERT INTO candidate_search(id,title,ingredients) VALUES(?,?,?)',(entry[0],entry[2],' '.join(ingredients)))
                known_index_ids.add(entry[0])
    batch.clear()
with open(args.csv,newline='',encoding='utf-8-sig') as f:
    reader=csv.DictReader(f)
    if not {'title','ingredients','directions','link'}.issubset(reader.fieldnames or []):raise SystemExit('Not a RecipeNLG CSV')
    for row in reader:
        scanned+=1
        link=row['link'].strip();url=urllib.parse.urlparse(link if '://' in link else 'https://'+link)
        host=(url.hostname or '').lower().removeprefix('www.')
        if host not in hosts or url.username or url.password:continue
        title=row['title'].strip()
        if not title:continue
        try:
            ingredients=json.loads(row['ingredients']);directions=json.loads(row['directions'])
            if not ingredients or not directions or not all(isinstance(x,str) for x in ingredients+directions):continue
        except (ValueError,TypeError):continue
        canonical=url._replace(scheme='https',fragment='').geturl()
        entry=('nlg-'+hashlib.sha256(canonical.encode()).hexdigest()[:24],canonical,title,json.dumps({'name':title,'ingredients':ingredients,'instructions':'\n\n'.join(directions)},ensure_ascii=False))
        eligible+=1;batch.append((entry,ingredients))
        if len(batch)>=2000:flush()
        if re.search(r'\b(cookie|cookies|cake|cakes|frosting|cocktail|smoothie|juice|candy|candies|brownies)\b',title,re.I):continue
        low=title.lower();buckets=['cuisine:'+x for x in cuisine_words if re.search(r'\b'+re.escape(x)+r'\b',low)]
        if not buckets:buckets=['style:'+x for x,p in style_patterns.items() if re.search(p,low)]
        bucket=rng.choice(buckets) if buckets else 'other'
        seen[bucket]+=1;pool=reservoirs[bucket]
        if len(pool)<args.limit:pool.append(entry[0])
        else:
            j=rng.randrange(seen[bucket])
            if j<args.limit:pool[j]=entry[0]
        if eligible%50000==0:print(f'Scanned {scanned:,}; indexed {eligible:,} candidates',flush=True)
flush()
# Cuisine buckets first, then food styles; cycle until the requested batch is filled.
keys=sorted(reservoirs,key=lambda k:(not k.startswith('cuisine:'),k=='other',k))
selected=[];unique=set();i=0
while len(selected)<args.limit:
    changed=False
    for key in keys:
        if i<len(reservoirs[key]):
            candidate=reservoirs[key][i]
            if candidate not in unique:selected.append(candidate);unique.add(candidate);changed=True
            if len(selected)>=args.limit:break
    if not changed:break
    i+=1
with db:
    for candidate in selected:db.execute("UPDATE candidates SET status='pending',priority=MAX(priority,1) WHERE id=? AND status IN ('pending','unprocessed')",(candidate,))
print(json.dumps({'scanned':scanned,'eligible':eligible,'newlyIndexed':indexed,'queued':len(selected),'candidateBuckets':dict(seen),'totalCandidates':db.execute('SELECT count(*) FROM candidates').fetchone()[0]}),flush=True)
db.close()
