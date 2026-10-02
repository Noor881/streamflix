const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Discovery = require('../discovery-core.js');
const SEO = require('../seo-core.js');
const render = require('../api/render.js');
const {routeForURL} = require('../scripts/dev-server.cjs');
const {staticRoutes,validateSnapshot} = require('../generate-sitemap.js');

test('discovery UMD registry exposes the same immutable definitions in Node and a browser',()=>{
    const sandbox = {window:{},URL,URLSearchParams};
    vm.runInNewContext(fs.readFileSync('discovery-core.js','utf8'),sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.DiscoveryCore.languages)),JSON.parse(JSON.stringify(Discovery.languages)));
    assert.deepEqual(Discovery.languages.map(item=>item.code),['hi','ta','te','ml','pa']);
    assert.deepEqual(Discovery.collections.map(item=>item.slug),['marvel-universe','mind-bending','weekend-binge','family-night']);
    assert.equal(Object.isFrozen(Discovery.collections),true);
    assert.equal(Object.isFrozen(Discovery.collections[0].filter),true);
});

test('collection queries use verified production and theme IDs and truthful media filters',()=>{
    const marvel = Discovery.collectionQuery('marvel-universe',2);
    assert.equal(marvel.endpoint,'/discover/movie');
    assert.equal(marvel.params.with_companies,'420');
    assert.equal(marvel.params.page,2);
    assert.equal(Discovery.collectionQuery('mind-bending').params.with_keywords,'4379|10854|346773|175629');
    const weekend = Discovery.collectionQuery('weekend-binge');
    assert.equal(weekend.type,'tv');
    assert.equal(weekend.params.with_genres,'18|80');
    assert.equal(weekend.params['vote_average.gte'],7);
    assert.equal(weekend.params['vote_count.gte'],200);
    assert.equal(Discovery.collectionQuery('family-night').params.with_genres,'16|10751');
    for (const item of Discovery.collections) assert.equal(Discovery.collectionQuery(item.slug).params.include_adult,false);
    assert.throws(()=>Discovery.collectionQuery('not-a-collection'));
    for(const page of [0,501,'two',-1,1.5,Infinity]) assert.throws(()=>Discovery.collectionQuery('marvel-universe',page));
});

test('Indian queries require a supported original language and Indian origin in both media types',()=>{
    for (const language of Discovery.languages) for(const type of ['movie','tv']) {
        const query = Discovery.indianQuery(language.code,type,3);
        assert.equal(query.endpoint,'/discover/'+type);
        assert.equal(query.params.with_origin_country,'IN');
        assert.equal(query.params.with_original_language,language.code);
        assert.equal(query.params.include_adult,false);
        assert.equal(query.params.page,3);
    }
    assert.throws(()=>Discovery.indianQuery('en'));
    assert.throws(()=>Discovery.indianQuery('hi','person'));
});

test('public discovery metadata self-canonicalizes meaningful media type and pagination',()=>{
    const urls = ['/collections','/indian',...Discovery.collections.map(item=>'/collections/'+item.slug),...Discovery.languages.flatMap(item=>['/indian/'+item.code,'/indian/'+item.code+'?type=tv'])];
    for(const url of urls) {
        const meta = SEO.describe(url);
        assert.equal(meta.status,200,url);
        assert.equal(meta.noindex,false,url);
        assert.equal(meta.canonical,SEO.SITE+url,url);
    }
    const series = SEO.describe('/indian/ta?page=2&type=tv&utm_source=test');
    assert.equal(series.canonical,SEO.SITE+'/indian/ta?type=tv&page=2');
    assert.equal(series.type,'tv');
    assert.match(series.title,/Tamil Series — Page 2/);
    assert.equal(SEO.describe('/indian/hi?type=movie&page=1').canonical,SEO.SITE+'/indian/hi');
    assert.equal(SEO.describe('/collections/weekend-binge?page=2').canonical,SEO.SITE+'/collections/weekend-binge?page=2');
    assert.equal(SEO.describe('/collections/weekend-binge').type,'tv');
});

