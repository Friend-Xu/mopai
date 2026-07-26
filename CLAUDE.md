# Mopai (墨排) — Markdown to WeChat Official Account Formatter

## Tech Stack
- **Runtime**: Browser-only SPA, zero build step
- **Language**: Vanilla JavaScript (ES5/IIFE modules, no transpilation)
- **Markdown**: markdown-it 14.x + markdown-it-footnote
- **Code Highlighting**: highlight.js 11.x
- **CSS Inlining**: juice 12.x (listed as dep, not used at runtime)
- **Dev Server**: `python -m http.server 3456`

## Architecture
Single HTML page with 8 IIFE modules loaded in dependency order via `<script>` tags. No bundler, no framework, no npm scripts.

### Module Loading Order (index.html lines 130-140)
```
hljs → markdownit → markdownitFootnote → state → themes → table-strategy → engine → file-io → copy → export → ui
```

`ui.js` is the orchestrator — all other modules are data or services with no knowledge of the DOM.

### Data Flow
```
User input (textarea/drag/paste)
  → ui.js captures event
  → state.js persists to localStorage
  → engine.js render pipeline:
      1. markdown-it → HTML
      2. applyTheme() walks DOM, merges inline styles per tag
      3. MopaiTable.process() adapts tables for mobile
      4. Footnote section appended for external links
  → Preview panel updated
  → Export/Copy: same pipeline → Blob download or clipboard
```

### Critical Design Constraint
**Everything must be inline styles.** WeChat Official Account editor strips `<style>`, `<link>`, and `class` attributes. All visual styling is applied via `element.setAttribute('style', ...)`.

## Project Structure
```
index.html          — Single-page app (all CSS in <style>, all JS via <script>)
src/
  ui.js             — Main orchestrator: DOM events, preview updates, toolbar actions
  engine.js         — Markdown → themed HTML pipeline (+ footnote generation)
  themes.js         — 6 article themes + 5 code highlight theme definitions
  table-strategy.js — Adaptive table rendering (fixed/scroll/key-value/warn)
  state.js          — Application state + localStorage persistence + history (max 20)
  file-io.js        — File drag & drop, paste handlers
  copy.js           — Clipboard API with legacy fallback
  export.js         — HTML/Markdown file download via Blob
lib/                — Vendored third-party libraries (minified)
themes/             — highlight.js CSS theme files (5 themes)
dev-server.cmd      — Windows batch file: starts Python HTTP server on :3456
```

## Key Conventions
- **IIFE modules** (`var ModName = (function() { ... })();`) — consistent pattern across all src files
- **Dependency comments** at top of each file: `Depends on: ...` / `Called by: ...`
- **No ES modules** — everything is global-namespaced (project is `type: "commonjs"` in package.json but never runs in Node)
- **ES5 syntax** — `var` not `let/const`, `function` not arrow functions, for broader browser compat
- **State persistence**: current doc auto-saved to `localStorage` on every change; explicit save (Ctrl+S or history button) adds to history list

## Running
```bash
# Start dev server (Windows)
dev-server.cmd

# Or directly
python -m http.server 3456
```
Then open http://localhost:3456

## No Tests
The project has no test suite. `package.json` scripts.test is the default placeholder.

## No Git
The project directory has no git repository initialized.
