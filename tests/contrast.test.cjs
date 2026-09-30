const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('design-v2.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const stylesCss = fs.readFileSync('styles.css', 'utf8');
const pageCss = ['nav.css', 'styles.css', 'responsive.css', 'design-v2.css', 'cards.css'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
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
const variables = declarations(':root', pageCss);
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

function compositedBackground(overlay, background) {
    const rgba = resolved(overlay).match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/);
    assert.ok(rgba, 'the prominent disclaimer background remains a simple rgba overlay');
    const base = resolved(background).replace('#', '');
    assert.match(base, /^[\da-f]{6}$/i);
    const alpha = Number(rgba[4]);
    return '#' + [0, 1, 2].map(index => Math.round(Number(rgba[index + 1]) * alpha + parseInt(base.slice(index * 2, index * 2 + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}

test('Help instructions and body-text links remain readable without relying on hover or color alone', () => {
    const background = declarations('.help-card', pageCss).background;
    minimum(declarations('.help-card p', pageCss).color, background, 'Help instructions');
    const style = declarations('.help-card-links a', pageCss);
    minimum(style.color, background, 'Help links');
    minimum(declarations('.help-card-links a:hover', pageCss).color, background, 'Hovered Help links');
    assert.equal(style['text-decoration'], 'underline');
    assert.equal(style['overflow-wrap'], 'anywhere');
});

test('hero CTA shadows are static at rest without the previous infinite box-shadow repaint', () => {
    const style = declarations('.btn-cineby-primary', pageCss);
    assert.ok(style.animation === undefined || style.animation === 'none');
    assert.ok(style['box-shadow'] && style['box-shadow'] !== 'none');
    assert.ok(!/btn-glow/.test(pageCss));
    assert.ok(declarations('.btn-cineby-primary:hover', pageCss)['box-shadow']);
});

test('native FAQ disclosures have readable answers, visible keyboard focus and no fixed height clipping', () => {
    const style = declarations('.faq-answer', pageCss);
    for (const property of ['height', 'max-height']) assert.ok(style[property] === undefined || style[property] === 'none', property);
    assert.notEqual(style.overflow, 'hidden');
    assert.equal(style['overflow-wrap'], 'anywhere');
    assert.ok(declarations('.faq-question:focus-visible', pageCss).outline);
    minimum(declarations('.faq-answer p', pageCss).color, declarations('body', pageCss).background, 'FAQ answers');
});

test('Contact and Legal normal text and permanently underlined links meet 4.5:1 in the actual page stylesheet cascade', () => {
    const body = declarations('body', pageCss);
    const pageBackground = body.background || body['background-color'];
    const cardBackground = declarations('.contact-info-card', pageCss).background;
    const bannerBackground = compositedBackground(declarations('.disclaimer-banner--prominent', pageCss).background, pageBackground);
    minimum(declarations('.static-page-header p', pageCss).color, pageBackground, 'Contact/Legal subtitles');
    minimum(declarations('.contact-info-card p', pageCss).color, cardBackground, 'Contact operator and card text');
    for (const selector of ['.legal-section p', '.legal-section li']) minimum(declarations(selector, pageCss).color, pageBackground, selector);
    minimum(declarations('.disclaimer-banner p', pageCss).color, bannerBackground, 'Legal disclaimer text');
    for (const [selector, background] of [['.contact-info-card a', cardBackground], ['.legal-section a', pageBackground], ['.disclaimer-banner--prominent a', bannerBackground]]) {
        const style = declarations(selector, pageCss);
        minimum(style.color, background, selector);
        minimum(({ ...style, ...declarations(selector + ':hover', pageCss) }).color, background, selector + ':hover');
        assert.equal(style['text-decoration'], 'underline', selector + ' identifies body-text links without hover or color alone');
        assert.ok(style.opacity === undefined || style.opacity === '1');
    }
});

test('Contact grid and email links can shrink and wrap at 320px and 390px mobile widths', () => {
    for (const selector of ['.contact-form', '.contact-info']) assert.equal(declarations(selector, pageCss)['min-width'], '0', selector);
    for (const selector of ['.contact-info-card p', '.contact-info-card a', '.legal-section a', '.disclaimer-banner--prominent a']) {
        const style = declarations(selector, pageCss);
        assert.equal(style['overflow-wrap'], 'anywhere', selector);
        assert.notEqual(style['white-space'], 'nowrap', selector);
    }
    const mobile = stylesCss.slice(stylesCss.indexOf('@media (max-width: 768px)'));
    for (const width of [320, 390]) {
        assert.ok(width <= 768);
        assert.equal(declarations('.contact-container', mobile)['grid-template-columns'], '1fr', width + 'px uses the existing single-column contact layout');
    }
});

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
