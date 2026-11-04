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

// 只檢查建置設定，不連線或建立測試專案。
export function assertSafePreview(env) {
    const required = ['API_KEY', 'AUTH_DOMAIN', 'DATABASE_URL', 'PROJECT_ID', 'APP_ID'];
    if (env.VITE_USE_FIREBASE_EMULATORS === 'true'
        || required.some(key => !env[`VITE_FIREBASE_${key}`]?.trim())) {
        throw new Error('Preview 必須明確提供隔離 Firebase 的五項 Web 設定，不能沿用正式預設值或 localhost Emulator。');
    }
    const config = getFirebaseConfig(env);
    const url = new URL(config.databaseURL);
    const project = config.projectId;
    const isolatedDatabase = url.hostname === `${project}.firebaseio.com`
        || url.hostname === `${project}-default-rtdb.firebaseio.com`
        || url.hostname.startsWith(`${project}-default-rtdb.`)
            && /^[a-z0-9-]+-default-rtdb\.[a-z0-9-]+\.firebasedatabase\.app$/.test(url.hostname);
    if (project === productionConfig.projectId
        || config.apiKey === productionConfig.apiKey
        || config.appId === productionConfig.appId
        || config.authDomain !== `${project}.firebaseapp.com`
        || !isolatedDatabase || url.protocol !== 'https:'
        || url.username || url.password || url.port
        || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('Preview 的 Auth、資料庫與 Web 設定必須屬於明確隔離的 Firebase 專案，禁止混用正式設定。');
    }
}
