const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function detailFixture() {
    const focus = [];
    const scrolls = [];
    const firstEpisode = {focus(options) {focus.push(options);}};
    const grid = {innerHTML:'', scrollTo(options) {scrolls.push(options);}, querySelector:() => firstEpisode};
    const attributes = () => ({values:{}, classList:{toggle() {}, remove() {}, add() {}}, setAttribute(name,value) {this.values[name]=value;}});
    const servers = Array.from({length:4}, attributes);
    const seasons = [1,2].map(number => ({...attributes(), textContent:`Season ${number}`}));
    const nextButton = {disabled:false};
    const label = {textContent:''};
    const player = {src:'', scrollIntoView(options) {this.scroll=options;}};
    const context = {
        console, URL, URLSearchParams, AbortSignal,
        history:{replaceState() {}},
        window:{SiteSEO:require('../seo-core.js'), location:{origin:'https://example.test'}, matchMedia:() => ({matches:true})},
        document:{
            addEventListener() {},
            getElementById:id => ({'episodes-grid':grid,'video-player':player})[id] || null,
            querySelector:selector => ({'.btn-next-ep':nextButton,'.current-episode-label':label})[selector] || null,
            querySelectorAll:selector => ({'.server-btn':servers,'.season-btn':seasons})[selector] || []
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('detail.js','utf8') + `
        this.api={DetailPage,buildPlayer,buildEpisodes,renderEpisodePage,ensureEpisodeVisible,setExpandedPlayer,handleExpandedPlayerKeydown,
            setEpisodes(value) {episodePageState=value;}};
        saveToHistory=()=>{};
        loadEpisodes=()=>{};
        showToast=()=>{};
    `,context);
    const page = context.api.DetailPage;
    page.currentType='tv';
    page.currentSeason=1;
    page.currentEpisode=1;
    page.currentData={id:999,name:'Fixture show',seasons:[{season_number:1,episode_count:80},{season_number:2,episode_count:1}]};
    return {api:context.api,page,grid,focus,scrolls,servers,seasons,nextButton,label,player,context};
}

function episodes(length) {
    return Array.from({length},(_,index) => ({virtual_number:index+1,name:`Episode ${index+1}`,overview:'Synopsis'}));
}

test('changing episode ranges focuses the first new episode and keeps focus at range boundaries',() => {
    const fixture=detailFixture();
    fixture.api.setEpisodes({id:999,season:1,page:0,episodes:episodes(80)});
    fixture.api.renderEpisodePage();
    assert.equal(fixture.focus.length,0,'initial rendering must not steal focus');
    fixture.page.changeEpisodePage(1);
    assert.match(fixture.grid.innerHTML,/data-episode="41"/);
    assert.doesNotMatch(fixture.grid.innerHTML,/data-episode="1" /);
    assert.match(fixture.grid.innerHTML,/41–80 of 80/);
    assert.equal(fixture.focus.length,1,'the removed pagination control transfers focus into the new range');
    assert.equal(fixture.focus[0].preventScroll,true);
    assert.equal(fixture.scrolls[0].top,0);
    fixture.page.changeEpisodePage(1);
    assert.equal(fixture.focus.length,1,'the disabled terminal range must not rerender or move focus');
    fixture.page.changeEpisodePage(-1);
    assert.match(fixture.grid.innerHTML,/1–40 of 80/);
    assert.equal(fixture.focus.length,2);
});

test('automatically revealing a selected episode does not hijack focus',() => {
    const fixture=detailFixture();
    fixture.api.setEpisodes({id:999,season:1,page:0,episodes:episodes(80)});
    fixture.api.ensureEpisodeVisible(65);
    assert.match(fixture.grid.innerHTML,/data-episode="65"/);
    assert.equal(fixture.focus.length,0);
});

test('TV selection updates the watch label and disables Next Episode only at the known end',() => {
    const fixture=detailFixture();
    fixture.page.playEpisode(999,1,80);
    assert.equal(fixture.label.textContent,'Watch S1 E80');
    assert.equal(fixture.nextButton.disabled,false,'an available following season keeps Next Episode usable');
    assert.equal(fixture.player.scroll.behavior,'auto','episode changes honor reduced motion');
    fixture.page.playEpisode(999,2,1);
    assert.equal(fixture.label.textContent,'Watch S2 E1');
    assert.equal(fixture.nextButton.disabled,true);
    fixture.page.playEpisode(999,1,1);
    assert.equal(fixture.nextButton.disabled,false,'returning to an earlier episode restores the control');
});

test('empty upcoming seasons do not advertise an available next episode',() => {
    const fixture=detailFixture();
    fixture.page.currentData.seasons[1].episode_count=0;
    fixture.page.currentEpisode=80;
    fixture.page.updateEpisodeControls();
    assert.equal(fixture.nextButton.disabled,true);
});

test('server and season controls expose their selected state before and after changes',() => {
    const fixture=detailFixture();
    const playerMarkup=fixture.api.buildPlayer('tv',999,1,1);
    assert.match(playerMarkup,/server-btn active" type="button" aria-pressed="true"/);
    assert.equal((playerMarkup.match(/aria-pressed="false"/g)||[]).length,3);
    assert.match(playerMarkup,/btn-next-ep" type="button"/);
    fixture.page.switchServer(2,'tv',999,1,1);
    assert.deepEqual(fixture.servers.map(button=>button.values['aria-pressed']),['false','false','true','false']);
    const episodeMarkup=fixture.api.buildEpisodes(fixture.page.currentData,1,1,999);
    assert.match(episodeMarkup,/season-btn active" type="button" aria-pressed="true"/);
    fixture.page.changeSeason(999,2);
    assert.deepEqual(fixture.seasons.map(button=>button.values['aria-pressed']),['false','true']);
    assert.equal(fixture.label.textContent,'Watch S2 E1');
});

function expandedFixture() {
    const fixture=detailFixture();
    const document=fixture.context.document;
    const attributes=new Map([['role','region']]);
    const classes=new Set();
    const control=() => ({isConnected:true, getClientRects:()=>[{}], focus() {document.activeElement=this;}});
    const trigger=control(), exit=control(), iframe=control();
    const actions={inert:false}, navigation={inert:false}, alreadyInert={inert:true};
    const wrapper={
        classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
        getAttribute:name=>attributes.get(name) ?? null,
        setAttribute:(name,value)=>attributes.set(name,value), removeAttribute:name=>attributes.delete(name),
        querySelector:()=>exit, querySelectorAll:()=>[exit,iframe], contains:element=>element===exit || element===iframe,
        requestFullscreen:async()=>{throw new Error('Native fullscreen denied');}
    };
    const section={children:[wrapper,actions]};
    const body={style:{overflow:'scroll'},children:[section,navigation,alreadyInert]};
    wrapper.parentElement=section;
    section.parentElement=body;
    document.body=body;
    document.activeElement=trigger;
    const getElementById=document.getElementById;
    document.getElementById=id=>id==='player-wrapper'?wrapper:getElementById(id);
    return {...fixture,document,wrapper,attributes,trigger,exit,iframe,actions,navigation,alreadyInert};
}

test('expanded fallback focuses its exit control, contains keyboard focus, and restores prior page state on Escape',async() => {
    const fixture=expandedFixture();
    await fixture.page.toggleFullscreen();
    assert.equal(fixture.document.activeElement,fixture.exit);
    assert.equal(fixture.wrapper.classList.contains('is-expanded'),true);
    assert.equal(fixture.attributes.get('aria-modal'),'true');
    assert.equal(fixture.document.body.style.overflow,'hidden');
    assert.equal(fixture.actions.inert,true);
    assert.equal(fixture.navigation.inert,true);
    let prevented=0;
    fixture.api.handleExpandedPlayerKeydown({key:'Tab',shiftKey:true,preventDefault() {prevented++;}});
    assert.equal(fixture.document.activeElement,fixture.iframe);
    fixture.api.handleExpandedPlayerKeydown({key:'Tab',shiftKey:false,preventDefault() {prevented++;}});
    assert.equal(fixture.document.activeElement,fixture.exit);
    fixture.api.handleExpandedPlayerKeydown({key:'Escape',preventDefault() {prevented++;}});
    assert.equal(prevented,3);
    assert.equal(fixture.document.activeElement,fixture.trigger);
    assert.equal(fixture.wrapper.classList.contains('is-expanded'),false);
    assert.equal(fixture.document.body.style.overflow,'scroll');
    assert.equal(fixture.actions.inert,false);
    assert.equal(fixture.navigation.inert,false);
    assert.equal(fixture.alreadyInert.inert,true,'closing must preserve elements that were already inert');
    assert.equal(fixture.attributes.get('role'),'region');
    assert.equal(fixture.attributes.has('aria-modal'),false);
});

test('the expanded exit button restores focus and successful native fullscreen does not make the page inert',async() => {
    const fixture=expandedFixture();
    await fixture.page.toggleFullscreen();
    await fixture.page.toggleFullscreen();
    assert.equal(fixture.document.activeElement,fixture.trigger);
    assert.equal(fixture.navigation.inert,false);
    let requested=0, exited=0;
    fixture.wrapper.requestFullscreen=async()=>{requested++;};
    await fixture.page.toggleFullscreen();
    assert.equal(requested,1);
    assert.equal(fixture.navigation.inert,false);
    assert.equal(fixture.document.activeElement,fixture.trigger);
    fixture.document.fullscreenElement=fixture.wrapper;
    fixture.document.exitFullscreen=async()=>{exited++;};
    await fixture.page.toggleFullscreen();
    assert.equal(exited,1);
});

test('local diagnostics remain readable when storage is blocked',() => {
    let onReady;
    const rows=[];
    const context={
        navigator:{}, window:{Watchlist:{read:()=>[]}},
        localStorage:{getItem() {throw new Error('Storage is blocked');}},
        document:{
            addEventListener:(name,handler)=>{if(name==='DOMContentLoaded') onReady=handler;},
            getElementById:()=>({append:(...elements)=>rows.push(...elements.map(element=>element.textContent))}),
            createElement:()=>({textContent:''})
        }
    };
    vm.runInNewContext(fs.readFileSync('admin.js','utf8'),context);
    assert.doesNotThrow(onReady);
    assert.equal(rows.length,8);
    assert.equal(rows[5],'Storage unavailable');
});
