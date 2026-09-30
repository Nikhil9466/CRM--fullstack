import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";

const databaseUrl = process.env.CRM_TEST_DATABASE_URL;
const base = (process.env.CRM_UI_BASE_URL || "http://localhost:4100").replace(
  /\/$/,
  "",
);
const requireBackend = createRequire(
  new URL("../crm-backend/package.json", import.meta.url),
);
const password = "UiRegression!2026";
const chromePath = process.env.CRM_CHROMIUM_PATH || chromium.executablePath();

async function request(page, path, method = "GET", body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await window.crmSession.request("/api" + path, {
        method,
        ...(body !== undefined
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      return {
        status: response.status,
        data: response.status === 204 ? null : await response.json(),
      };
    },
    { path, method, body },
  );
}
async function api(page, path, method = "GET", body) {
  const result = await request(page, path, method, body);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`,
  );
  return result.data;
}
async function route(page, name, title) {
  await page.goto(`${base}/home.html#${name}`);
  await expect(page.locator("main h1")).toHaveText(
    title ||
      {
        contacts: "Contacts",
        deals: "Deals",
        tasks: "Tasks",
        documents: "Document centre",
        settings: "Team & settings",
        teams: "Teams & performance",
        profile: "Your profile",
        activity: "Activity history",
        "recycle-bin": "Recycle bin",
        attendance: "Attendance",
      }[name],
  );
}
async function saveEditor(page, button = "Save changes") {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function login(page, email, secret = password) {
  await page.goto(`${base}/login.html`);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(secret);
  await page
    .getByRole("button", { name: "Sign in to your workspace", exact: true })
    .click();
  await page.waitForURL("**/home.html");
  await expect(page.locator("main h1")).toContainText("Hello,");
}
async function noOverflow(page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

test(
  "React CRM preserves real authenticated workflows and responsive navigation",
  { skip: !databaseUrl, timeout: 360000 },
  async (t) => {
    // Never run this suite against the installed CRM database or its normal port.
    assert.notEqual(
      new URL(databaseUrl).pathname.replace(/^\//, ""),
      "virtual_binz",
      "Use a disposable test database.",
    );
    assert.notEqual(
      new URL(base).port,
      "4000",
      "Use the dedicated test server, not the installed CRM server.",
    );
    const { PrismaClient } = requireBackend("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const run = randomUUID().slice(0, 8);
    const orgId = "react-ui-" + randomUUID();
    const email = `ui-admin-${run}@example.test`;
    const phone = randomInt(6000000000, 8999999000);
    const browser = await chromium.launch({
      headless: true,
      executablePath: chromePath,
    });
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 960 },
      timezoneId: "Asia/Kolkata",
    });
    context.setDefaultTimeout(12000);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    let admin,
      employee,
      leader,
      candidate,
      team,
      alpha,
      beta,
      deal,
      task,
      uploadedDocument;
    t.after(async () => {
      await browser.close();
      // Remove only this suite's unique organisation, including dependency order.
      await db.$transaction([
        db.document.deleteMany({ where: { orgId } }),
        db.attendanceBreak.deleteMany({ where: { orgId } }),
        db.attendanceCorrectionRequest.deleteMany({ where: { orgId } }),
        db.attendanceRecord.deleteMany({ where: { orgId } }),
        db.task.deleteMany({ where: { orgId } }),
        db.deal.deleteMany({ where: { orgId } }),
        db.contact.deleteMany({ where: { orgId } }),
        db.teamRequest.deleteMany({ where: { orgId } }),
        db.team.deleteMany({ where: { orgId } }),
        db.stage.deleteMany({ where: { orgId } }),
        db.user.deleteMany({ where: { orgId } }),
        db.activity.deleteMany({ where: { orgId } }),
        db.attendanceSettings.deleteMany({ where: { orgId } }),
        db.organisation.deleteMany({ where: { id: orgId } }),
      ]);
      await db.$disconnect();
    });

    const scenario = async (name, runScenario) => {
      let failure;
      await t.test(name, async () => {
        try {
          await runScenario();
        } catch (error) {
          failure = error;
          throw error;
        }
      });
      if (failure)
        throw new Error("Cannot continue dependent scenarios after: " + name, {
          cause: failure,
        });
    };

    await scenario(
      "signup creates an admin workspace; wrong and correct login preserve cookie protection",
      async () => {
        await page.goto(`${base}/signup.html`);
        await page
          .getByLabel("Your full name", { exact: true })
          .fill("UI Admin");
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page
          .getByLabel("Phone number", { exact: true })
          .fill(String(phone));
        await page.getByLabel("Organisation ID", { exact: true }).fill(orgId);
        await page.getByLabel("New password", { exact: true }).fill(password);
        await page
          .getByRole("button", { name: "Create workspace", exact: true })
          .click();
        await page.waitForURL("**/home.html");
        await expect(page.locator("main h1")).toContainText("Hello, UI.");
        admin = await api(page, "/me");
        assert.equal(admin.role, "ADMIN");
        assert.ok(
          await db.user.findUnique({ where: { id: admin.id } }),
          "The server must use the disposable database.",
        );
        await page
          .getByRole("button", { name: "Log out", exact: true })
          .click();
        await page.waitForURL("**/login.html");
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page
          .getByLabel("Password", { exact: true })
          .fill("WrongPassword!2026");
        await page
          .getByRole("button", {
            name: "Sign in to your workspace",
            exact: true,
          })
          .click();
        await expect(page.getByRole("alert")).toContainText(
          "Invalid email or password",
        );
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByLabel("Keep me signed in").check();
        await page
          .getByRole("button", {
            name: "Sign in to your workspace",
            exact: true,
          })
          .click();
        await page.waitForURL("**/home.html");
        await expect(page.locator("main h1")).toContainText("Hello, UI.");
        const cookie = (await context.cookies()).find(
          (value) => value.httpOnly,
        );
        assert.ok(cookie, "Authentication uses an HttpOnly cookie.");
        assert.ok(
          cookie.expires > Date.now() / 1000,
          "Keep me signed in creates an expiring persistent cookie.",
        );
        assert.equal(
          await page.evaluate(() => localStorage.getItem("token")),
          null,
        );
      },
    );

    await scenario(
      "contacts create, edit, filter and search through a React modal",
      async () => {
        await route(page, "contacts");
        for (const name of ["Alpha Customer", "Beta Customer"]) {
          await page
            .getByRole("button", { name: "Add contact", exact: true })
            .click();
          const dialog = page.getByRole("dialog");
          await dialog.getByLabel("Full name", { exact: true }).fill(name);
          await dialog
            .getByLabel("Email", { exact: true })
            .fill(
              name.startsWith("Alpha")
                ? "alpha@example.test"
                : "beta@example.test",
            );
          await dialog.getByLabel("Phone", { exact: true }).fill("1234567890");
          await dialog
            .getByLabel("Company", { exact: true })
            .fill("Original Company");
          await dialog
            .locator('select[name="assigneeId"]')
            .selectOption(admin.id);
          await saveEditor(page);
          await expect(
            page.locator("#content").getByText(name, { exact: true }),
          ).toBeVisible();
        }
        const contacts = await api(page, "/contacts");
        alpha = contacts.items.find((value) => value.name === "Alpha Customer");
        beta = contacts.items.find((value) => value.name === "Beta Customer");
        assert.ok(alpha && beta);
        await page
          .getByRole("button", { name: "Edit Alpha Customer", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByLabel("Company", { exact: true })
          .fill("Updated Company");
        await saveEditor(page);
        await page.locator('.filters input[name="q"]').fill("Alpha");
        await page.getByRole("button", { name: "Apply", exact: true }).click();
        await expect(
          page.locator("#content").getByText("Alpha Customer", { exact: true }),
        ).toBeVisible();
        await expect(
          page.locator("#content").getByText("Beta Customer", { exact: true }),
        ).toHaveCount(0);
        assert.equal(
          (await api(page, `/contacts/${alpha.id}`)).company,
          "Updated Company",
        );
        await page.getByRole("button", { name: "Clear", exact: true }).click();
        await expect(
          page.locator("#content").getByText("Beta Customer", { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("searchbox", { name: "Search contacts, deals and tasks" })
          .fill("Alpha");
        await page
          .locator(".search-results")
          .getByRole("button", { name: "Alpha Customer", exact: true })
          .click();
        await expect(
          page.getByRole("dialog").getByLabel("Full name", { exact: true }),
        ).toHaveValue("Alpha Customer");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
      },
    );

    await scenario(
      "deals retain values and stage transitions; tasks retain links and completion",
      async () => {
        const stages = await api(page, "/stages");
        const open = stages.find((value) => value.kind === "OPEN");
        const won = stages.find((value) => value.kind === "WON");
        await route(page, "deals");
        await page
          .getByRole("button", { name: "New deal", exact: true })
          .click();
        let dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Deal title", { exact: true })
          .fill("UI Opportunity");
        await dialog.locator('select[name="contactId"]').selectOption(alpha.id);
        await dialog.locator('select[name="stageId"]').selectOption(open.id);
        await dialog.getByLabel("Value (₹)", { exact: true }).fill("12345.67");
        await dialog
          .getByLabel("Expected close date", { exact: true })
          .fill("2026-12-15");
        await saveEditor(page);
        await expect(
          page.getByRole("cell", { name: "UI Opportunity", exact: true }),
        ).toBeVisible();
        deal = (await api(page, "/deals")).items.find(
          (value) => value.title === "UI Opportunity",
        );
        assert.equal(Number(deal.value), 12345.67);
        await page
          .getByRole("combobox", { name: "Stage for UI Opportunity" })
          .selectOption(won.id);
        await expect
          .poll(async () => (await api(page, `/deals/${deal.id}`)).stageId)
          .toBe(won.id);
        await page
          .locator('.filters select[name="stageId"]')
          .selectOption(won.id);
        await page.getByRole("button", { name: "Apply", exact: true }).click();
        await expect(
          page.getByRole("cell", { name: "UI Opportunity", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Edit UI Opportunity", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByLabel("Deal title", { exact: true })
          .fill("UI Opportunity Updated");
        await saveEditor(page);
        assert.equal(
          (await api(page, `/deals/${deal.id}`)).title,
          "UI Opportunity Updated",
        );
        await route(page, "tasks");
        await page
          .getByRole("button", { name: "Add task", exact: true })
          .click();
        dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Task title", { exact: true })
          .fill("UI Follow up");
        await dialog
          .locator('select[name="link"]')
          .selectOption("deal:" + deal.id);
        await dialog.getByLabel("Due date", { exact: true }).fill("2026-12-10");
        await saveEditor(page);
        await expect(
          page.getByRole("checkbox", { name: "Complete UI Follow up" }),
        ).toBeVisible();
        task = (await api(page, "/tasks")).items.find(
          (value) => value.title === "UI Follow up",
        );
        assert.equal(task.dealId, deal.id);
        await page
          .getByRole("checkbox", { name: "Complete UI Follow up" })
          .click();
        await expect
          .poll(async () => (await api(page, `/tasks/${task.id}`)).completed)
          .toBe(true);
        await expect(page.getByRole("checkbox", { name: "Complete UI Follow up" })).toBeChecked();
        await page
          .locator('.filters select[name="completed"]')
          .selectOption("true");
        await page.getByRole("button", { name: "Apply", exact: true }).click();
        await expect(
          page.getByRole("checkbox", { name: "Complete UI Follow up" }),
        ).toBeChecked();
        await page
          .getByRole("button", { name: "Edit UI Follow up", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByLabel("Task title", { exact: true })
          .fill("UI Follow up Updated");
        await saveEditor(page);
        assert.equal(
          (await api(page, `/tasks/${task.id}`)).title,
          "UI Follow up Updated",
        );
      },
    );

    await scenario(
      "create employee creates accounts; assign employee moves an existing account into a team",
      async () => {
        await route(page, "settings");
        for (const [index, name] of [
          "UI Employee",
          "UI Leader",
          "UI Candidate",
        ].entries()) {
          await page
            .getByRole("button", { name: /^\+?\s*Create employee$/ })
            .click();
          const dialog = page.getByRole("dialog");
          await dialog.getByLabel("Full name", { exact: true }).fill(name);
          await dialog
            .getByLabel("Email", { exact: true })
            .fill(`ui-member-${run}-${index}@example.test`);
          await dialog
            .getByLabel("Phone (10 digits)", { exact: true })
            .fill(String(phone + index + 1));
          await dialog
            .getByLabel("Initial password", { exact: true })
            .fill(password);
          await saveEditor(page, "Create employee");
          await expect(
            page.locator("#content").getByText(name, { exact: true }),
          ).toBeVisible();
        }
        const members = await api(page, "/members");
        employee = members.find((value) => value.name === "UI Employee");
        leader = members.find((value) => value.name === "UI Leader");
        candidate = members.find((value) => value.name === "UI Candidate");
        assert.equal(members.length, 4);
        assert.equal(employee.role, "EMPLOYEE");
        await route(page, "teams");
        await page
          .getByRole("button", { name: "Create team", exact: false })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Team name", { exact: true }).fill("UI Team");
        await dialog.locator('select[name="leaderId"]').selectOption(leader.id);
        await saveEditor(page);
        await expect(
          page.getByRole("heading", { name: "UI Team", exact: true }),
        ).toBeVisible();
        team = (await api(page, "/teams")).find(
          (value) => value.name === "UI Team",
        );
        await page
          .getByRole("combobox", { name: "Assign employee to UI Team" })
          .selectOption(employee.id);
        await page
          .getByRole("button", { name: "Assign employee", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (await api(page, "/members")).find(
                (value) => value.id === employee.id,
              ).teamId,
          )
          .toBe(team.id);
        const assigned = await api(page, "/members");
        assert.equal(
          assigned.length,
          4,
          "Assigning an existing employee must not create an account.",
        );
        assert.equal(
          assigned.find((value) => value.id === leader.id).role,
          "SUB_ADMIN",
        );
        await expect(
          page.getByRole("heading", { name: "Team performance", exact: true }),
        ).toBeVisible();
      },
    );

    await scenario(
      "activity history records mutations; recycle bin restores contacts, deals and tasks",
      async () => {
        for (const [view, name] of [
          ["tasks", "UI Follow up Updated"],
          ["deals", "UI Opportunity Updated"],
          ["contacts", "Beta Customer"],
        ]) {
          await route(page, view);
          await page
            .getByRole("button", { name: "Delete " + name, exact: true })
            .click();
          await expect(
            page.getByRole("cell", { name, exact: false }),
          ).toHaveCount(0);
        }
        for (const [type, name] of [
          ["contacts", "Beta Customer"],
          ["deals", "UI Opportunity Updated"],
          ["tasks", "UI Follow up Updated"],
        ]) {
          await route(page, "recycle-bin");
          await page
            .locator('.management-history-filters select[name="type"]')
            .selectOption(type);
          await page
            .getByRole("button", { name: "Apply filters", exact: true })
            .click();
          const row = page.getByRole("row").filter({ hasText: name });
          await expect(row).toHaveCount(1);
          await row
            .getByRole("button", { name: "Restore", exact: true })
            .click();
          await expect(row).toHaveCount(0);
          const restored = await api(
            page,
            `/${type}/${type === "contacts" ? beta.id : type === "deals" ? deal.id : task.id}`,
          );
          assert.equal(restored.deletedAt, null);
        }
        await route(page, "activity");
        await page
          .locator('.management-history-filters input[name="q"]')
          .fill("UI Opportunity");
        await page
          .getByRole("button", { name: "Apply filters", exact: true })
          .click();
        await expect(
          page.getByRole("row").filter({ hasText: "Moved to recycle bin" }),
        ).toBeVisible();
        const activity = await api(page, "/activity?q=UI%20Opportunity");
        assert.ok(activity.items.some((value) => value.action === "restored"));
        assert.ok(
          !JSON.stringify(activity).includes(password),
          "History must not contain passwords.",
        );
      },
    );

    await scenario(
      "employee and sub-admin roles expose only their navigation, work and team controls",
      async () => {
        const employeeContext = await browser.newContext();
        const employeePage = await employeeContext.newPage();
        const leaderContext = await browser.newContext();
        const leaderPage = await leaderContext.newPage();
        employeePage.on("pageerror", (error) => pageErrors.push(error.message));
        leaderPage.on("pageerror", (error) => pageErrors.push(error.message));
        try {
          await login(employeePage, employee.email);
          await expect(
            employeePage.getByRole("link", {
              name: "Team & settings",
              exact: true,
            }),
          ).toHaveCount(0);
          assert.equal((await request(employeePage, "/activity")).status, 403);
          assert.equal((await request(employeePage, "/teams")).status, 403);
          assert.equal((await api(employeePage, "/contacts")).total, 0);
          await employeePage.goto(`${base}/home.html#settings`);
          await expect(employeePage.locator("main h1")).toContainText("Hello,");
          await login(leaderPage, leader.email);
          await route(leaderPage, "settings");
          await expect(
            leaderPage.getByRole("button", {
              name: /^\+?\s*Create employee$/,
            }),
          ).toHaveCount(0);
          await expect(
            leaderPage.getByRole("heading", {
              name: "Pipeline stages",
              exact: true,
            }),
          ).toHaveCount(0);
          await expect(
            leaderPage.getByRole("link", {
              name: "Activity history",
              exact: true,
            }),
          ).toHaveCount(0);
          assert.equal((await request(leaderPage, "/activity")).status, 403);
          await route(leaderPage, "teams");
          await expect(
            leaderPage.getByRole("button", {
              name: "Create team",
              exact: false,
            }),
          ).toHaveCount(0);
          await leaderPage
            .getByRole("combobox", { name: "Request an employee to UI Team" })
            .selectOption(candidate.id);
          await leaderPage
            .getByRole("button", { name: "Request approval", exact: true })
            .click();
          await expect
            .poll(
              async () =>
                (await api(leaderPage, "/team-requests")).filter(
                  (value) => value.status === "PENDING",
                ).length,
            )
            .toBe(1);
          await route(page, "teams");
          const row = page.getByRole("row").filter({ hasText: "UI Candidate" });
          await row
            .getByRole("button", { name: "Approve", exact: true })
            .click();
          await expect
            .poll(
              async () =>
                (await api(page, "/members")).find(
                  (value) => value.id === candidate.id,
                ).teamId,
            )
            .toBe(team.id);
          assert.equal((await api(page, "/members")).length, 4);
        } finally {
          await employeeContext.close();
          await leaderContext.close();
        }
      },
    );

    await scenario(
      "documents upload and download exact bytes; mobile menu and wide tables fit 375 pixels",
      async () => {
        const bytes = Buffer.from([0, 1, 2, 255, 10, 13, 65, 66, 67]);
        const filename = "Résumé regression.bin";
        await route(page, "documents");
        await expect(
          page.getByRole("heading", { name: "Upload a document", exact: true }),
        ).toBeVisible();
        await page
          .locator("#documentFile")
          .setInputFiles({
            name: filename,
            mimeType: "application/octet-stream",
            buffer: bytes,
          });
        await page
          .getByRole("button", { name: "Upload document", exact: true })
          .click();
        const row = page.getByRole("row").filter({ hasText: filename });
        await expect(row).toHaveCount(1);
        uploadedDocument = (await api(page, "/documents")).items.find(
          (value) => value.name === filename,
        );
        assert.ok(uploadedDocument);
        const downloading = page.waitForEvent("download");
        await row
          .getByRole("button", { name: "Download", exact: true })
          .click();
        const download = await downloading;
        assert.equal(download.suggestedFilename(), filename);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        assert.deepEqual(Buffer.concat(chunks), bytes);
        await page.reload();
        await expect(
          page.getByRole("row").filter({ hasText: filename }),
        ).toHaveCount(1);
        await page.setViewportSize({ width: 375, height: 812 });
        await page
          .getByRole("button", { name: "Toggle menu", exact: true })
          .click();
        await expect(page.locator("#sidebar")).toHaveClass(/open/);
        await page
          .locator("#sidebar")
          .getByRole("link", { name: "Tasks", exact: true })
          .click();
        await expect(page.locator("main h1")).toHaveText("Tasks");
        await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
        await noOverflow(page);
        for (const view of ["contacts", "documents", "teams", "attendance"]) {
          await route(page, view);
          if (view === "contacts") await expect(page.locator("#content").getByText("Alpha Customer", { exact: true })).toBeVisible();
          if (view === "documents") await expect(page.getByRole("row").filter({ hasText: filename })).toHaveCount(1);
          if (view === "teams") await expect(page.getByRole("heading", { name: "UI Team", exact: true })).toBeVisible();
          if (view === "attendance") await expect(page.getByRole("heading", { name: "My attendance history", exact: true })).toBeVisible();
          await noOverflow(page);
        }
        await page.setViewportSize({ width: 1440, height: 960 });
      },
    );

    await scenario(
      "theme persists, profile retains identity, and account pages preserve password help",
      async () => {
        await route(page, "profile");
        await expect(
          page.getByRole("heading", { name: "UI Admin", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".management-profile")).toContainText(email);
        await expect(
          page.getByRole("link", { name: "Change password", exact: true }),
        ).toBeVisible();
        const before = await page.evaluate(
          () => document.documentElement.dataset.theme,
        );
        await page
          .getByRole("button", { name: /Switch to (dark|light) mode/ })
          .click();
        assert.notEqual(
          await page.evaluate(() => document.documentElement.dataset.theme),
          before,
        );
        const changed = await page.evaluate(
          () => document.documentElement.dataset.theme,
        );
        await page.reload();
        await expect(page.locator("main h1")).toHaveText("Your profile");
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.theme),
          changed,
        );
        for (const [path, heading] of [
          ["forgot-password.html", "Need a hand?"],
          ["reset-password.html", "Let’s find another way."],
          ["account.html", "A fresh password."],
        ]) {
          await page.goto(`${base}/${path}`);
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            heading,
          );
          await page.setViewportSize({ width: 375, height: 812 });
          await noOverflow(page);
          await page.setViewportSize({ width: 1440, height: 960 });
        }
      },
    );

    await scenario(
      "attendance checks in, breaks, checks out, resumes, and approves an admin’s own correction",
      async () => {
        await route(page, "attendance");
        await api(page, "/attendance/settings", "PUT", {
          timeZone: "UTC",
          workingDays: [0, 1, 2, 3, 4, 5, 6],
          startTime: "00:00",
          endTime: "23:59",
          graceMinutes: 15,
          expectedMinutes: 480,
        });
        await page.reload();
        await page
          .getByRole("button", { name: "Check in", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Start break", exact: true }),
        ).toBeVisible();
        const checkedIn = (await api(page, "/attendance/today")).today;
        await page
          .getByRole("button", { name: "Start break", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "End break", exact: true }),
        ).toBeVisible();
        assert.equal(
          (await api(page, "/attendance/today")).today.status,
          "On Break",
        );
        await page
          .getByRole("button", { name: "End break", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Check out", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Check out", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Resume work", exact: true })
          .click();
        const resume = page.getByRole("dialog");
        await resume
          .getByLabel("Reason", { exact: true })
          .fill("UI accidental checkout recovery");
        await resume
          .getByRole("button", { name: "Resume work", exact: true })
          .click();
        await expect(resume).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Check out", exact: true }),
        ).toBeVisible();
        const resumed = (await api(page, "/attendance/today")).today;
        assert.equal(resumed.checkIn, checkedIn.checkIn);
        assert.equal(resumed.checkOut, null);
        assert.equal(
          resumed.breaks.length,
          2,
          "Resume records the checked-out gap as a closed break.",
        );
        await page
          .getByRole("button", { name: "Check out", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Resume work", exact: true }),
        ).toBeVisible();
        const checkedOut = (await api(page, "/attendance/today")).today;
        await page
          .locator(".attendance-history")
          .getByRole("row")
          .filter({ hasText: checkedOut.workDate })
          .getByRole("button", { name: "Request correction", exact: true })
          .click();
        await page
          .locator(".attendance-correction")
          .getByLabel("Reason", { exact: true })
          .fill("UI self correction review");
        await page
          .getByRole("button", {
            name: "Submit correction request",
            exact: true,
          })
          .click();
        await expect
          .poll(async () =>
            (await api(page, "/attendance/corrections")).items.some(
              (value) => value.reason === "UI self correction review",
            ),
          )
          .toBe(true);
        const correction = (
          await api(page, "/attendance/corrections")
        ).items.find((value) => value.reason === "UI self correction review");
        assert.equal(
          correction.proposed.checkIn,
          checkedOut.checkIn,
          "Unchanged correction inputs retain exact timestamps.",
        );
        assert.equal(correction.proposed.checkOut, checkedOut.checkOut);
        await page
          .getByRole("button", { name: "Correction review", exact: true })
          .click();
        const row = page
          .getByRole("row")
          .filter({ hasText: "UI self correction review" });
        await row.getByRole("button", { name: "Approve", exact: true }).click();
        await expect
          .poll(
            async () =>
              (
                await api(page, "/attendance/corrections?view=review")
              ).items.find((value) => value.id === correction.id).status,
          )
          .toBe("APPROVED");
      },
    );

    await scenario(
      "changing a password signs out the account and the new password works",
      async () => {
        const newPassword = "UiRegression!Changed2026";
        await page.goto(`${base}/account.html`);
        await page
          .getByLabel("Current password", { exact: true })
          .fill(password);
        await page
          .getByLabel("New password", { exact: true })
          .fill(newPassword);
        await page
          .getByRole("button", { name: "Update password", exact: true })
          .click();
        await page.waitForURL("**/login.html");
        await expect(page.getByRole("status")).toContainText(
          "Password changed",
        );
        await login(page, email, newPassword);
        assert.equal((await api(page, "/me")).id, admin.id);
      },
    );

    assert.deepEqual(
      pageErrors,
      [],
      "React pages should not produce uncaught browser errors.",
    );
  },
);
