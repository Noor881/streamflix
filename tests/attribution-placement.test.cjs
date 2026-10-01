const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('homepage omits the long attribution paragraph while Legal keeps the required notice',()=>{
 const root=path.resolve(__dirname,'..');
 const home=fs.readFileSync(path.join(root,'server/templates/index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.ok(!home.includes('Movie and TV information, posters and ratings are supplied by'));
 assert.ok(home.includes('href="/legal"'));
 assert.ok(app.includes('This product uses the TMDB API but is not endorsed or certified by TMDB.'));
});
