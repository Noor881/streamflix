const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');
function preferences(raw,blocked=false){
 const values=new Map([['streamflix_my_list',raw]]);
 const c={window:{},setTimeout,clearTimeout,AbortController,localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){if(blocked && k.endsWith('_recovery_backup'))throw Error('blocked');values.set(k,v);},removeItem:k=>values.delete(k)},document:{},location:{hostname:'localhost'}};
 vm.runInNewContext(read('site-core.js'),c);return {c,values};
}
for(const raw of ['[null]','{broken','{}'])test('invalid saved list recovers without losing backup: '+raw,()=>{
 const {c,values}=preferences(raw);assert.equal(c.window.Watchlist.read().length,0);assert.equal(values.get('streamflix_my_list_recovery_backup'),raw);
});
test('valid saved titles survive malformed neighboring records and poster fields',()=>{
 const {c,values}=preferences(JSON.stringify([null,{id:550,title:'Example',poster:99},{id:550,name:'TV',media_type:'tv'}]));
 const list=c.window.Watchlist.read();assert.equal(list.length,2);assert.equal(list[0].poster,'');assert.ok(values.has('streamflix_my_list_recovery_backup'));
});
test('blocked recovery backup leaves original saved data untouched',()=>{const raw='[null,{"id":550}]';const {values}=preferences(raw,true);assert.equal(values.get('streamflix_my_list'),raw);});
test('deadline works without native AbortSignal.timeout',async()=>{const {c}=preferences('[]');c.fetch=()=>new Promise(()=>{});await assert.rejects(c.window.fetchWithDeadline('/test',{},5),/timed out/);});
for(const failure of ['open','put'])test('cache '+failure+' failure preserves successful online content',async()=>{
 const c={setTimeout,clearTimeout,AbortController,Response,URL,self:{addEventListener(){},location:{origin:'https://example.org'}},fetch:async()=>new Response('Online'),caches:{open:async()=>{if(failure==='open')throw Error('blocked');return {put:async()=>{throw Error('quota');}};}}};
 vm.runInNewContext(read('sw.js')+'\nthis.run=networkFirst;',c);const response=await c.run({mode:'cors'},'test');assert.equal(response.status,200);assert.equal(await response.text(),'Online');
});
test('private metadata responses never enter shared worker cache',async()=>{
 let opened=0;const c={setTimeout,clearTimeout,AbortController,Response,URL,self:{addEventListener(){},location:{origin:'https://example.org'}},fetch:async()=>new Response('{}',{headers:{'Cache-Control':'private, no-store'}}),caches:{open:async()=>{opened++;}}};
 vm.runInNewContext(read('sw.js')+'\nthis.run=networkFirst;',c);assert.equal((await c.run({},'test')).status,200);assert.equal(opened,0);
});
function detail(){
 const grid={innerHTML:'',scrollTo(){}},copies=[];let sourceWrites=0;
 const c={console:{error(){}},URL,URLSearchParams,AbortSignal,navigator:{},history:{replaceState(){}},window:{SiteSEO:require('../seo-core.js'),addEventListener(){}},document:{addEventListener(){},getElementById:id=>id==='episodes-grid'?grid:id==='video-player'?{set src(v){sourceWrites++;},scrollIntoView(){}}:null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>({setAttribute(){},select(){},focus(){}}),body:{appendChild:t=>copies.push(t),removeChild:t=>copies.splice(copies.indexOf(t),1)},execCommand:()=>true}};
 vm.createContext(c);vm.runInContext(read('detail.js')+'\nthis.api={DetailPage,loadEpisodes};saveToHistory=()=>{};showToast=()=>{};',c);
 c.api.DetailPage.currentData={id:999999,name:'Example'};c.api.DetailPage.currentType='tv';c.api.DetailPage.currentSeason=1;c.api.DetailPage.currentEpisode=1;
 return {c,grid,copies,writes:()=>sourceWrites};
}
test('old failed season request cannot overwrite current episode grid',async()=>{
 const {c,grid}=detail();let reject;c.mock=()=>new Promise((_,r)=>reject=r);vm.runInContext('fetchWithRetry=()=>mock();',c);
 const work=c.api.loadEpisodes(999999,1,1);c.api.DetailPage.currentSeason=2;grid.innerHTML='New season';reject(Error('old'));await work;assert.equal(grid.innerHTML,'New season');
});
test('season change updates player once',()=>{const {c,writes}=detail();vm.runInContext('loadEpisodes=()=>{};',c);c.api.DetailPage.changeSeason(999999,2);assert.equal(writes(),1);});
test('1547 episodes render only one bounded range containing direct episode',async()=>{
 const {c,grid,writes}=detail();c.api.DetailPage.currentEpisode=1500;c.fixture={episodes:Array.from({length:1547},(_,i)=>({episode_number:i+1,name:'Episode '+(i+1)}))};vm.runInContext('fetchWithRetry=async()=>fixture;',c);
 await c.api.loadEpisodes(999999,1,1500);assert.equal((grid.innerHTML.match(/class="episode-card/g)||[]).length,40);assert.match(grid.innerHTML,/data-episode="1500"/);assert.match(grid.innerHTML,/1481–1520 of 1547/);
 c.api.DetailPage.changeEpisodePage(1);assert.equal((grid.innerHTML.match(/class="episode-card/g)||[]).length,27);assert.equal(writes(),0);
});
test('missing clipboard API uses actual fallback and failed copy leaves manual link',async()=>{
 const {c,copies}=detail();assert.equal(await c.api.DetailPage.copyLink('https://example.org/title'),true);assert.equal(copies.length,0);c.document.execCommand=()=>false;assert.equal(await c.api.DetailPage.copyLink('https://example.org/title'),false);assert.equal(copies[0].value,'https://example.org/title');
});
test('metadata proxy validates requests, hides upstream credentials and preserves error semantics',async()=>{
 const TMDB=require('../server/tmdb.js'),original=TMDB.request;let calls=0;
 function request(endpoint,params={}){const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};return require('../api/metadata.js')({method:'GET',query:{endpoint,...params}},res).then(()=>res);}
 try{
 TMDB.request=async()=>{calls++;return {ok:true,json:async()=>({results:[{id:1}],total_pages:1})};};
 for(const endpoint of ['https://evil.example','/configuration','/movie/0'])assert.equal((await request(endpoint)).statusCode,400);
 assert.equal((await request('/movie/popular',{api_key:'test'})).statusCode,400);assert.equal((await request('/movie/popular',{page:501})).statusCode,400);assert.equal(calls,0);
 const first=await request('/movie/popular',{page:37}),second=await request('/movie/popular',{page:37});assert.equal(first.statusCode,200);assert.deepEqual(first.body,second.body);assert.equal(calls,1);
 await request('/search/multi',{query:'private-test'});await request('/search/multi',{query:'private-test'});assert.equal(calls,3);
 TMDB.request=async()=>({ok:true,json:async()=>({wrong:true})});const invalid=await request('/tv/popular',{page:38});assert.equal(invalid.statusCode,503);assert.equal(invalid.headers['Retry-After'],'60');
 TMDB.request=async()=>({ok:false,status:404});assert.equal((await request('/movie/999999998')).statusCode,404);
 assert.equal(TMDB.redact('https://example.org?api_key=secret&token=private').includes('secret'),false);
 }finally{TMDB.request=original;}
});
test('build validates saved sitemap without fetching metadata; browser assets contain no API credential assignment',()=>{
 assert.doesNotMatch(read('scripts/build.cjs'),/generateSitemap\(/);
 for(const file of ['app.js','detail.js','404.html'])assert.doesNotMatch(read(file),/(?:TMDB_API_KEY|TMDB_KEY|KEY)\s*[:=]\s*['"][a-f\d]{32}['"]/);
 const policy=require('../vercel.json').headers.flatMap(x=>x.headers).find(x=>x.key==='Content-Security-Policy').value;assert.ok(!policy.includes('unsafe-eval'));assert.ok(policy.includes("object-src 'none'"));
});
