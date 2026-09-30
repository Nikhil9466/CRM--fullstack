import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

// Exercise the built application and its real session/React code. Only API
// responses are replaced; these tests intentionally need no database.
const dist = fileURLToPath(new URL("../front end/dist/", import.meta.url));
const policy = {
  timeZone: "Asia/Kolkata",
  startTime: "09:00",
  endTime: "18:00",
  workingDays: [1, 2, 3, 4, 5],
  graceMinutes: 10,
  expectedMinutes: 480,
};
const csrfToken = "a".repeat(64);
const user = {
  id: "employee-1",
  name: "Attendance Test",
  email: "attendance@example.test",
  role: "ADMIN",
  orgId: "test-workspace",
  teamId: "team-1",
  active: true,
};
const recordedDay = () => ({
  id: "record-1",
  version: 7,
  workDate: "2026-09-30",
  checkIn: "2026-09-30T04:02:34.777Z",
  checkOut: "2026-09-30T11:17:22.911Z",
  breaks: [
    { start: "2026-09-30T06:10:14.213Z", end: "2026-09-30T06:39:11.322Z" },
  ],
  policy,
  status: "Checked Out",
  attendanceStatus: "Late",
  workedSeconds: 23400,
  breakSeconds: 1740,
  canResume: true,
  needsCorrection: false,
});
let server, browser, base;

before(async () => {
  await access(resolve(dist, "home.html")).catch(() => {
    throw Error(
      "Build the React application with npm run build before running the UI tests.",
    );
  });
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const file = resolve(
        dist,
        "." + (pathname === "/" ? "/home.html" : pathname),
      );
      if (!file.startsWith(resolve(dist) + "/")) {
        response.writeHead(404).end();
        return;
      }
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CRM_CHROMIUM_PATH
      ? { executablePath: process.env.CRM_CHROMIUM_PATH }
      : {}),
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
});

async function workspace(t, options = {}) {
  const context = await browser.newContext({
    timezoneId: "Asia/Kolkata",
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const state = {
    record: recordedDay(),
    today: null,
    open: null,
    history: null,
    requests: [],
    documents: [],
    calls: [],
    unexpected: [],
    errors: [],
    resumeConflicts: options.resumeConflicts || 0,
    ...options,
    user: { ...user, ...options.user },
  };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, ""),
      method = request.method();
    const bytes = request.postDataBuffer();
    const body =
      bytes && request.headers()["content-type"]?.includes("application/json")
        ? JSON.parse(bytes.toString())
        : undefined;
    state.calls.push({ path, method, body, bytes, headers: request.headers() });
    const json = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/auth/session") return json({ csrfToken });
    if (path === "/me") return json(state.user);
    if (path === "/stages") return json([]);
    if (path === "/members") return json([state.user]);
    if (path === "/teams")
      return json([{ id: "team-1", name: "Permitted team" }]);
    if (path === "/attendance/today")
      return json({
        today: state.today || state.record,
        open: state.open || (state.record.checkOut ? null : state.record),
        policy,
      });
    if (path === "/attendance/history")
      return json({ items: state.history || [state.record], policy });
    if (path === "/attendance/corrections" && method === "GET")
      return json({
        items: state.requests,
        total: state.requests.length,
        page: Number(url.searchParams.get("page") || 1),
        pageSize: 50,
      });
    if (path === "/attendance/corrections" && method === "POST") {
      const correction = {
        ...body,
        id: `correction-${state.requests.length + 1}`,
        status: "PENDING",
        user: { name: state.user.name },
      };
      state.requests.push(correction);
      return json(correction, 201);
    }
    if (path.startsWith("/attendance/corrections/") && method === "PATCH") {
      const correction = state.requests.find((item) =>
        path.endsWith("/" + item.id),
      );
      Object.assign(correction, body, { reviewer: { name: state.user.name } });
      return json(correction);
    }
    if (path === "/attendance/records/record-1/resume" && method === "POST") {
      if (state.resumeConflicts-- > 0)
        return json({ error: "Attendance changed. Refresh and retry." }, 409);
      state.record = {
        ...state.record,
        checkOut: null,
        canResume: false,
        status: "Working",
        version: state.record.version + 1,
      };
      return json(state.record);
    }
    if (path === "/attendance/start-break" && method === "POST") {
      state.record = {
        ...state.record,
        status: "On Break",
        breaks: [
          ...state.record.breaks,
          { start: "2026-09-30T12:00:00Z", end: null },
        ],
      };
      return json(state.record);
    }
    if (path === "/attendance/end-break" && method === "POST") {
      state.record = {
        ...state.record,
        status: "Working",
        breaks: state.record.breaks.map((item) =>
          item.end ? item : { ...item, end: "2026-09-30T12:10:00Z" },
        ),
      };
      return json(state.record);
    }
    if (path === "/attendance/check-out" && method === "POST") {
      state.record = {
        ...state.record,
        status: "Checked Out",
        checkOut: "2026-09-30T12:15:00Z",
        canResume: true,
      };
      return json(state.record);
    }
    if (path === "/documents" && method === "GET")
      return json({
        items: state.documents,
        total: state.documents.length,
        page: Number(url.searchParams.get("page") || 1),
        pages: state.documents.length ? 1 : 0,
      });
    if (path === "/documents" && method === "POST") {
      const document = {
        id: `document-${state.documents.length + 1}`,
        name: decodeURIComponent(request.headers()["x-document-name"]),
        size: bytes.length,
        createdAt: "2026-09-30T12:00:00Z",
        uploader: { name: state.user.name },
        bytes,
      };
      state.documents.unshift(document);
      return json(document, 201);
    }
    if (path.startsWith("/documents/") && path.endsWith("/download")) {
      const document = state.documents.find(
        (item) => path === `/documents/${item.id}/download`,
      );
      if (document)
        return route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: document.bytes,
        });
    }
    state.unexpected.push(`${method} ${path}`);
    return json({ error: "Unexpected mocked endpoint" }, 500);
  });
  t.after(async () => {
    try {
      assert.deepEqual(
        state.errors,
        [],
        "The integrated React app raised a browser error",
      );
      assert.deepEqual(
        state.unexpected,
        [],
        "The test must explicitly cover all requested API endpoints",
      );
    } finally {
      await context.close();
    }
  });
  await page.goto(`${base}/home.html#${options.view || "attendance"}`);
  await expect(
    page.getByRole("heading", {
      name:
        options.view === "documents"
          ? "Upload a document"
          : "My attendance history",
      exact: true,
    }),
  ).toBeVisible();
  return { page, state };
}
async function submitCorrection(page, reason) {
  await page
    .getByPlaceholder("Explain the missing or incorrect attendance")
    .fill(reason);
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/attendance/corrections",
  );
  await page
    .getByRole("button", { name: "Submit correction request", exact: true })
    .click();
  return (await request).postDataJSON();
}

