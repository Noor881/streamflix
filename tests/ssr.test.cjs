const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const render = require('../api/render.js');
const SEO = require('../seo-core.js');
const {createPreviewServer,routeForURL} = require('../scripts/dev-server.cjs');

const movie = {id:550,title:'Fight Club',overview:'An office worker forms a club.',release_date:'1999-10-15',poster_path:'/poster.jpg',backdrop_path:'/backdrop.jpg',vote_average:8.4,runtime:139,genres:[{id:18,name:'Drama'}],credits:{cast:[{id:1,name:'A Performer',profile_path:'/person.jpg'}],crew:[]},videos:{results:[]},recommendations:{results:[{id:680,title:'Pulp Fiction',poster_path:'/related.jpg',vote_average:8.5,release_date:'1994-10-14'}]}};
const show = {id:1396,name:'Breaking Bad',overview:'A chemistry teacher changes his life.',first_air_date:'2008-01-20',poster_path:'/show.jpg',vote_average:8.9,genres:[{id:18,name:'Drama'}],seasons:[{season_number:1,episode_count:7},{season_number:2,episode_count:13}],number_of_seasons:2,number_of_episodes:20,credits:{cast:[],crew:[]},recommendations:{results:[]}};
const listing = {results:[{...movie,media_type:'movie',genre_ids:[18]},{...show,media_type:'tv',genre_ids:[18]}],page:1,total_pages:5,total_results:100};
const ok = data => ({ok:true,status:200,json:async()=>data});
function response() {
    return {statusCode:200,headers:{},html:'',setHeader(key,value){this.headers[key.toLowerCase()]=value;},end(value){this.html=String(value || '');}};
}
async function withFetch(fetcher,fn) {
    const original=global.fetch;global.fetch=fetcher;
    try{return await fn();}finally{global.fetch=original;}
}
async function rendered(query,url) {
    const result=response();await render({query,url},result);return result;
}
function canonical(html) {return html.match(/<link rel="canonical" href="([^"]+)"/)[1].replace(/&amp;/g,'&');}
function embeddedJSON(html,id) {
    const match=html.match(new RegExp(`<script id="${id}" type="application/(?:ld\\+)?json">([\\s\\S]*?)<\\/script>`));
    assert.ok(match,`missing ${id}`);return JSON.parse(match[1]);
}

test('shared metadata self-canonicalizes pagination and excludes alternate/private URLs from indexing',()=>{
    const page=SEO.describe('/movies?page=2');
    assert.equal(page.canonical,SEO.SITE+'/movies?page=2');assert.equal(page.noindex,false);
    const alternate=SEO.describe('/movies?category=top_rated&page=2');
    assert.equal(alternate.canonical,SEO.SITE+'/movies?category=top_rated&page=2');assert.equal(alternate.noindex,true);
    assert.equal(SEO.describe('/movies?page=1&utm_source=test').canonical,SEO.SITE+'/movies');
    for(const path of ['/search?q=batman&page=2','/account','/my-list','/cookies']) assert.equal(SEO.describe(path).noindex,true,path);
    for(const path of ['/genre/999999','/movies?page=0','/movies?page=501','/movies?page=two','/movies?category=invalid','/random']) assert.equal(SEO.describe(path).status,404,path);
    assert.equal(SEO.slug('日本語'),'title');
});

test('homepage initial HTML contains the same hero and portrait-card content without executing browser JavaScript',async()=>{
    const calls=[];
    await withFetch(async url=>{calls.push(String(url));return ok(listing);},async()=>{
        const result=await rendered({route:'home'},'/');
        assert.equal(result.statusCode,200);assert.equal(canonical(result.html),SEO.SITE+'/');
        assert.ok(result.html.includes('id="hero-carousel"'));assert.ok(result.html.includes('Fight Club'));
        assert.ok(result.html.includes('href="/movie/550-fight-club"'));assert.ok(result.html.includes('class="card-wrapper"'));assert.ok(result.html.includes('class="card-poster"'));
        assert.equal(calls.length,6);assert.equal(embeddedJSON(result.html,'initial-catalog-data').responses.length,6);
        assert.ok(result.html.includes('Indian Movies'));assert.ok(result.html.includes('Indian Series'));
        assert.ok(result.html.includes('rel="preload" as="image"'));
    });
});

