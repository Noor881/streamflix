const test = require('node:test');
const assert = require('node:assert/strict');
const TMDB = require('../server/tmdb.js');
const Discovery = require('../discovery-core.js');
const SSR = require('../server/ssr.js');
const SEO = require('../seo-core.js');

test('all public discovery queries pass strict proxy validation',()=>{
    for(const collection of Discovery.collections) {
        const query = Discovery.collectionQuery(collection.slug,2);
        assert.equal(TMDB.validate(query.endpoint,query.params),query.params);
    }
    for(const language of Discovery.languages) for(const type of ['movie','tv']) {
        const query = Discovery.indianQuery(language.code,type,2);
        assert.equal(TMDB.validate(query.endpoint,query.params),query.params);
    }
});

test('company and keyword filters reject malformed, excessive or unsafe ID lists',()=>{
    for(const name of ['with_companies','with_keywords']) {
        for(const value of ['0','-1','foo','420&api_key=oops','1,,2','1|','9007199254740992',Array(11).fill('1').join('|'),{},null]) {
            if(value===null) continue;
            assert.throws(()=>TMDB.validate('/discover/movie',{[name]:value}),error=>error.status===400);
        }
        assert.doesNotThrow(()=>TMDB.validate('/discover/movie',{[name]:'420|1,2'}));
        assert.throws(()=>TMDB.validate('/search/multi',{query:'movie',[name]:'420'}),error=>error.status===400);
    }
});

test('rating filters are discovery-only decimal values between zero and ten',()=>{
    for(const value of [-1,11,Infinity,NaN,'','7.111','7&foo=bar']) assert.throws(()=>TMDB.validate('/discover/tv',{'vote_average.gte':value}),error=>error.status===400);
    for(const value of [0,7,'7.25',10]) assert.doesNotThrow(()=>TMDB.validate('/discover/tv',{'vote_average.gte':value}));
    assert.throws(()=>TMDB.validate('/tv/popular',{'vote_average.gte':7}),error=>error.status===400);
});

test('public home exposes all new feature links while keeping six public metadata requests',async()=>{
    const original = global.fetch, calls=[];
    global.fetch = async raw => {calls.push(new URL(raw));return {ok:true,status:200,json:async()=>({results:[],total_pages:1,total_results:0})};};
    try {
        const rendered = await SSR.catalog(SEO.describe('/'),'/');
        assert.equal(calls.length,6);
        assert.ok(rendered.html.includes('id="for-you-content"'));
        assert.ok(rendered.html.includes('href="/for-you"'));
        for(const collection of Discovery.collections) assert.ok(rendered.html.includes(`href="/collections/${collection.slug}"`));
        for(const language of Discovery.languages) assert.ok(rendered.html.includes(`href="/indian/${language.code}"`));
        assert.ok(!calls.some(url=>url.pathname.endsWith('/recommendations')));
    } finally {global.fetch=original;}
});

test('discovery hubs render without upstream requests and privacy explains seed lookup',async()=>{
    const original = global.fetch;
    global.fetch = async()=>{throw new Error('No discovery hub requests expected');};
    try {
        for(const path of ['/collections','/indian','/indian?type=tv']) {
            const rendered = await SSR.catalog(SEO.describe(path),path);
            assert.equal(rendered.responses.length,0);
            assert.ok(rendered.html.includes('discovery-page'));
        }
        const privacy = await SSR.catalog(SEO.describe('/privacy'),'/privacy');
        assert.ok(privacy.html.includes('up to three titles'));
        assert.ok(privacy.html.includes('title IDs are sent'));
        assert.ok(privacy.html.includes('complete saved list and history are not uploaded'));
    } finally {global.fetch=original;}
});
