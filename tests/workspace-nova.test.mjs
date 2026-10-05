import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

// Exercise the built workspace with real React/session code and intercepted API
// responses. These scenarios must never connect to the installed database.
const base = (process.env.CRM_NOVA_BASE_URL || "http://127.0.0.1:4177").replace(/\/$/, "");
const chromePath = process.env.CRM_CHROMIUM_PATH ||
  "/home/nagender/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const user = {
  id: "nova-ui-admin",
  name: "Nova Test",
  email: "nova@example.test",
  phone: "7000000000",
  role: "ADMIN",
  orgId: "nova-test-workspace",
  active: true,
  createdAt: "2026-10-01T09:00:00Z",
};
const hiddenKey = `crm:nova:hidden-until:${user.id}`;
const stages = [{ id: "open-stage", name: "New", kind: "OPEN", position: 0 }];
const contact = {
  id: "nova-contact", name: "Test Contact", email: "contact@example.test",
  company: "Test Company", assigneeId: user.id, createdAt: "2026-10-01T09:00:00Z",
};
const dashboard = {
  kpis: { contacts: 24, activeDeals: 12, openValue: 240000, wonThisMonth: 42000, pendingTasks: 2 },
  monthly: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((month, index) => ({ month, count: index + 1, value: (index + 1) * 10000 })),
  pipeline: [{ ...stages[0], count: 12, value: 240000 }],
  dueCount: 2,
  dueTasks: [
    { id: "nova-task-1", title: "Share project timeline", completed: false, contact: { name: contact.name } },
    { id: "nova-task-2", title: "Review discovery notes", completed: false },
  ],
};
let browser;

before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
});
after(async () => { await browser?.close(); });

const nova = (page) => page.getByRole("button", { name: "Hide Nova for two minutes", exact: true, includeHidden: true });

async function capture(page, name) {
  const directory = process.env.CRM_NOVA_SCREENSHOT_DIR;
  if (!directory) return;
  await page.waitForTimeout(600);
  await expect.poll(() => page.locator(".workspace-nova").evaluate((node) => node.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await expect.poll(() => nova(page).evaluate((node) => node.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, name), fullPage: false });
}

async function workspace(t, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 900 },
    reducedMotion: options.reducedMotion || "no-preference",
    hasTouch: Boolean(options.touch),
    timezoneId: "Asia/Kolkata",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const state = { errors: [], unexpected: [], calls: [], authenticated: true };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("vb-theme", "light"));
  if (options.clock) await page.clock.install({ time: new Date("2026-10-05T09:00:00Z") });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, ""), method = request.method();
    state.calls.push({ path, method });
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/auth/session") return json({ csrfToken: "a".repeat(64) });
    if (path === "/me") {
      if (options.authGate) await options.authGate;
      return state.authenticated ? json(user) : json({ error: "Please sign in again." }, 401);
    }
    if (path === "/stages") return json(stages);
    if (path === "/members") return json([user]);
    if (path === "/teams") return json([]);
    if (path === "/dashboard") return json(dashboard);
    if (["/contacts", "/deals", "/tasks"].includes(path) && method === "GET") {
      const items = path === "/contacts" ? [contact] : [];
      return json({ items, total: items.length, page: Number(url.searchParams.get("page") || 1), pageSize: 20 });
    }
    if (path === "/documents" && method === "GET") return json({ items: [], total: 0, page: 1, pages: 0 });
    if (path === "/search") return json({ contacts: [], deals: [], tasks: [] });
    if (path === "/auth/logout" && method === "POST") {
      state.authenticated = false;
      return route.fulfill({ status: 204 });
    }
    state.unexpected.push(`${method} ${path}`);
    return json({ error: "Unexpected mocked endpoint" }, 500);
  });
  t.after(async () => {
    try {
      assert.deepEqual(state.errors, [], "Nova must not raise browser errors");
      assert.deepEqual(state.unexpected, [], "Every API call must be explicitly intercepted");
    } finally { await context.close(); }
  });
  await page.goto(`${base}/${options.login ? "login" : "home"}.html${options.view ? "#" + options.view : ""}`);
  if (!options.login && !options.authGate) {
    await expect(page.locator("main h1")).toContainText(options.view === "contacts" ? "Contacts" : "Hello, Nova.");
    await expect(page.locator(options.view === "contacts" ? ".records-panel" : ".kpi").first()).toBeVisible();
  }
  return { page, state };
}

async function pointInWorkspace(page, fractionX = .75, fractionY = .45) {
  return page.locator("main#main").evaluate((main, { fractionX, fractionY }) => {
    const rect = main.getBoundingClientRect();
    const left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    const top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    return { x: left + (right - left) * fractionX, y: top + (bottom - top) * fractionY };
  }, { fractionX, fractionY });
}

