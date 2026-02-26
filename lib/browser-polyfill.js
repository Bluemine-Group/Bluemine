/**
 * Cross-browser compatibility shim for Bluemine.
 *
 * Provides a unified `browserAPI` global that works in both Chrome and Firefox.
 * Chrome uses the `chrome.*` namespace, Firefox uses `browser.*`.
 *
 * Import this file before any other script that needs extension APIs.
 * In content scripts and popup, it's loaded via manifest content_scripts / popup.html.
 * In the service worker / background script, it's imported via importScripts().
 */

// eslint-disable-next-line no-unused-vars, no-var
var browserAPI = browserAPI || (() => {
  if (typeof browser !== "undefined" && browser && browser.runtime) {
    return browser;
  }

  if (typeof chrome !== "undefined" && chrome && chrome.runtime) {
    return chrome;
  }

  throw new Error("[Bluemine] No browser extension API found");
})();
