# 班表網站：密碼編輯

保留原有 React／Vite 月曆、排班規則與四個資料節點，只新增簡單密碼編輯功能。本輪不要求另建 Firebase 測試專案，驗收使用本機模擬資料。

## 行為

- 公開查看班表與日期詳細資料，預設不能換班或更改標記。
- 點「編輯班表」後只輸入密碼；Email 讀取 `VITE_EDITOR_EMAIL`，透過 Firebase Authentication Email／Password 驗證。
- 只有 UID `ceockx7WIPfKWZuyqOaxImBdQ1P2` 可以編輯。選單的姓名仍是紀錄用設定，不是授權依據。
- 「完成編輯／登出」立即停用編輯；登入只保留於記憶體，重新整理回到唯讀。
- 空白資料庫只在畫面依原規則產生班表，不在瀏覽時寫入初始化資料。

## Rules 與既有操作

`database.rules.json` 以使用者提供的 Firebase Console 原始規則為基準：

| 路徑 | 公開讀取 | 指定 UID 的寫入 |
| --- | --- | --- |
| `/`、未知節點 | 不允許 | 不允許 |
| `shifts/{year}/{month}/{date}` | 允許讀取整個 shifts | 只允許日期班別寫入；拒絕刪除班別 |
| `modifiedDates/{date}` | 允許讀取整個 modifiedDates | 日期紀錄可寫入與刪除 |
| `pendingDates/{date}` | 允許讀取整個 pendingDates | 日期標記可寫入與刪除 |
| `lockedDates/{date}` | 允許讀取整個 lockedDates | 日期標記可寫入與刪除 |

shifts 的 `.validate` **完全保留原式** `newData.isString() && newData.val().length < 20`：允許空字串、最多 19 個 UTF-16 單位，拒絕物件、數字、布林與長度達 20 的字串。`.validate` 不會驗證刪除，因此另外在 `.write` 要求 `newData.exists()`；既有網站沒有刪除班別的功能。

其他三個節點不新增 schema、欄位或長度限制，僅縮小授權範圍。直接覆寫／刪除資料庫根、整年、整月或整個標記節點均沒有授權。

實際寫入路徑維持：

- 換班：`update()` 一次提交 `shifts/{year}/{month}/{date}`、`modifiedDates/{date}` 及 `pendingDates/{date}`。多路徑更新從根呼叫，但每一項都指定日期；**不需要根層級 `.write`**。
- 換回原班別：將該日 `modifiedDates` 設為 `null`，並清除該日待確認。
- 待確認：對 `pendingDates/{date}` 執行 `set({ requestedBy, timestamp })` 或 `remove()`。
- 禁止換班：對 `lockedDates/{date}` 執行 `set({ lockedBy, timestamp })` 或 `remove()`。

取消最後一筆標記後，Firebase 自動移除空父節點是正常行為；與直接要求刪除父節點不同。舊的平面 shifts 仍可讀，新的班別修改沿用原程式的巢狀路徑，不搬移或刪除舊資料。

只有日後由管理者發布 Rules，資料庫端限制才會生效；本次不發布。

## 本機測試與 Preview

```bash
npm ci
npm run lint
npm test
npm run build
```

`npm test` 是 Rules 運算式與設定合約測試，**不是官方 Firebase 權限測試**。

瀏覽器測試需要 Playwright 與 Chromium；可使用環境既有的工具，或另裝測試工具 `npm install --no-save --package-lock=false playwright`。預設 Chromium 路徑為 `/usr/bin/chromium`，可用 `CHROMIUM_PATH` 覆寫。

```bash
npm run test:browser
```

測試啟動 `127.0.0.1:4174`，使用記憶體資料，攔截 Auth HTTP 回應並拒絕其他對外連線。正式程式不會匯入測試 mock，也沒有新增產品依賴。

官方 Rules 引擎驗證是可選的本機命令，需要已可使用的 Firebase CLI、Emulator 與 Java：

```bash
npx firebase-tools emulators:exec --project demo-shift-schedule --only database "npm run test:rules:emulator"
```

