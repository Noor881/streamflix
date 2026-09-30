const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname,'..');
const privateFiles = ['.brainsync/.context-key','.brainsync/shared-context.json','.brainsync/rules/brainsync_auto.md','.cursor/active-context.md'];
const deploymentPatterns = fs.readFileSync(path.join(root,'.vercelignore'),'utf8').split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith('#'));
function deploymentExcluded(file) {
    return deploymentPatterns.some(pattern => pattern.endsWith('/') ? file.startsWith(pattern) : file === pattern);
}

test('private agent key, context and personalized rules are untracked and Git-ignored', () => {
    const tracked = execFileSync('git',['ls-files','--','.brainsync','.cursor/active-context.md'],{cwd:root,encoding:'utf8'}).trim();
    assert.equal(tracked,'','private agent state must stay outside the Git index');
    for (const file of privateFiles) {
        assert.doesNotThrow(()=>execFileSync('git',['check-ignore','--no-index','-q','--',file],{cwd:root,stdio:'ignore'}),file);
    }
});

test('deployment ignores exclude private state without excluding SSR or public assets', () => {
    for (const file of privateFiles) assert.equal(deploymentExcluded(file),true,file);
    for (const file of ['api/render.js','server/ssr.js','seo-core.js','app.js','detail.js','server/templates/index.html','server/templates/movie.html','server/templates/tv.html','cards.css','sitemap.xml','robots.txt','docs/editorial-drafts.md']) {
        assert.equal(deploymentExcluded(file),false,file);
        assert.ok(fs.existsSync(path.join(root,file)),file);
    }
    for (const pattern of ['.vercel','.env*.local','AGENT.md','CLAUDE.md','.agent-mem/']) {
        assert.ok(deploymentPatterns.includes(pattern),`existing local-only exclusion: ${pattern}`);
    }
});
