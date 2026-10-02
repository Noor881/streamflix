const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {buildStatic,publicAssets}=require('../scripts/build-static.cjs');
const root=path.resolve(__dirname,'..');
const temporaryRoot=fs.realpathSync(os.tmpdir());
let directory,outputDirectory;
const read=(base,file)=>fs.readFileSync(path.join(base,file),'utf8');
const hash=(base,file)=>createHash('sha256').update(fs.readFileSync(path.join(base,file))).digest('hex');

test.before(()=>{
    directory=fs.mkdtempSync(path.join(temporaryRoot,'streamflix-minify-test-'));
    outputDirectory=path.join(directory,'public');
    const originals=new Map([...publicAssets().filter(file=>/\.(?:js|css)$/.test(file)),'server/ssr.js','api/render.js',...['index.html','movie.html','tv.html'].map(file=>'server/templates/'+file)].map(file=>[file,hash(root,file)]));
    buildStatic({outputDirectory});
    for(const [file,digest] of originals) assert.equal(hash(root,file),digest,`build preserves original source: ${file}`);
});
test.after(()=>{
    if (!directory) return;
    const target=fs.realpathSync(directory);
    assert.equal(path.dirname(target),temporaryRoot);
    assert.ok(path.basename(target).startsWith('streamflix-minify-test-'));
    fs.rmSync(target,{recursive:true,force:true});
});

function classicScripts(base,script) {
    const app={innerHTML:'',style:{}};
    const saved=new Map();
    const c={console,URL,URLSearchParams,AbortSignal,Promise,Map,Set,Date,Math,JSON,Number,String,parseInt,
        setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame(){},
        matchMedia:()=>({matches:false}),navigator:{},
        location:{pathname:'/',search:'',hash:'',hostname:'localhost',href:'https://hdwatchzone.com/',origin:'https://hdwatchzone.com'},
        history:{pushState(){},replaceState(){}},addEventListener(){},scrollTo(){},
        localStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
        document:{cookie:'',hidden:false,body:{style:{}},addEventListener(){},getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[]}
    };
    c.window=c;
    vm.createContext(c);
    for(const file of ['seo-core.js','site-core.js',script]) vm.runInContext(read(base,file),c,{filename:file,timeout:5000});
    return {c,app,saved};
}

test('generated JavaScript preserves script mode and no source maps or private build paths are published',()=>{
    let sourceBytes=0,productionBytes=0;
    for(const file of publicAssets().filter(file=>/\.(?:js|css)$/.test(file))) {
        const contents=read(outputDirectory,file);
        sourceBytes+=fs.statSync(path.join(root,file)).size;
        productionBytes+=Buffer.byteLength(contents);
        assert.notEqual(contents,read(root,file),`production transform: ${file}`);
        assert.doesNotMatch(contents,/sourceMappingURL|sourceURL|[A-Z]:[\\/]Users[\\/]|node_modules[\\/]|scripts[\\/]build-static\.cjs/i,file);
        if(file.endsWith('.js')) {
            if(/^(?:import|export)\b/m.test(read(root,file))) execFileSync(process.execPath,['--input-type=module','--check'],{input:contents,encoding:'utf8'});
            else new vm.Script(contents,{filename:file});
        }
    }
    assert.ok(productionBytes<sourceBytes*.8,'production CSS/JS together save at least 20% without changing source assets');
    const before=new Map(publicAssets().map(file=>[file,fs.readFileSync(path.join(outputDirectory,file))]));
    buildStatic({outputDirectory});
    for(const [file,contents] of before) assert.deepEqual(fs.readFileSync(path.join(outputDirectory,file)),contents,`deterministic rebuild: ${file}`);
});

