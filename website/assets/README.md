# Screenshots

Every slot has a light and a dark version. The page shows whichever matches the
active mode, swapping instantly with no cross-fade (see `.shot-light` /
`.shot-dark` in `styles.css`).

| Slot | Files | Size | Framing |
| --- | --- | --- | --- |
| Desktop grid | `desktop-grid.webp` / `-dark` | 1920x997 | shown in a window frame drawn by the page |
| Editor | `editor.webp` / `-dark` | 1400x727 | same |
| Drawing | `drawing.webp` / `-dark` | 1400x727 | same |
| Phones | `mobile-1..4.webp` / `-dark` | 850x1796 | the capture carries its own device frame with transparent corners, so the page adds nothing behind it |
| TV | `tv.webp` / `-dark` | 1955x1177 | the capture carries its own bezel, so the page adds no frame at all |

## Replacing one

Keep the same filename and the light/dark pairing. If the pixel size changes,
update the matching `width`/`height` attributes in `index.html`: they reserve
the right space while the image loads and stop the page from jumping.

WebP at quality 85 keeps UI text crisp while staying about a tenth of the PNG
weight. Preserve the alpha channel on the phone and TV captures, otherwise
their rounded corners turn into opaque boxes.

Sizes are chosen from the on-page display width, doubled for high-density
screens: full-width shots stay near 1920, the half-width pair sits at 1400, and
the phones only ever render about 300px wide.
