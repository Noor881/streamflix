const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('design-v2.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const detailCss = fs.readFileSync('detail.css', 'utf8');
const html = fs.readFileSync('server/templates/index.html', 'utf8');

function declarations(selector, source = css) {
    const result = {};
    for (const rule of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!rule[1].split(',').some(value => value.trim() === selector)) continue;
        for (const declaration of rule[2].split(';')) {
            const colon = declaration.indexOf(':');
            if (colon >= 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim().replace(/\s*!important$/, '');
        }
    }
    return result;
}
const variables = declarations(':root');
function resolved(value) {
    return value.replace(/var\((--[\w-]+)\)/g, (_, name) => resolved(variables[name]));
}
function luminance(hex) {
    let digits = hex.replace('#', '');
    if (digits.length === 3) digits = digits.split('').map(value => value + value).join('');
    assert.match(digits, /^[\da-f]{6}$/i);
    const channels = [0, 2, 4].map(index => parseInt(digits.slice(index, index + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(foreground, background) {
    const a = luminance(resolved(foreground));
    const b = luminance(resolved(background));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function minimum(foreground, background, label) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(3)}:1 is below WCAG 1.4.3's 4.5:1 minimum`);
}

test('filled primary and selected-tab text meet 4.5:1 in normal and hover states', () => {
    for (const selector of ['.btn-cineby-primary', '.btn-cineby-primary:hover', '.section-tab.active', '.section-tab.active:hover']) {
        const style = declarations(selector);
        minimum(style.color, style.background, selector);
    }
});

test('About inline and quick links have sufficient contrast and remain underlined', () => {
    const background = html.match(/<section aria-label="About HD Watchzone" style="[^\"]*background:([^;]+);/)[1];
    const selector = 'section[aria-label="About HD Watchzone"] a';
    const style = declarations(selector);
    minimum(style.color, background, 'About links');
    minimum(declarations(selector + ':hover').color, background, 'About hovered links');
    assert.equal(style['text-decoration'], 'underline');
    assert.match(css, /section\[aria-label="About HD Watchzone"\] a\s*\{[^}]*color:[^;]+!important/);
    assert.match(css, /section\[aria-label="About HD Watchzone"\] a\s*\{[^}]*text-decoration:[^;]+!important/);
});

test('homepage and detail footer text meet 4.5:1 without reduced opacity', () => {
    const homeBackground = declarations('.footer').background;
    const detailBackground = declarations('.detail-footer', detailCss).background;
    for (const selector of ['.footer .footer-tagline', '.footer .footer-brand p', '.footer .footer-section a', '.footer .footer-bottom', '.footer .footer-bottom p', '.footer .footer-bottom a', '.footer .footer-lang']) {
        const style = declarations(selector);
        minimum(style.color, homeBackground, selector);
        assert.equal(style.opacity, '1');
    }
    minimum(declarations('.footer .footer-bottom-text').color, homeBackground, 'legacy footer-bottom text');
    for (const selector of ['.detail-footer .footer-links a', '.detail-footer .footer-bottom', '.detail-footer .footer-bottom p']) {
        const style = declarations(selector);
        minimum(style.color, detailBackground, selector);
        assert.equal(style.opacity, '1');
    }
    for (const selector of ['.footer .footer-section a:hover', '.footer .footer-bottom a:hover', '.detail-footer .footer-links a:hover']) {
        minimum(declarations(selector).color, selector.startsWith('.detail') ? detailBackground : homeBackground, selector);
    }
});

test('screen-reader-only labels remain available while visually clipped', () => {
    const style = declarations('.sr-only');
    assert.equal(style.position, 'absolute');
    assert.equal(style.width, '1px');
    assert.equal(style.height, '1px');
    assert.equal(style.overflow, 'hidden');
    assert.equal(style['clip-path'], 'inset(50%)');
    assert.equal(style['white-space'], 'nowrap');
    assert.equal(style.display, undefined);
    assert.equal(style.visibility, undefined);
});
