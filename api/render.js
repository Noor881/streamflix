const fs = require('node:fs');
const path = require('node:path');
const SEO = require('../seo-core.js');
const SSR = require('../server/ssr.js');
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g,'\\u003c');
function validateTitleData(data, type, requestedId) {
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !Number.isSafeInteger(data.id) || data.id !== requestedId) throw new Error('Unexpected title identity');
    const name = type === 'movie' ? data.title : data.name;
    if (typeof name !== 'string' || !name.trim()) throw new Error('Incomplete title metadata');
    if (data.media_type !== undefined && data.media_type !== type) throw new Error('Unexpected title media type');
    for (const key of ['overview', 'release_date', 'first_air_date']) {
        if (data[key] != null && typeof data[key] !== 'string') throw new Error('Invalid title text metadata');
    }
}
function errorResponse(res,status,message) {
    res.statusCode=status; res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Robots-Tag','noindex, follow');
    if(status===503) res.setHeader('Retry-After','60');
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${status===404?'Page not found':status===410?'Title removed':'Temporarily unavailable'} | HD Watchzone</title></head><body><main><h1>${escape(message)}</h1><p><a href="/">Home</a> · <a href="/movies">Browse movies</a> · <a href="/search">Search titles</a></p></main></body></html>`);
}
module.exports = async function render(req,res) {
    const query=req.query || Object.fromEntries(new URL(req.url,SEO.SITE).searchParams);
    const route=query.route, isDetail=['movie','show'].includes(route), type=route==='show'?'tv':'movie';
    let meta,data,body,payload,schema,image=SEO.SITE+'/logo-v2.png';
    if(isDetail) {
        const match=String(query.id || '').match(/^(\d+)(?:-[^/]+)?$/);
        if(!match) return errorResponse(res,404,'Title not found');
        const id=match[1];
        const numericId=Number(id);
        if(!Number.isSafeInteger(numericId) || numericId<1) return errorResponse(res,404,'Title not found');
        if(type==='movie' && numericId===928480) return errorResponse(res,410,'This title has been removed');
        try {
            const response=await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=d74b73cd4563f614919e6493152fbc1e&append_to_response=credits,videos,recommendations`,{signal:AbortSignal.timeout(10000)});
            if(response.status===404) return errorResponse(res,404,'Title not found');
            if(!response.ok) throw new Error('Metadata unavailable');
            data=await response.json();
            validateTitleData(data,type,numericId);
        } catch { return errorResponse(res,503,'Title information is temporarily unavailable. Please retry shortly.'); }
        meta={...SEO.titleMeta(data,type),noindex:false,robots:'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'};
        const season=Number(query.s || 1),episode=Number(query.e || 1);
        if(!Number.isInteger(season)||season<1||!Number.isInteger(episode)||episode<1) return errorResponse(res,404,'Episode not found');
        if(type==='tv' && (query.s || query.e) && data.seasons?.length) {
            const selected=data.seasons.find(s=>s.season_number===season);
            if(!selected || selected.episode_count && episode>selected.episode_count) return errorResponse(res,404,'Episode not found');
        }
        const segment=new URL(meta.canonical).pathname.split('/')[2];
        if(String(query.id)!==segment || req.url && /\/(movie|tv)\.html(?:\?|$)/.test(req.url)) {
            const destination=new URL(meta.canonical).pathname+(type==='tv'&&(query.s||query.e)?`/${season}/${episode}`:'');
            res.statusCode=301; res.setHeader('Location',destination);res.setHeader('Cache-Control','public, max-age=3600');return res.end('Moved permanently');
        }
        try { body=SSR.detail(data,type,season,episode); }
        catch { return errorResponse(res,503,'Title information is temporarily unavailable. Please retry shortly.'); }
        payload=`<script id="initial-title-data" type="application/json">${json(data)}</script>`;
        image=data.backdrop_path?`https://image.tmdb.org/t/p/w1280${data.backdrop_path}`:data.poster_path?`https://image.tmdb.org/t/p/w780${data.poster_path}`:image;
        schema={'@context':'https://schema.org','@graph':[
            {'@type':type==='movie'?'Movie':'TVSeries','@id':meta.canonical+'#title',name:data.title||data.name,description:data.overview,url:meta.canonical,image:data.poster_path?`https://image.tmdb.org/t/p/w780${data.poster_path}`:undefined,datePublished:data.release_date||data.first_air_date,genre:data.genres?.map(g=>g.name),actor:data.credits?.cast?.slice(0,5).map(a=>({'@type':'Person',name:a.name}))},
            {'@type':'BreadcrumbList',itemListElement:[{name:'Home',item:SEO.SITE+'/'},{name:type==='movie'?'Movies':'TV Shows',item:SEO.SITE+(type==='movie'?'/movies':'/tv')},{name:data.title||data.name,item:meta.canonical}].map((item,i)=>({'@type':'ListItem',position:i+1,...item}))}
        ]};
    } else {
        const params=new URLSearchParams(Object.entries(query).filter(([key])=>!['route','id'].includes(key)));
        const input=(route==='home'?'/':route==='genre'?`/genre/${query.id}`:`/${route}`)+(params.size?'?'+params:'');
        meta=SEO.describe(input);
        if(meta.status!==200) return errorResponse(res,404,'Page not found');
        try {
            const rendered=await SSR.catalog(meta,input);body=rendered.html;
            payload=`<script id="initial-catalog-data" type="application/json">${json({responses:rendered.responses})}</script>`;
            const first=rendered.responses.find(entry=>entry.endpoint==='/trending/all/day')?.data.results?.find(item=>item.media_type!=='person'&&(item.title||item.name));
            if(route==='home'&&first?.backdrop_path) {
                const src=`https://image.tmdb.org/t/p/w1280${first.backdrop_path}`;
                const srcset=[300,780,1280].map(w=>`https://image.tmdb.org/t/p/w${w}${first.backdrop_path} ${w}w`).join(', ');
                payload+=`<link rel="preload" as="image" href="${escape(src)}" imagesrcset="${escape(srcset)}" imagesizes="100vw" fetchpriority="high">`;
            }
            const items=rendered.responses.flatMap(entry=>entry.data.results||[]).filter(item=>item.media_type!=='person'&&item.id&&(item.title||item.name));
            if(meta.genreId) items.sort((a,b)=>b.popularity-a.popularity);
            if(items.length && route!=='home' && !meta.noindex) schema={'@context':'https://schema.org','@type':'CollectionPage',name:meta.title,url:meta.canonical,mainEntity:{'@type':'ItemList',itemListElement:items.map((item,i)=>({'@type':'ListItem',position:i+1,url:SEO.titleMeta(item,item.media_type || (item.name?'tv':'movie')).canonical,name:item.title||item.name}))}};
        } catch(error) { return errorResponse(res,error.status||503,error.status===404?'Page not found':'Catalog information is temporarily unavailable. Please retry shortly.'); }
    }
    let html=fs.readFileSync(path.resolve(__dirname,'..','server','templates',isDetail?`${type}.html`:'index.html'),'utf8');
    html=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${escape(meta.title)}</title>`);
    const values={title:meta.title,description:meta.description,robots:meta.robots,'og:title':meta.title,'og:description':meta.description,'og:url':meta.canonical,'og:image':image,'twitter:title':meta.title,'twitter:description':meta.description,'twitter:url':meta.canonical,'twitter:image':image};
    for(const [key,value] of Object.entries(values)) {
        const pattern=new RegExp(`(<meta (?:name|property)="${key}"\\s+content=")[^"]*(")`);
        html=html.replace(pattern,(_,a,b)=>a+escape(value)+b);
    }
    html=html.replace(/<link rel="canonical"[^>]*>/g,'').replace('</head>',`<link rel="canonical" href="${escape(meta.canonical)}">${payload || ''}</head>`);
    if(isDetail) {
        html=html.replace(/(<div id="detail-app">)[\s\S]*?(<\/div>\s*<div id="toast")/,(_,open,close)=>open+body+close);
        html=html.replace(/(<script id="schema-movie" type="application\/ld\+json">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+json(schema)+b);
    } else {
        html=html.replace(/(<main[^>]*id="app"[^>]*>)[\s\S]*?(<\/main>)/,(_,a,b)=>a.replace('id="app"','id="app" data-server-rendered="true"')+body+b);
        if(schema) html=html.replace('</head>',`<script id="page-schema" type="application/ld+json">${json(schema)}</script></head>`);
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control',meta.noindex?'private, no-store':'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
    if(meta.noindex) res.setHeader('X-Robots-Tag','noindex, follow');
    res.end(html);
};
