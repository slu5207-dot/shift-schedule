// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBmSPNAl4MLOePqArUFHaIXPsv-26a4cBo",
    authDomain: "shift-schedule-a6daf.firebaseapp.com",
    databaseURL: "https://shift-schedule-a6daf-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "shift-schedule-a6daf",
    storageBucket: "shift-schedule-a6daf.firebasestorage.app",
    messagingSenderId: "780365132523",
    appId: "1:780365132523:web:d7ffaecf9dd33037fe44ae"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
// 取得資料庫實體
export const db = getDatabase(app);
