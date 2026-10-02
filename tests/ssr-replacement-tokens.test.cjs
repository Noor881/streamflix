const test = require('node:test');
const assert = require('node:assert/strict');
const render = require('../api/render.js');
const TMDB = require('../server/tmdb.js');
const SEO = require('../seo-core.js');

async function rendered(query, data) {
    const original = TMDB.request;
    TMDB.request = async () => ({ok:true,status:200,json:async()=>data});
    const response = {statusCode:200,html:'',setHeader(){},end(html){this.html=html;}};
    try { await render({query},response); }
    finally { TMDB.request = original; }
    assert.equal(response.statusCode,200);
    assert.equal((response.html.match(/<title>/g)||[]).length,1);
    assert.equal((response.html.match(/<\/head>/g)||[]).length,1);
    assert.equal((response.html.match(/<\/body>/g)||[]).length,1);
    return response.html;
}

function scriptJSON(html, id) {
    const match = html.match(new RegExp(`<script id="${id}" type="application/(?:ld\\+)?json">([\\s\\S]*?)<\\/script>`));
    assert.ok(match,`missing ${id}`);
    return JSON.parse(match[1]);
}

for (const token of ["$'",'$&']) {
    test(`search preserves literal replacement token ${token} in title and hydration data`,async()=>{
        const html = await rendered({route:'search',q:token},{results:[],total_pages:1});
        const escaped = token.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
        assert.ok(html.includes(`<title>Search for ${escaped} | HD Watchzone</title>`));
        const payload = scriptJSON(html,'initial-catalog-data');
        assert.equal(payload.responses[0].params.query,token);
    });

    test(`movie preserves literal replacement token ${token} in title, metadata and JSON`,async()=>{
        const data = {id:550,title:`Example ${token}`,overview:`Overview ${token}`,genres:[],credits:{cast:[]},recommendations:{results:[]}};
        const html = await rendered({route:'movie',id:`550-${SEO.slug(data.title)}`},data);
        const escaped = SEO.titleMeta(data,'movie').title.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
        assert.ok(html.includes(`<title>${escaped}</title>`));
        assert.deepEqual(scriptJSON(html,'initial-title-data'),data);
        assert.equal(scriptJSON(html,'schema-movie')['@graph'][0].name,data.title);
    });

    test(`collection schema preserves literal replacement token ${token} in title names`,async()=>{
        const item = {id:550,title:`Example ${token}`,media_type:'movie',genre_ids:[],vote_average:8};
        const html = await rendered({route:'movies'},{results:[item],total_pages:1});
        assert.equal(scriptJSON(html,'page-schema').mainEntity.itemListElement[0].name,item.title);
        assert.equal(scriptJSON(html,'initial-catalog-data').responses[0].data.results[0].title,item.title);
    });
}
