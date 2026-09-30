const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('hero detail links have title-specific text instead of generic More Info', () => {
    const source=fs.readFileSync('app.js','utf8');
    assert.equal((source.match(/Title details<span class="sr-only"> for \$\{utils.sanitize\(title\)\}<\/span>/g) || []).length,2);
    assert.ok(source.includes('aria-label="Open player for ${utils.sanitize(title)}"'));
    assert.ok(!/\n\s+More Info\n/.test(source));
    assert.ok(source.includes("'/movies':'Browse movies','/tv':'Browse TV','/anime':'Browse anime'"));
    assert.ok(!source.includes('class="section-link">See All'));
});
