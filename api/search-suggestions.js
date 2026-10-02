const Search=require('../server/search-suggestions.js');

function json(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
}

module.exports=async function searchSuggestions(req,res) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    if (req.method && req.method!=='GET') {
        res.statusCode=405;res.setHeader('Allow','GET');return res.end(json({error:'Method not allowed'}));
    }
    let query;
    try {
        const url=req.query?null:new URL(req.url,'https://hdwatchzone.com');
        const params=req.query || Object.fromEntries(url.searchParams);
        if (Object.keys(params).some(key=>key!=='q') || url && url.searchParams.getAll('q').length!==1) throw Object.assign(new Error('Invalid search parameters'),{status:400});
        query=Search.validateQuery(params.q);
    } catch {
        res.statusCode=400;return res.end(json({error:'Provide a search query containing 2 to 100 characters'}));
    }
    try {return res.end(json(await Search.suggest(query)));}
    catch {
        res.statusCode=503;res.setHeader('Retry-After','60');
        return res.end(json({error:'Search suggestions are temporarily unavailable. Please retry.'}));
    }
};
