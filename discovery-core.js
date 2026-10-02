/* Public discovery definitions shared by browser navigation and server rendering. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DiscoveryCore = api;
})(typeof window === 'object' ? window : globalThis, function () {
    const languages = Object.freeze([
        {code:'hi',name:'Hindi',description:'Discover Indian movies and series originally made in Hindi.'},
        {code:'ta',name:'Tamil',description:'Discover Indian movies and series originally made in Tamil.'},
        {code:'te',name:'Telugu',description:'Discover Indian movies and series originally made in Telugu.'},
        {code:'ml',name:'Malayalam',description:'Discover Indian movies and series originally made in Malayalam.'},
        {code:'pa',name:'Punjabi',description:'Discover Indian movies and series originally made in Punjabi.'}
    ].map(Object.freeze));
    const collections = Object.freeze([
        {slug:'marvel-universe',name:'Marvel Universe',type:'movie',description:'Explore movies credited to Marvel Studios, from superhero origins to universe-spanning adventures.',eyebrow:'Superhero adventures',filter:{with_companies:'420',sort_by:'popularity.desc'}},
        {slug:'mind-bending',name:'Mind-Bending Movies',type:'movie',description:'Explore dream worlds, time-travel puzzles, looping timelines and alternative realities that invite a second look.',eyebrow:'Dreams, time & reality',filter:{with_keywords:'4379|10854|346773|175629','vote_count.gte':100,sort_by:'popularity.desc'}},
        {slug:'weekend-binge',name:'Weekend Binge',type:'tv',description:'Highly rated drama and crime series with at least 200 TMDB votes, ready for your next series discovery.',eyebrow:'Drama & crime series',filter:{with_genres:'18|80','vote_average.gte':7,'vote_count.gte':200,sort_by:'vote_average.desc'}},
        {slug:'family-night',name:'Family Night',type:'movie',description:'Animation and family-genre movies for a shared movie night. Check each title’s rating and suitability before watching.',eyebrow:'Animation & family',filter:{with_genres:'16|10751','vote_count.gte':100,sort_by:'popularity.desc'}}
    ].map(item=>Object.freeze({...item,filter:Object.freeze(item.filter)})));
    const getLanguage = code => languages.find(item=>item.code===code) || null;
    const getCollection = slug => collections.find(item=>item.slug===slug) || null;
    function validPage(value) {
        return /^\d+$/.test(String(value)) && Number(value)>=1 && Number(value)<=500;
    }
    function pageNumber(value) {
        if (!validPage(value)) throw new RangeError('Discovery page must be between 1 and 500');
        return Number(value);
    }
    function collectionQuery(slug, page = 1) {
        const collection = getCollection(slug);
        if (!collection) throw new RangeError('Unknown collection');
        return {endpoint:'/discover/'+collection.type,params:{page:pageNumber(page),include_adult:false,...collection.filter},type:collection.type};
    }
    function indianQuery(code, type = 'movie', page = 1) {
        if (!getLanguage(code) || !['movie','tv'].includes(type)) throw new RangeError('Unknown Indian discovery section');
        return {endpoint:'/discover/'+type,params:{page:pageNumber(page),include_adult:false,with_origin_country:'IN',with_original_language:code,sort_by:'popularity.desc'},type};
    }
    function routeURL(kind, key = '', options = {}) {
        if (!['collections','indian','for-you'].includes(kind)) throw new RangeError('Unknown discovery route');
        if (kind==='collections' && key && !getCollection(key) || kind==='indian' && key && !getLanguage(key) || kind==='for-you' && key) throw new RangeError('Unknown discovery route');
        const page = pageNumber(options.page ?? 1), type = options.type || 'movie';
        if (!['movie','tv'].includes(type)) throw new RangeError('Unknown discovery media type');
        if (!key && page!==1) throw new RangeError('Discovery hubs are not paginated');
        const query = new URLSearchParams();
        if (kind==='indian' && type==='tv') query.set('type','tv');
        if (key && page>1) query.set('page',String(page));
        return '/'+kind+(key?'/'+key:'')+(query.size?'?'+query.toString():'');
    }
    function parseRoute(input) {
        const url = new URL(input,'https://hdwatchzone.com'), path = url.pathname.replace(/\/$/,'') || '/';
        if (!/^\/(collections|indian|for-you)(?:\/|$)/.test(path)) return null;
        const match = path.match(/^\/(collections|indian|for-you)(?:\/([^/]+))?$/);
        if (!match) return {status:404};
        const [,kind,key=''] = match, params = url.searchParams;
        const rawPage = params.get('page') ?? '1';
        if (params.getAll('page').length>1 || params.getAll('type').length>1 || !validPage(rawPage)) return {status:404};
        const page = Number(rawPage), type = params.get('type') ?? 'movie';
        if (!['movie','tv'].includes(type) || !key && page!==1 || kind!=='indian' && params.has('type')) return {status:404};
        const language = kind==='indian' && key ? getLanguage(key) : null;
        const collection = kind==='collections' && key ? getCollection(key) : null;
        if (kind==='indian' && key && !language || kind==='collections' && key && !collection || kind==='for-you' && key) return {status:404};
        const name = language ? `${language.name} ${type==='tv'?'Series':'Movies'}` : collection?.name || {collections:'Curated Collections',indian:'Indian Movies & Series','for-you':'For You'}[kind];
        const description = language ? `Explore Indian ${type==='tv'?'series':'movies'} originally made in ${language.name}, with title information and local watchlists.` : collection?.description || {collections:'Discover Marvel Studios movies, dream worlds and timeline puzzles, drama and crime series, and animation or family-genre collections.',indian:'Browse Hindi, Tamil, Telugu, Malayalam and Punjabi movies and series from India.','for-you':'Discover recommendations from titles saved or recently viewed in this browser. Your local history is not shared between visitors.'}[kind];
        return {status:200,path,kind,key,page,type:collection?.type || type,languageCode:language?.code,collectionSlug:collection?.slug,name,description,canonicalPath:routeURL(kind,key,{page,type}),noindex:kind==='for-you'};
    }
    function queryFor(key, type, page) {
        return getCollection(key) ? collectionQuery(key,page ?? 1) : indianQuery(key,type || 'movie',page ?? 1);
    }
    return {languages,collections,getLanguage,getCollection,collectionQuery,indianQuery,queryFor,routeURL,parseRoute};
});
