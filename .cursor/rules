# Bluemine — Development Guidelines

## Cross-Browser Compatibility (Chrome + Firefox)

This extension targets **both Chrome and Firefox**. Every feature, bug fix, or change must work in both browsers.

### Key rules

- **Never use `chrome.*` or `browser.*` directly.** Always use `browserAPI.*` from `lib/browser-polyfill.js`.
- **Never use `storage.sync`.** Firefox does not support it. All storage goes through `browserAPI.storage.local`.
- **Never use `webRequest` APIs.** Redmine tab detection is done via DOM inspection in the content script (`detectRedmineFromDOM()` in `content/content.js`), not via HTTP header sniffing.
- **New content scripts** must include `lib/browser-polyfill.js` before them in the `content_scripts` array in `manifest.json`.
- **New popup/options pages** must include `<script src="../lib/browser-polyfill.js"></script>` before their own script.
- The **background service worker** loads the polyfill via `importScripts("../lib/browser-polyfill.js")` at the top.

### Architecture

- `lib/browser-polyfill.js` — Thin shim exposing `browserAPI` (resolves to `browser` on Firefox, `chrome` on Chrome)
- `manifest.json` — MV3 manifest with `browser_specific_settings.gecko` for Firefox
- Redmine detection — Content script checks DOM for Redmine markers and registers via `BLUEMINE_REGISTER_REDMINE_TAB` message to background

### Testing

Always test changes in both Chrome and Firefox (121+).
