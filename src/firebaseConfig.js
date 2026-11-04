// Firebase Web 設定是公開識別資訊；密碼及服務帳戶金鑰不得放入 VITE_*。
const productionConfig = {
    apiKey: 'AIzaSyBmSPNAl4MLOePqArUFHaIXPsv-26a4cBo',
    authDomain: 'shift-schedule-a6daf.firebaseapp.com',
    databaseURL: 'https://shift-schedule-a6daf-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'shift-schedule-a6daf',
    storageBucket: 'shift-schedule-a6daf.firebasestorage.app',
    messagingSenderId: '780365132523',
    appId: '1:780365132523:web:d7ffaecf9dd33037fe44ae',
};

export const EDITOR_UID = 'ceockx7WIPfKWZuyqOaxImBdQ1P2';

export function getFirebaseConfig(env) {
    if (env.VITE_USE_FIREBASE_EMULATORS === 'true') {
        return {
            apiKey: 'demo-api-key',
            authDomain: 'demo-shift-schedule.firebaseapp.com',
            databaseURL: 'https://demo-shift-schedule-default-rtdb.firebaseio.com',
            projectId: 'demo-shift-schedule',
        };
    }
    const variables = {
        apiKey: 'API_KEY', authDomain: 'AUTH_DOMAIN', databaseURL: 'DATABASE_URL',
        projectId: 'PROJECT_ID', storageBucket: 'STORAGE_BUCKET',
        messagingSenderId: 'MESSAGING_SENDER_ID', appId: 'APP_ID',
    };
    return Object.fromEntries(Object.entries(productionConfig).map(([key, fallback]) =>
        [key, env[`VITE_FIREBASE_${variables[key]}`] || fallback]
    ));
}

// 本輪只使用本機隔離測試；即使 Vercel 繼承正式環境設定也不產生 Preview。
export function assertSafePreview() {
    throw new Error('此分支僅供本機隔離驗收，已停用 Vercel Preview 建置，避免連到正式 Firebase。');
}
