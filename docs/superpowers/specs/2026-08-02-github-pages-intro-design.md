# GitHub Pages Introduction Site Design

## Goal

Publish a public introduction and download page for 考公打卡 at:

```text
https://alexued.github.io/kaogong-checkin/
```

The page presents the real Android application, explains its main workflows, and provides a direct download of the verified `v0.5.1` APK.

## Delivery Model

The site is a dependency-free static site stored in `docs/` on the `main` branch. GitHub Pages will publish from `main:/docs`.

This approach keeps the public introduction independent from the Vue/Capacitor application build. The site must work when opened as static files and must not require a Node build step or GitHub Actions workflow.

## Release

Create a public GitHub Release tagged `v0.5.1` using the local verified APK:

```text
kaogong-checkin-v0.5.1.apk
```

Release metadata includes:

- the in-app update progress and version history improvements;
- LAN APK discovery, download, and GitHub fallback support;
- verification summary for server tests, client tests, Web build, Android build, and real-device LAN download;
- SHA-256 `C39DA4AA47DD6989CA0A571B913BD2D06D30751C19CE845F61B69FC582E18EA9`.

The primary page download button links directly to:

```text
https://github.com/Alexued/kaogong-checkin/releases/download/v0.5.1/kaogong-checkin-v0.5.1.apk
```

A secondary link opens the `v0.5.1` release page. Both links must be checked after publishing.

## Content Structure

### Header

A compact header contains the application icon, product name, GitHub repository link, and a download command. It remains readable without becoming a separate marketing banner.

### First Viewport

The first viewport uses a real application screenshot as the primary visual signal. The H1 is the product name `考公打卡`. Supporting copy describes it as an Android study workflow for daily plans, check-ins, timing, memorization drills, and local-network synchronization.

The primary download button is visible without scrolling. Version, APK size, Android requirement, and checksum access are adjacent supporting facts. The first viewport leaves part of the next content section visible on desktop and mobile.

### Product Workflows

Use selected real-device screenshots copied into `docs/assets/`:

- today view for daily tasks and progress;
- timer/countdown view;
- memorization or formula-drill view;
- settings/update view showing LAN synchronization and update source.

Screenshots remain legible and are not blurred, darkened, or used as generic atmosphere. Each workflow receives a concise title and outcome-oriented caption.

### Download Section

The closing section repeats the direct APK download command and shows:

- version `0.5.1`;
- APK size rounded for display;
- SHA-256 with a copy control;
- Android unknown-source installation note;
- links to the release notes and repository.

The copy control provides a visible success state and remains functional without external libraries.

## Visual Direction

The site extends the application's clean, focused character without duplicating the app UI as a dashboard.

- Base: white and soft neutral gray surfaces.
- Primary accent: the application's teal.
- Secondary accent: clear blue for download emphasis.
- Text: near-black with restrained gray supporting copy.
- Typography: system Chinese sans-serif stack for fast rendering and reliable glyph coverage.
- Geometry: restrained radii, stable screenshot aspect ratios, and no nested cards.
- Motion: short opacity and translation entrances only when useful, with a complete `prefers-reduced-motion` fallback.

No gradient-only hero, decorative orbs, oversized empty hero, stock imagery, or explanatory feature-tour text is used.

## Responsive Behavior

The layout supports at least:

- 360 x 800 mobile;
- 412 x 915 mobile;
- 768 x 1024 tablet;
- 1440 x 900 desktop.

Text, buttons, checksums, and download metadata must wrap without horizontal overflow. Screenshots use fixed aspect ratios and responsive width constraints so loading cannot shift the layout.

## Accessibility And Metadata

- Semantic headings and landmarks.
- Keyboard-visible focus states.
- Descriptive alternative text for screenshots.
- Minimum touch target of 44 pixels for commands.
- Sufficient contrast for text and controls.
- Page title, description, Open Graph metadata, canonical URL, theme color, and favicon.
- External links use safe `rel` attributes.

## Deployment

1. Add the static site and selected image assets under `docs/`.
2. Validate links and static rendering locally.
3. Commit and push the page implementation.
4. Create the `v0.5.1` GitHub Release and upload the APK.
5. Enable GitHub Pages with `main` and `/docs` as the source.
6. Wait for the Pages build to complete and verify the public URL.
7. Test desktop and mobile layouts in a real browser.
8. Verify the public APK response, filename, and content length.
9. Open the final page in the system default browser.

## Failure Handling

- If the Release already exists, verify its asset and update release notes instead of creating a duplicate.
- If Pages configuration is temporarily unavailable, retain the committed static site and retry the Pages API after confirming repository permissions.
- If the public page is cached during deployment, poll the Pages build status and use a cache-busting query only for verification.
- Do not report completion until the public URL and direct APK link both return successful responses.

## Acceptance Criteria

- `v0.5.1` is a public Release with the verified APK asset.
- The direct APK URL downloads the expected file and reports the expected size.
- GitHub Pages is publicly reachable at the repository Pages URL.
- The page uses real application imagery and presents the download command in the first viewport.
- Desktop and mobile views have no horizontal overflow or overlapping text.
- Reduced-motion behavior is present.
- The final public page is opened in the user's default browser.