test('Indian movie and series catalogs preserve country, page, portrait cards and detail links',async()=>{
    for (const [route,item,heading] of [['movies',movie,'Indian Movies'],['tv',show,'Indian Series']]) {
        const calls=[];
        await withFetch(async raw=>{calls.push(new URL(raw));return ok({...listing,results:[item],page:2});},async()=>{
            const result=await rendered({route,category:'indian',page:'2'},`/${route}?category=indian&page=2`);
            assert.equal(result.statusCode,200);
            assert.ok(result.html.includes(`<h1>${heading}</h1>`));
            assert.ok(result.html.includes(`href="/${route}?category=indian&amp;page=3"`) || result.html.includes(`href="/${route}?category=indian&page=3"`));
            assert.ok(result.html.includes('class="card-poster"'));
            assert.ok(result.html.includes(route==='movies'?'/movie/550-fight-club':'/tv/1396-breaking-bad'));
            assert.equal(calls.length,1);
            assert.equal(calls[0].pathname,route==='movies'?'/3/discover/movie':'/3/discover/tv');
            assert.equal(calls[0].searchParams.get('with_origin_country'),'IN');
            assert.equal(calls[0].searchParams.get('page'),'2');
            assert.equal(calls[0].searchParams.get('include_adult'),'false');
            assert.equal(calls[0].searchParams.has('with_original_language'),false);
            assert.equal(canonical(result.html),SEO.SITE+`/${route}?category=indian&page=2`);
        });
    }
});

test('catalog page two SSR requests page two and exposes real sequential links and collection schema',async()=>{
    const calls=[];
    await withFetch(async url=>{calls.push(new URL(url));return ok({...listing,page:2});},async()=>{
        const result=await rendered({route:'movies',page:'2'},'/movies?page=2');
        assert.equal(result.statusCode,200);assert.equal(canonical(result.html),SEO.SITE+'/movies?page=2');
        assert.ok(result.html.includes('Page 2'));assert.ok(result.html.includes('href="/movies?page=3"'));
        assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('page'),'2');
        const schema=embeddedJSON(result.html,'page-schema');assert.equal(schema['@type'],'CollectionPage');
        assert.equal(schema.mainEntity.itemListElement[0].url,SEO.SITE+'/movie/550-fight-club');
    });
});

test('movie and TV-specific genre SSR handles valid empty counterpart results without auxiliary genre-list requests',async()=>{
    for(const genreId of ['28','10765']) {
        const calls=[];
        await withFetch(async raw=>{
            const url=new URL(raw);calls.push(url);
            const isTV=url.pathname.endsWith('/tv');
            const supported=genreId==='28'?!isTV:isTV;
            return ok(supported?{...listing,results:[isTV?show:movie],page:2}:{results:[],total_pages:0,total_results:0});
        },async()=>{
            const result=await rendered({route:'genre',id:genreId,page:'2'});
            assert.equal(result.statusCode,200);assert.equal(canonical(result.html),SEO.SITE+`/genre/${genreId}?page=2`);
            assert.ok(result.html.includes(genreId==='28'?'Fight Club':'Breaking Bad'));
            assert.equal(calls.length,2);assert.deepEqual(calls.map(url=>url.pathname).sort(),['/3/discover/movie','/3/discover/tv']);
            for(const url of calls) {assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('with_genres'),genreId);}
        });
    }
});

