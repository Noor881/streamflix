const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {buildStatic} = require('../scripts/build-static.cjs');
const {createPreviewServer} = require('../scripts/dev-server.cjs');

test('production preview serves built assets and keeps SSR and source exclusions', async t => {
    buildStatic();
    const server = createPreviewServer({productionAssets: true, render: async (req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<main>Rendered ${req.query.route}</main>`);
    }});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const file of ['cards.css', 'app.js', 'detail.js']) {
        const response = await fetch(`${base}/${file}`);
        assert.equal(response.status, 200);
        const body = Buffer.from(await response.arrayBuffer());
        assert.deepEqual(body, fs.readFileSync(`public/${file}`), `exact production bytes: ${file}`);
        assert.ok(!body.equals(fs.readFileSync(file)), `not original source bytes: ${file}`);
    }
    assert.equal(await (await fetch(base)).text(), '<main>Rendered home</main>');
    assert.equal(await (await fetch(`${base}/movie/550-fight-club`)).text(), '<main>Rendered movie</main>');
    for (const path of ['/server/templates/index.html', '/scripts/build-static.cjs', '/package-lock.json', '/node_modules/esbuild/lib/main.js']) {
        assert.equal((await fetch(base + path)).status, 404, `private file excluded: ${path}`);
    }
});