describe("React attendance and documents preserve server contracts", () => {
  test("untouched correction timestamps preserve seconds and milliseconds, including all breaks", async (t) => {
    const { page, state } = await workspace(t);
    await page
      .getByRole("button", { name: "Request correction", exact: true })
      .click();
    const submitted = await submitCorrection(
      page,
      "Keep the recorded times precise.",
    );
    assert.equal(submitted.proposed.checkIn, state.record.checkIn);
    assert.equal(submitted.proposed.checkOut, state.record.checkOut);
    assert.deepEqual(submitted.proposed.breaks, state.record.breaks);
    await expect(
      page.getByText("Keep the recorded times precise.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Correction review", exact: true })
      .click();
    await page
      .getByPlaceholder("Optional note")
      .fill("Reviewed the complete period.");
    const reviewed = page.waitForRequest(
      (request) =>
        request.method() === "PATCH" &&
        new URL(request.url()).pathname ===
          "/api/attendance/corrections/correction-1",
    );
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    assert.deepEqual((await reviewed).postDataJSON(), {
      status: "APPROVED",
      reviewNote: "Reviewed the complete period.",
    });
    await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
  });

  test("deliberately editing and restoring a time uses the entered local minute, not its original instant", async (t) => {
    const { page, state } = await workspace(t);
    await page
      .getByRole("button", { name: "Request correction", exact: true })
      .click();
    const checkIn = page.getByLabel("Requested check-in", { exact: true });
    const originalInput = await checkIn.inputValue();
    assert.equal(originalInput, "2026-09-30T09:32");
    await checkIn.fill("2026-09-30T09:33");
    await checkIn.fill(originalInput);
    const breakEnd = page.getByLabel("Break 1 end", { exact: true });
    const originalBreakInput = await breakEnd.inputValue();
    await breakEnd.fill("2026-09-30T12:10");
    await breakEnd.fill(originalBreakInput);
    const submitted = await submitCorrection(
      page,
      "Explicitly replace the entered minute.",
    );
    assert.equal(submitted.proposed.checkIn, "2026-09-30T04:02:00.000Z");
    assert.equal(submitted.proposed.checkOut, state.record.checkOut);
    assert.equal(
      submitted.proposed.breaks[0].start,
      state.record.breaks[0].start,
    );
    assert.equal(submitted.proposed.breaks[0].end, "2026-09-30T06:39:00.000Z");
  });

  test("an expired open workday can be corrected when it is outside the history range", async (t) => {
    const open = {
      ...recordedDay(),
      workDate: "2026-08-01",
      checkIn: "2026-08-01T04:02:34.777Z",
      checkOut: null,
      breaks: [],
      status: "Working",
      needsCorrection: true,
      actionsExpired: true,
      canResume: false,
    };
    const { page } = await workspace(t, { open });
    const todayCard = page.locator(".attendance-today");
    await expect(
      todayCard.getByText("2026-08-01", { exact: false }),
    ).toBeVisible();
    assert.equal(
      await todayCard
        .getByRole("button", { name: "Start break", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await todayCard
        .getByRole("button", { name: "Check out", exact: true })
        .count(),
      0,
    );
    await todayCard
      .getByRole("button", { name: "Request correction", exact: true })
      .click();
    await expect(
      page.getByLabel("Workday in workspace timezone", { exact: true }),
    ).toHaveValue("2026-08-01");
    await page
      .getByLabel("Requested checkout", { exact: true })
      .fill("2026-08-01T18:00");
    const submitted = await submitCorrection(
      page,
      "Close the old open workday.",
    );
    assert.equal(submitted.workDate, open.workDate);
    assert.equal(submitted.proposed.checkIn, open.checkIn);
    assert.equal(submitted.proposed.checkOut, "2026-08-01T12:30:00.000Z");
  });

  test("admin resume sends the displayed optimistic version and handles a conflict before a refreshed retry", async (t) => {
    const { page, state } = await workspace(t, { resumeConflicts: 1 });
    await page
      .getByRole("button", { name: "Resume work", exact: true })
      .click();
    await page
      .getByPlaceholder("Explain the accidental checkout")
      .fill("Accidental checkout.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Resume work", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("Attendance changed. Refresh and retry.", { exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      state.calls.find((call) => call.path.endsWith("/resume")).body,
      { version: 7, reason: "Accidental checkout." },
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    state.record = { ...state.record, version: 8 };
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Resume work", exact: true })
      .click();
    await page
      .getByPlaceholder("Explain the accidental checkout")
      .fill("Retry after refresh.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Resume work", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start break", exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      state.calls
        .filter((call) => call.path.endsWith("/resume"))
        .map((call) => call.body),
      [
        { version: 7, reason: "Accidental checkout." },
        { version: 8, reason: "Retry after refresh." },
      ],
    );
    await page
      .getByRole("button", { name: "Start break", exact: true })
      .click();
    await page.getByRole("button", { name: "End break", exact: true }).click();
    await page.getByRole("button", { name: "Check out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resume work", exact: true }),
    ).toBeVisible();
  });

  test("employees cannot see organisation, correction review, policy, or admin resume controls", async (t) => {
    const { page } = await workspace(t, {
      user: { ...user, role: "EMPLOYEE" },
    });
    for (const name of [
      "Organisation",
      "Correction review",
      "Resume work",
      "Save attendance settings",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).count(),
        0,
      );
    assert.equal(
      await page
        .getByRole("link", { name: "Team & settings", exact: true })
        .count(),
      0,
    );
    await expect(
      page.getByRole("button", { name: "Request correction", exact: true }),
    ).toBeVisible();
  });

  test("document upload and download preserve binary bytes, encoded names, and session protection", async (t) => {
    const { page, state } = await workspace(t, { view: "documents" });
    const name = "Résumé 100% (final).bin",
      bytes = Buffer.from([0, 255, 10, 13, 65, 0, 128]);
    await page
      .locator("#documentFile")
      .setInputFiles({
        name,
        mimeType: "application/octet-stream",
        buffer: bytes,
      });
    await page
      .getByRole("button", { name: "Upload document", exact: true })
      .click();
    const row = page
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toBeVisible();
    const uploaded = state.calls.find(
      (call) => call.path === "/documents" && call.method === "POST",
    );
    assert.deepEqual(uploaded.bytes, bytes);
    assert.equal(uploaded.headers["content-type"], "application/octet-stream");
    assert.equal(uploaded.headers["x-document-name"], encodeURIComponent(name));
    assert.equal(uploaded.headers["x-csrf-token"], csrfToken);
    assert.equal(uploaded.headers["x-crm-request"], "1");
    const downloadEvent = page.waitForEvent("download");
    await row.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), name);
    const stream = await download.createReadStream(),
      chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.equal(
      state.calls.find((call) => call.path.endsWith("/download")).headers[
        "x-csrf-token"
      ],
      csrfToken,
    );
  });
});