test('mixed trending responses cannot create person cards or unsupported person URL schema entries',async()=>{
    const person={id:9999,name:'Unsupported Person Sentinel',media_type:'person',profile_path:'/profile.jpg',backdrop_path:'/person-not-hero.jpg',popularity:99};
    for(const route of ['home','new']) {
        await withFetch(async raw=>ok(new URL(raw).pathname.includes('/trending/all/')?{...listing,results:[person,...listing.results]}:listing),async()=>{
            const result=await rendered({route});assert.equal(result.statusCode,200);
            const main=result.html.match(/<main[^>]+id="app"[^>]*>([\s\S]*?)<\/main>/)[1];
            assert.ok(!main.includes('Unsupported Person Sentinel'),'people are not title cards');
            assert.ok(!main.includes('/tv/9999-'));assert.ok(!main.includes('/person/9999-'));
            if(route==='home') {
                assert.ok(result.html.includes('<link rel="preload" as="image" href="https://image.tmdb.org/t/p/w1280/backdrop.jpg"'),'preload belongs to the first rendered movie hero, not a skipped person');
                assert.ok(!result.html.includes('<link rel="preload" as="image" href="https://image.tmdb.org/t/p/w1280/person-not-hero.jpg"'));
            }
            if(route==='new') {
                const schema=embeddedJSON(result.html,'page-schema');
                assert.ok(schema.mainEntity.itemListElement.every(item=>!item.url.includes('/person/')));
                assert.equal(schema.mainEntity.itemListElement.length,listing.results.length);
            }
        });
    }
});

test('search SSR preserves query and page while emitting noindex before JavaScript',async()=>{
    const calls=[];
    await withFetch(async url=>{calls.push(new URL(url));return ok({...listing,page:2});},async()=>{
        const result=await rendered({route:'search',q:'Batman & Robin',page:'2'},'/search?q=Batman%20%26%20Robin&page=2');
        assert.equal(result.statusCode,200);assert.equal(result.headers['x-robots-tag'],'noindex, follow');
        assert.equal(result.headers['cache-control'],'private, no-store');
        assert.ok(result.html.includes('name="robots" content="noindex, follow"'));
        assert.ok(result.html.includes('Batman &amp; Robin'));
        assert.equal(calls[0].searchParams.get('query'),'Batman & Robin');assert.equal(calls[0].searchParams.get('page'),'2');
        assert.equal(canonical(result.html),SEO.SITE+'/search?q=Batman+%26+Robin&page=2');
    });
});

test('movie SSR delivers visible title, overview, cast, portrait recommendations, canonical and factual schema',async()=>{
    await withFetch(async()=>ok(movie),async()=>{
        const result=await rendered({route:'movie',id:'550-fight-club'},'/movie/550-fight-club');
        assert.equal(result.statusCode,200);assert.equal(canonical(result.html),SEO.SITE+'/movie/550-fight-club');
        assert.ok(result.html.includes('<h1 class="hero-title">Fight Club</h1>'));assert.ok(result.html.includes(movie.overview));
        assert.ok(result.html.includes('A Performer'));assert.ok(result.html.includes('href="/movie/680-pulp-fiction"'));
        const relatedImage=result.html.match(/class="reco-card">\s*<img[^>]+width="(\d+)" height="(\d+)"[^>]+srcset="[^"]+"/);
        assert.ok(relatedImage,'related cards retain responsive portrait images');
        assert.equal(Number(relatedImage[1])/Number(relatedImage[2]),2/3);
        assert.equal(embeddedJSON(result.html,'initial-title-data').id,550);
        const graph=embeddedJSON(result.html,'schema-movie')['@graph'];
        assert.equal(graph[0]['@type'],'Movie');assert.equal(graph[1]['@type'],'BreadcrumbList');
        assert.ok(!result.html.includes('VideoObject'));assert.ok(!graph[0].aggregateRating);
    });
});

test('safe JSON payloads cannot close their script element or inject raw movie markup',async()=>{
    const hostile={...movie,title:'Fight <Club>',overview:'Before </script><img src=x onerror=alert(1)> after'};
    await withFetch(async()=>ok(hostile),async()=>{
        const result=await rendered({route:'movie',id:'550-fight-club'},'/movie/550-fight-club');
        assert.equal(result.statusCode,200);assert.ok(result.html.includes('Fight &lt;Club&gt;'));
        assert.ok(!result.html.includes('</script><img src=x'));
        assert.equal(embeddedJSON(result.html,'initial-title-data').overview,hostile.overview);
    });
});

