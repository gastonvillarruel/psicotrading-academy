/* eslint @typescript-eslint/no-require-imports: "off" */
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertPortFree, startServer } = require('./server.cjs');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const bcrypt = require('bcryptjs');
const { chromium } = require('../../.local/snipers/browser-tools/node_modules/playwright');
const { requireRunner, verifyDatabase, localPool } = require('../phase1/guard.ts');
const { changePermission } = require('../../src/lib/snipers/permissions.ts');
const { localInput } = require('../../src/lib/snipers/presentation.ts');
const { COUNTRY_STORAGE_KEY } = require('../../src/lib/countries.ts');

async function canonicalLocalInput(page, instant) {
  return page.evaluate(raw => {
    const input = document.createElement('input'); input.type = 'datetime-local'; input.step = '0.001'; input.value = raw;
    const value = input.value; const numeric = input.valueAsNumber;
    if (!value || numeric !== Date.parse(raw + 'Z')) throw new Error('Canonicalization changed datetime-local precision');
    return value;
  }, localInput(instant));
}

async function main() {
  assert.equal(process.env.SNIPERS_PHASE3A_LOCAL, '1'); assert.equal(process.env.SNIPERS_ENABLED, 'false');
  const profile = requireRunner(); verifyDatabase(profile);
  await assertPortFree(3100);
  const pool = localPool(); const base = 'http://127.0.0.1:3100'; const results = []; const pageErrors = []; const blocked = [];
  const root = { userId: JSON.parse(fs.readFileSync('.local/snipers/phase1-synthetic-account.json', 'utf8')).userId, activeSessionId: null, singleSession: false };
  const password = randomUUID() + 'aA!'; const hash = await bcrypt.hash(password, 10);
  const users = {};
  let server; let browser; let supervisor;
  const log = fs.createWriteStream('.local/snipers/phase3a-web-server.log');
  let currentPage; let capturedLookup; let capturedReconciliation;
  async function check(name, work) { server.assertRunning(); await work(); server.assertRunning(); results.push({ name, passed: true }); fs.writeFileSync('.local/snipers/phase3a-browser-progress.json', JSON.stringify(results)); console.log(`PASS browser: ${name}`); }
  try {
    for (const [name, role, permission] of [['manager', 'STUDENT', 'SNIPERS_MEMBERSHIP_MANAGER'], ['editor', 'STUDENT', 'SNIPERS_CONTENT_EDITOR'], ['student', 'STUDENT'], ['globalAdmin', 'ADMIN'], ['supervisor', 'STUDENT', 'SNIPERS_ADMIN']]) {
      const id = randomUUID(); const email = `phase3a-browser-${id}@local.invalid`;
      await pool.query('INSERT INTO "User" (id,email,name,password,role,"emailVerified","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', [id, email, `Prueba ${name}`, hash, role]);
      users[name] = { id, email };
      if (permission) await changePermission(pool, root, id, permission, true);
      if (name === 'supervisor') supervisor = id;
    }
    const plans = (await pool.query('SELECT id,name,"priceCents" FROM "SnipersPlan" ORDER BY code')).rows;
    assert.ok(fs.existsSync('.next/BUILD_ID'), 'Ejecutá primero el build aislado de 3A.');
    server = startServer(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', SNIPERS_ENABLED: 'true', NEXTAUTH_URL: base, NEXT_PUBLIC_APP_URL: base }, windowsHide: true,
    }, 3100, log, () => { if (browser) void browser.close().catch(() => {}); });
    await server.waitReady();
    assert.ok((await fetch(`${base}/api/auth/csrf`, { signal: AbortSignal.timeout(2000) })).ok);
    server.assertRunning();
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
      args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-features=msEdgeSidebarV2'] });
    async function context() {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addInitScript(({ key, origin }) => { if (location.origin === origin) localStorage.setItem(key, 'AR'); }, { key: COUNTRY_STORAGE_KEY, origin: base });
      await ctx.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.protocol === 'data:' || url.origin === base) return route.continue();
        if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '/* offline local validation */' });
        blocked.push(url.origin); return route.abort();
      });
      ctx.on('page', p => p.on('pageerror', e => pageErrors.push(e.message)));
      return ctx;
    }
    async function login(ctx, user, existingPage) {
      const page = existingPage ?? await ctx.newPage(); currentPage = page; page.setDefaultTimeout(30000);
      await page.goto(`${base}/login`); await page.locator('input[type=email]').fill(user.email); await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', { name: 'Ingresar', exact: true }).click(); await page.waitForURL('**/mi-campus', { timeout: 60000 }); return page;
    }
    const managerContext = await context(); let page;
    await check('login real de gestor y tarjeta sin cursos/matrículas', async () => {
      page = await login(managerContext, users.manager);
      page.on('request', request => { if (request.method() === 'POST' && request.headers()['next-action'] && (request.postData() || '').includes(users.student.email)) capturedLookup = { action: request.headers()['next-action'], body: request.postData() }; });
      page.on('request', request => {
        const body = request.postData() || '';
        if (request.method() === 'POST' && request.headers()['next-action'] && body.includes('operationId') && body.includes('membershipId') && !body.includes('expectedVersion') && !body.includes('preview')) capturedReconciliation = { action: request.headers()['next-action'], body };
      });
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "Enrollment" WHERE "userId"=$1', [users.manager.id])).rows[0].n, 0);
      await page.getByRole('link', { name: /Grupo de Snipers/ }).click(); await page.waitForURL('**/mi-campus/snipers');
      await page.getByRole('link', { name: 'Alumnos', exact: true }).click(); await page.waitForURL('**/gestion/alumnos');
    });
    let membershipId;
    await check('búsqueda mínima y alta con plan, sin cobertura implícita', async () => {
      await page.getByLabel('Buscar por correo').fill(users.student.email);
      await page.getByRole('button', { name: 'Buscar usuario para alta', exact: true }).click();
      await page.getByRole('button', { name: 'Crear membresía', exact: true }).click();
      await page.getByLabel('Plan para alta').selectOption(plans[0].id);
      await page.getByRole('button', { name: 'Revisar alta', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click(); await page.waitForURL(/\/gestion\/alumnos\/[a-f0-9-]+$/);
      membershipId = page.url().split('/').pop();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1', [membershipId])).rows[0].n, 0);
    });
    async function confirm() {
      await page.getByRole('button', { name: 'Revisar operación', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    }
    async function waitSql(sql, args, expected) {
      for (let i = 0; i < 100; i++) { if ((await pool.query(sql, args)).rows[0].n === expected) return; await delay(100); }
      assert.fail('La operación no alcanzó el estado SQL esperado.');
    }
    const ref = randomUUID();
    await check('pago manual completo: navegador → acción → pago/cobertura/auditoría', async () => {
      await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).click();
      await page.getByLabel('Método de pago').fill('TRANSFER'); await page.getByLabel('Referencia / comprobante').fill(ref);
      await confirm(); await waitSql('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [ref], 1);
      await page.getByText('Recibido:', { exact: false }).first().waitFor();
      await page.screenshot({ path: '.local/snipers/phase3a-member-desktop.png', fullPage: true });
    });
    const retryRef = randomUUID(); let lost = false;
    await check('respuesta perdida tras commit, recarga y reintento conservan un solo pago', async () => {
      await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).click();
      await page.getByLabel('Cantidad de períodos').selectOption('2'); await page.getByLabel('Importe recibido (USD)').fill('50');
      await page.getByLabel('Método de pago').fill('TRANSFER'); await page.getByLabel('Referencia / comprobante').fill(retryRef);
      await page.getByLabel('Motivo de descuento o importe excepcional').fill('Descuento de prueba');
      await page.route('**/mi-campus/snipers/gestion/alumnos/*', async route => {
        const req = route.request();
        if (!lost && req.method() === 'POST' && req.headers()['next-action'] && (req.postData() || '').includes(retryRef) && (req.postData() || '').includes('preview')) {
          lost = true; await route.fetch(); return route.abort('failed');
        }
        return route.fallback();
      });
      await confirm(); await waitSql('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [retryRef], 1); assert.ok(lost);
      await page.reload(); await page.getByRole('button', { name: 'Reintentar mismo envío', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await page.waitForFunction(() => !Object.keys(sessionStorage).some(k => k.startsWith('psico.snipers.intent.')));
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [retryRef])).rows[0].n, 1);
    });
    await check('cambio de próxima renovación conserva prepagos', async () => {
      await page.getByRole('button', { name: 'Cambiar próxima renovación', exact: true }).click();
      await page.getByLabel('Plan para la próxima renovación no abonada').selectOption(plans[1].id);
      await page.getByLabel('Motivo obligatorio').fill('Cambio solicitado'); await confirm();
      await waitSql('SELECT count(*)::int AS n FROM "SnipersMembership" WHERE id=$1 AND "renewalPlanId"=$2', [membershipId, plans[1].id], 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND "planId"=$2', [membershipId, plans[0].id])).rows[0].n, 3);
    });
    await check('cortesía sin pago y reemplazo conservando frontera exacta', async () => {
      await page.getByRole('button', { name: 'Otorgar cortesía', exact: true }).click();
      await page.getByLabel('Fin de cortesía (hora de Argentina, exclusivo)').fill(await canonicalLocalInput(page, new Date(Date.now() + 200 * 86400000).toISOString()));
      await page.getByLabel('Motivo obligatorio').fill('Cortesía de prueba'); await confirm();
      await waitSql('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND origin=\'COURTESY\' AND status=\'VALID\'', [membershipId], 1);
      await page.getByRole('tab', { name: 'Coberturas', exact: true }).click();
      await page.getByRole('button', { name: 'Modificar cortesía', exact: true }).click();
      await page.getByLabel('Motivo obligatorio').fill('Reemplazo de cortesía'); await page.getByLabel('Motivo de fecha manual').fill('Conservar inicio exacto'); await confirm();
      await waitSql('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND origin=\'COURTESY\'', [membershipId], 2);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [membershipId])).rows[0].n, 2);
    });
    await check('revocación de cortesía visible en historial', async () => {
      await page.getByRole('button', { name: 'Revocar cortesía', exact: true }).click(); await page.getByLabel('Motivo obligatorio').fill('Fin de cortesía'); await confirm();
      await waitSql('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND origin=\'COURTESY\' AND status=\'VALID\'', [membershipId], 0);
    });
    async function changeStatus(label, expected) {
      const details = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Estado de la membresía' }) });
      if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
      await page.getByRole('button', { name: label, exact: true }).click(); await page.getByLabel('Motivo obligatorio').fill('Cambio administrativo de prueba'); await confirm();
      await waitSql('SELECT count(*)::int AS n FROM "SnipersMembership" WHERE id=$1 AND status::text=$2', [membershipId, expected], 1);
    }
    await check('suspensión y consulta propia del alumno sin acceso a gestión', async () => {
      await changeStatus('Suspender membresía', 'SUSPENDED');
      const ctx = await context(); const studentPage = await login(ctx, users.student);
      await studentPage.goto(`${base}/mi-campus/snipers`); assert.match(await studentPage.locator('main').innerText(), /Suspendida/);
      const r = await studentPage.goto(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`); assert.equal(r.status(), 404);
      assert.ok(capturedLookup);
      const direct = await ctx.request.post(`${base}/mi-campus/snipers/gestion/alumnos`, { headers: { 'Next-Action': capturedLookup.action, 'Content-Type': 'text/plain;charset=UTF-8', Origin: base, Accept: 'text/x-component' }, data: capturedLookup.body });
      assert.match(await direct.text(), /FORBIDDEN|No tenés permiso/);
      await ctx.close(); currentPage = page;
    });
    await check('reactivación, baja y reapertura no agregan días', async () => {
      const before = (await pool.query('SELECT "expiresAt" FROM "SnipersMembership" WHERE id=$1', [membershipId])).rows[0].expiresAt.toISOString();
      await changeStatus('Reactivar membresía', 'ACTIVE'); await changeStatus('Dar de baja', 'CLOSED'); await changeStatus('Reabrir membresía', 'ACTIVE');
      assert.equal((await pool.query('SELECT "expiresAt" FROM "SnipersMembership" WHERE id=$1', [membershipId])).rows[0].expiresAt.toISOString(), before);
    });
    await check('anulación íntegra del pago y auditoría legible', async () => {
      await page.getByRole('tab', { name: 'Pagos', exact: true }).click(); await page.getByRole('button', { name: 'Anular pago', exact: true }).first().click();
      await page.getByLabel('Motivo obligatorio').fill('Comprobante incorrecto'); await confirm();
      await waitSql('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1 AND status=\'VOID\'', [membershipId], 1);
      await page.getByRole('tab', { name: 'Auditoría', exact: true }).click(); await page.getByText('Pago anulado', { exact: true }).waitFor();
    });
    await check('reemplazo explícito de comprobante anulado conserva método y referencia', async () => {
      const previous = (await pool.query('SELECT reference,method FROM "SnipersPayment" WHERE "membershipId"=$1 AND status=\'VOID\'', [membershipId])).rows[0];
      await page.getByRole('tab', { name: 'Pagos', exact: true }).click();
      await page.getByRole('button', { name: 'Registrar reemplazo', exact: true }).click();
      assert.equal(await page.getByLabel('Referencia / comprobante').inputValue(), previous.reference);
      assert.equal(await page.getByLabel('Método de pago').inputValue(), previous.method);
      await confirm(); await waitSql('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [previous.reference], 2);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1 AND status=\'REGISTERED\'', [previous.reference])).rows[0].n, 1);
    });
    await check('editor y ADMIN global no acceden directamente a gestión ni supervisión', async () => {
      for (const user of [users.editor, users.globalAdmin]) {
        const ctx = await context(); const p = await login(ctx, user);
        for (const url of ['/mi-campus/snipers/gestion/alumnos', '/mi-campus/snipers/gestion/supervision']) assert.equal((await p.goto(base + url)).status(), 404);
        await ctx.close();
      }
      currentPage = page;
    });
    await check('acceso directo anónimo exige login', async () => {
      const ctx = await context(); const p = await ctx.newPage();
      await p.goto(`${base}/mi-campus/snipers/gestion/alumnos`);
      assert.match(p.url(), /\/login\?/); await ctx.close();
    });
    const supervisorContext = await context(); let sp;
    await check('supervisor STUDENT edita catálogo sin cambiar roles globales', async () => {
      sp = await login(supervisorContext, users.supervisor); await sp.goto(`${base}/mi-campus/snipers/gestion/supervision`);
      await sp.getByRole('button', { name: `Editar ${plans[0].name}`, exact: true }).click();
      await sp.getByLabel('Motivo del cambio').fill('Revisión de catálogo local'); await sp.getByRole('button', { name: 'Revisar cambio', exact: true }).click(); await sp.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await sp.getByText('Plan actualizado.', { exact: true }).waitFor();
      assert.equal((await pool.query('SELECT role FROM "User" WHERE id=$1', [users.supervisor.id])).rows[0].role, 'STUDENT');
    });
    await check('concesión y revocación desde supervisión se aplican a solicitudes posteriores', async () => {
      await sp.getByLabel('Correo del usuario').fill(users.editor.email); await sp.getByRole('button', { name: 'Buscar usuario', exact: true }).click();
      await sp.getByRole('button', { name: new RegExp(users.editor.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
      await sp.getByRole('button', { name: 'Conceder Gestión comercial', exact: true }).click(); await sp.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await sp.getByRole('button', { name: 'Revocar Gestión comercial', exact: true }).waitFor();
      const ctx = await context(); const p = await login(ctx, users.editor); assert.equal((await p.goto(`${base}/mi-campus/snipers/gestion/alumnos`)).status(), 200);
      await sp.getByRole('button', { name: 'Revocar Gestión comercial', exact: true }).click(); await sp.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await sp.getByRole('button', { name: 'Conceder Gestión comercial', exact: true }).waitFor();
      assert.equal((await p.goto(`${base}/mi-campus/snipers/gestion/alumnos`)).status(), 404); await ctx.close();
    });
    await check('diseño móvil y ausencia de errores JavaScript inesperados', async () => {
      currentPage = page; await page.setViewportSize({ width: 390, height: 844 }); await page.reload();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: '.local/snipers/phase3a-member-mobile.png', fullPage: true });
      assert.deepEqual(pageErrors, []);
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    async function losePaymentResponse(reference, withoutReference = false) {
      let lost = false;
      await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).click();
      const currentPlan = (await pool.query('SELECT p."priceCents" FROM "SnipersMembership" m JOIN "SnipersPlan" p ON p.id=m."renewalPlanId" WHERE m.id=$1', [membershipId])).rows[0];
      await page.getByLabel('Importe recibido (USD)').fill(String(currentPlan.priceCents / 100));
      await page.getByLabel('Método de pago').fill(withoutReference ? 'CASH' : 'TRANSFER'); await page.getByLabel('Referencia / comprobante').fill(withoutReference ? '' : reference);
      if (withoutReference) await page.getByLabel('Motivo de descuento o importe excepcional').fill(reference);
      await page.route('**/mi-campus/snipers/gestion/alumnos/*', async route => {
        const req = route.request();
        if (!lost && req.method() === 'POST' && (req.postData() || '').includes(reference) && (req.postData() || '').includes('preview')) {
          lost = true; await route.fetch(); return route.abort('failed');
        }
        return route.fallback();
      });
      await confirm(); await waitSql(withoutReference ? 'SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "exceptionReason"=$1' : 'SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [reference], 1); assert.ok(lost);
    }
    async function assertMinimalMarker() {
      const records = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('psico.snipers.')));
      assert.equal(records.length, 1); assert.match(records[0][0], /pending\.v1/);
      assert.deepEqual(Object.keys(JSON.parse(records[0][1])).sort(), ['membershipId', 'operationId', 'owner']);
    }
    for (const mode of ['permission', 'session']) await check(`corrección: commit perdido, revocación ${mode}, denegación y conciliación sin duplicación`, async () => {
      const reference = randomUUID(); await losePaymentResponse(reference);
      if (mode === 'permission') await changePermission(pool, root, users.manager.id, 'SNIPERS_MEMBERSHIP_MANAGER', false);
      else await pool.query('UPDATE "User" SET "activeSessionId"=$2 WHERE id=$1', [users.manager.id, randomUUID()]);
      try {
        await page.getByRole('button', { name: 'Reintentar mismo envío', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
        await page.waitForFunction(() => !Object.keys(sessionStorage).some(k => k.startsWith('psico.snipers.intent.')));
        await assertMinimalMarker(); await page.getByText('Recibido:', { exact: false }).waitFor({ state: 'hidden' });
      } finally { if (mode === 'permission') await changePermission(pool, root, users.manager.id, 'SNIPERS_MEMBERSHIP_MANAGER', true); }
      if (mode === 'session') { await page.waitForURL(base + '/login'); page = await login(managerContext, users.manager, page); }
      await page.goto(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`);
      await page.getByRole('button', { name: 'Conciliar operación original', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Conciliar operación original', exact: true }).click();
      await page.getByText('Operación original conciliada. No se registró un nuevo pago.', { exact: true }).waitFor();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [reference])).rows[0].n, 1);
      assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith('psico.snipers.'))), false);
    });
    await check('corrección: gestor sale, alumno entra en misma pestaña sin datos comerciales y gestor concilia', async () => {
      const reference = randomUUID(); await losePaymentResponse(reference);
      await page.goto(base + '/mi-campus'); await page.getByRole('button', { name: 'Salir', exact: true }).click(); await page.waitForURL(base + '/');
      await assertMinimalMarker(); page = await login(managerContext, users.student, page);
      await assertMinimalMarker(); assert.equal((await page.goto(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`)).status(), 404);
      await page.goto(base + '/mi-campus'); await page.getByRole('button', { name: 'Salir', exact: true }).click(); await page.waitForURL(base + '/');
      page = await login(managerContext, users.manager, page);
      await page.goto(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`);
      await page.getByRole('button', { name: 'Conciliar operación original', exact: true }).click();
      await page.getByText('Operación original conciliada. No se registró un nuevo pago.', { exact: true }).waitFor();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE reference=$1', [reference])).rows[0].n, 1);
    });
    await check('corrección: ausencia de comprobante mantiene bloqueo sin inventar un rechazo', async () => {
      const marker = { owner: users.manager.id, membershipId, operationId: randomUUID() };
      const key = `psico.snipers.pending.v1:${marker.owner}:${marker.membershipId}`;
      await page.evaluate(({ key, marker }) => sessionStorage.setItem(key, JSON.stringify(marker)), { key, marker });
      try {
        await page.reload(); await page.getByRole('button', { name: 'Conciliar operación original', exact: true }).click();
        await page.getByText(/Todavía no se encontró el comprobante original/).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).isDisabled(), true);
        await assertMinimalMarker();
      } finally { await page.evaluate(key => sessionStorage.removeItem(key), key); await page.reload(); }
    });
    await check('corrección: editar cortesías conserva cada nivel y exige elección explícita si está inactivo', async () => {
      for (const plan of plans) {
        await page.getByRole('button', { name: 'Otorgar cortesía', exact: true }).click();
        await page.getByLabel('Plan asociado a la cortesía').selectOption(plan.id);
        const max = (await pool.query('SELECT max("endsAt") AS end FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND status=\'VALID\'', [membershipId])).rows[0].end;
        await page.getByLabel('Fin de cortesía (hora de Argentina, exclusivo)').fill(await canonicalLocalInput(page, new Date(new Date(max).getTime() + 86400000).toISOString()));
        await page.getByLabel('Motivo obligatorio').fill('Cortesía de nivel a conservar'); await confirm();
        await waitSql('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND origin=\'COURTESY\' AND status=\'VALID\'', [membershipId], 1);
        await page.getByRole('tab', { name: 'Coberturas', exact: true }).click(); await page.getByRole('button', { name: 'Modificar cortesía', exact: true }).click();
        assert.equal(await page.getByLabel('Plan asociado a la cortesía').inputValue(), plan.id);
        await page.getByLabel('Motivo obligatorio').fill('Sólo cambia el motivo'); await page.getByLabel('Motivo de fecha manual').fill('Conservar inicio'); await confirm();
        await page.getByRole('button', { name: 'Modificar cortesía', exact: true }).waitFor();
        assert.equal((await pool.query('SELECT "planId" FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND origin=\'COURTESY\' AND status=\'VALID\'', [membershipId])).rows[0].planId, plan.id);
        if (plan.id === plans[2].id) {
          const { updatePlan, getCatalog } = require('../../src/lib/snipers/commercial.ts');
          const current = (await getCatalog(pool, root)).find(p => p.id === plan.id);
          const edit = { planId: current.id, expectedVersion: current.version, name: current.name, priceCents: current.priceCents, durationDays: current.durationDays, active: false, sortOrder: current.sortOrder, reason: 'Prueba local de cortesía inactiva' };
          const updated = await updatePlan(pool, root, edit);
          try {
            await page.reload(); await page.getByRole('tab', { name: 'Coberturas', exact: true }).click(); await page.getByRole('button', { name: 'Modificar cortesía', exact: true }).click();
            assert.equal(await page.getByLabel('Plan asociado a la cortesía').inputValue(), plan.id);
            assert.equal(await page.getByRole('button', { name: 'Revisar operación', exact: true }).isDisabled(), true);
            await page.getByText(/No se cambió el plan automáticamente/).waitFor();
            await page.getByLabel('Plan asociado a la cortesía').selectOption(plans[0].id);
            assert.equal(await page.getByRole('button', { name: 'Revisar operación', exact: true }).isEnabled(), true);
            await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
          } finally { await updatePlan(pool, root, { ...edit, expectedVersion: updated.version, active: current.active }); }
        }
        await page.getByRole('button', { name: 'Revocar cortesía', exact: true }).click(); await page.getByLabel('Motivo obligatorio').fill('Fin de prueba de nivel'); await confirm();
        await waitSql('SELECT count(*)::int AS n FROM "SnipersCoveragePeriod" WHERE "membershipId"=$1 AND origin=\'COURTESY\' AND status=\'VALID\'', [membershipId], 0);
      }
    });
    await check('corrección: supervisión muestra nombre, precio, duración, estado y orden cambiados', async () => {
      await sp.reload(); const plan = (await pool.query('SELECT * FROM "SnipersPlan" WHERE id=$1', [plans[2].id])).rows[0];
      await sp.getByRole('button', { name: `Editar ${plan.name}`, exact: true }).click();
      await sp.getByLabel('Nombre', { exact: true }).fill(plan.name + ' revisión'); await sp.getByLabel('Precio (USD)').fill(String((plan.priceCents + 100) / 100));
      await sp.getByLabel('Duración en días').fill(String(plan.durationDays + 1)); await sp.getByLabel('Orden', { exact: true }).fill(String(plan.sortOrder + 1)); await sp.getByLabel('Plan activo para nuevas asignaciones').uncheck();
      const reason = 'Cambios visibles ' + randomUUID(); await sp.getByLabel('Motivo del cambio').fill(reason);
      await sp.getByRole('button', { name: 'Revisar cambio', exact: true }).click(); await sp.getByRole('button', { name: 'Confirmar', exact: true }).click(); await sp.getByText('Plan actualizado.', { exact: true }).waitFor();
      try {
        const event = sp.locator('article').filter({ hasText: reason });
        for (const label of ['Nombre:', 'Precio:', 'Duración:', 'Estado:', 'Orden:']) await event.getByText(label, { exact: false }).waitFor();
        assert.doesNotMatch(await event.innerText(), /formatVersion|priceCents|sortOrder|entityId/);
      } finally {
        const { updatePlan } = require('../../src/lib/snipers/commercial.ts'); const version = (await pool.query('SELECT version FROM "SnipersPlan" WHERE id=$1', [plan.id])).rows[0].version;
        await updatePlan(pool, root, { planId: plan.id, expectedVersion: version, name: plan.name, priceCents: plan.priceCents, durationDays: plan.durationDays, active: plan.active, sortOrder: plan.sortOrder, reason: 'Restaurar catálogo tras prueba local' });
      }
      assert.deepEqual(pageErrors, []);
    });
    await check('última corrección: A pierde respuesta, B inicia en otra pestaña, conflicto conserva señal de A y A concilia', async () => {
      const trace = randomUUID(); await losePaymentResponse(trace, true);
      const markerBefore = await page.evaluate(() => {
        const value = Object.entries(sessionStorage).find(([key]) => key.startsWith('psico.snipers.pending.v1:'));
        return JSON.parse(value[1]);
      });
      assert.equal(markerBefore.owner, users.manager.id);
      const paymentsBefore = (await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [membershipId])).rows[0].n;
      const sessionResponse = await page.request.get(base + '/api/auth/session'); const staleSession = await sessionResponse.json();
      assert.equal(staleSession.user.id, users.manager.id);
      const freezeSession = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(staleSession) });
      await page.route('**/api/auth/session', freezeSession);
      let bPage; let conflictSeen = false;
      const observeConflict = async route => {
        const req = route.request(); const body = req.postData() || '';
        if (req.method() === 'POST' && body.includes(trace) && body.includes('preview')) {
          const response = await route.fetch(); assert.match(await response.text(), /IDEMPOTENCY_CONFLICT/); conflictSeen = true; return route.fulfill({ response });
        }
        return route.fallback();
      };
      try {
        bPage = await login(managerContext, users.supervisor); // Shared cookies, separate tab storage.
        await page.route('**/mi-campus/snipers/gestion/alumnos/*', observeConflict);
        await page.getByRole('button', { name: 'Reintentar mismo envío', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
        await page.getByText(/La señal original se conserva para conciliar/).waitFor(); assert.ok(conflictSeen);
        await assertMinimalMarker();
        assert.deepEqual(await page.evaluate(() => JSON.parse(Object.entries(sessionStorage).find(([key]) => key.startsWith('psico.snipers.pending.v1:'))[1])), markerBefore);
        assert.equal(await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).count(), 0);
        assert.ok(capturedReconciliation);
        const args = JSON.parse(capturedReconciliation.body); args[0] = { operationId: markerBefore.operationId, membershipId };
        const denied = await bPage.request.post(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`, { headers: { 'Next-Action': capturedReconciliation.action, Origin: base, Accept: 'text/x-component' }, data: JSON.stringify(args) });
        assert.match(await denied.text(), /"confirmed":false/);
        await bPage.goto(`${base}/mi-campus/snipers/gestion/alumnos`); await bPage.getByLabel('Buscar por correo').waitFor();
        await bPage.goto(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`);
        await bPage.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Registrar pago / renovar' && !b.disabled));
        // B is not globally blocked and cannot use A's stored envelope, which has been removed.
      } finally {
        await page.unroute('**/api/auth/session', freezeSession); await page.unroute('**/mi-campus/snipers/gestion/alumnos/*', observeConflict);
        if (bPage) await bPage.close(); currentPage = page;
      }
      await page.goto(base + '/mi-campus'); await page.getByRole('button', { name: 'Salir', exact: true }).click(); await page.waitForURL(base + '/');
      page = await login(managerContext, users.manager, page); await page.goto(`${base}/mi-campus/snipers/gestion/alumnos/${membershipId}`);
      await page.getByRole('button', { name: 'Conciliar operación original', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'Conciliar operación original', exact: true }).click(); await page.getByText('Operación original conciliada. No se registró un nuevo pago.', { exact: true }).waitFor();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [membershipId])).rows[0].n, paymentsBefore);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "idempotencyKey"=$1', [markerBefore.operationId])).rows[0].n, 1);
    });
    await check('última corrección: rechazo STALE definitivo descarta intención y libera ficha sin otro pago', async () => {
      const before = (await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [membershipId])).rows[0].n;
      await page.getByRole('button', { name: 'Registrar pago / renovar', exact: true }).click(); await page.getByLabel('Método de pago').fill('CASH');
      await page.getByRole('button', { name: 'Revisar operación', exact: true }).click();
      const { changeMembershipStatus } = require('../../src/lib/snipers/operations.ts');
      const version = (await pool.query('SELECT version FROM "SnipersMembership" WHERE id=$1', [membershipId])).rows[0].version;
      await changeMembershipStatus(pool, root, { operationId: randomUUID(), membershipId, expectedVersion: version, status: 'SUSPENDED', reason: 'Cambio concurrente local antes de confirmar' });
      await page.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      await page.getByText('Las condiciones cambiaron. Recargá y revisá nuevamente.', { exact: true }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Registrar pago / renovar' && !b.disabled));
      assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith('psico.snipers.'))), false);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM "SnipersPayment" WHERE "membershipId"=$1', [membershipId])).rows[0].n, before);
      await changeStatus('Reactivar membresía', 'ACTIVE'); assert.deepEqual(pageErrors, []);
    });
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: '.local/snipers/phase3a-browser-failure.png', fullPage: true }).catch(() => {});
    results.push({ name: 'interrupted', passed: false, error: error.message }); throw error;
  } finally {
    try { try { if (browser) await browser.close(); } finally { if (server) await server.stop(); } }
    finally {
      if (supervisor) await changePermission(pool, root, supervisor, 'SNIPERS_ADMIN', false);
      log.end(); await pool.end();
      fs.writeFileSync(path.resolve('.local/snipers/phase3a-browser-results.json'), JSON.stringify({ results, pageErrors, blocked, syntheticUsers: Object.values(users).map(u => u.id) }, null, 2));
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