測試固定連到 `127.0.0.1:9000`，沒有管理者金鑰或正式專案設定。直接執行 `npm run test:rules:emulator` 而本機未啟動 Emulator，會明確失敗並表示未進行真實 Rules 驗證，不會略過後當成通過。工具不可用時，以 `TEST_RESULTS.md` 記錄限制；不要求另建雲端測試專案。

本機人工操作 Emulator 時，複製 `.env.example` 為 `.env.local`，設定測試 Email 並保持 `VITE_USE_FIREBASE_EMULATORS=true`，啟動本機 Auth／Database Emulator；測試帳號的 UID 使用上述指定值。此模式強制使用 `demo-shift-schedule`，不沿用正式設定。

**目前不部署 Vercel Preview**：`vercel.json` 停用 `feature/editor-password` 的 Git 自動部署；Vite 遇到 `VERCEL_ENV=preview`，或 `VERCEL=1` 卻未標明 production 時直接停止建置，即使繼承正式 Firebase 設定也不產生預覽產物。不更改 Vercel 正式環境或部署設定。既有 Preview 若先前已存在，不會因這些檔案自動撤除，本輪不使用它做寫入測試。

## 環境設定與上線前必要操作

`VITE_EDITOR_EMAIL` 是指定 UID 的 Email，不是密碼。`VITE_*` 會進入瀏覽器，不能放密碼、服務帳戶或私密金鑰。Firebase Web API Key、專案 ID 與 UID 是既有公開識別設定。

正式 Firebase Web 設定預設沿用原程式；如有需要，可用 `.env.example` 所列 `VITE_FIREBASE_*` 覆寫。本次不改正式環境變數。

正式上線前需由使用者／管理者完成：

1. 審查 Draft PR 與測試限制。在有工具的環境補跑上述本機 Emulator，確認真實 Rules 引擎的型別驗證、父節點拒絕與逐日期原子更新；不需要新增 Firebase 專案。
2. 確認正式 Authentication 已啟用 Email／Password，指定 UID 的 Email 正確；在 Vercel **Production** 設定 `VITE_EDITOR_EMAIL`，並關閉或移除 `VITE_USE_FIREBASE_EMULATORS`。不把密碼放進環境變數。
3. 另外確認正式上線時段。備份目前資料與 Rules，再由管理者在正式專案發布本次 Rules。優先用 Rules Simulator 驗證，不為測試修改正式班表。
4. Rules 生效後才依核准流程合併至 `main` 並正式發布前端。這兩步之間舊網站仍可閱讀，但未登入編輯會被拒絕，需安排短暫停止編輯。
5. 驗收公開閱讀與登入／登出；正式班表的實際修改留給另經授權的正常操作。回滾前端時仍保留嚴格 Rules，不重新開放匿名寫入。

本次只推送工作分支並建立 Draft PR，不合併 main、不發布正式 Rules、不部署正式網站。

## 變更檔案

- `src/App.jsx`：唯讀、密碼對話框、UID 檢查、登出與原操作保護；修正既有 lint、訂閱與初始化問題，換班改為逐日期原子更新。
- `src/firebase.js`、`src/firebaseConfig.js`：集中既有 SDK 設定與 Auth，加入記憶體登入及本機 Emulator 支援；Preview 建置停止保護。
- `database.rules.json`、`firebase.json`：日期層級 Rules 與本機 Emulator 設定。
- `vite.config.js`、`vercel.json`：停止此輪 Preview 與工作分支自動部署。
- `.env.example`、`.gitignore`：環境設定範例與忽略本機設定／暫存。
- `package.json`、`eslint.config.js`、`tests/security.test.mjs`、`tests/browser.mjs`、`tests/firebase.mock.js`、`tests/rules.emulator.mjs`：本機合約、瀏覽器與可選官方 Emulator 測試；無新增產品依賴、無套件鎖檔變更。
- `README.md`、`TEST_RESULTS.md`：說明與實際測試記錄。
