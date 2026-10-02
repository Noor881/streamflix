const fs=require('node:fs');
const path=require('node:path');
const {validateSnapshot}=require('../generate-sitemap.js');
const {buildStatic}=require('./build-static.cjs');
async function build() {
    validateSnapshot(fs.readFileSync(path.resolve(__dirname,'../sitemap.xml'),'utf8'));
    const output=buildStatic();
    console.log(`Built ${output.files.length} allowlisted public assets; title templates stay in the server function.`);
}
if (require.main===module) build().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={build};
