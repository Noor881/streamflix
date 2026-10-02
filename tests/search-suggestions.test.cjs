const test=require('node:test');
const assert=require('node:assert/strict');
const Search=require('../server/search-suggestions.js');
const api=require('../api/search-suggestions.js');
const sitemap='<urlset><url><loc>https://hdwatchzone.com/movie/557-spider-man</loc></url><url><loc>https://hdwatchzone.com/movie/550-fight-club</loc></url></urlset>';
const movie=(id,title,extra={})=>({id,title,media_type:'movie',adult:false,poster_path:'/poster.jpg',release_date:'2002-05-03',...extra});
const ok=results=>({ok:true,json:async()=>({results,total_pages:1})});
function service(responseFor,options={}) {
    const calls=[];
    const suggest=Search.createSearchSuggestions({readSitemap:()=>sitemap,request:async(endpoint,params)=>{calls.push({endpoint,...params});return responseFor(params.query);},...options});
    return {suggest,calls};
}

test('sipierman uses one bounded Damerau correction to Spider-Man only after no exact results',async()=>{
    const {suggest,calls}=service(query=>ok(query==='Spider-Man'?[movie(557,'Spider-Man')]:[]));
    const result=await suggest('sipierman');
    assert.equal(result.query,'sipierman');assert.equal(result.correctedQuery,'Spider-Man');assert.equal(result.results[0].title,'Spider-Man');
    assert.deepEqual(calls,[{endpoint:'/search/multi',query:'sipierman',page:1},{endpoint:'/search/multi',query:'Spider-Man',page:1}]);
    assert.equal(Search.editDistance('sipierman','spiderman',2),2);
});

test('exact-query and prefix results take precedence and textual relevance beats popularity',async()=>{
    const {suggest,calls}=service(()=>ok([movie(2,'Other story',{popularity:9999}),movie(3,'Amazing Spider-Man',{popularity:999}),movie(4,'Spider-Man 2',{popularity:1})]));
    const result=await suggest('spi');
    assert.equal(result.correctedQuery,null);assert.deepEqual(result.results.map(item=>item.id),[4,3,2]);assert.equal(calls.length,1);
    const exact=service(()=>ok([movie(9,'Actual response')]));assert.equal((await exact.suggest('sipierman')).correctedQuery,null);assert.equal(exact.calls.length,1);
});

test('normalization handles accents and punctuation for matching without changing the exact upstream query',async()=>{
    const {suggest,calls}=service(()=>ok([movie(1,'Le Cafe',{popularity:100}),movie(2,'Café: Society',{popularity:1})]));
    const result=await suggest('cafe');assert.equal(result.results[0].id,2);assert.equal(calls[0].query,'cafe');
    assert.equal(Search.normalize('  SPÍDER—MAN! '),'spider man');
});

test('results reject adult, person and malformed identities, dedupe and expose only bounded safe fields',async()=>{
    const valid=movie(1,'Spider-Man',{poster_path:'//evil.example/image.jpg',release_date:'<script>',credits:{secret:'discard'}});
    const {suggest}=service(()=>ok([null,[],movie('2','Bad'),movie(-2,'Bad'),movie(3,'Adult',{adult:true}),movie(6,'Adult unknown',{adult:'true'}),{id:4,name:'Person',media_type:'person'},movie(5,''),valid,valid,{id:1,name:'Spider Show',media_type:'tv',first_air_date:'2020-01-01'},...Array.from({length:12},(_,i)=>movie(20+i,'Spider '+i))]));
    const result=await suggest('spider');assert.equal(result.results.length,8);assert.equal(result.hasMore,true);
    const first=result.results.find(item=>item.id===1 && item.media_type==='movie');assert.equal(first.poster_path,null);assert.equal(first.release_date,'');assert.ok(!('credits' in first));
    assert.equal(result.results.filter(item=>item.id===1 && item.media_type==='movie').length,1);assert.ok(!result.results.some(item=>[3,4,6].includes(item.id)));assert.ok(result.results.every(item=>Number.isSafeInteger(item.id) && ['movie','tv'].includes(item.media_type)));
});