test('malformed discovery routes and parameters return real 404 metadata',()=>{
    for(const url of ['/collections/nope','/collections/family-night/extra','/indian/en','/indian/hi/extra','/for-you/private','/indian/hi?type=person','/indian/hi?type=','/collections/marvel-universe?type=tv','/collections?page=2','/for-you?page=2','/indian/hi?page=0','/indian/hi?page=501','/indian/hi?page=two','/indian/hi?page=','/indian/hi?page=1&page=2','/indian/hi?type=tv&type=movie']) {
        assert.equal(SEO.describe(url).status,404,url);
    }
    assert.equal(Discovery.parseRoute('/movies'),null);
});

test('preview and Vercel route wiring preserve discovery path identity and query state',()=>{
    assert.deepEqual(routeForURL(new URL('/collections/mind-bending?page=2&route=search',SEO.SITE)),{page:'2',route:'collections',id:'mind-bending'});
    assert.deepEqual(routeForURL(new URL('/indian/te?type=tv&page=4',SEO.SITE)),{type:'tv',page:'4',route:'indian',id:'te'});
    assert.deepEqual(routeForURL(new URL('/for-you',SEO.SITE)),{route:'for-you'});
    assert.equal(routeForURL(new URL('/indian/hi/extra',SEO.SITE)),null);
    const config = require('../vercel.json');
    for(const path of ['/collections','/collections/:id','/indian','/indian/:id','/for-you']) assert.ok(config.rewrites.some(rule=>rule.source===path));
    assert.match(config.functions['api/render.js'].includeFiles,/discovery-core\.js/);
});

test('For You SSR is generic and private without requests, title cards or private collection schema',async()=>{
    const previous = global.fetch;
    let requests = 0;
    global.fetch = async()=>{requests++;throw new Error('SSR must not fetch private seed titles');};
    const response = {statusCode:200,headers:{},html:'',setHeader(key,value){this.headers[key.toLowerCase()]=value;},end(html){this.html=String(html || '');}};
    try {await render({url:'/for-you',query:{route:'for-you'}},response);} finally {global.fetch=previous;}
    assert.equal(response.statusCode,200);
    assert.equal(requests,0);
    assert.equal(response.headers['cache-control'],'private, no-store');
    assert.equal(response.headers['x-robots-tag'],'noindex, follow');
    assert.match(response.html,/<h1>For You<\/h1>/);
    assert.match(response.html,/saved or recently viewed in this browser/);
    assert.equal(response.html.includes('card-wrapper'),false);
    assert.equal(response.html.includes('page-schema'),false);
    assert.equal(SEO.describe('/for-you').noindex,true);
});

test('sitemap adds every public discovery entry point while preserving all existing titles and omitting private recommendations',()=>{
    const urls = validateSnapshot(fs.readFileSync('sitemap.xml','utf8'));
    for(const route of ['/collections','/indian',...Discovery.collections.map(item=>'/collections/'+item.slug),...Discovery.languages.flatMap(item=>['/indian/'+item.code,'/indian/'+item.code+'?type=tv'])]) {
        assert.ok(staticRoutes.includes(route),route);
        assert.ok(urls.includes(SEO.SITE+route),route);
    }
    assert.equal(staticRoutes.includes('/for-you'),false);
    assert.equal(urls.includes(SEO.SITE+'/for-you'),false);
    assert.ok(urls.length>=2029);
});

function mockResponse() {
    return {statusCode:200,headers:{},html:'',setHeader(key,value){this.headers[key.toLowerCase()]=value;},end(html){this.html=String(html || '');}};
}
async function withMetadata(run) {
    const previous = global.fetch, requests = [];
    global.fetch = async input=>{
        const url = new URL(input);requests.push(url);
        const type = url.pathname.endsWith('/tv')?'tv':'movie';
        return {ok:true,status:200,json:async()=>({results:[{id:type==='tv'?1396:550,[type==='tv'?'name':'title']:type==='tv'?'Example Series':'Example Movie',poster_path:'/example.jpg',vote_average:8,genre_ids:[18]}],page:Number(url.searchParams.get('page')||1),total_pages:5,total_results:100})};
    };
    try {await run(requests);} finally {global.fetch=previous;}
}

