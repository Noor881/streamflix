const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SEO = require('../seo-core.js');
const root = path.resolve(__dirname,'..');
const compiled = new Map();
function script(file, suffix) {
    const filename = path.join(root,file), modified = fs.statSync(filename).mtimeMs;
    const old = compiled.get(file);
    if (old?.modified === modified) return old.code;
    const code = new vm.Script(fs.readFileSync(filename,'utf8') + suffix,{filename});
    compiled.set(file,{modified,code}); return code;
}
function context(fetcher) {
    const app = {innerHTML:'',style:{}};
    const document = {hidden:false,body:{style:{}},addEventListener(){},getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[]};
    const sandbox = {console,URL,URLSearchParams,AbortSignal,Date,Math,JSON,Number,String,Map,Set,Promise,parseInt,fetch:fetcher,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame(){},matchMedia:()=>({matches:true}),navigator:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},document,window:{SiteSEO:SEO,location:{pathname:'/',search:'',hash:'',href:SEO.SITE+'/',origin:SEO.SITE},addEventListener(){},scrollTo(){},Watchlist:{read:()=>[],ready:Promise.resolve()}}};
    vm.createContext(sandbox); return {sandbox,app};
}
async function catalog(meta, input) {
    const responses = [], failures = [];
    const fetcher = async url => {
        const target = new URL(url);
        const response = await fetch(target,{signal:AbortSignal.timeout(10000)});
        if (!response.ok) { failures.push(response.status); return response; }
        const data = await response.json();
        if (!Array.isArray(data?.results) || !Number.isFinite(data.total_pages) || data.total_pages < 0) {
            failures.push(503);
            throw new Error('Incomplete catalog metadata');
        }
        const params = Object.fromEntries([...target.searchParams].filter(([key])=>key!=='api_key'));
        responses.push({endpoint:target.pathname.replace(/^\/3/,''),params,data});
        return {ok:true,json:async()=>data};
    };
    const c = context(async url => {try{return await fetcher(url);}catch(error){failures.push(503);throw error;}});
    script('app.js','\nthis.serverApp = {pages,components};').runInContext(c.sandbox,{timeout:5000});
    const pages = c.sandbox.serverApp.pages;
    const route = meta.path.slice(1);
    if (meta.path==='/') await pages.home();
    else if (['movies','tv','anime'].includes(route)) await pages[route](meta.category,meta.page);
    else if (route==='new') await pages.newPopular(meta.category,meta.page);
    else if (meta.genreId) await pages.genre(meta.genreId,meta.page);
    else if (route==='search') await pages.search(new URL(input,SEO.SITE).searchParams.get('q') || '',meta.page);
    else pages[route]?.();
    if (failures.length) { const error = new Error('Catalog metadata unavailable'); error.status=503; throw error; }
    const pageLimit = Math.max(1,...responses.map(entry=>entry.data.total_pages || 1));
    if (meta.page>pageLimit && responses.length) {const error=new Error('Page not found');error.status=404;throw error;}
    return {html:c.app.innerHTML,responses};
}
function detail(data,type,season,episode) {
    const c=context();
    script('detail.js','\nthis.serverDetail = {renderNav,buildBreadcrumbs,buildCast,buildRecos,buildDetailsGrid,buildGenreSection,buildDetailFooter,sanitize,formatRuntime};').runInContext(c.sandbox,{timeout:5000});
    const d=c.sandbox.serverDetail, esc=d.sanitize, name=data.title || data.name;
    const date=data.release_date || data.first_air_date;
    const rating=data.vote_average>0?Number(data.vote_average).toFixed(1):null;
    const titlePanel=`<section class="watch-title-panel"><div class="hero-info"><div class="hero-tags">${(data.genres||[]).slice(0,3).map(g=>`<span class="hero-tag">${esc(g.name)}</span>`).join('')}${date?`<span class="hero-tag year">${esc(date.slice(0,4))}</span>`:''}</div><h1 class="hero-title">${esc(name)}</h1>${rating?`<p class="hero-rating">TMDB score: ${rating}/10</p>`:''}${data.tagline?`<p class="hero-tagline">${esc(data.tagline)}</p>`:''}<p class="hero-overview">${esc(data.overview||'No synopsis is available for this title.')}</p>${type==='tv'?`<p>Selected season ${season}, episode ${episode}.</p>`:''}</div></section>`;
    return d.renderNav()+`<main><div class="watch-layout"><section class="detail-section"><h2 class="section-title">Player</h2><div class="player-wrapper"><div class="detail-loading"><p>Preparing player controls…</p><noscript>Enable JavaScript to use external players. Title information and related links remain available below.</noscript></div></div></section>${titlePanel}</div><div class="detail-content"><div class="detail-main">${d.buildBreadcrumbs(data,type)}${d.buildCast(data.credits)}${d.buildGenreSection(data.genres,type)}</div><aside class="detail-sidebar">${d.buildDetailsGrid(data,type)}${d.buildRecos(data.recommendations?.results,type)}</aside></div></main>`+d.buildDetailFooter();
}
module.exports={catalog,detail};
