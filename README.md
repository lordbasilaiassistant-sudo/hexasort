# HexaSort — Free Hexagon Color Sort Puzzle Game

A relaxing **hexagon color‑sorting puzzle** for mobile and desktop — an original, from‑scratch implementation inspired by the "hexa sort" genre. Drag stacks of colored hexagon tiles onto a hex board; adjacent tiles whose **top color matches** pool together, and collecting **10 of one color** in a stack pops it for points.

Built as a single‑page, zero‑dependency, **installable PWA** that runs perfectly on GitHub Pages.

**▶ Play:** open the GitHub Pages URL of this repo on any phone or browser — no install required (but you can "Add to Home Screen").

### SEO / discoverability (set these on the repo)

GitHub ranks repos partly by the **About** description and **topics**, so set them:

- **Description:** `HexaSort — a free, installable hexagon color‑sort puzzle game (HTML5 PWA). Match, merge & clear colored hex tiles. Plays offline on mobile & desktop.`
- **Website:** the repo's GitHub Pages URL (enable Pages, then paste it in About).
- **Topics:** `game` `puzzle` `puzzle-game` `hexagon` `hexa-sort` `color-sort` `html5-game` `canvas` `pwa` `mobile-game` `javascript` `offline-first` `webgame`

The page itself ships full on‑page SEO: descriptive `<title>`, meta description + keywords, canonical, Open Graph + Twitter Card tags (`og-image.png`), `robots.txt`, and `VideoGame` JSON‑LD structured data for rich results.

## Features

- 🎨 Polished 3D layered hexagon tiles, shockwave/particle clear effects, screen shake, and combo scoring
- 📱 Mobile‑first: touch drag controls, responsive canvas, safe‑area aware
- ⬇️ **Installable** — "Add to Home Screen" gives users an app icon (PWA manifest + service worker + offline cache)
- 💾 **Progress continuity per machine** — the board, tray, score, and best score are saved to `localStorage`; a per‑device profile id is generated so a returning player resumes exactly where they left off, fully offline
- 🚀 Static files only — deploys straight to GitHub Pages

## How to play

1. Three hexagon‑tile pieces sit in the tray at the bottom.
2. Drag a piece onto any empty cell on the board.
3. When the **top** colors of neighboring stacks match, they merge into one.
4. Get **10 tiles of the same color** in a stack and it clears for points. Chain clears for combo multipliers.
5. The board fills up over time — keep it clear to keep playing.

## Deploy to GitHub Pages

1. Create a public repo and push all files in this folder (keep the structure).
2. In the repo settings → **Pages**, set the source to the `main` branch, root.
3. Open `https://<user>.github.io/<repo>/` on a phone and choose **Add to Home Screen** to install.

No build step. All paths are relative, so it works from any sub‑path.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell + HUD + overlay |
| `style.css` | Theme and layout |
| `game.js` | Game engine, rendering, animation, persistence |
| `manifest.webmanifest` | PWA metadata (installability) |
| `sw.js` | Service worker (offline cache) |
| `icons/` | App icons (192/512 + maskable) |
| `og-image.png` | 1200×630 social share image |
| `robots.txt` | Allow all crawlers |
| `.nojekyll` | Serve files as‑is on GitHub Pages |

## Local development

```bash
python -m http.server 8000
# open http://localhost:8000
```

The service worker is automatically disabled on `localhost` so code changes show up without cache busting. Append `?debug=1` to expose a `window.__hexa` test API.