test('correction makes at most two upstream calls and absent sitemap stays optional',async()=>{
    const empty=service(()=>ok([]));assert.deepEqual(await empty.suggest('sipierman'),{query:'sipierman',correctedQuery:null,results:[],hasMore:false});assert.equal(empty.calls.length,2);
    const missing=service(()=>ok([]),{readSitemap:()=>{throw Error('missing');}});assert.equal((await missing.suggest('sipierman')).correctedQuery,null);assert.equal(missing.calls.length,1);
});

test('warm cache expires, simultaneous queries dedupe, and admission and cache size are bounded',async()=>{
    let time=0,release;
    const {suggest,calls}=service(()=>new Promise(resolve=>{release=()=>resolve(ok([movie(1,'Spider-Man')]));}),{now:()=>time,maxPending:1,cacheLimit:1,cacheTTL:10});
    const first=suggest('spider'),same=suggest('spider');await assert.rejects(suggest('other'),error=>error.status===503);release();assert.deepEqual(await first,await same);assert.equal(calls.length,1);
    await suggest('spider');assert.equal(calls.length,1);time=11;const expired=suggest('spider');release();await expired;assert.equal(calls.length,2);
    const next=suggest('other');release();await next;const evicted=suggest('spider');release();await evicted;assert.equal(calls.length,4);
});

async function response(req) {
    const res={statusCode:200,headers:{},setHeader(key,value){this.headers[key.toLowerCase()]=value;},end(body){this.body=body;}};
    await api(req,res);return res;
}
test('API validates parameters and methods before any request and all responses stay private',async()=>{
    const original=Search.suggest;let calls=0;Search.suggest=async()=>{calls++;return {results:[]};};
    try {
        for(const q of [undefined,'','x','x'.repeat(101),['spider'],{},42]) {
            const result=await response({method:'GET',query:{q}});assert.equal(result.statusCode,400);assert.equal(result.headers['cache-control'],'private, no-store');
        }
        assert.equal((await response({method:'GET',query:{q:'spider',page:'2'}})).statusCode,400);
        assert.equal((await response({method:'GET',url:'/api/search-suggestions?q=spider&q=other'})).statusCode,400);
        const method=await response({method:'POST',query:{q:'spider'}});assert.equal(method.statusCode,405);assert.equal(method.headers.allow,'GET');assert.equal(calls,0);
    } finally {Search.suggest=original;}
});

test('API returns literal injection-safe JSON with no shared cache and controlled retryable errors',async()=>{
    const original=Search.suggest;
    try {
        const title='</script><img src=x onerror=alert(1)> $\' $&';
        Search.suggest=async query=>({query,correctedQuery:null,results:[movie(1,title)],hasMore:false});
        const result=await response({method:'GET',query:{q:'<script>'}});assert.equal(result.statusCode,200);assert.equal(result.headers['cache-control'],'private, no-store');assert.equal(result.headers['x-robots-tag'],'noindex, nofollow');assert.ok(!result.body.includes('<script>'));assert.ok(!result.body.includes('</script>'));assert.equal(JSON.parse(result.body).results[0].title,title);
        Search.suggest=async()=>{throw Error('upstream details must stay private');};const failure=await response({method:'GET',query:{q:'spider'}});assert.equal(failure.statusCode,503);assert.equal(failure.headers['retry-after'],'60');assert.ok(!failure.body.includes('upstream details'));
    } finally {Search.suggest=original;}
});

test('malformed, failed and timed-out upstream responses are transient and never cached',async()=>{
    for(const responseFor of [()=>({ok:false,status:429}),()=>({ok:true,json:async()=>({results:{}})}),()=>({ok:true,json:async()=>({results:[],total_pages:'2'})}),()=>{throw Error('deadline');}]) {
        const {suggest,calls}=service(responseFor);await assert.rejects(suggest('spider'));await assert.rejects(suggest('spider'));assert.equal(calls.length,2);
    }
});