test('public collection SSR uses one correct filtered page and emits crawleable portrait cards and pagination',async()=>{
    for(const collection of Discovery.collections) await withMetadata(async requests=>{
        const response = mockResponse();
        await render({url:'/collections/'+collection.slug+'?page=2',query:{route:'collections',id:collection.slug,page:'2'}},response);
        assert.equal(response.statusCode,200,collection.slug);
        assert.equal(requests.length,1,collection.slug);
        const expected = Discovery.collectionQuery(collection.slug,2);
        assert.equal(requests[0].pathname,'/3'+expected.endpoint);
        for(const [name,value] of Object.entries(expected.params)) assert.equal(requests[0].searchParams.get(name),String(value),name);
        assert.ok(response.html.includes(collection.name));
        assert.ok(response.html.includes('class="card-poster"'));
        assert.ok(response.html.includes('/collections/'+collection.slug+'?page=3'));
        assert.ok(response.html.includes('id="page-schema"'));
    });
});

test('every Indian language SSR keeps origin, original language, media type and paginated canonical URLs',async()=>{
    for(const language of Discovery.languages) for(const type of ['movie','tv']) await withMetadata(async requests=>{
        const response = mockResponse(), query = {route:'indian',id:language.code,page:'2',...(type==='tv'?{type:'tv'}:{})};
        await render({url:Discovery.routeURL('indian',language.code,{type,page:2}),query},response);
        assert.equal(response.statusCode,200,language.code+' '+type);
        assert.equal(requests.length,1);
        assert.equal(requests[0].pathname,'/3/discover/'+type);
        assert.equal(requests[0].searchParams.get('with_original_language'),language.code);
        assert.equal(requests[0].searchParams.get('with_origin_country'),'IN');
        assert.equal(requests[0].searchParams.get('page'),'2');
        assert.ok(response.html.includes(language.name));
        assert.ok(response.html.includes('class="card-poster"'));
        const canonical = response.html.match(/<link rel="canonical" href="([^"]+)"/)[1].replace(/&amp;/g,'&');
        assert.equal(canonical,SEO.SITE+Discovery.routeURL('indian',language.code,{type,page:2}));
    });
});

test('unknown discovery pages are nonindexable 404 responses without requesting metadata',async()=>{
    for(const query of [{route:'collections',id:'unknown'},{route:'indian',id:'en'},{route:'indian',id:'hi',type:'person'},{route:'collections',id:'family-night',page:'501'}]) await withMetadata(async requests=>{
        const response = mockResponse();
        await render({query},response);
        assert.equal(response.statusCode,404);
        assert.equal(response.headers['x-robots-tag'],'noindex, follow');
        assert.equal(requests.length,0);
    });
});

test('duplicate discovery query parameters remain rejected after route adapters flatten the query object',async()=>{
    for(const url of ['/collections/mind-bending?page=1&page=2','/indian/hi?type=movie&type=tv']) await withMetadata(async requests=>{
        const response = mockResponse();
        await render({url,query:routeForURL(new URL(url,SEO.SITE))},response);
        assert.equal(response.statusCode,404,url);
        assert.equal(response.headers['x-robots-tag'],'noindex, follow');
        assert.equal(requests.length,0);
    });
});

test('discovery SSR schema includes exactly the filtered visible grid without duplicate or excluded titles',async()=>{
    const previous = global.fetch;
    global.fetch = async()=>({ok:true,status:200,json:async()=>({page:1,total_pages:1,total_results:6,results:[
        {id:550,title:'Visible Title',vote_average:8,poster_path:'/example.jpg'},
        {id:550,title:'Duplicate Title'},
        {id:928480,title:'Excluded Title'},
        {id:2,title:'Adult Title',adult:true},
        {id:'invalid',title:'Malformed Title'},
        {id:3,title:'Wrong Media Type',media_type:'tv'}
    ]})});
    const response = mockResponse();
    try {await render({url:'/collections/mind-bending',query:{route:'collections',id:'mind-bending'}},response);} finally {global.fetch=previous;}
    assert.equal(response.statusCode,200);
    const schema = JSON.parse(response.html.match(/<script id="page-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(schema.mainEntity.itemListElement.map(item=>item.name),['Visible Title']);
    assert.ok(response.html.includes('class="card-info-title">Visible Title'));
});
