const {generateSitemap}=require('../generate-sitemap.js');
const {buildStatic}=require('./build-static.cjs');
async function build() {
    await generateSitemap();
    const output=buildStatic();
    console.log(`Built ${output.files.length} allowlisted public assets; title templates stay in the server function.`);
}
if (require.main===module) build().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={build};
