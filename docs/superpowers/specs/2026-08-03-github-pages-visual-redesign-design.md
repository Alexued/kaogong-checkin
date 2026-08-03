# GitHub Pages Visual Redesign Design

## Goal

Redesign the existing public introduction and APK download page so it feels energetic, technical, and memorable while remaining trustworthy and fast for Chinese civil-service exam candidates.

The public URL, release links, APK metadata, screenshots, checksum, privacy statement, and dependency-free GitHub Pages delivery model remain unchanged.

## Visual Thesis

The direction is **Sprint Instrument Panel**: a high-contrast release page influenced by sports campaign graphics and timing equipment rather than a generic software landing page.

- Material: graphite black, cold white, hard rules, exposed grid marks, and solid color blocks.
- Energy: oversized numbers, condensed labels, sharp rhythm changes, and decisive motion.
- Product signal: real application screenshots stay prominent and readable instead of becoming decorative background texture.
- Restraint: no gradients, glassmorphism, decorative blobs, nested cards, stock imagery, or generic three-card feature grid.

## Audience And Context

The primary audience is a Chinese Android user preparing for public-service examinations. They need to understand the product quickly, trust the APK source, and reach the download action without learning a new navigation system.

The visual system should communicate execution, timing, repetition, and progress. It must not resemble a gaming launcher, cryptocurrency site, or enterprise monitoring dashboard.

## Color And Typography

### Palette

- Graphite canvas: near-black neutral, not dark blue.
- Cold white: primary text and light section background.
- Electric cyan: primary download action, progress line, and active markers.
- Signal yellow: timing facts and selected emphasis.
- Signal coral: occasional section index or warning-level accent.
- Neutral gray: secondary text, separators, and inactive marks.

The three accent colors are used sparingly and for different roles. Sections alternate between graphite and cold-white bands so the page does not become a one-note dark theme.

### Typography

- Chinese display text uses the installed heavy system Chinese sans stack for reliable glyph coverage.
- Latin labels, version numbers, indices, and timing data prefer `Bahnschrift`, with robust system fallbacks.
- Headlines use high weight, compact line-height, and normal letter spacing.
- Body copy remains calm and readable, with no viewport-scaled font sizing.

The signature is the contrast between very large Chinese headlines and precise instrument-style numeric labels.

## Page Structure

### Header And Progress Rail

A compact sticky header keeps the icon, product name, repository link, and download command visible. A 2-pixel page progress rail runs along the top edge and advances with `transform: scaleX()`.

The header uses a solid background with a hard lower rule. It does not use blur or translucency.

### Hero

The hero remains the first screen and uses the real countdown screenshot as a full-bleed background. The image receives a deliberate crop and restrained dark overlay so the actual interface remains identifiable.

The foreground contains:

- the literal product name `考公打卡` as the H1;
- a compact category label;
- one outcome-focused paragraph;
- a prominent direct APK download command;
- the release link and three verified release facts;
- a large `05:01` visual motif built from text and rules, referencing version `0.5.1` and timed study without pretending to be live data.

The hero uses an asymmetric composition but does not become a split text-and-media layout. On every supported viewport, the next content band remains partially visible.

### Capability Strip

Replace the quiet three-column summary with a horizontal instrument strip. Each item has a large two-digit index, a short outcome, and a compact operational label. Hard separators and offset accent marks provide rhythm without card containers.

### Workflow Stories

Each real application workflow becomes a full-width editorial band rather than a repeated card-like row.

1. Daily execution uses a light band with a large `01` marker and the Today screenshot.
2. Timing uses a graphite band with signal-yellow timing marks and the Countdown screenshot.
3. Memorization drills use a cold-white band with coral indexing and the Drill screenshot.
4. Local control uses a graphite band with cyan network marks and the Settings screenshot.

Desktop alternates text and screenshot placement. Each screenshot is fully inspectable, uses a stable aspect ratio, and is framed by a solid offset color slab and thin outline. Mobile layouts stack copy before media and remove any sticky behavior.

