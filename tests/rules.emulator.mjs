// 官方 Rules 引擎驗證：固定連本機 demo Emulator，沒有正式專案設定。
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { after, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, get, set, update, remove } from 'firebase/database';
import { EDITOR_UID } from '../src/firebaseConfig.js';

const apps = [];
function client(uid) {
    const app = initializeApp({ projectId: 'demo-shift-schedule', databaseURL: 'https://demo-shift-schedule-default-rtdb.firebaseio.com' }, `test-${apps.length}`);
    apps.push(app);
    const db = getDatabase(app);
    connectDatabaseEmulator(db, '127.0.0.1', 9000, uid ? { mockUserToken: { sub: uid } } : undefined);
    return db;
}
async function requireEmulator() {
    await new Promise((resolve, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port: 9000 });
        socket.setTimeout(2000);
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('error', () => { socket.destroy(); reject(new Error('本機 Database Emulator 未啟動；未執行真實 Rules 引擎測試。')); });
        socket.once('timeout', () => { socket.destroy(); reject(new Error('本機 Database Emulator 無回應；未執行真實 Rules 引擎測試。')); });
    });
}
after(async () => { await Promise.all(apps.map(deleteApp)); });

// 一次測試依序驗證，避免共享的本機測試資料互相干擾。
test('官方 Firebase Rules：讀取、UID、資料型別、父節點拒絕與原有換班操作', { timeout: 30000 }, async () => {
    await requireEmulator();
    const anonymous = client();
    const other = client('other-uid');
    const editor = client(EDITOR_UID);
    const date = '2026-11-04';
    const shiftPath = `shifts/2026/11/${date}`;
    const timestamp = '2026-11-04T00:00:00.000Z';
    const records = {
        [shiftPath]: '測試甲',
        [`modifiedDates/${date}`]: { from: '測試甲', to: '測試乙', modifiedBy: '測試甲', timestamp },
        [`pendingDates/${date}`]: { requestedBy: '測試甲', timestamp },
        [`lockedDates/${date}`]: { lockedBy: '測試乙', timestamp },
    };
    const denied = operation => assert.rejects(operation, /permission.denied/i);
    for (const db of [anonymous, other, editor]) {
        for (const path of ['', 'unknown']) await denied(() => get(ref(db, path || undefined)));
    }
    for (const [path, value] of Object.entries(records)) {
        await set(ref(editor, path || undefined), value);
        for (const db of [anonymous, other]) {
            assert.equal((await get(ref(db, path || undefined))).exists(), true);
            await denied(() => set(ref(db, path || undefined), value));
            await denied(() => set(ref(db, `${path}-new`), value));
            await denied(() => remove(ref(db, path || undefined)));
        }
    }
    for (const node of ['shifts', 'modifiedDates', 'pendingDates', 'lockedDates']) {
        assert.equal((await get(ref(anonymous, node))).exists(), true);
    }
    // 保留原始驗證：空字串可用、19 字元可用，20 字元與非字串不可用。
    for (const value of ['', '甲'.repeat(19), '測試甲']) await set(ref(editor, shiftPath), value);
    for (const value of ['甲'.repeat(20), 123, true, { name: '測試甲' }]) await denied(() => set(ref(editor, shiftPath), value));
    await denied(() => remove(ref(editor, shiftPath)));
    for (const path of ['', 'shifts', 'shifts/2026', 'shifts/2026/11', 'modifiedDates', 'pendingDates', 'lockedDates']) {
        await denied(() => set(ref(editor, path || undefined), { overwrite: true }));
        await denied(() => remove(ref(editor, path || undefined)));
        if (path) await denied(() => update(ref(editor), { [path]: null }));
    }
    const change = {
        [shiftPath]: '測試乙',
        [`modifiedDates/${date}`]: records[`modifiedDates/${date}`],
        [`pendingDates/${date}`]: null,
    };
    await update(ref(editor), change);
    assert.equal((await get(ref(anonymous, shiftPath))).val(), '測試乙');
    assert.equal((await get(ref(anonymous, `pendingDates/${date}`))).exists(), false);
    for (const db of [anonymous, other]) await denied(() => update(ref(db), change));
    // 混入錯誤資料／父節點刪除時，整筆更新都要失敗，原班別不變。
    for (const invalid of [
        { ...change, [shiftPath]: '甲'.repeat(20) },
        { ...change, lockedDates: null },
    ]) {
        await denied(() => update(ref(editor), invalid));
        assert.equal((await get(ref(anonymous, shiftPath))).val(), '測試乙');
    }
    for (const path of Object.keys(records).filter(path => !path.startsWith('shifts/'))) {
        await set(ref(editor, path || undefined), records[path]);
        await remove(ref(editor, path || undefined)); // 取消最後一筆標記也必須可用。
    }
    await update(ref(editor), { [shiftPath]: '測試甲', [`modifiedDates/${date}`]: null, [`pendingDates/${date}`]: null });
    await denied(() => set(ref(anonymous, shiftPath), '測試乙')); // 登出後的無驗證請求。
});