test('minified catalog scripts preserve global handlers, function names and rendered HTML',()=>{
    const original=classicScripts(root,'app.js');
    const generated=classicScripts(outputDirectory,'app.js');
    const source=read(root,'app.js');
    const handlers=new Set([...source.matchAll(/window\.(\w+)\s*=/g)].map(match=>match[1]));
    for(const name of handlers) {
        assert.equal(typeof generated.c[name],typeof original.c[name],`global callback/object: ${name}`);
        if(typeof original.c[name]==='function') assert.equal(generated.c[name].name,original.c[name].name,`callback function name: ${name}`);
    }
    const expression=`JSON.stringify([
        components.heroCarousel([{id:550,title:'Movie & title',poster_path:'/p.jpg',backdrop_path:'/b.jpg'}]),
        components.card({id:550,title:'<Movie>',poster_path:'/p.jpg'}),
        components.continueCard({id:1396,type:'tv',title:'Show',season:2,episode:3,poster_path:'/p.jpg'}),
        components.pagination(2,5,'movies','popular')
    ])`;
    assert.equal(vm.runInContext(expression,generated.c),vm.runInContext(expression,original.c),'rendered strings preserve handlers, attributes, escaping and links');
    for(const fixture of [original,generated]) {
        vm.runInContext("router.navigate=path=>{window.lastNavigation=path;}",fixture.c);
        vm.runInContext("navigateMovies('top_rated',2);",fixture.c);
        assert.equal(fixture.c.lastNavigation,'#/movies?category=top_rated&page=2');
        fixture.c.toggleAnalyticsCookies(false);
        assert.equal(fixture.saved.get('analytics_consent'),'false');
        assert.equal(fixture.c['ga-disable-G-ZHQKVYP1WN'],true,'browser API property and consent state preserved');
    }
});

