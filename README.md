# Symbol Studio

Magda Gourinchas’s SVG editor for circle, dot, and line symbols. Open this folder in OpenCode. The editable HTML, CSS, JavaScript, and locally bundled Inter Tight fonts live in dist/.

## Run locally

From this folder run `python3 -m http.server 8000 --bind 127.0.0.1 --directory dist`, then visit http://127.0.0.1:8000/. The project runs directly from these files and has no build step.

## Continue development

- Edit dist/editor.js for presets, pointer gestures, drawing state, SVG rendering, undo, and exports.
- Edit dist/index.html for controls and dist/studio.css for layout and typography. Use Inter Tight throughout.
- Keep the 32-unit snap grid, stepped circle and stroke sizes, and individual circle fills. Select moves placed dots, Circle adds dots, Connect creates branches, and Bend reshapes a line.
- Drafts and variations live in localStorage on the browser origin where they were created. The built-in presets travel with this source. Personal variations can be exported individually as JSON from the original editor.
- The online gallery and Instagram publishing are possible future additions.

## Editing controls

- **V** Select / move; **O** Add circle; **C** Connect; **B** Bend; **E** Erase.
- **Shift-click** shapes or lines, or drag a box in Select mode, to select mixed groups. **Ctrl / Cmd A** selects all. **D** toggles dotted strokes for the selection. Curve controls apply to selected lines; fill and circle/square conversion apply to selected shapes. The Selected menu reveals only relevant controls.
- **Randomize symbol** creates 4–20 connected, grid-aligned shapes, with varied dotted strokes, shape size, line weight, distortion amount, and distortion scale. Undo restores the previous drawing.
- Experimental connected motion is currently disabled for production with `canvasMotionEnabled` in `dist/editor.js`. Its implementation remains in `dist/motion.js` for future iteration; saved coordinates and exports are static.
- Click a Sketchbook or variation entry to edit it. **Save edits** updates that entry, including its name; **Save variation** creates a separate copy. **Delete library entry** removes the saved entry while leaving the open drawing intact. Sketchbook edits persist locally under `mg-sketchbook-v1`.
- Select a circle, then use **F** or **Fill circle** to toggle only that circle.
- Select a connection or one/more shapes and toggle **Dotted stroke** to replace the continuous stroke with round points. Dot diameter equals Line weight, spacing scales with it, and the dots follow the same distorted vector path. Fill remains independent. The style is saved in node slot 5 and edge slot 4 and is retained in SVG/Instagram exports.
- Select a connection to use its curve handle, ten-level slider, or Straighten.
- Curves bend perpendicular to the connection in levels from -4 to 5, relative to its length. Moving endpoints preserves the level.
- **Arrow keys** nudge selected points; **Delete / Backspace** removes the selection; **G** toggles grid snapping.
- **Ctrl / Cmd Z** undo; **Ctrl / Cmd Shift Z** redo; **Ctrl / Cmd S** save variation.
- **Escape** cancels an active drag. Pointer cancellation or focus loss also rolls back unfinished gestures.
- Nodes use `[x, y, junction, filled, shape, dottedStroke]`, with `shape` either `circle` (default) or `square`. Edges use `[start, end, bendX, bendY, dottedStroke]`; omitted dotted flags default to solid. Squares stay axis-aligned; their connections meet their edges. Legacy symbol-wide fills migrate automatically when loaded.
- Place a circle on a line, move a shape onto a line, or end a connection on a line to split it into connected segments. With snapping enabled, the new junction uses the grid and the line adjusts to it.
- Use **− / +** to zoom out / in and **Fit** to see the full symbol. SVG exports include the complete drawing, including shapes outside the original canvas. **Export PNG** creates a square 1200 × 1200 PNG with the symbol centered on `#FFFEF8`.

## Checks

Run `node --check dist/editor.js`, `node --check dist/motion.js`, and `node --test tests/editor.test.cjs tests/motion.test.cjs`.

## Instagram demo

Click **Instagram demo** to compose a 1080 × 1350 JPEG from the current drawing. The symbol is centered on `#FFFEF8`; its title and the local creation date are set in bundled Inter Tight at the bottom left. Portrait (3:4) and square crop previews show the shared safe area. Long titles wrap automatically.

The date uses `MM.DD.YY` and sits directly below the title. The **Symbol style** menu has four ten-stop sliders: **Shape size** (8–192 units), **Line weight** (0.5–16 units), **Edge distortion** (clean through 6.4-unit offsets per axis), and **Distortion scale** (0.2× fine waviness through 8× broad waviness). Amount and scale are independent. The artwork uses smooth vector centerlines stroked at a constant line weight, with no raster filters, blur, or opacity grain. These settings save per symbol and carry through to SVG and Instagram JPEG exports. UI text, controls, and the paper background remain untextured.

## Embed version

Open `embed.html` or `index.html?embed=1`. Both use the same editor source and hide the logo/header, Save variation, Instagram demo, all library controls, and footer. Editing, randomization, zoom, JSON/SVG/PNG exports, and keyboard controls remain available. The embed draft uses separate browser storage (`mg-embed-draft-v1`). For production, point the iframe directly to `index.html?embed=1`; `embed.html` is a convenient fallback redirect.

After hosting `dist/`, use your hosted URL:

```html
<iframe id="symbol-studio" src="https://YOUR-DOMAIN/index.html?embed=1"
  title="Symbol editor" style="width:100%;height:950px;border:0"
  loading="lazy" allow="clipboard-write"></iframe>
<script>
  const studioOrigin = 'https://YOUR-DOMAIN';
  window.addEventListener('message', event => {
    if (event.origin !== studioOrigin || event.data?.type !== 'symbol-studio:resize') return;
    document.getElementById('symbol-studio').style.height = `${event.data.height}px`;
  });
</script>
```

The resize message keeps the iframe aligned with responsive content. The host example validates the sender origin before using it. Embed visibility rules are at the end of `dist/studio.css`.

## Production deployment

Deploy the contents of `dist/` together on any static HTTPS host. Preserve the relative `fonts/` paths and serve JavaScript as `text/javascript`, CSS as `text/css`, SVG as `image/svg+xml`, and TTF files as `font/ttf`. Configure long-lived immutable caching for versioned assets and a short cache for HTML.

Recommended response headers:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors https://YOUR-SITE-DOMAIN
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

Replace `YOUR-SITE-DOMAIN` with the exact site origin that may embed the editor. Do not send `X-Frame-Options: DENY` or `SAMEORIGIN` when the editor and portfolio use different origins. The editor makes no network requests and has no package or build-time dependencies.

**Download JPEG** exports the image. **Publish demo** saves the latest demo post under `mg-instagram-demo-v1` in localStorage; it does not contact Instagram. Rendering and demo publishing live in `dist/post.js`.

Live publishing is a future integration: connect an eligible Instagram account through Meta authorization and use a backend to hold credentials, host the generated JPEG, and perform the media publishing calls.

On Windows, start with `python -m http.server 8000 --bind 127.0.0.1 --directory dist`.
