const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');

function swipeHarness() {
    const events = {}, carousel = {dataset:{}, addEventListener:(name, callback) => { events[name] = callback; }};
    let next = 0, previous = 0;
    const context = {document:{getElementById:()=>carousel}, nextSlide:()=>next++, prevSlide:()=>previous++};
    vm.runInNewContext(source.slice(source.indexOf('function initHeroSwipe()'), source.indexOf('// Initialize App')), context);
    context.initHeroSwipe();
    const touch = (x,y,control=false) => ({touches:[{}],changedTouches:[{screenX:x,screenY:y}],target:{closest:()=>control}});
    return {events,touch,context,counts:()=>[next,previous],carousel};
}

test('hero mobile layout has a definite height for percentage-height slides', () => {
    const css = fs.readFileSync('design-v2.css','utf8');
    assert.ok(!/\.hero-carousel\s*\{[^}]*height:\s*auto/.test(css));
    assert.ok(css.includes('height: clamp(540px, 72svh, 680px) !important'));
    assert.ok(css.includes('.hero-slide .hero-content-split { display: block !important; padding: 0 !important;'));
});

test('hero horizontal swipe works, but vertical scroll and control taps do not change slides', () => {
    const h = swipeHarness();
    h.events.touchstart(h.touch(250,100)); h.events.touchend(h.touch(100,110));
    h.events.touchstart(h.touch(100,100)); h.events.touchend(h.touch(250,110));
    assert.deepEqual(h.counts(),[1,1]);
    h.events.touchstart(h.touch(250,100)); h.events.touchend(h.touch(190,300));
    h.events.touchstart(h.touch(250,100,true)); h.events.touchend(h.touch(100,100,true));
    assert.deepEqual(h.counts(),[1,1]);
});

test('hero swipe binding is idempotent and cancelled touches do not advance', () => {
    const h = swipeHarness(), previous = h.events.touchend;
    h.context.initHeroSwipe(); assert.equal(h.events.touchend, previous);
    h.events.touchstart(h.touch(250,100)); h.events.touchcancel(); h.events.touchend(h.touch(100,100));
    assert.deepEqual(h.counts(),[0,0]);
});