test('minified detail scripts preserve inline-handler object methods and title renderers',()=>{
    const original=classicScripts(root,'detail.js');
    const generated=classicScripts(outputDirectory,'detail.js');
    for(const [,name] of read(root,'detail.js').matchAll(/^(?:async )?function (\w+)\(/gm)) {
        assert.equal(typeof generated.c[name],'function',`classic global: ${name}`);
        assert.equal(generated.c[name].name,original.c[name].name,`function name: ${name}`);
    }
    const methodNames="Object.keys(DetailPage).filter(key=>typeof DetailPage[key]==='function').sort().join(',')";
    assert.equal(vm.runInContext(methodNames,generated.c),vm.runInContext(methodNames,original.c));
    const expression=`JSON.stringify([
        buildBreadcrumbs({id:550,title:'Movie & title'},'movie'),
        buildCast({cast:[{id:1,name:'A Performer',profile_path:'/person.jpg'}]}),
        buildRecos([{id:1396,name:'A Show',poster_path:'/p.jpg',vote_average:8.9}],'tv'),
        responsiveImageAttrs('/p.jpg'),buildDetailFooter()
    ])`;
    assert.equal(vm.runInContext(expression,generated.c),vm.runInContext(expression,original.c));
    for(const fixture of [original,generated]) {
        vm.runInContext("DetailPage.currentType='tv';DetailPage.currentSeason=2;DetailPage.currentEpisode=3;DetailPage.currentData={seasons:[{season_number:2,episode_count:13}]};DetailPage.playEpisode=(...args)=>window.nextEpisode=args;DetailPage.playNextEpisode(1396);",fixture.c);
        assert.equal(JSON.stringify(fixture.c.nextEpisode),'[1396,2,4]','episode callback and method properties are callable');
    }
});

test('production CSS retains portrait sizing, responsive overrides and blocking stylesheet order',()=>{
    const styles=read(outputDirectory,'styles.css');
    assert.match(styles,/\.static-page-header p\{[^}]*color:var\(--color-text-secondary\)/);
    assert.match(styles,/\.contact-info-card p\{[^}]*color:var\(--color-text-secondary\)[^}]*overflow-wrap:anywhere/);
    for(const selector of ['\\.contact-info-card a','\\.legal-section a','\\.disclaimer-banner--prominent a']) {
        assert.match(styles,new RegExp(selector+'\\{[^}]*color:var\\(--color-text-primary\\)[^}]*text-decoration:underline[^}]*overflow-wrap:anywhere'));
    }
    const cards=read(outputDirectory,'cards.css');
    assert.match(cards,/\.card-wrapper>\.card\{[^}]*aspect-ratio:2\s*\/\s*3/);
    assert.match(cards,/\.card-wrapper>\.card-info\{[^}]*height:84px/);
    assert.match(cards,/\.card-wrapper \.card-poster\{[^}]*object-fit:cover/);
    const mobile=cards.indexOf('@media(max-width:560px)');
    assert.ok(mobile>cards.indexOf('.content-grid{'),'mobile override follows base grid');
    assert.match(cards.slice(mobile),/\.content-row\{[^}]*display:grid!important;[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(cards.slice(0,mobile),/\.content-row>\.card-wrapper\{[^}]*flex:0 0 var\(--poster-card-width\)/);
    const orders={
        'index.html':['nav.css','styles.css','responsive.css','design-v2.css','cards.css','search-ui.css'],
        'movie.html':['nav.css','detail.css','seo-enhancements.css','responsive.css','design-v2.css','cards.css','search-ui.css'],
        'tv.html':['nav.css','detail.css','seo-enhancements.css','responsive.css','design-v2.css','cards.css','search-ui.css']
    };
    for(const [file,expected] of Object.entries(orders)) {
        const tags=[...read(root,'server/templates/'+file).matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).filter(tag=>/href="\/(?!\/)/.test(tag));
        assert.deepEqual(tags.map(tag=>tag.match(/href="\/([^?"\s]+)/)[1]),expected,`cascade file order: ${file}`);
        for(const tag of tags) assert.doesNotMatch(tag,/\b(?:media|onload)=/,`layout CSS stays blocking: ${file}`);
    }
});

test('minifier is an exact build-only dependency and server function loads original render sources',()=>{
    const pkg=JSON.parse(read(root,'package.json'));
    const lock=JSON.parse(read(root,'package-lock.json'));
    assert.equal(pkg.devDependencies.esbuild,'0.28.2');
    assert.equal(pkg.dependencies?.esbuild,undefined);
    assert.equal(lock.packages['node_modules/esbuild'].version,pkg.devDependencies.esbuild);
    assert.equal(lock.packages['node_modules/esbuild'].dev,true);
    const include=require('../vercel.json').functions['api/render.js'].includeFiles;
    assert.match(include,/app\.js,detail\.js,seo-core\.js/);
    assert.doesNotMatch(include,/public|build|node_modules/);
    const result=JSON.parse(execFileSync(process.execPath,['-e',"require('./api/render.js');console.log(JSON.stringify(Object.keys(require.cache).map(file=>file.replaceAll('\\\\','/'))));"],{cwd:root,encoding:'utf8'}));
    assert.ok(result.some(file=>file.endsWith('/server/ssr.js')));
    assert.ok(result.some(file=>file.endsWith('/seo-core.js')));
    assert.ok(result.every(file=>!file.includes('/node_modules/') && !file.includes('/scripts/') && !file.includes('/public/')),'function dependency graph excludes the build tool and generated scripts');
    const ssr=read(root,'server/ssr.js');
    assert.match(ssr,/filename = path\.join\(root,file\)/);
    assert.match(ssr,/script\('app\.js'/);
    assert.match(ssr,/script\('detail\.js'/);
});

test('a minification parse error preserves all existing generated assets and ownership metadata',()=>{
    const previous=new Map(publicAssets().map(file=>[file,hash(outputDirectory,file)]));
    const manifest=outputDirectory+'.streamflix-build.json';
    const previousManifest=fs.readFileSync(manifest,'utf8');
    const originalRead=fs.readFileSync;
    try {
        // Simulate an invalid input without editing the source worktree or generated output.
        fs.readFileSync=function(filename,...args) {
            if(typeof filename==='string' && path.resolve(filename)===path.join(root,'app.js')) return Buffer.from('const =;');
            return originalRead.call(this,filename,...args);
        };
        assert.throws(()=>buildStatic({outputDirectory}),/Transform failed/);
    } finally {fs.readFileSync=originalRead;}
    for(const [file,digest] of previous) assert.equal(hash(outputDirectory,file),digest,`existing generated asset preserved: ${file}`);
    assert.equal(fs.readFileSync(manifest,'utf8'),previousManifest);
});
