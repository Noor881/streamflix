const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {buildStatic,publicAssets,OUTPUT_DIRECTORY}=require('../scripts/build-static.cjs');
const config=require('../vercel.json');
const root=path.resolve(__dirname,'..');

function temporaryBuild(t) {
    const temporaryRoot=fs.realpathSync(os.tmpdir());
    const directory=fs.mkdtempSync(path.join(temporaryRoot,'streamflix-static-test-'));
    t.after(()=>{
        const target=fs.realpathSync(directory);
        assert.equal(path.dirname(target),temporaryRoot,'cleanup stays in the selected temporary directory');
        assert.ok(path.basename(target).startsWith('streamflix-static-test-'),'cleanup targets only this generated test directory');
        fs.rmSync(target,{recursive:true,force:true});
    });
    return path.join(directory,'public');
}

test('deployed static output cannot shadow homepage or legacy title SSR rewrites', t => {
    const outputDirectory=temporaryBuild(t);
    const output=buildStatic({outputDirectory});
    assert.equal(config.outputDirectory,'public');
    assert.equal(OUTPUT_DIRECTORY,path.join(root,'public'));
    assert.equal(config.buildCommand,'npm run build');
    const assets=new Set(output.files);
    for (const file of ['index.html','movie.html','tv.html']) {
        assert.equal(fs.existsSync(path.join(root,file)),false,`no root template: ${file}`);
        assert.equal(fs.existsSync(path.join(outputDirectory,file)),false,`no static rewrite collision: ${file}`);
        assert.ok(fs.existsSync(path.join(root,'server','templates',file)),`function template preserved: ${file}`);
    }
    for (const rule of config.rewrites.filter(rule=>rule.destination.startsWith('/api/render'))) {
        const literal=rule.source.slice(1);
        if (literal && !literal.includes(':')) assert.equal(assets.has(literal),false,`no filesystem collision: ${rule.source}`);
    }
    assert.ok(config.functions['api/render.js'].includeFiles.includes('server/templates/*.html'));
});

test('build copies required runtime and verification assets, excluding source and local state', t => {
    const outputDirectory=temporaryBuild(t);
    const first=buildStatic({outputDirectory});
    assert.equal(new Set(first.files).size,first.files.length);
    for (const file of publicAssets()) {
        assert.ok(fs.existsSync(path.join(outputDirectory,file)),file);
        assert.deepEqual(fs.readFileSync(path.join(outputDirectory,file)),fs.readFileSync(path.join(root,file)),`copied source bytes: ${file}`);
    }
    for (const file of ['server/templates/index.html','server/ssr.js','api/render.js','tests/ssr.test.cjs','docs/editorial-drafts.md','FULL-AUDIT-REPORT-RAW.md','seo-expert.skill','scripts/auto-blogger.js','scripts/post-to-facebook.js','scripts/build-static.cjs','.brainsync/.context-key','.cursor/active-context.md','data/movies.sample.json','.github/workflows/verify.yml']) {
        assert.equal(fs.existsSync(path.join(outputDirectory,file)),false,file);
    }
    for (const asset of ['404.html','offline.html','admin.html','sw.js','manifest.json','logo-v2.webp','favicon-v2.ico','540bb093e1ba44239f8dc4bb75201b7d.txt']) assert.ok(first.files.includes(asset),asset);
    assert.ok(!fs.existsSync(path.join(outputDirectory,'public.streamflix-build.json')),'ownership manifest is not public');
    assert.deepEqual(buildStatic({outputDirectory}).files,first.files,'repeat build remains safe and deterministic');
});

test('runtime references in templates, static HTML and manifest all remain available', () => {
    const assets=new Set(publicAssets());
    const files=['server/templates/index.html','server/templates/movie.html','server/templates/tv.html','admin.html','offline.html','404.html'];
    for(const file of files) {
        const html=fs.readFileSync(path.join(root,file),'utf8');
        const references=[...html.matchAll(/\b(?:src|href)="(\/(?!\/)[^"]+)"/g)].map(match=>new URL(match[1].replace(/&amp;/g,'&'),'https://hdwatchzone.com').pathname.slice(1));
        for(const reference of references.filter(value=>/\.(?:js|css|png|webp|ico|svg|json)$/.test(value))) assert.ok(assets.has(reference),`${file}: ${reference}`);
    }
    for(const icon of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).icons) assert.ok(assets.has(icon.src.slice(1)),icon.src);
});

test('unexpected existing output or ownership files are preserved, not recursively deleted', t => {
    const outputDirectory=temporaryBuild(t);
    fs.mkdirSync(outputDirectory);
    const sentinel=path.join(outputDirectory,'user-file.txt');
    fs.writeFileSync(sentinel,'preserve existing user contents');
    assert.throws(()=>buildStatic({outputDirectory}),/preserved/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'preserve existing user contents');
    assert.equal(fs.existsSync(path.join(outputDirectory,'app.js')),false);
    fs.writeFileSync(outputDirectory+'.streamflix-build.json','{"owner":"unrelated-user-tool"}');
    assert.throws(()=>buildStatic({outputDirectory}),/preserved/);
    assert.equal(fs.readFileSync(outputDirectory+'.streamflix-build.json','utf8'),'{"owner":"unrelated-user-tool"}');
});

test('unexpected files added to a generated output remain untouched and fail the build', t => {
    const outputDirectory=temporaryBuild(t);
    buildStatic({outputDirectory});
    const sentinel=path.join(outputDirectory,'index.html');
    fs.writeFileSync(sentinel,'unexpected template collision');
    assert.throws(()=>buildStatic({outputDirectory}),/Unexpected generated-output file preserved: index\.html/);
    assert.equal(fs.readFileSync(sentinel,'utf8'),'unexpected template collision');
    assert.throws(()=>buildStatic({outputDirectory:root}),/dedicated public directory/);
});
