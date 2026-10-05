import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

// Run the built login page with its real theme helper; no database is needed.
const dist = fileURLToPath(new URL("../front end/dist/", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
let server, browser, base;

before(async () => {
  await access(resolve(dist, "login.html")).catch(() => {
    throw Error("Run npm run build before running the theme UI tests.");
  });
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = resolve(dist, "." + (pathname === "/" ? "/login.html" : pathname));
      if (!file.startsWith(resolve(dist) + "/")) return response.writeHead(404).end();
      const content = await readFile(file);
      response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CRM_CHROMIUM_PATH ? { executablePath: process.env.CRM_CHROMIUM_PATH } : {}),
  });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
});

async function login(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: options.reducedMotion || "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ unsupported, nativeFailure }) => {
    localStorage.setItem("vb-theme", "light");
    if (unsupported) Object.defineProperty(document, "startViewTransition", { value: undefined });
    if (nativeFailure === "throw") {
      document.startViewTransition = () => { throw Error("Simulated snapshot failure"); };
    } else if (nativeFailure === "skip") {
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (update) => {
        const transition = start(update);
        transition.skipTransition();
        return transition;
      };
    }
    // Keep handles for inspection: a finished, filled pseudo animation can outlive
    // its removed snapshot and disappear from normal animation enumeration.
    window.__themeReveals = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, timing) {
      const animation = animate.call(this, keyframes, timing);
      if (this === document.documentElement && timing?.pseudoElement === "::view-transition-new(root)") {
        window.__themeReveals.push(animation);
      }
      return animation;
    };
  }, { unsupported: Boolean(options.unsupported), nativeFailure: options.nativeFailure });
  await page.route("**/api/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  t.after(async () => {
    try { assert.deepEqual(errors, [], "Theme switching must not raise browser errors"); }
    finally { await context.close(); }
  });
  await page.goto(`${base}/login.html`);
  await expect(page.locator(".auth-theme-toggle")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  return page;
}

async function tap(page, count = 1) {
  return page.evaluate((count) => {
    const button = document.querySelector(".auth-theme-toggle");
    const box = button.getBoundingClientRect();
    const started = performance.now();
    for (let index = 0; index < count; index++) {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
    }
    return started;
  }, count);
}

async function settled(page, theme, timeout = 2500) {
  await page.waitForFunction((theme) => {
    const root = document.documentElement;
    return root.dataset.theme === theme && !root.classList.contains("theme-revealing") && !root.classList.contains("theme-fading");
  }, theme, { timeout });
  const state = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      remaining: root.getAnimations().filter((animation) => animation.effect?.pseudoElement === "::view-transition-new(root)").length,
      retained: window.__themeReveals.filter((animation) => animation.effect?.getComputedTiming().progress != null).length,
      buttonName: document.querySelector(".auth-theme-toggle").style.viewTransitionName,
      saved: localStorage.getItem("vb-theme"),
    };
  });
  assert.equal(state.remaining, 0, "Finished reveal effects must be removed from the root");
  assert.equal(state.retained, 0, "Finished reveal handles must stop applying their filled effects");
  assert.equal(state.buttonName, "", "The temporary snapshot name must be restored");
  assert.equal(state.saved, theme, "The selected theme must remain saved");
}

test("20 native one-second switches clean up every reveal", { timeout: 60000 }, async (t) => {
  const page = await login(t);
  assert.equal(await page.evaluate(() => typeof document.startViewTransition), "function", "Chromium must exercise the real view transition API");
  const durations = [];
  for (let index = 0; index < 20; index++) {
    const started = await tap(page);
    await page.waitForFunction(() => window.__themeReveals.some((animation) => animation.playState === "running"), null, { timeout: 1500 });
    const duration = await page.evaluate(() => window.__themeReveals.at(-1).effect.getTiming().duration);
    assert.equal(duration, 1000, "The full circular reveal should last one second");
    await settled(page, index % 2 ? "light" : "dark");
    const elapsed = await page.evaluate((started) => performance.now() - started, started);
    durations.push(Math.round(elapsed));
    assert.ok(elapsed <= 2500, `Switch ${index + 1} stalled for ${Math.round(elapsed)} ms`);
  }
  t.diagnostic(`Completed reveal durations in ms: ${durations.join(", ")}`);
});

test("15 rapid taps preserve parity without building a transition backlog", { timeout: 10000 }, async (t) => {
  const page = await login(t);
  const started = await tap(page, 15);
  await settled(page, "dark", 3500);
  const result = await page.evaluate((started) => ({ elapsed: performance.now() - started, reveals: window.__themeReveals.length }), started);
  assert.ok(result.elapsed <= 3500, "A burst must finish without replaying all queued taps");
  assert.ok(result.reveals <= 2, "Rapid taps should coalesce into at most one pending reveal");
  // A hidden queue must not start a later switch after the first cleanup.
  await page.waitForTimeout(1100);
  await settled(page, "dark", 200);
  const before = await page.evaluate(() => window.__themeReveals.length);
  await tap(page, 16);
  await settled(page, "dark", 3500);
  assert.equal(await page.evaluate(() => window.__themeReveals.length), before + 2, "An even burst should perform the active and one pending reveal");
});

test("unsupported browsers repeatedly fade and coalesce taps without a backlog", { timeout: 12000 }, async (t) => {
  const page = await login(t, { unsupported: true });
  for (let index = 0; index < 3; index++) {
    await tap(page);
    await settled(page, index % 2 ? "light" : "dark");
  }
  const started = await tap(page, 15);
  await settled(page, "light", 3500);
  assert.ok(await page.evaluate((started) => performance.now() - started <= 3500, started));
  await page.waitForTimeout(1100);
  await settled(page, "light", 200);
  await tap(page, 16);
  await settled(page, "light", 3500);
  assert.equal(await page.evaluate(() => window.__themeReveals.length), 0);
});

test("reduced motion switches instantly, including repeated taps", { timeout: 5000 }, async (t) => {
  const page = await login(t, { reducedMotion: "reduce" });
  for (let index = 0; index < 5; index++) {
    await tap(page);
    await settled(page, index % 2 ? "light" : "dark", 500);
  }
  await tap(page, 15);
  await settled(page, "light", 500);
  assert.equal(await page.evaluate(() => window.__themeReveals.length), 0);
});

for (const nativeFailure of ["throw", "skip"]) {
  test(`native transitions that ${nativeFailure} keep later switches usable`, { timeout: 5000 }, async (t) => {
    const page = await login(t, { nativeFailure });
    for (let index = 0; index < 5; index++) {
      await tap(page);
      await settled(page, index % 2 ? "light" : "dark", 1500);
    }
    await tap(page, 15);
    await settled(page, "light", 1500);
  });
}
