import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import { getFirebaseConfig } from './firebaseConfig';

// 沿用原本的 ref / on / set 介面，避免更動既有資料與排班操作。
const app = firebase.initializeApp(getFirebaseConfig(import.meta.env));
export const db = app.database();
export const auth = app.auth();

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    auth.useEmulator('http://127.0.0.1:9099', { disableWarnings: true });
    db.useEmulator('127.0.0.1', 9000);
}

// 不保留登入憑證；每次重新載入網站都回到唯讀。
export const authReady = auth.setPersistence(firebase.auth.Auth.Persistence.NONE)
    .then(() => auth.signOut());
