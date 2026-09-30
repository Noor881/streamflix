# Slider and saved-card follow-up

The supplied mobile recording showed an empty hero except for a narrow backdrop strip and controls. Reproduction at 390px found `.hero-slides` was 0px high because its percentage height sat inside an auto-height parent with only min-height. Active title content was positioned above the clipped hero.

- Set a definite mobile carousel height with a pixel fallback and bounded small-viewport units.
- Removed conflicting old split-layout padding/flex styling from the current hero component.
- Reserved a separate control area; dots and pause no longer overlap Play/More Info or each other.
- Swipe handling ignores predominantly vertical scrolling, interactive controls and cancelled gestures; binding is idempotent.
- Carousel rotation respects pointer/focus pause and restores the correct active-slide state after returning home.
- Recently Viewed uses the same portrait card shell and responsive row rules as Trending. My List already uses the shared catalog shell. Title links, saved posters and TV season/episode labels are preserved.

Verification: all 19 regression tests passed. All five slides checked at 320, 390, 768 and 1280px: active content inside hero, controls separate, no page overflow. Recently Viewed matches Trending: 138×291px at 320, 173×343.5px at 390 and 154×315px at 768/1280. These browser checks used Chromium; direct native iPhone/Safari testing was not available.
