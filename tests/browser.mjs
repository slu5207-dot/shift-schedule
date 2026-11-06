import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

// 需要可用的 Playwright 套件與 Chromium。可透過 NODE_PATH 指定工具安裝位置。
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: { ...process.env, VITE_EDITOR_EMAIL: 'editor@example.test', VITE_USE_FIREBASE_EMULATORS: 'true', VERCEL_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
let browser;
let checks = 0;
const forbiddenRequests = [];
const pageErrors = [];
const mock = readFileSync(new URL('./firebase.mock.js', import.meta.url), 'utf8');
try {
    for (let attempt = 0; ; attempt++) {
        try { if ((await fetch(baseURL)).ok) break; } catch { /* 等候本機伺服器 */ }
        if (attempt > 80 || server.exitCode != null) throw new Error(`Vite 啟動失敗：${serverLog}`);
        await delay(100);
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.clock.install({ time: new Date('2026-11-04T04:00:00Z') });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1' || url.port !== String(port)) {
            forbiddenRequests.push(url.origin);
            return route.abort();
        }
        if (url.pathname === '/src/firebase.js') return route.fulfill({ contentType: 'application/javascript', body: mock });
        return route.continue();
    });
    await page.routeWebSocket(/.*/, ws => {
        const url = new URL(ws.url());
        if (url.hostname === '127.0.0.1' && url.port === String(port)) ws.connectToServer();
        else { forbiddenRequests.push(url.origin); ws.close(); }
    });
    const check = message => { console.log(`PASS ${message}`); checks++; };
    const dateCell = () => page.locator('div.grid.grid-cols-7 > div').filter({ has: page.locator('div.absolute.top-0\\.5.right-1', { hasText: /^4$/ }) });
    const openDate = async () => { await dateCell().click(); await page.getByRole('heading', { name: '2026-11-04' }).waitFor(); };
    const closeDate = async () => { await page.getByRole('heading', { name: '2026-11-04' }).locator('../..').getByRole('button').click(); };
    const countWrites = () => page.evaluate(() => window.__testFirebase.writes.length);
    const login = async password => {
        await page.getByRole('button', { name: '編輯班表', exact: true }).click();
        await page.getByLabel('編輯密碼').fill(password);
        await page.getByRole('button', { name: '確認編輯', exact: true }).click();
    };
    const waitLoggedIn = () => page.getByRole('button', { name: '完成編輯／登出' }).waitFor();
    await page.goto(baseURL);
    await dateCell().waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await openDate();
    assert.equal(await page.getByRole('button', { name: '換班', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '取消待確認', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: '標記不能換班', exact: true }).isDisabled(), true);
    assert.equal(await countWrites(), 0);
    await closeDate();
    check('未登入直接讀取班表與狀態；三個編輯按鈕停用，無自動寫入、無自動密碼視窗');

    for (const [password, message] of [
        ['wrong-test-password', '密碼錯誤或帳號無法使用，請重新輸入。'],
        ['network-test-password', '無法連線，請檢查網路後再試。'],
        ['rate-test-password', '嘗試次數過多，請稍後再試。'],
        ['other-uid-test-password', '此帳號沒有編輯權限。'],
    ]) {
        await login(password);
        await page.getByRole('alert').filter({ hasText: message }).waitFor();
        assert.equal(await page.getByLabel('編輯密碼').inputValue(), '');
        assert.equal(await countWrites(), 0);
        await page.getByRole('button', { name: '取消', exact: true }).click();
    }
    check('密碼錯誤、網路錯誤、過量嘗試與其他 UID 均維持唯讀，並清除密碼');

    await login('correct-test-password');
    await waitLoggedIn();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.__testFirebase.signIns.at(-1).email), 'editor@example.test');
    await openDate();
    assert.equal(await page.getByRole('button', { name: '換班', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: '換班', exact: true }).click();
    await page.getByText('已調整班別為 靖翰', { exact: true }).waitFor();
    assert.equal(await countWrites(), 1);
    const update = await page.evaluate(() => window.__testFirebase.writes[0]);
    assert.equal(update.method, 'update');
    assert.equal(update.changes['shifts/2026/11/2026-11-04'], '靖翰');
    assert.equal(update.changes['modifiedDates/2026-11-04'].to, '靖翰');
    assert.equal(update.changes['pendingDates/2026-11-04'], null);
    check('授權 UID 登入後換班，以原有路徑一次更新班別、調班紀錄與待確認');

    for (const name of ['標記待確認', '取消待確認', '標記不能換班', '解除不能換班']) {
        await openDate();
        await page.getByRole('button', { name, exact: true }).click();
    }
    assert.equal(await countWrites(), 5);
    check('保留待確認與禁止換班的新增／解除功能');

    await openDate();
    await page.getByRole('button', { name: '換班', exact: true }).click();
    await page.getByText('已調整班別為 宇軒', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__testFirebase.read('modifiedDates/2026-11-04')), null);
    check('換回原班別時清除調班紀錄');

    await page.evaluate(() => { window.__testFirebase.delayLogout = true; });
    await page.getByRole('button', { name: '完成編輯／登出' }).click();
    await page.getByRole('button', { name: '登出中…' }).waitFor();
    await openDate();
    assert.equal(await page.getByRole('button', { name: '換班', exact: true }).isDisabled(), true);
    await closeDate();
    await page.evaluate(() => window.__testFirebase.finishLogout());
    await page.getByRole('button', { name: '編輯班表', exact: true }).waitFor();
    assert.equal(await countWrites(), 6);
    check('登出尚未完成便立即停用編輯，登出後仍可公開瀏覽');

    await login('correct-test-password');
    await waitLoggedIn();
    await page.evaluate(() => window.__testFirebase.clearAuthSilently());
    await openDate();
    await page.getByRole('button', { name: '換班', exact: true }).click();
    await page.getByText('請先點選「編輯班表」並輸入密碼', { exact: true }).waitFor();
    assert.equal(await countWrites(), 6);
    check('寫入函式再次檢查當前驗證狀態，畫面仍顯示編輯時也能拒絕失效帳號');

    await page.evaluate(() => window.__testFirebase.expireAuth());
    await login('correct-test-password');
    await waitLoggedIn();
    await page.evaluate(() => window.__testFirebase.setConnected(false));
    await openDate();
    assert.equal(await page.getByRole('button', { name: '換班', exact: true }).isDisabled(), true);
    await closeDate();
    await page.reload();
    await dateCell().waitFor();
    assert.equal(await page.getByRole('button', { name: '編輯班表', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('password')), null);
    check('離線時停用編輯；重新整理回到唯讀，無密碼儲存');

    await page.evaluate(() => window.__testFirebase.replaceData({}));
    assert.equal(await countWrites(), 0);
    assert.equal(await dateCell().getByText('宇軒', { exact: true }).count(), 1);
    check('空白資料庫以原排班規則顯示，不寫入初始化資料');
    await page.evaluate(() => window.__testFirebase.replaceData({ shifts: { '2026-11-04': '靖翰' } }));
    assert.equal(await dateCell().getByText('靖翰', { exact: true }).count(), 1);
    await page.evaluate(() => window.__testFirebase.replaceData({ shifts: { '2026-11-04': '宇軒', 2026: { '11': { '2026-11-04': '靖翰' } } } }));
    assert.equal(await dateCell().getByText('靖翰', { exact: true }).count(), 1);
    check('相容舊平面資料與混合巢狀資料，巢狀新值優先');

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.equal(await page.getByRole('button', { name: '編輯班表', exact: true }).isVisible(), true);
    check('390px 手機寬度保留既有班表與編輯入口，無水平溢出');
    // 第二組測試使用真正的 Firebase Authentication SDK，僅模擬 HTTP 回應與資料庫。
    // 確認密碼登入 API、in-memory persistence 與 signOut 實際接線。
    const sdkPage = await browser.newPage();
    sdkPage.on('pageerror', error => pageErrors.push(error.message));
    const authRequests = [];
    const uid = 'ceockx7WIPfKWZuyqOaxImBdQ1P2';
    const now = Math.floor(Date.now() / 1000);
    const token = [
        { alg: 'none', typ: 'JWT' },
        { sub: uid, user_id: uid, aud: 'demo-shift-schedule', iss: 'https://securetoken.google.com/demo-shift-schedule', iat: now, exp: now + 3600, auth_time: now, email: 'editor@example.test', firebase: { sign_in_provider: 'password', identities: {} } },
    ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.';
    await sdkPage.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1' && url.port === '9099' && url.pathname.includes('identitytoolkit.googleapis.com')) {
            const body = route.request().postDataJSON();
            if (url.pathname.includes('signInWithPassword')) {
                authRequests.push(body.email);
                if (body.password !== 'correct-test-password') {
                    return route.fulfill({ status: 400, json: { error: { code: 400, message: 'INVALID_PASSWORD' } } });
                }
                return route.fulfill({ json: { localId: uid, email: body.email, idToken: token, refreshToken: 'mock-refresh-token', expiresIn: '3600', registered: true } });
            }
            if (url.pathname.includes('accounts:lookup')) return route.fulfill({ json: { users: [{ localId: uid, email: 'editor@example.test', emailVerified: true, providerUserInfo: [{ providerId: 'password', email: 'editor@example.test' }] }] } });
            throw new Error(`未預期的模擬 Auth API：${url.pathname}`);
        }
        if (url.hostname !== '127.0.0.1' || url.port !== String(port)) {
            forbiddenRequests.push(url.origin);
            return route.abort();
        }
        if (url.pathname === '/src/firebase.js') {
            const response = await route.fetch();
            const realModule = "import { db as testDb } from '/tests/firebase.mock.js';\n"
                + (await response.text())
                    .replace('export const db = app.database();', 'export const db = testDb;')
                    .replace("    db.useEmulator('127.0.0.1', 9000);", '');
            return route.fulfill({ response, body: realModule });
        }
        return route.continue();
    });
    await sdkPage.routeWebSocket(/.*/, ws => {
        const url = new URL(ws.url());
        if (url.hostname === '127.0.0.1' && url.port === String(port)) ws.connectToServer();
        else { forbiddenRequests.push(url.origin); ws.close(); }
    });
    await sdkPage.goto(baseURL);
    const sdkLogin = async password => {
        await sdkPage.getByRole('button', { name: '編輯班表', exact: true }).click();
        await sdkPage.getByLabel('編輯密碼').fill(password);
        await sdkPage.getByRole('button', { name: '確認編輯', exact: true }).click();
    };
    await sdkLogin('wrong-test-password');
    await sdkPage.getByRole('alert').filter({ hasText: '密碼錯誤或帳號無法使用' }).waitFor();
    await sdkPage.getByRole('button', { name: '取消', exact: true }).click();
    await sdkLogin('correct-test-password');
    await sdkPage.getByRole('button', { name: '完成編輯／登出' }).waitFor();
    await sdkPage.getByRole('button', { name: '完成編輯／登出' }).click();
    await sdkPage.getByRole('button', { name: '編輯班表', exact: true }).waitFor();
    await sdkLogin('correct-test-password');
    await sdkPage.getByRole('button', { name: '完成編輯／登出' }).waitFor();
    await sdkPage.reload();
    await sdkPage.getByRole('button', { name: '編輯班表', exact: true }).waitFor();
    assert.equal(await sdkPage.getByRole('button', { name: '完成編輯／登出' }).count(), 0);
    assert.deepEqual(authRequests, ['editor@example.test', 'editor@example.test', 'editor@example.test']);
    assert.equal(await sdkPage.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('firebase:authUser'))), false);
    await sdkPage.close();
    check('真實 Firebase Auth SDK（HTTP 模擬）：密碼錯誤、成功登入、登出、重新整理回唯讀與不持久儲存憑證');

    // 以 Vite 已轉譯的環境字串模擬忘記設定 Email，仍使用原有 App 程式碼。
    await page.route('**/src/App.jsx*', async route => {
        const response = await route.fetch();
        const original = await response.text();
        const withoutEmail = original.replace(/"VITE_EDITOR_EMAIL"\s*:\s*"editor@example.test"/, '"VITE_EDITOR_EMAIL":""');
        assert.notEqual(withoutEmail, original);
        return route.fulfill({ response, body: withoutEmail });
    });
    await page.reload();
    await dateCell().waitFor();
    await login('correct-test-password');
    await page.getByRole('alert').filter({ hasText: '尚未設定編輯帳號' }).waitFor();
    assert.equal(await page.getByLabel('編輯密碼').inputValue(), '');
    assert.equal(await page.evaluate(() => window.__testFirebase.signIns.length), 0);
    assert.equal(await countWrites(), 0);
    check('未設定 VITE_EDITOR_EMAIL 時仍可讀取，登入提示設定錯誤並清空密碼，不發出驗證或寫入');
    assert.deepEqual(forbiddenRequests, []);
    assert.deepEqual(pageErrors, []);
    check('整個瀏覽器測試沒有外連 Firebase、正式資料庫請求或未捕捉的頁面錯誤');
    console.log(`Browser checks: ${checks} passed`);
} finally {
    await browser?.close();
    server.kill();
}
