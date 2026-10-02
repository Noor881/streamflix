const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const appSource = fs.readFileSync('app.js','utf8');
function appContext() {
    const app={innerHTML:'',style:{}};
    const storage=new Map();
    const context={console,URL,URLSearchParams,AbortSignal,Promise,Map,Set,Date,Math,JSON,Number,String,parseInt,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false}),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},navigator:{},fetch:async()=>({ok:true,json:async()=>({results:[],total_pages:1})})};
    const document={hidden:false,body:{style:{}},addEventListener(){},getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[]};
    context.document=document;context.window={SiteSEO:require('../seo-core.js'),history:{pushState(){},replaceState(){}},location:{hash:'#/',pathname:'/',search:''},addEventListener(){},scrollTo(){},Watchlist:{read:()=>[]}};
    vm.createContext(context);vm.runInContext(appSource+'\nthis.testing={tmdbAPI,router,pages,components,routeTarget};',context);
    return {...context,app,context};
}
test('catalog fetches selected API page, not 125 pages',async()=>{
    const c=appContext(),urls=[];
    c.context.fetch=async url=>{urls.push(String(url));return {ok:true,json:async()=>({results:[{id:1}],total_pages:400,total_results:8000})};};
    const data=await c.testing.tmdbAPI.getPopularMovies({page:7});
    assert.equal(urls.length,1);assert.equal(new URL(urls[0]).searchParams.get('page'),'7');assert.equal(data.total_pages,400);
});
test('route generation rejects a stale async render',()=>{
    const c=appContext(),old=c.testing.routeTarget();
    c.testing.pages.home=()=>{};c.testing.router.handleRoute();
    const current=c.testing.routeTarget();current.innerHTML='new';old.innerHTML='old';assert.equal(c.app.innerHTML,'new');
});
test('clean URL search forwards query and page',()=>{
    const c=appContext();let args;
    c.window.location={hash:'',pathname:'/search',search:'?q=batman&page=2'};
    c.testing.pages.search=(...value)=>args=value;c.testing.router.handleRoute();assert.deepEqual(args,['batman',2]);
});
test('cards escape titles and Trending owns only one row ID',()=>{
    const c=appContext(),card=c.testing.components.card({id:1,title:'<img src=x onerror=alert(1)>',poster_path:'/x.jpg'});
    assert.ok(card.includes('&lt;img'));assert.ok(!card.includes('<h3 class="card-info-title"><img'));
    const html=c.testing.components.sectionWithRightTabs('Trending',c.testing.components.contentRow([{id:1,title:'A'}],'movie','row-trending'),'row-trending');
    assert.equal((html.match(/id="row-trending"/g)||[]).length,1);
});
test('TV slug URL retains season and episode',()=>{
    const pattern=/\/tv\/(\d+)(?:-[^/]+)?(?:\/(\d+))?(?:\/(\d+))?/;
    assert.deepEqual('/tv/1396-breaking-bad/2/3'.match(pattern).slice(1),['1396','2','3']);
    assert.ok(fs.readFileSync('server/templates/tv.html','utf8').includes(String(pattern)));
});
test('watchlist migration keeps same numeric ID for movie and TV',()=>{
    const data=new Map([['watchlist',JSON.stringify([{id:10,title:'Movie',type:'movie',poster:'https://image.tmdb.org/t/p/w342/a.jpg'}])],['streamflix_my_list',JSON.stringify([{id:10,name:'TV',media_type:'tv'}])]]);
    const c={window:{},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},document:{},location:{hostname:'localhost'}};
    vm.runInNewContext(fs.readFileSync('site-core.js','utf8'),c);
    assert.equal(c.window.Watchlist.read().length,2);assert.equal(c.window.Watchlist.read().find(i=>i.type==='movie').poster_path,'/a.jpg');assert.equal(data.has('watchlist'),false);
});
test('analytics is not loaded without opt-in and disabling sets kill switch',()=>{
    let requests=0;const values=new Map();
    const c={window:{},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},document:{cookie:'',createElement:()=>({}),head:{appendChild:()=>requests++}},location:{hostname:'localhost'}};
    vm.runInNewContext(fs.readFileSync('site-core.js','utf8'),c);assert.equal(requests,0);
    c.window.AnalyticsConsent.set(true);assert.equal(requests,1);
    c.window.AnalyticsConsent.set(false);assert.equal(c.window['ga-disable-G-ZHQKVYP1WN'],true);
});
test('rendered initial HTML contains unique canonical and safe title/schema',async()=>{
    const render=require('../api/render.js');const original=global.fetch;
    global.fetch=async()=>({ok:true,json:async()=>({id:550,title:'Fight <Club>',overview:'A & B',release_date:'1999-10-15',poster_path:'/x.jpg'})});
    try {let html;const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){html=value;}};
        await render({query:{route:'movie',id:'550-fight-club'}},res);
        assert.ok(html.includes('<title>Fight &lt;Club&gt; (1999) — Movie | HD Watchzone</title>'));
        assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
        assert.ok(html.includes('https://hdwatchzone.com/movie/550-fight-club'));
        assert.ok(html.includes('"@type":"Movie"'));assert.ok(!html.includes('VideoObject'));
    } finally {global.fetch=original;}
});
test('cache policy revalidates mutable assets and SW never drops a sync queue',()=>{
    const config=require('../vercel.json');assert.ok(!JSON.stringify(config.headers).includes('31536000, immutable'));
    const sw=fs.readFileSync('sw.js','utf8');assert.ok(!sw.includes('/api/sync-watchlist'));assert.ok(sw.includes("event.request.method !== 'GET'"));assert.ok(sw.includes('12000'));
});
test('sitemap generator keeps categories and excludes private pages',()=>{
    const {staticRoutes}=require('../generate-sitemap.js');assert.ok(staticRoutes.includes('/movies'));assert.ok(staticRoutes.includes('/genre/28'));assert.ok(!staticRoutes.includes('/account'));
});
test('homepage waits for only its six visible data sources including Indian catalogs',async()=>{
    const c=appContext(),calls=[];
    c.context.fetch=async url=>{calls.push(String(url));return {ok:true,json:async()=>({results:[{id:1,title:'A',name:'A',media_type:'movie',genre_ids:[],vote_average:8}],total_pages:10})};};
    await c.testing.pages.home();assert.equal(calls.length,6);
});
test('metadata outages return retryable 503, not an indexable generic movie',async()=>{
    const render=require('../api/render.js'),original=global.fetch;
    global.fetch=async()=>{throw new Error('Unavailable');};
    try {let html;const headers={};const res={setHeader(key,value){headers[key]=value;},end(value){html=value;}};await render({query:{route:'movie',id:'550'}},res);assert.equal(res.statusCode,503);assert.equal(headers['Retry-After'],'60');assert.equal(headers['X-Robots-Tag'],'noindex, follow');assert.ok(html.includes('<title>Temporarily unavailable | HD Watchzone</title>'));} finally {global.fetch=original;}
});
test('initial category metadata and privacy-sensitive noindex are emitted before JS',async()=>{
    const render=require('../api/render.js'),original=global.fetch;
    global.fetch=async()=>({ok:true,json:async()=>({results:[{id:550,title:'Fight Club',media_type:'movie',genre_ids:[],vote_average:8}],total_pages:10})});
    try {
        for(const route of ['movies','tv','anime','new','account','my-list','search']) {
            let html;const res={setHeader(){},end(value){html=value;}};await render({query:{route}},res);
            assert.ok(html.includes(`https://hdwatchzone.com/${route}`));
            if(['account','my-list','search'].includes(route)) assert.ok(html.includes('name="robots" content="noindex, follow"'));
        }
    } finally {global.fetch=original;}
});
test('SW passes opaque images and real 404s through unchanged',async()=>{
    const cache={put:async()=>{},keys:async()=>[],match:async()=>null};
    const c={setTimeout,clearTimeout,AbortController,self:{addEventListener(){},location:{origin:'http://localhost'}},caches:{open:async()=>cache},AbortSignal,URL,Response,fetch:async()=>({type:'opaque',status:0,ok:false,clone(){return this;}})};
    vm.runInNewContext(fs.readFileSync('sw.js','utf8')+'\nthis.readNetwork=networkFirst;',c);
    assert.equal((await c.readNetwork({mode:'no-cors'},'images')).type,'opaque');
    c.fetch=async()=>({ok:false,status:404,type:'basic'});assert.equal((await c.readNetwork({mode:'navigate'},'static')).status,404);
});