test('wrong-slug and legacy aliases issue permanent redirects, retaining selected TV episode',async()=>{
    await withFetch(async url=>ok(new URL(url).pathname.includes('/tv/')?show:movie),async()=>{
        for(const [query,url,destination] of [
            [{route:'movie',id:'550-wrong-name'},'/movie/550-wrong-name','/movie/550-fight-club'],
            [{route:'movie',id:'550'},'/movie.html?id=550','/movie/550-fight-club'],
            [{route:'show',id:'1396',s:'2',e:'3'},'/tv.html?id=1396&s=2&e=3','/tv/1396-breaking-bad/2/3']
        ]) {
            const result=await rendered(query,url);assert.equal(result.statusCode,301);assert.equal(result.headers.location,destination);
        }
    });
});

test('TV SSR retains the selected episode but consolidates duplicate episode metadata to its show canonical',async()=>{
    await withFetch(async()=>ok(show),async()=>{
        const result=await rendered({route:'show',id:'1396-breaking-bad',s:'2',e:'3'},'/tv/1396-breaking-bad/2/3');
        assert.equal(result.statusCode,200);assert.ok(result.html.includes('Selected season 2, episode 3.'));
        assert.equal(canonical(result.html),SEO.SITE+'/tv/1396-breaking-bad');
        for(const params of [{s:'-1',e:'3'},{s:'2',e:'0'},{s:'3',e:'1'},{s:'2',e:'14'}]) {
            assert.equal((await rendered({route:'show',id:'1396-breaking-bad',...params})).statusCode,404);
        }
    });
});

test('removed and malformed titles and invalid catalog routes do not request upstream metadata',async()=>{
    let calls=0;
    await withFetch(async()=>{calls++;throw new Error('unexpected request');},async()=>{
        const removed=await rendered({route:'movie',id:'928480-monster-summer'});
        assert.equal(removed.statusCode,410);assert.equal(removed.headers['x-robots-tag'],'noindex, follow');
        for(const query of [{route:'movie',id:'550junk'},{route:'show',id:'0/not-a-title'},{route:'genre',id:'999999'},{route:'movies',page:'501'},{route:'missing'}]) {
            assert.equal((await rendered(query)).statusCode,404);
        }
        assert.equal(calls,0);
    });
});

test('upstream missing detail is 404; outages and incomplete metadata are retryable 503, never indexable errors',async()=>{
    for(const [fetcher,status] of [
        [async()=>({ok:false,status:404}),404],
        [async()=>({ok:false,status:429}),503],
        [async()=>{throw new Error('network timeout');},503],
        [async()=>ok({title:'Missing ID'}),503]
    ]) {
        await withFetch(fetcher,async()=>{
            const result=await rendered({route:'movie',id:'550-fight-club'});
            assert.equal(result.statusCode,status);assert.equal(result.headers['x-robots-tag'],'noindex, follow');
            assert.equal(result.headers['cache-control'],'no-store');
            if(status===503) assert.equal(result.headers['retry-after'],'60');
            assert.ok(result.html.includes('href="/movies"'));
        });
    }
});

test('catalog page beyond the actual API page limit is 404 and an API outage is 503',async()=>{
    await withFetch(async()=>ok({...listing,total_pages:1}),async()=>{
        assert.equal((await rendered({route:'movies',page:'2'})).statusCode,404);
    });
    await withFetch(async()=>({ok:false,status:503}),async()=>{
        const result=await rendered({route:'movies'});assert.equal(result.statusCode,503);
        assert.equal(result.headers['retry-after'],'60');assert.equal(result.headers['x-robots-tag'],'noindex, follow');
    });
});