async function callNova(page, point) {
  // Use a real bubbled double-click with workspace coordinates. The main element
  // is an ordinary background target, avoiding accidental CRM form submissions.
  await page.locator("main#main").dispatchEvent("dblclick", { bubbles: true, detail: 2, clientX: point.x, clientY: point.y });
}

async function assertBounds(page) {
  await expect(nova(page)).toBeVisible();
  const box = await nova(page).boundingBox();
  assert.ok(box, "Nova should be visible after authentication");
  const limits = await page.locator("main#main").evaluate((main) => {
    const rect = main.getBoundingClientRect();
    return { left: Math.max(0, rect.left), right: Math.min(innerWidth, rect.right), top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom) };
  });
  assert.ok(box.x >= limits.left - 2 && box.x + box.width <= limits.right + 2, "Nova must stay inside the visible workspace horizontally");
  assert.ok(box.y >= limits.top - 2 && box.y + box.height <= limits.bottom + 2, "Nova must stay inside the visible workspace vertically");
  assert.ok(box.width >= 40 && box.width <= 66 && box.height >= 48 && box.height <= 82, "Workspace Nova should remain small with a usable click target");
  return box;
}

test("login keeps its existing mascot and never mounts a workspace companion", async (t) => {
  const { page } = await workspace(t, { login: true });
  await expect(page.getByRole("button", { name: "Sign in to your workspace", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-nova")).toHaveCount(0);
  await expect(nova(page)).toHaveCount(0);
});

test("Nova mounts only after identity is verified, as a small body portal", async (t) => {
  let release;
  const authGate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  const { page } = await workspace(t, { authGate });
  await expect(page.locator(".startup")).toBeVisible();
  await expect(page.locator(".workspace-nova")).toHaveCount(0);
  release();
  await expect(page.locator("main h1")).toContainText("Hello, Nova.");
  await expect(nova(page)).toBeVisible();
  assert.equal(await page.locator(".workspace-nova").evaluate((node) => node.parentElement === document.body), true);
  await assertBounds(page);
  await capture(page, "nova-workspace-desktop.png");
});

test("a newer double-click cancels the old trip and Nova subsequently returns", { timeout: 20000 }, async (t) => {
  const { page } = await workspace(t);
  await expect(nova(page)).toBeVisible();
  const home = await nova(page).boundingBox();
  const first = await pointInWorkspace(page, .2, .6), latest = await pointInWorkspace(page, .85, .5);
  await callNova(page, first);
  await page.waitForTimeout(200);
  await callNova(page, latest);
  await expect.poll(async () => {
    const box = await nova(page).boundingBox();
    return box ? Math.hypot(box.x + box.width / 2 - latest.x, box.y + box.height / 2 - latest.y) : Infinity;
  }, { timeout: 6000 }).toBeLessThan(70);
  await assertBounds(page);
  await expect.poll(async () => {
    const box = await nova(page).boundingBox();
    return box ? Math.hypot(box.x - home.x, box.y - home.y) : Infinity;
  }, { timeout: 12000 }).toBeLessThan(35);
});

test("focused forms and modal dialogs keep Nova quiet and reject background calls", { timeout: 12000 }, async (t) => {
  const { page } = await workspace(t, { view: "contacts" });
  await expect(nova(page)).toBeVisible();
  const search = page.getByPlaceholder("Name, email or phone");
  await search.focus();
  await expect(nova(page)).toBeHidden();
  const point = await pointInWorkspace(page, .9, .7);
  await callNova(page, point);
  await page.waitForTimeout(800);
  await expect(nova(page)).toBeHidden();
  await page.getByRole("button", { name: "Add contact", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Full name", { exact: true }).fill("A safe contact form");
  await expect(nova(page)).toBeHidden();
  await callNova(page, point);
  await page.waitForTimeout(800);
  await expect(nova(page)).toBeHidden();
  await expect(page.getByRole("dialog").getByLabel("Full name", { exact: true })).toHaveValue("A safe contact form");
  assert.equal(await page.locator(".workspace-nova").evaluate((node) => node.getAnimations({ subtree: true }).some((animation) => animation.playState === "running" && animation.effect?.getKeyframes().some((frame) => String(frame.transform || "").includes("translate3d")))), false, "No trip may run behind a form or modal");
});

test("click hiding survives navigation and reload, and double-click cannot resurrect Nova", { timeout: 10000 }, async (t) => {
  const { page } = await workspace(t);
  await expect(nova(page)).toBeVisible();
  await nova(page).click();
  await expect(nova(page)).toBeHidden();
  const saved = await page.evaluate((key) => Number(sessionStorage.getItem(key)), hiddenKey);
  assert.ok(saved > Date.now() + 115000 && saved <= Date.now() + 120500, "Dismissal should save a two-minute deadline for this user");
  await callNova(page, await pointInWorkspace(page));
  await page.waitForTimeout(350);
  await expect(nova(page)).toBeHidden();
  await page.locator('nav[aria-label="Main navigation"] a[data-view="contacts"]').click();
  await expect(page.locator("main h1")).toHaveText("Contacts");
  await expect(nova(page)).toBeHidden();
  await page.reload();
  await expect(page.locator("main h1")).toHaveText("Contacts");
  await expect(nova(page)).toBeHidden();
  assert.equal(await page.evaluate((key) => Number(sessionStorage.getItem(key)), hiddenKey), saved);
  await callNova(page, await pointInWorkspace(page));
  await page.waitForTimeout(350);
  await expect(nova(page)).toBeHidden();
});

test("Nova reappears at the saved two-minute deadline using the real timer", { timeout: 10000 }, async (t) => {
  const { page } = await workspace(t, { clock: true });
  await expect(nova(page)).toBeVisible();
  await nova(page).click();
  await expect(nova(page)).toBeHidden();
  const remaining = await page.evaluate((key) => Number(sessionStorage.getItem(key)) - Date.now(), hiddenKey);
  await page.clock.fastForward(Math.max(0, remaining - 1000));
  await expect(nova(page)).toBeHidden();
  await page.clock.fastForward(1100);
  await expect(nova(page)).toBeVisible();
  const deadline = await page.evaluate((key) => Number(sessionStorage.getItem(key) || 0), hiddenKey);
  assert.ok(deadline <= await page.evaluate(() => Date.now()), "The old hide deadline must no longer suppress Nova");
});

test("small-screen roaming and called positions stay inside the visible workspace", { timeout: 18000 }, async (t) => {
  const { page } = await workspace(t, { viewport: { width: 375, height: 740 } });
  await expect(nova(page)).toBeVisible();
  await assertBounds(page);
  await capture(page, "nova-workspace-mobile.png");
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 640 });
    await page.waitForTimeout(250);
    await assertBounds(page);
    await callNova(page, { x: 0, y: 0 });
    await page.waitForTimeout(2200);
    await assertBounds(page);
    await callNova(page, { x: width + 50, y: 900 });
    await page.waitForTimeout(2200);
    await assertBounds(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "The companion must not create horizontal scrolling");
  }
});

test("reduced motion has no companion animations or animated double-click trip", async (t) => {
  const { page } = await workspace(t, { reducedMotion: "reduce" });
  await expect(nova(page)).toBeVisible();
  await assertBounds(page);
  const running = () => page.locator(".workspace-nova").evaluate((node) => node.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length);
  assert.equal(await running(), 0);
  await callNova(page, await pointInWorkspace(page));
  await page.waitForTimeout(250);
  assert.equal(await running(), 0);
  await assertBounds(page);
});

test("Nova over a control allows a touch through before any pointer movement", async (t) => {
  const { page } = await workspace(t, { reducedMotion: "reduce", touch: true });
  await expect(nova(page)).toBeVisible();
  const newDeal = page.getByRole("button", { name: "New deal", exact: true });
  const buttonBox = await newDeal.boundingBox();
  await callNova(page, {
    x: buttonBox.x + buttonBox.width / 2,
    y: buttonBox.y + buttonBox.height / 2 + 76,
  });
  const petBox = await nova(page).boundingBox();
  assert.ok(petBox && petBox.x < buttonBox.x + buttonBox.width && petBox.x + petBox.width > buttonBox.x && petBox.y < buttonBox.y + buttonBox.height && petBox.y + petBox.height > buttonBox.y, "The regression must place Nova over the real CRM button");
  assert.equal(await nova(page).evaluate((node) => getComputedStyle(node).pointerEvents), "none", "The control must already be protected without a mouse move");
  await newDeal.tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "New deal", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("Deal title", { exact: true })).toBeVisible();
});

test("logout removes the portal, timers, and click target from the login page", async (t) => {
  const { page, state } = await workspace(t);
  await expect(nova(page)).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/login.html");
  await expect(page.locator(".workspace-nova")).toHaveCount(0);
  await expect(nova(page)).toHaveCount(0);
  assert.equal(state.calls.some((call) => call.path === "/auth/logout" && call.method === "POST"), true);
});
