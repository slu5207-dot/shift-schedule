// 僅由瀏覽器測試攔截 src/firebase.js 時載入；正式程式不會匯入此檔。
import { EDITOR_UID } from '/src/firebaseConfig.js';

const listeners = new Map();
const authListeners = new Set();
const fixture = {
    shifts: { 2026: { '11': { '2026-11-04': '宇軒', '2026-11-05': '靖翰' } } },
    modifiedDates: {},
    pendingDates: { '2026-11-04': { requestedBy: '宇軒', timestamp: '2026-11-01T00:00:00Z' } },
    lockedDates: { '2026-11-06': { lockedBy: '靖翰', timestamp: '2026-11-01T00:00:00Z' } },
};
let store = structuredClone(fixture);
let connected = true;
const writes = [];
const signIns = [];
function read(path) {
    if (path === '.info/connected') return connected;
    return path.split('/').filter(Boolean).reduce((data, key) => data?.[key], store) ?? null;
}
function emit() {
    for (const [path, handlers] of listeners) for (const handler of handlers) handler({ val: () => read(path) });
}
function write(path, value) {
    const parts = path.split('/');
    let target = store;
    for (const part of parts.slice(0, -1)) target = target[part] ??= {};
    if (value === null) delete target[parts.at(-1)];
    else target[parts.at(-1)] = structuredClone(value);
}
function authorize() {
    if (auth.currentUser?.uid !== EDITOR_UID) throw new Error('PERMISSION_DENIED');
}
export const auth = {
    currentUser: null,
    onAuthStateChanged(handler) {
        authListeners.add(handler);
        queueMicrotask(() => { if (authListeners.has(handler)) handler(auth.currentUser); });
        return () => authListeners.delete(handler);
    },
    async signInWithEmailAndPassword(email, password) {
        signIns.push({ email });
        if (password === 'network-test-password') throw Object.assign(new Error(), { code: 'auth/network-request-failed' });
        if (password === 'rate-test-password') throw Object.assign(new Error(), { code: 'auth/too-many-requests' });
        if (!['correct-test-password', 'other-uid-test-password'].includes(password)) throw Object.assign(new Error(), { code: 'auth/invalid-credential' });
        auth.currentUser = { uid: password === 'other-uid-test-password' ? 'other-uid' : EDITOR_UID };
        for (const handler of authListeners) handler(auth.currentUser);
        return { user: auth.currentUser };
    },
    async signOut() {
        if (window.__testFirebase.delayLogout) await new Promise(resolve => { window.__testFirebase.finishLogout = resolve; });
        auth.currentUser = null;
        for (const handler of authListeners) handler(null);
    },
};
export const authReady = Promise.resolve();
export const db = {
    ref(path = '') {
        return {
            on(_event, handler) {
                if (!listeners.has(path)) listeners.set(path, new Set());
                listeners.get(path).add(handler);
                queueMicrotask(() => { if (listeners.get(path)?.has(handler)) handler({ val: () => read(path) }); });
            },
            off(_event, handler) { if (handler) listeners.get(path)?.delete(handler); else listeners.delete(path); },
            async set(value) { authorize(); writes.push({ method: 'set', path, value }); write(path, value); emit(); },
            async remove() { authorize(); writes.push({ method: 'remove', path }); write(path, null); emit(); },
            async update(changes) {
                authorize();
                writes.push({ method: 'update', path, changes });
                for (const [key, value] of Object.entries(changes)) write(path ? `${path}/${key}` : key, value);
                emit();
            },
        };
    },
};
window.__testFirebase = {
    auth, db, writes, signIns,
    read,
    replaceData(value) { store = value; emit(); },
    setConnected(value) { connected = value; emit(); },
    expireAuth() { auth.currentUser = null; for (const handler of authListeners) handler(null); },
    // 模擬 auth.currentUser 已失效但畫面還未收到 observer 的短暫狀態。
    clearAuthSilently() { auth.currentUser = null; },
};
