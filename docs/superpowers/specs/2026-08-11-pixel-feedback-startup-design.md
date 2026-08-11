# Pixel feedback and startup timing design

## Visual thesis

Keep the current calm, utility-first mobile interface and make the 3x3 pixel grid its restrained interaction signature. Motion must explain an action, never decorate an idle screen.

## Content plan

The existing information hierarchy remains unchanged. Pixel feedback appears only at the interaction origin for check-in confirmation, item arrival, deletion, completion, and short processing states.

## Interaction thesis

- Check-in expands from the center into a complete 3x3 confirmation.
- Deletion contracts from a complete grid into an empty center, while data is deleted immediately.
- Creation fills upward from the lower-left to communicate arrival.
- The teleported empty-state FAB consumes the same `pending / entering / ready` shell phase as the app content. It is not mounted during `pending` and enters on the same frame as the shell.

## Motion constraints

- Pattern grouping, normalization, absolute-time frame lookup, looping, and reduced-motion union frames follow SwiftPixelGrid.
- Direct feedback stays within 300 to 440 ms and uses a crisp ease-out transition.
- Continuous animations keep the existing requestAnimationFrame renderer. Pattern frames reuse the same three visual layers and fixed geometry.
- Page visibility pauses frame work. Reduced motion stops the loop and renders a meaningful static frame.
- No phone reboot is required for implementation or QA.
