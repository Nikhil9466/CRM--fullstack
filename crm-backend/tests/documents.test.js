const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const enabled = process.env.CRM_TEST_DATABASE_URL;
if (enabled) process.env.DATABASE_URL = enabled;
test('document uploads, bytes, limits and role isolation', { skip: !enabled }, async () => {
  const db = require('../src/config/prisma');
  const { digest, cookieName } = require('../src/utils/sessions');
  const server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const orgId = randomUUID(), otherOrg = randomUUID();
  const users = [];
  async function user(role, org, teamId) {
    const id = randomUUID(), token = require('node:crypto').randomBytes(32).toString('hex'), csrfToken = require('node:crypto').randomBytes(32).toString('hex');
    await db.user.create({ data: { id, name: 'Doc test', email: id + '@example.test', phone: String(1000000000 + users.length), passwordHash: 'unused', role, orgId: org, teamId } });
    users.push(id);
    await db.session.create({ data: { idHash: digest(token), userId: id, csrfToken, sessionVersion: 0, expiresAt: new Date(Date.now() + 600000) } });
    return { Cookie: cookieName() + '=' + token, 'X-CSRF-Token': csrfToken, 'X-CRM-Request': '1' };
  }
  try {
    const team = await db.team.create({ data: { orgId, name: 'Documents team' } });
    const admin = await user('ADMIN', orgId), employee = await user('EMPLOYEE', orgId, team.id), peer = await user('EMPLOYEE', orgId, team.id), leader = await user('SUB_ADMIN', orgId, team.id), outsider = await user('ADMIN', otherOrg);
    const upload = (h, body, name = 'Résumé.pdf') => fetch(base + '/documents', { method: 'POST', headers: { ...h, 'Content-Type': 'application/octet-stream', 'X-Document-Name': encodeURIComponent(name) }, body });
    assert.equal((await fetch(base + '/documents')).status, 401);
    const bytes = Buffer.from('%PDF-1.4\nDocument test\n');
    const response = await upload(employee, bytes); assert.equal(response.status, 201, await response.clone().text());
    const doc = await response.json(); assert.equal(doc.name, 'Résumé.pdf'); assert.equal(doc.content, undefined);
    for (const h of [employee, admin, leader]) {
      const download = await fetch(base + '/documents/' + doc.id + '/download', { headers: h });
      assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /^attachment/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      const list = await (await fetch(base + '/documents', { headers: h })).json(); assert.equal(list.total, 1);
    }
    for (const h of [peer, outsider]) {
      assert.equal((await fetch(base + '/documents/' + doc.id + '/download', { headers: h })).status, 404);
      assert.equal((await (await fetch(base + '/documents', { headers: h })).json()).total, 0);
    }
    assert.equal((await upload(employee, Buffer.alloc(0))).status, 400);
    assert.equal((await upload(employee, bytes, '../bad.pdf')).status, 400);
    assert.equal((await upload(employee, Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await upload({ ...employee, 'X-CSRF-Token': 'bad' }, bytes)).status, 403);
    assert.equal(await db.document.count(), 1);
    if (process.env.CRM_PLAYWRIGHT_MODULE) {
      const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE);
      const browser = await chromium.launch({ headless: true, ...(process.env.CRM_CHROMIUM_PATH ? { executablePath: process.env.CRM_CHROMIUM_PATH } : {}) });
      try {
        const context = await browser.newContext();
        await context.addCookies([{ name: cookieName(), value: employee.Cookie.split('=')[1], url: base }]);
        const page = await context.newPage();
        const errors = []; page.on('pageerror', err => errors.push(err.message));
        await page.goto(base.replace('/api', '/home.html#documents'));
        await page.getByRole('heading', { name: 'Upload a document' }).waitFor();
        assert.equal(await page.locator('[data-view="tasks"] + a').getAttribute('data-view'), 'documents');
        await page.locator('#documentFile').setInputFiles({ name: 'browser-check.txt', mimeType: 'text/plain', buffer: Buffer.from('Browser upload verified') });
        await page.getByRole('button', { name: 'Upload document', exact: true }).click();
        await page.getByRole('cell', { name: 'browser-check.txt', exact: true }).waitFor();
        const downloadEvent = page.waitForEvent('download');
        await page.getByRole('row').filter({ hasText: 'browser-check.txt' }).getByRole('button', { name: 'Download' }).click();
        assert.equal((await downloadEvent).suggestedFilename(), 'browser-check.txt');
        await page.reload(); await page.getByRole('cell', { name: 'browser-check.txt', exact: true }).waitFor();
        await page.screenshot({ path: '../work/document-centre-desktop.png', fullPage: true });
        await page.setViewportSize({ width: 375, height: 812 });
        await page.screenshot({ path: '../work/document-centre-mobile.png', fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    }

  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.team.deleteMany({ where: { orgId } });
    await new Promise(r => server.close(r)); await db.$disconnect();
  }
});
