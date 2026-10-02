const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ui=require('../search-ui.js');
test('suggestion markup reserves portrait thumbnails, distinguishes movie/TV and escapes all title text',()=>{
 const items=[{id:550,media_type:'movie',title:'<img src=x onerror=alert(1)>',release_date:'1999-10-15',poster_path:'/poster.jpg'},{id:1396,media_type:'tv',name:'Breaking Bad',first_air_date:'2008-01-20',poster_path:'" onerror="alert(1)'}];
 const html=ui.resultMarkup(items);assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('Movie · 1999'));assert.ok(html.includes('TV series · 2008'));assert.equal((html.match(/<img /g)||[]).length,1);assert.ok(html.includes('role="option"'));assert.ok(html.includes('href="/tv/1396-breaking-bad"'));
});
test('suggestions filter invalid identities, adult/person records and duplicate same-media IDs but retain cross-media identity',()=>{
 const valid={id:1,media_type:'movie',title:'Movie'};const result=ui.validResults({results:[null,valid,valid,{...valid,id:0},{...valid,id:'1'},{...valid,adult:true},{id:1,media_type:'tv',name:'TV'},{id:2,media_type:'person',title:'Person'}]});assert.equal(result.length,2);assert.equal(ui.validResults({results:{}}).length,0);
});
test('suggestions are bounded at eight even with unusually large payloads',()=>assert.equal(ui.validResults({results:Array.from({length:100},(_,i)=>({id:i+1,media_type:'movie',title:'Movie'}))}).length,8));
test('all active templates include shared search scripts/styles and real GET forms; detail has same field',()=>{
 for(const name of ['index','movie','tv']){const source=fs.readFileSync('server/templates/'+name+'.html','utf8');assert.ok(source.includes('/search-ui.js'));assert.ok(source.includes('/search-ui.css'));assert.ok(source.includes('/nav-ui.js'));}
 const detail=fs.readFileSync('detail.js','utf8');assert.ok(detail.includes('id="search-container"'));assert.ok(detail.includes('name="q"'));assert.ok(detail.includes('window.SearchUI?.init()'));
});
test('search controller defines debounce, race guards, keyboard selection, IME suppression and no persistent query history',()=>{
 const source=fs.readFileSync('search-ui.js','utf8');assert.ok(source.includes('},250)'));assert.ok(source.includes('version!==generation'));assert.ok(source.includes('aria-activedescendant'));assert.ok(source.includes('compositionstart'));assert.ok(source.includes("event.key==='Escape'"));assert.ok(!source.includes('localStorage'));assert.ok(source.includes("status.textContent='Suggestions are unavailable"));
});