### Download Finale

The closing download band is the strongest command surface after the hero. It uses electric cyan against graphite, includes the full APK filename, version, size, platform, release link, and checksum copy control.

The checksum remains breakable on narrow screens. Copy success and failure use text and color changes inside a fixed-height action slot so the layout does not shift.

### Footer

The footer stays compact and retains repository, release, return-to-top, and privacy information. It uses a hard top rule and no separate panel.

## Motion System

Motion is short, directional, and tied to hierarchy.

- Hero entrance: category, H1, copy, action, and facts arrive in a 70 ms stagger using opacity and `translateY` over 520 to 680 ms.
- Progress rail: one passive `requestAnimationFrame` update while scrolling, using only `transform`.
- Workflow reveal: copy rises slightly while screenshots reveal once with opacity, translation, and a short `clip-path` transition.
- Section indices: a small horizontal rule expands once when the section enters.
- Commands: hover moves by at most 2 pixels; press scales to 0.97.

There are no infinite animations, cursor followers, scroll traps, autoplay media, or mobile parallax. `prefers-reduced-motion: reduce` disables all reveals and smooth scrolling while keeping every item visible.

## Responsive Behavior

The redesign must support at least 360 x 800, 412 x 915, 768 x 1024, and 1440 x 900.

- Header labels and download commands fit without truncation.
- The hero height uses stable `svh` bounds and keeps the primary action above the fold.
- Large numeric decoration is clipped inside its own layer and cannot increase document width.
- Workflow bands become single-column below 860 pixels.
- Screenshot width is capped so tall phone images do not dominate the entire mobile scroll.
- All text, checksum values, and APK filenames wrap without horizontal overflow.

## Progressive Enhancement And Accessibility

- The complete page remains readable with JavaScript disabled.
- Semantic headings, landmarks, lists, definitions, and figure captions remain intact.
- All commands keep visible keyboard focus and a minimum 44-pixel target.
- Screenshot alternative text remains descriptive.
- Text contrast targets WCAG AA or better.
- Motion is never required to reveal content or reach the download.
- Page title, description, canonical URL, Open Graph metadata, favicon, and theme color remain valid.

## Technical Design

The site remains static and dependency-free under `docs/`.

- `index.html` changes only the presentation structure needed for the new visual hierarchy.
- `styles.css` owns the complete token system, responsive layout, and motion states.
- `app.js` keeps checksum copy behavior, observes one-time reveals, and updates the progress rail with a single passive scroll listener and `requestAnimationFrame` batching.
- Existing PNG assets and public GitHub URLs remain the data source.
- No build command, framework, analytics, cookie, external font service, or third-party runtime is introduced.

If JavaScript clipboard access fails, the copy command shows a fixed-height failure state while the checksum remains selectable. If IntersectionObserver is unavailable, all reveal targets become immediately visible.

## Verification

Local and deployed verification must cover:

- HTML and JavaScript syntax plus `git diff --check`;
- desktop and mobile screenshots at all four target viewports;
- horizontal overflow, text wrapping, first-viewport content, and stable screenshot geometry;
- scroll progress, one-time reveal behavior, rapid scroll, and resize;
- reduced-motion output with no hidden content;
- keyboard focus and checksum copy success/failure states;
- console errors, failed requests, lazy image loading, and custom 404 rendering;
- GitHub Pages HTTP 200 and direct APK download size and SHA-256.

## Acceptance Criteria

- The first viewport is unmistakably `考公打卡` and visibly more energetic than the current pastel page.
- The page reads as a focused study product, not a generic SaaS template or gaming site.
- Real screenshots remain legible and central to the story.
- The direct APK download remains visible in the first viewport and the final download band.
- No gradient, decorative blob, glass effect, nested card, scroll trap, or infinite animation is present.
- Desktop and mobile have no overlapping text, layout shift, or horizontal overflow.
- Reduced-motion and no-JavaScript paths expose all content.
- The deployed page and direct APK link pass public verification before handoff.
