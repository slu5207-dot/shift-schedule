import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { EDITOR_UID, getFirebaseConfig, assertSafePreview } from '../src/firebaseConfig.js';

const { rules } = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url)));
const editor = { uid: EDITOR_UID };
const date = '2026-11-04';
const timestamp = '2026-11-04T00:00:00.000Z';
const records = {
    [`shifts/2026/11/${date}`]: '測試乙',
    [`modifiedDates/${date}`]: { from: '測試甲', to: '測試乙', modifiedBy: '測試甲', timestamp },
    [`pendingDates/${date}`]: { requestedBy: '測試甲', timestamp },
    [`lockedDates/${date}`]: { lockedBy: '測試乙', timestamp },
};

// 只評估本檔 Rules 用到的運算式與紀錄驗證，不實作完整 Rules 引擎。
// 真正的授權、級聯及多路徑原子性仍須由 rules.emulator.mjs 驗證。
const snapshot = value => ({
    val: () => value,
    exists: () => value != null,
    isString: () => typeof value === 'string',
});
function evaluate(expression, bindings, value, auth) {
    if (typeof expression === 'boolean') return expression;
    return runInNewContext(`(${expression})`, { ...bindings, auth, newData: snapshot(value) });
}
function locate(path) {
    let node = rules;
    const bindings = {};
    const ancestors = [node];
    for (const part of path.split('/').filter(Boolean)) {
        const key = Object.hasOwn(node, part) ? part : Object.keys(node).find(key => key.startsWith('$'));
        if (!key) return null;
        if (key.startsWith('$')) bindings[key] = part;
        node = node[key];
        ancestors.push(node);
    }
    return { node, bindings, ancestors };
}
function mayWrite(path, value, auth) {
    const match = locate(path);
    if (!match) return false;
    const { node, bindings, ancestors } = match;
    const valid = value == null || node['.validate'] == null || evaluate(node['.validate'], bindings, value, auth);
    return ancestors.some(rule => rule['.write'] != null && evaluate(rule['.write'], bindings, value, auth)) && valid;
}
function mayRead(path) {
    return locate(path)?.ancestors.some(rule => rule['.read'] === true) ?? false;
}

test('僅四個資料節點公開讀取，根與未知節點拒絕讀寫', () => {
    assert.equal(rules['.read'], false);
    assert.equal(rules['.write'], false);
    assert.deepEqual(Object.keys(rules).filter(key => !key.startsWith('.')).sort(), ['lockedDates', 'modifiedDates', 'pendingDates', 'shifts']);
    for (const path of Object.keys(records)) assert.equal(mayRead(path), true);
    for (const path of ['', 'unknown', 'unknown/date']) {
        assert.equal(mayRead(path), false);
        assert.equal(mayWrite(path, 'test', editor), false);
    }
});

for (const [name, auth] of [['未登入', null], ['非指定 UID', { uid: 'other-uid' }], ['登出後', null]]) {
    test(`${name}不能新增、修改或刪除四種日期紀錄`, () => {
        for (const [path, value] of Object.entries(records)) {
            assert.equal(mayWrite(path, value, auth), false);
            assert.equal(mayWrite(path, null, auth), false);
        }
    });
}

test('指定 UID 可換班及更新既有三種紀錄，取消標記與清除調班紀錄仍可用', () => {
    for (const [path, value] of Object.entries(records)) {
        assert.equal(mayWrite(path, value, editor), true, path);
        assert.equal(mayWrite(path, null, editor), !path.startsWith('shifts/'), path);
    }
});

test('指定 UID 也不能直接覆寫或刪除根、年、月與整個標記節點', () => {
    for (const path of ['', 'shifts', 'shifts/2026', 'shifts/2026/11', 'modifiedDates', 'pendingDates', 'lockedDates']) {
        assert.equal(mayWrite(path, {}, editor), false, path);
        assert.equal(mayWrite(path, null, editor), false, path);
    }
});

test('shifts 完整保留原始字串與 length < 20 驗證，包含空字串與 19 字元邊界', () => {
    const path = `shifts/2026/11/${date}`;
    const validation = rules.shifts.$year.$month.$date['.validate'];
    assert.equal(validation, 'newData.isString() && newData.val().length < 20');
    for (const value of ['', '甲', '甲'.repeat(19)]) assert.equal(mayWrite(path, value, editor), true);
    for (const value of ['甲'.repeat(20), '甲'.repeat(21), 123, true, {}, { name: '測試甲' }, null]) assert.equal(mayWrite(path, value, editor), false);
});

test('只授權巢狀日期層級；舊平面 shifts 可讀但不能直接寫入', () => {
    for (const path of [`shifts/${date}`, 'shifts/2026/11', 'unknown/2026-11-04']) assert.equal(mayWrite(path, '測試甲', editor), false);
    assert.equal(mayRead(`shifts/${date}`), true);
});

test('另外三個節點維持原有物件格式，未新增 schema 或欄位限制', () => {
    for (const [path, record] of Object.entries(records).filter(([path]) => !path.startsWith('shifts/'))) {
        assert.equal(mayWrite(path, record, editor), true);
        assert.equal(mayWrite(path, { ...record, existingField: 'kept' }, editor), true);
        assert.equal(mayWrite(path, null, editor), true);
        const node = path.split('/')[0];
        assert.deepEqual(Object.keys(rules[node].$date), ['.write']);
    }
});

test('換班的逐日期多路徑內容可授權，混入父節點刪除或非法班別必須拒絕', () => {
    const change = { ...records, [`pendingDates/${date}`]: null };
    const permitted = update => Object.entries(update).every(([path, value]) => mayWrite(path, value, editor));
    assert.equal(permitted(change), true);
    assert.equal(permitted({ ...change, pendingDates: null }), false);
    assert.equal(permitted({ ...change, [`shifts/2026/11/${date}`]: { invalid: true } }), false);
});

test('現有公開 Web 設定保留；Emulator 強制使用 demo 專案', () => {
    assert.equal(getFirebaseConfig({}).projectId, 'shift-schedule-a6daf');
    const config = getFirebaseConfig({ VITE_USE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'shift-schedule-a6daf' });
    assert.equal(config.projectId, 'demo-shift-schedule');
    assert.ok(!JSON.stringify(config).includes('a6daf'));
});

test('本輪所有 Preview 建置均停止，分支 Git 自動部署已停用', () => {
    assert.throws(() => assertSafePreview(), /停用 Vercel Preview/);
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
    assert.equal(config.git.deploymentEnabled['feature/editor-password'], false);
    assert.equal(config.git.deploymentEnabled.main, undefined);
});
