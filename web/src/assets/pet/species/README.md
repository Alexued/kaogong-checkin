# Original companion animation atlases

These ten SVG atlases are authored in this repository, not fetched from a stock library or generated through a third-party image API. The image-generation service was unavailable (403), so the implementation uses reproducible vector character artwork.

Regenerate with: node web/scripts/generate-pet-atlases.mjs (from repository root).

Each atlas has 8 columns, 11 rows, 128px cells and 88 frames: 22 activities with four articulated poses each. The ordering is shared with PET_ACTIVITIES. Paws, feet, head, expression and activity props change between poses; species have distinct ear, face, tail and body details. The backgrounds are transparent. Inner margins keep jumping poses within their cells.

The original hamster-sheet.png remains unchanged and retains its existing nine-pose animation. Clothing, accessories and vehicles remain icon overlays; they are not illustrated into each frame. Shirts and dresses are positioned on the torso, glasses at the eyes, hats above the face. The compact avatar separates accessory and food positions.

No external asset fetches, fonts, scripts or runtime drawing dependencies are required. Only the selected atlas is displayed by the main avatar. Species-picker thumbnails reuse the same cached atlas URLs.
