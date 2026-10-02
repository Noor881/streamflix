const TMDB=require('../server/tmdb.js');
const cache=new Map(),pending=new Map();
async function metadata(req,res) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(req.method && req.method!=='GET') {res.statusCode=405;res.setHeader('Allow','GET');return res.end(JSON.stringify({error:'Method not allowed'}));}
    const {endpoint,...params}=req.query || Object.fromEntries(new URL(req.url,'https://hdwatchzone.com').searchParams);
    try {TMDB.validate(endpoint,params);}catch(error){res.statusCode=400;return res.end(JSON.stringify({error:error.message}));}
    const privateRequest=endpoint.startsWith('/search/');
    res.setHeader('Cache-Control',privateRequest?'private, no-store':'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    const identity=endpoint+'?'+new URLSearchParams(Object.entries(params).sort()).toString();
    try {
        let entry=!privateRequest && cache.get(identity);
        if(!entry || Date.now()-entry.time>300000) {
            let work=pending.get(identity);
            if(!work){
                if(pending.size>=24) throw Object.assign(new Error('Metadata busy'),{status:503});
                work=(async()=>{
                const response=await TMDB.request(endpoint,params);
                if(!response.ok) throw Object.assign(new Error('Metadata temporarily unavailable'),{status:response.status===404?404:503});
                const data=await response.json();
                if(!data || typeof data!=='object' || Array.isArray(data)) throw new Error('Invalid metadata response');
                const list=/^\/(discover|search|trending)\//.test(endpoint) || /^\/(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today)$/.test(endpoint) || /\/recommendations$/.test(endpoint);
                if(list && !Array.isArray(data.results) || /^\/genre\//.test(endpoint) && !Array.isArray(data.genres) || /\/season\/\d+$/.test(endpoint) && !Array.isArray(data.episodes)) throw new Error('Invalid metadata response');
                const title=endpoint.match(/^\/(movie|tv)\/(\d+)$/);
                if(title && (Number(data.id)!==Number(title[2]) || typeof data[title[1]==='movie'?'title':'name']!=='string')) throw new Error('Invalid title response');
                return {time:Date.now(),data};
            })();pending.set(identity,work);}
            try {entry=await work;}finally{pending.delete(identity);}
            if(!privateRequest){cache.set(identity,entry);while(cache.size>200)cache.delete(cache.keys().next().value);}
        }
        return res.end(JSON.stringify(entry.data));
    }catch(error){res.statusCode=error.status||503;res.setHeader('Cache-Control','no-store');if(res.statusCode===503)res.setHeader('Retry-After','60');return res.end(JSON.stringify({error:'Title information is temporarily unavailable. Please retry.'}));}
}
module.exports=metadata;
