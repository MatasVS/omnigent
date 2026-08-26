// Regression guard for two sub-symptoms of the desktop dead-end 401 bug:
//
// Sub-symptom 1 — No boot-time URL normalization:
//   The CLI saves server: <ws>/api/2.0/omnigent in its config. When that value
//   ends up as the desktop server_url, createWindow() must strip the API mount
//   before loading the URL; otherwise the top-level navigation hits the raw API
//   endpoint, which returns 401 application/json with no SPA and no SSO path.
//
//   createWindow must call stripApiMountFromServerUrl (or an equivalent
//   normalizer) on the saved server_url before it builds the loadUrl.
//
// Sub-symptom 2 — No JSON-401 recovery:
//   When the saved URL had the UI mount (/omnigent or similar) but the server
//   still responds HTTP 401 application/json to a top-level navigation, the
//   window is dead-ended on raw JSON — did-fail-load never fires for HTTP-level
//   errors. The shell must intercept a top-level 401 JSON response (via
//   onHeadersReceived) and redirect to the setup page.
//
// Both are run with `node --test` (no Electron deps needed).

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const mainSource = readFileSync(path.join(__dirname, "../src/main.js"), "utf8");

// Strip block comments, then line comments (leaving `://` in URLs intact).
const liveCode = mainSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("boot-time API-mount normalization (sub-symptom 1)", () => {
  it("imports stripApiMountFromServerUrl from url.js", () => {
    assert.match(
      mainSource,
      /stripApiMountFromServerUrl/,
      [
        "main.js does not import or reference stripApiMountFromServerUrl.",
        "A saved server_url of .../api/2.0/omnigent is loaded raw at boot,",
        "returning a dead-end 401. Fix: import and call stripApiMountFromServerUrl",
        "(or equivalent) on the saved URL in createWindow before loadURL.",
      ].join(" "),
    );
  });

  it("calls stripApiMountFromServerUrl on the saved server_url in createWindow", () => {
    // Guard that the call appears in live code (not just a comment).
    assert.match(
      liveCode,
      /stripApiMountFromServerUrl\s*\(\s*loadSettings\s*\(\s*\)\s*\.\s*server_url\s*\)/,
      [
        "createWindow does not call stripApiMountFromServerUrl on the saved",
        "server_url. Without this, a URL saved as .../api/2.0/omnigent is",
        "loaded directly, returning a dead-end 401 JSON page with no recovery.",
        "Fix: const saved = stripApiMountFromServerUrl(loadSettings().server_url)",
        "in createWindow before building loadUrl.",
      ].join(" "),
    );
  });
});

describe("JSON-401 recovery for top-level navigation (sub-symptom 2)", () => {
  it("intercepts a top-level 401 JSON response and redirects to setup", () => {
    // The onHeadersReceived hook must detect a main-frame 401 with
    // application/json and redirect to the setup page (redirectURL or
    // loadFile(SETUP_PAGE)). Pattern: any live-code reference to statusCode 401
    // being acted on (e.g. statusCode === 401 OR statusCode === 401 check near
    // json/content-type handling).
    assert.match(
      liveCode,
      /statusCode[^;{]*401|json401|redirectToSetupOn.*401|401.*json.*setup/i,
      [
        "main.js has no handler that intercepts a top-level HTTP 401",
        "application/json response and redirects the window to the setup page.",
        "When the web-UI mount returns 401 JSON (e.g. expired credentials),",
        "did-fail-load never fires — HTTP 401 is a successful load from",
        "Chromium's perspective. Fix: add an onHeadersReceived hook that checks",
        "resourceType=mainFrame, statusCode=401, content-type includes json,",
        "and redirects to the setup page.",
      ].join(" "),
    );
  });
});
