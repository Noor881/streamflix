const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const source = fs.readFileSync('scripts/daily-poster.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/daily-poster.yml', 'utf8');

// Evaluate only orchestration with mocked metadata, auth, transport and history.
// The publishing module is never imported or executed by these tests.
function runner({empty = false, env = {}, argv = [], failDetails = false} = {}) {
    const calls = {reads: 0, details: 0, auth: 0, telegram: 0, reddit: 0, writes: []};
    const history = [10];
    const sandbox = {
        console: {log() {}, error() {}}, process: {env, argv, exit() {throw new Error('Unexpected exit');}},
        SITE_URL: 'https://hdwatchzone.com', createSlug: () => 'example',
        loadPostedIds: () => [...history],
        loadDeliveryState: () => ({}), saveDeliveryState() {},
        savePostedIds: ids => {calls.writes.push([...ids]);},
        fetchTrendingMovies: async () => {calls.reads++; return [{id: 550, title: 'Example'}];},
        pickMovies: movies => empty ? [] : movies,
        fetchMovieDetails: async () => {calls.details++; if (failDetails) throw new Error('Metadata unavailable'); return {};},
        getRedditToken: async () => {calls.auth++; return 'mock-token';},
        postToTelegram: async () => {calls.telegram++;return {status:'sent'};}, postToReddit: async () => {calls.reddit++;return {status:'sent'};},
        sleep: async () => {}
    };
    const pure = source.slice(source.indexOf('function readDryRun('), source.indexOf('if (require.main === module)'));
    vm.runInNewContext(pure + '\nthis.run = main; this.mode = readDryRun;', sandbox);
    return {calls, sandbox, run: sandbox.run, mode: sandbox.mode};
}
function noPublishing(calls) {
    assert.equal(calls.auth, 0); assert.equal(calls.telegram, 0); assert.equal(calls.reddit, 0);
    assert.deepEqual(calls.writes, []);
}
test('manual dry-run input is boolean and passed to the script without changing the daily schedule', () => {
    assert.match(workflow, /dry_run:[\s\S]*?type: boolean[\s\S]*?default: false/);
    assert.match(workflow, /DRY_RUN: \$\{\{ inputs\.dry_run \|\| 'false' \}\}/);
    assert.match(workflow, /cron: '0 9 \* \* \*'/);
    assert.match(source, /if \(require\.main === module\) main\(\)/);
});
test('importing the actual module performs no network requests or history writes', () => {
    const result = spawnSync(process.execPath, ['-e', `const https = require('node:https'); const fs = require('node:fs'); const forbidden = () => {throw new Error('Unexpected side effect');}; https.get = forbidden; https.request = forbidden; fs.writeFileSync = forbidden; const api = require('./scripts/daily-poster.js'); if (typeof api.main !== 'function' || typeof api.readDryRun !== 'function') process.exit(2);`], {cwd: process.cwd(), encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.equal(result.stdout, '');
});
test('dry runs skip social authentication, publishing and deduplication writes on every exit path', async () => {
    for (const config of [{}, {empty: true}, {failDetails: true}]) {
        const {calls, run} = runner(config); await run({dryRun: true}); noPublishing(calls);
        assert.equal(calls.reads, 1);
    }
});
test('environment and CLI dry-run selections both preserve external services and history', async () => {
    for (const config of [{env: {DRY_RUN: 'true'}}, {env: {DRY_RUN: ' TRUE '}}, {argv: ['--dry-run']}]) {
        const {calls, run} = runner(config); await run(); noPublishing(calls);
    }
});
test('invalid dry-run values fail before any metadata, authentication or writes', async () => {
    for (const env of [{DRY_RUN: 'yes'}, {DRY_RUN: 'tru'}, {DRY_RUN: '0'}]) {
        const {calls, run} = runner({env}); await assert.rejects(run(), /DRY_RUN must be/);
        noPublishing(calls); assert.equal(calls.reads, 0);
    }
    const {calls, run} = runner(); await assert.rejects(run({dryRun: 'false'}), /dryRun must be/);
    noPublishing(calls); assert.equal(calls.reads, 0);
    const cli = runner({env: {DRY_RUN: 'typo'}, argv: ['--dry-run']});
    await assert.rejects(cli.run(), /DRY_RUN must be/); noPublishing(cli.calls); assert.equal(cli.calls.reads, 0);
});
test('default and explicit false retain the existing scheduled live path, using mocked transports only', async () => {
    for (const config of [{}, {env: {DRY_RUN: 'false'}}]) {
        const {calls, run} = runner(config); await run();
        assert.equal(calls.auth, 1); assert.equal(calls.telegram, 1); assert.equal(calls.reddit, 1);
        assert.deepEqual(calls.writes, [[10, 550]]);
    }
});
test('failed or skipped deliveries do not mark a movie globally posted', async () => {
    for (const status of ['failed','skipped']) {
        const {calls, sandbox, run} = runner();
        let state;
        sandbox.postToReddit = async () => ({status});
        sandbox.saveDeliveryState = value => {state=JSON.parse(JSON.stringify(value));};
        await assert.rejects(run(), /deliveries failed or were skipped/);
        assert.deepEqual(calls.writes, [[10]]);
        assert.equal(state[550].telegram,'sent');
        assert.equal(state[550].reddit,status);
    }
});
test('partial retry does not resend to an already successful platform', async () => {
    const {calls,sandbox,run}=runner();
    sandbox.loadDeliveryState=()=>({550:{telegram:'sent',reddit:'failed'}});
    await run();assert.equal(calls.telegram,0);assert.equal(calls.reddit,1);assert.deepEqual(calls.writes,[[10,550]]);
});
test('Reddit authentication failure does not prevent Telegram delivery',async()=>{
    const {calls,sandbox,run}=runner();sandbox.getRedditToken=async()=>{throw Error('auth');};sandbox.postToReddit=async()=>({status:'skipped'});
    await assert.rejects(run(), /deliveries failed or were skipped/);assert.equal(calls.telegram,1);assert.deepEqual(calls.writes,[[10]]);
});
