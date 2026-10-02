const fs = require('node:fs');
const path = require('node:path');
const TMDB = require('./tmdb.js');

const MAX_RESULTS = 8;
const SITEMAP_LIMIT = 2 * 1024 * 1024;
const SITEMAP_PATH = path.resolve(__dirname,'..','sitemap.xml');

function validateQuery(value) {
    if (typeof value !== 'string') throw Object.assign(new Error('A search query is required'),{status:400});
    const query = value.trim();
    if (query.length < 2 || query.length > 100) throw Object.assign(new Error('Search queries must contain 2 to 100 characters'),{status:400});
    return query;
}

function normalize(value) {
    return String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

// Banded optimal-string-alignment distance includes adjacent letter swaps.
function editDistance(left,right,limit=2) {
    if (Math.abs(left.length-right.length)>limit) return limit+1;
    let previous = Array.from({length:right.length+1},(_,i)=>i<=limit?i:Infinity),beforePrevious;
    for (let i=1;i<=left.length;i++) {
        const current = Array(right.length+1).fill(Infinity);
        if (i<=limit) current[0]=i;
        let minimum=current[0];
        for (let j=Math.max(1,i-limit);j<=Math.min(right.length,i+limit);j++) {
            current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(left[i-1]===right[j-1]?0:1));
            if (i>1 && j>1 && left[i-1]===right[j-2] && left[i-2]===right[j-1]) current[j]=Math.min(current[j],beforePrevious[j-2]+1);
            minimum=Math.min(minimum,current[j]);
        }
        if (minimum>limit) return limit+1;
        beforePrevious=previous;previous=current;
    }
    return previous[right.length];
}

function relevance(name,query) {
    const title=normalize(name),needle=normalize(query),compact=title.replace(/ /g,''),search=needle.replace(/ /g,'');
    if (!search) return 9;
    if (title===needle) return 0;
    if (compact===search) return 1;
    if (title.startsWith(needle)) return 2;
    if (compact.startsWith(search)) return 3;
    if (title.split(' ').some(word=>word.startsWith(needle))) return 4;
    if (title.includes(needle)) return 5;
    if (compact.includes(search)) return 6;
    if (needle.split(' ').every(word=>title.includes(word))) return 7;
    return 9;
}

function publicResults(data,query) {
    if (!data || typeof data!=='object' || !Array.isArray(data.results) || data.results.length>200 ||
        data.total_pages!=null && (!Number.isInteger(data.total_pages) || data.total_pages<0)) throw new Error('Invalid search response');
    const seen=new Set(),items=[];
    for (const raw of data.results) {
        if (!raw || typeof raw!=='object' || Array.isArray(raw) || raw.adult!==undefined && raw.adult!==false ||
            !['movie','tv'].includes(raw.media_type) || !Number.isSafeInteger(raw.id) || raw.id<1 ||
            raw.media_type==='movie' && raw.id===928480) continue;
        const field=raw.media_type==='movie'?'title':'name',dateField=raw.media_type==='movie'?'release_date':'first_air_date';
        if (typeof raw[field]!=='string' || !raw[field].trim() || raw[field].length>300) continue;
        const identity=`${raw.media_type}:${raw.id}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const name=raw[field].replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
        if (!name) continue;
        const item={id:raw.id,media_type:raw.media_type,[field]:name,
            [dateField]:typeof raw[dateField]==='string' && /^\d{4}-\d{2}-\d{2}$/.test(raw[dateField])?raw[dateField]:'',
            poster_path:typeof raw.poster_path==='string' && /^\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(raw.poster_path)?raw.poster_path:null};
        items.push({item,score:relevance(name,query),popularity:Number.isFinite(raw.popularity)?raw.popularity:0,index:items.length});
    }
    items.sort((a,b)=>a.score-b.score || b.popularity-a.popularity || a.index-b.index);
    return {results:items.slice(0,MAX_RESULTS).map(entry=>entry.item),hasMore:items.length>MAX_RESULTS || data.total_pages>1};
}

function sitemapCandidates(xml) {
    if (typeof xml!=='string' || Buffer.byteLength(xml,'utf8')>SITEMAP_LIMIT) return [];
    const candidates=[],seen=new Set();
    for (const match of xml.matchAll(/<loc>(https:\/\/hdwatchzone\.com\/(?:movie|tv)\/\d+-([a-z0-9_-]+))<\/loc>/g)) {
        const slug=match[2],compact=normalize(slug).replace(/ /g,'');
        if (compact.length<4 || compact.length>100 || slug.length>100 || compact==='title' || seen.has(compact)) continue;
        seen.add(compact);
        candidates.push({compact,query:slug.split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join('-')});
        if (candidates.length>=4000) break;
    }
    return candidates;
}

function createSearchSuggestions({request=(...args)=>TMDB.request(...args),readSitemap=()=>{
    if (fs.statSync(SITEMAP_PATH).size>SITEMAP_LIMIT) return '';
    return fs.readFileSync(SITEMAP_PATH,'utf8');
},now=()=>Date.now(),maxPending=12,cacheLimit=128,cacheTTL=15000}={}) {
    const cache=new Map(),pending=new Map();
    let candidates=[],candidatesAt=-Infinity;
    function correction(query) {
        const needle=normalize(query).replace(/ /g,'');
        if (needle.length<4) return null;
        if (now()-candidatesAt>300000) {
            try {candidates=sitemapCandidates(readSitemap());} catch {candidates=[];}
            candidatesAt=now();
        }
        const limit=needle.length<7?1:2;
        let best=null,bestDistance=limit+1;
        for (const candidate of candidates) {
            const distance=editDistance(needle,candidate.compact,limit);
            if (distance>0 && distance<bestDistance) {best=candidate.query;bestDistance=distance;}
        }
        return best;
    }
    async function search(query) {
        const response=await request('/search/multi',{query,page:1});
        if (!response.ok) throw new Error('Search temporarily unavailable');
        return publicResults(await response.json(),query);
    }
    return async function suggest(value) {
        const query=validateQuery(value),entry=cache.get(query);
        if (entry && now()-entry.time<cacheTTL) return entry.data;
        if (pending.has(query)) return pending.get(query);
        if (pending.size>=maxPending) throw Object.assign(new Error('Search temporarily busy'),{status:503});
        const work=(async()=>{
            const exact=await search(query);
            let data={query,correctedQuery:null,...exact};
            if (!exact.results.length) {
                const correctedQuery=correction(query);
                if (correctedQuery) {
                    const corrected=await search(correctedQuery);
                    if (corrected.results.length) data={query,correctedQuery,...corrected};
                }
            }
            cache.set(query,{time:now(),data});
            while (cache.size>cacheLimit) cache.delete(cache.keys().next().value);
            return data;
        })();
        pending.set(query,work);
        try {return await work;} finally {pending.delete(query);}
    };
}

module.exports={suggest:createSearchSuggestions(),createSearchSuggestions,validateQuery,normalize,editDistance};
