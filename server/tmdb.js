/* Server-only metadata configuration. Rotate the former public key after setting TMDB_API_KEY. */
const FALLBACK_KEY = 'd74b73cd4563f614919e6493152fbc1e';
const parameters = new Set(['page','query','language','append_to_response','with_genres','with_origin_country','with_original_language','sort_by','vote_count.gte','with_watch_providers','watch_region','include_adult']);
function key() { return process.env.TMDB_API_KEY || FALLBACK_KEY; }
function validate(endpoint, params = {}) {
    if (typeof endpoint !== 'string' || !/^(?:\/(?:movie|tv)\/(?:popular|top_rated|now_playing|upcoming|on_the_air|airing_today)|\/trending\/(?:all|movie|tv)\/(?:day|week)|\/discover\/(?:movie|tv)|\/search\/multi|\/genre\/(?:movie|tv)\/list|\/(?:movie|tv)\/\d+(?:\/(?:credits|videos|recommendations))?|\/tv\/\d+\/season\/\d+)$/.test(endpoint)) throw Object.assign(new Error('Unsupported metadata endpoint'), {status:400});
    if (endpoint.length > 100 || Object.keys(params).length > 12) throw Object.assign(new Error('Invalid metadata request'), {status:400});
    for (const [name,value] of Object.entries(params)) {
        if (!parameters.has(name) || typeof value === 'object' || String(value).length > 200) throw Object.assign(new Error('Invalid metadata parameter'), {status:400});
    }
    if (params.page != null && (!/^\d+$/.test(String(params.page)) || Number(params.page)<1 || Number(params.page)>500)) throw Object.assign(new Error('Invalid page'), {status:400});
    if (params.query != null && !String(params.query).trim()) throw Object.assign(new Error('Empty search'), {status:400});
    if (params.append_to_response && !String(params.append_to_response).split(',').every(item=>['credits','videos','recommendations'].includes(item))) throw Object.assign(new Error('Unsupported appended data'), {status:400});
    for (const id of endpoint.match(/\d+/g) || []) if (!Number.isSafeInteger(Number(id)) || Number(id)<1) throw Object.assign(new Error('Invalid identifier'),{status:400});
    return params;
}
function url(endpoint, params = {}) {
    validate(endpoint, params);
    const target=new URL('https://api.themoviedb.org/3'+endpoint);
    target.searchParams.set('api_key',key());
    for(const [name,value] of Object.entries(params)) target.searchParams.set(name,String(value));
    if (/^\/(discover|search)\//.test(endpoint)) target.searchParams.set('include_adult','false');
    return target;
}
async function request(endpoint,params={}) { return fetch(url(endpoint,params),{signal:AbortSignal.timeout(12000)}); }
function redact(value) { return String(value).replace(/([?&](?:api_key|access_token|token)=)[^&\s]+/gi,'$1[redacted]'); }
module.exports={key,url,validate,request,redact};