test('successful but malformed catalog responses produce retryable 503 instead of an indexable empty catalog',async()=>{
    for(const data of [{},{results:'not an array',total_pages:5},{results:[],total_pages:'unknown'}]) {
        await withFetch(async()=>ok(data),async()=>{
            const result=await rendered({route:'movies'});
            assert.equal(result.statusCode,503);assert.equal(result.headers['x-robots-tag'],'noindex, follow');
            assert.equal(result.headers['retry-after'],'60');
        });
    }
    await withFetch(async()=>ok({results:[],total_pages:0,total_results:0}),async()=>{
        const result=await rendered({route:'search',q:'No matching title'});
        assert.equal(result.statusCode,200);assert.equal(result.headers['x-robots-tag'],'noindex, follow');
    });
});

test('detail SSR navigation links all resolve to known catalog pages or valid title routes',async()=>{
    await withFetch(async()=>ok(movie),async()=>{
        const result=await rendered({route:'movie',id:'550-fight-club'});
        const links=[...result.html.matchAll(/<a[^>]+href="(\/[^"#]*)"/g)].map(match=>match[1]);
        assert.ok(links.includes('/new'),'Trending footer uses the real New & Popular route');
        for(const link of links) {
            if(/^\/(?:movie|tv)\/\d+-[^/]+(?:\/\d+\/\d+)?$/.test(link)) continue;
            assert.equal(SEO.describe(link).status,200,link);
        }
    });
});

test('preview routing preserves search, catalog and episode parameters and cannot be overridden by route query injection',()=>{
    const url=path=>new URL(path,'http://localhost');
    assert.deepEqual(routeForURL(url('/?utm_source=test')),{utm_source:'test',route:'home'});
    assert.deepEqual(routeForURL(url('/movies?category=top_rated&page=2&route=search')),{category:'top_rated',page:'2',route:'movies'});
    assert.deepEqual(routeForURL(url('/search?q=Batman%20%26%20Robin&page=2')),{q:'Batman & Robin',page:'2',route:'search'});
    assert.deepEqual(routeForURL(url('/tv/1396-breaking-bad/2/3?s=1&e=1')),{s:'2',e:'3',route:'show',id:'1396-breaking-bad'});
    assert.deepEqual(routeForURL(url('/genre/invalid?page=3')),{page:'3',route:'genre',id:'invalid'});
    assert.equal(routeForURL(url('/movie/550/extra')),null);
    assert.equal(routeForURL(url('/tv/1396/2')),null);
    assert.equal(routeForURL(url('/movie.html')),null);
    assert.equal(routeForURL(url('/tv.html')),null);
});

test('preview HTTP serves homepage SSR and query routes, redirects aliases, and keeps malformed routes non-indexable 404',async()=>{
    const requests=[];
    const server=createPreviewServer({render:async(req,res)=>{requests.push(req.query);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.query));}});
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port;
    try {
        assert.equal((await (await fetch(base+'/')).json()).route,'home');
        const query=await (await fetch(base+'/search?q=batman&page=2')).json();assert.equal(query.q,'batman');assert.equal(query.page,'2');
        for(const path of ['/index.html?page=2','/movies/?page=2']) {
            const result=await fetch(base+path,{redirect:'manual'});assert.equal(result.status,308);
            assert.equal(result.headers.get('location'),path.startsWith('/index')?'/?page=2':'/movies?page=2');
        }
        const malformed=await fetch(base+'/movie/550/extra');assert.equal(malformed.status,404);assert.equal(malformed.headers.get('x-robots-tag'),'noindex');
        for (const path of ['/movie.html','/tv.html','/server/templates/index.html','/server/templates/movie.html','/.brainsync/.context-key','/.cursor/active-context.md','/tests/core.test.cjs','/scripts/auto-blogger.js']) {
            const result=await fetch(base+path);assert.equal(result.status,404,path);
        }
        const offline=await fetch(base+'/offline.html');assert.equal(offline.status,200);assert.equal(offline.headers.get('x-robots-tag'),'noindex, follow');
        assert.equal(requests.length,2);
    } finally {await new Promise(resolve=>server.close(resolve));}
});
