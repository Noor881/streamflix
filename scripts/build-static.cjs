const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const OUTPUT_DIRECTORY = path.join(root,'public');
const OWNER = 'streamflix-public-assets-v1';

// Deliberate allowlist: source, automation, templates and local state are not public assets.
const ROOT_ASSETS = [
    'app.js','detail.js','site-core.js','seo-core.js','admin.js','mobile-fixes.js','sw.js',
    'styles.css','nav.css','responsive.css','design-v2.css','cards.css','detail.css','seo-enhancements.css','admin.css',
    'admin.html','offline.html','404.html','manifest.json','sitemap.xml','robots.txt','llms.txt',
    'logo-v2.png','logo-v2.webp','logo.png','favicon-v2.ico','favicon.ico','favicon.jpeg','favicon.svg','apple-touch-icon.png',
    '540bb093e1ba44239f8dc4bb75201b7d.txt'
];
const SCRIPT_ASSETS = ['install.js','idb-helper.js','playback.js','recommendations.js','search.js','visitor-counter.js','watchlist.js'];
const ICON_SIZES = [72,96,128,144,152,192,384,512];

function publicAssets() {
    return [...ROOT_ASSETS,...SCRIPT_ASSETS.map(file=>'scripts/'+file),...ICON_SIZES.map(size=>`icons/icon-${size}x${size}.png`)];
}

function inspectOutput(directory, allowed) {
    for (const item of fs.readdirSync(directory,{withFileTypes:true})) {
        const filename = path.join(directory,item.name);
        const relative = path.relative(allowed.root,filename).split(path.sep).join('/');
        if (item.isSymbolicLink()) throw new Error(`Refusing to overwrite a generated-output symlink: ${relative}`);
        if (item.isDirectory()) {
            if (!allowed.files.some(file=>file.startsWith(relative+'/'))) throw new Error(`Unexpected generated-output directory preserved: ${relative}`);
            inspectOutput(filename,allowed);
        } else if (!item.isFile() || !allowed.files.includes(relative)) {
            throw new Error(`Unexpected generated-output file preserved: ${relative}`);
        }
    }
}

function buildStatic({outputDirectory=OUTPUT_DIRECTORY}={}) {
    const output = path.resolve(outputDirectory);
    if (path.basename(output)!=='public' || output===root || output===path.parse(output).root) throw new Error('Static output must be a dedicated public directory');
    const assets = publicAssets();
    for (const file of assets) {
        const source = path.join(root,file);
        if (!fs.lstatSync(source).isFile()) throw new Error(`Public asset is missing or not a regular file: ${file}`);
    }
    const manifest = output+'.streamflix-build.json';
    let previous;
    if (fs.existsSync(manifest)) {
        if (!fs.lstatSync(manifest).isFile()) throw new Error('Generated ownership manifest is not a regular file; contents preserved');
        try {previous=JSON.parse(fs.readFileSync(manifest,'utf8'));} catch {throw new Error('Existing ownership manifest is invalid; contents preserved');}
        if (previous.owner!==OWNER) throw new Error('Existing ownership manifest is not owned by this build; contents preserved');
    }
    if (fs.existsSync(output)) {
        if (!fs.lstatSync(output).isDirectory()) throw new Error('Static output is not a regular directory');
        if (fs.readdirSync(output).length) {
            if (!previous) throw new Error('Existing public directory has no generated ownership manifest; contents preserved');
        }
        inspectOutput(output,{root:output,files:assets});
    }
    fs.mkdirSync(output,{recursive:true});
    // The ownership marker stays outside the deployed static directory.
    fs.writeFileSync(manifest,JSON.stringify({owner:OWNER,files:assets},null,2)+'\n');
    for (const file of assets) {
        const destination=path.join(output,file);
        fs.mkdirSync(path.dirname(destination),{recursive:true});
        fs.copyFileSync(path.join(root,file),destination);
    }
    return {outputDirectory:output,files:assets};
}

if (require.main===module) {
    try {const output=buildStatic();console.log(`Built ${output.files.length} allowlisted public assets.`);}
    catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={buildStatic,publicAssets,OUTPUT_DIRECTORY};
