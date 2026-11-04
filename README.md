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

## GitHub Actions 自動驗證

`.github/workflows/firebase-rules.yml` 會在對 main 的 PR 建立、更新或重開時執行，包含 Draft PR。使用 GitHub-hosted Ubuntu 24.04、Node.js 22 與 Java 21，明確權限只有 `contents: read`，checkout 不保留憑證。

流程執行 `npm ci`、build、lint、15 項合約測試，安裝固定版本 Firebase CLI 14.26.0，透過既有 `firebase.json`／`database.rules.json` 啟動 Database Emulator，再執行 `tests/rules.emulator.mjs`。專案固定是 `demo-shift-schedule`，測試只連 `127.0.0.1:9000`，不用 Firebase 密碼、Admin SDK 金鑰或雲端測試專案。最後執行 14 組瀏覽器模擬測試；Playwright 裝在 runner 暫存目錄，不更動專案依賴與鎖檔。沒有部署步驟。

已確認[官方 Emulator 與全部既有檢查執行成功](https://github.com/slu5207-dot/shift-schedule/actions/runs/41843177693)。失敗與修正記錄、剩餘風險見 `TEST_RESULTS.md`。不需要使用者手動安裝工具或執行指令；後續修改 PR 會自動重測。

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

官方 Rules 引擎驗證已由 Actions 自動執行；若開發者需要自行重現，可用以下本機命令（需 Firebase CLI、Emulator 與 Java）：

```bash
npx firebase-tools emulators:exec --project demo-shift-schedule --only database "npm run test:rules:emulator"
```

測試固定連到 `127.0.0.1:9000`，沒有管理者金鑰或正式專案設定。直接執行 `npm run test:rules:emulator` 而本機未啟動 Emulator，會明確失敗並表示未進行真實 Rules 驗證，不會略過後當成通過。本機工具不可用時直接查看 PR 的 Actions 結果，不要求使用者另裝工具或建立雲端測試專案。

本機人工操作 Emulator 時，複製 `.env.example` 為 `.env.local`，設定測試 Email 並保持 `VITE_USE_FIREBASE_EMULATORS=true`，啟動本機 Auth／Database Emulator；測試帳號的 UID 使用上述指定值。此模式強制使用 `demo-shift-schedule`，不沿用正式設定。

**本次不部署 Preview，也不要求另建 Firebase 專案。** `vercel.json` 只停用 `feature/editor-password` 的 Git 自動部署，不影響 main 或其他分支。

未來 Preview 建置可以通過，但必須明確設定隔離專案的 `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_AUTH_DOMAIN`、`VITE_FIREBASE_DATABASE_URL`、`VITE_FIREBASE_PROJECT_ID` 與 `VITE_FIREBASE_APP_ID`。Auth domain 必須是該專案的 `專案ID.firebaseapp.com`；資料庫須使用該專案對應的標準預設 instance URL（`專案ID.firebaseio.com`、`專案ID-default-rtdb.firebaseio.com` 或 `專案ID-default-rtdb.區域.firebasedatabase.app`）。缺值、正式專案／API Key／App ID、混用 Auth／資料庫或 localhost Emulator 都會拒絕建置。自訂資料庫名稱與自訂 Auth 網域暫不放行，以維持明確可檢查的對應關係。

這是建置設定檢查，不會建立專案或連線驗證雲端資源；Firebase 實際權限仍由各資料庫的 Rules 決定。`VERCEL_ENV=production` 不套用 Preview 檢查，正式建置維持正常；`VERCEL=1` 卻未標明 production 時則保守套用檢查。若從其他系統提供 prebuilt artifacts，仍須先以正確的 `VERCEL_ENV` 執行此建置，不能略過檢查。既有已部署 Preview 不會自動被撤除，本輪不使用它做寫入測試。

## 可選人工複查：Console Rules Playground

Codex 執行環境仍受下載限制，但官方 Emulator 已改在 GitHub Actions 完成驗證。下列 Playground 操作僅供額外人工複查，不是本次驗收的必要手動步驟。

最簡單的人工替代方式：

1. 開啟 Firebase Console → Realtime Database → Rules，將 PR 的 `database.rules.json` 貼到編輯器，保持**未發布**，開啟 Rules Playground。模擬不會寫入正式資料；不要按 Publish，也不要到 Data 分頁手動建立測試資料。若目前介面無法對未發布草稿模擬，就停止，改在可用環境執行 Emulator，不能為了驗證而發布規則。
2. 使用下表的 Read／Write、Location、Data 與驗證設定。匿名時關閉 Authenticated；指定／其他帳號時開啟驗證並填入對應 UID。不要輸入真實密碼。若介面不提供自訂 UID，這些授權案例暫時不能驗證。
3. 以下使用合成日期 `2099-01-01`，只在 Playground 填值。成功的模擬也不會建立該日資料；記錄每項結果，離開時捨棄草稿。

| 模擬 | 路徑與資料 | 身分 | 預期 |
| --- | --- | --- | --- |
| Read，各執行一次 | `/shifts`、`/modifiedDates`、`/pendingDates`、`/lockedDates` | 匿名 | 允許 |
| Write | `/shifts/2099/01/2099-01-01`，`"測試甲"` | 匿名／其他 UID | 拒絕 |
| Write | 同上，`"測試甲"` | 指定 UID | 允許 |
| Write，邊界值 | 同上，`""`、`"1234567890123456789"` | 指定 UID | 允許 |
| Write，非法格式 | 同上，`123`、`{"name":"測試甲"}`、`"12345678901234567890"` | 指定 UID | 拒絕 |
| Write，刪除班別 | 同上，`null`（不加引號） | 指定 UID | 拒絕 |
| Write，標記待確認 | `/pendingDates/2099-01-01`，`{"requestedBy":"測試甲","timestamp":"2099-01-01T00:00:00.000Z"}` | 指定 UID；再用匿名／其他 UID 各試一次 | 指定 UID 允許，其餘拒絕 |
| Write，禁止換班 | `/lockedDates/2099-01-01`，`{"lockedBy":"測試甲","timestamp":"2099-01-01T00:00:00.000Z"}` | 同上 | 同上 |
| Write，調班紀錄 | `/modifiedDates/2099-01-01`，`{"from":"測試甲","to":"測試乙","modifiedBy":"測試甲","timestamp":"2099-01-01T00:00:00.000Z"}` | 同上 | 同上 |
| Write，取消標記／清除紀錄 | 以上三個日期紀錄路徑，資料 `null` | 同上 | 同上 |
| Write，刪除父節點 | `/`、`/shifts`、`/shifts/2099`、`/shifts/2099/01`、`/modifiedDates`、`/pendingDates`、`/lockedDates`，資料 `null`；再用 `{"overwrite":true}` 試覆寫 | 指定 UID | 全部拒絕 |

指定 UID 是 `ceockx7WIPfKWZuyqOaxImBdQ1P2`，其他 UID 可填合成值 `other-test-uid`。

**Playground 的單一路徑 Write 不能代替多路徑 `update()` 的原子性驗證。** 不要把帶有斜線鍵的 JSON 貼到根路徑當成多路徑更新，那是不同請求。本次已由 Actions 的官方 Emulator 驗證多路徑更新成功與整筆拒絕，不再以合約測試代替官方驗證。

## 環境設定與上線前必要操作

`VITE_EDITOR_EMAIL` 是指定 UID 的 Email，不是密碼。`VITE_*` 會進入瀏覽器，不能放密碼、服務帳戶或私密金鑰。Firebase Web API Key、專案 ID 與 UID 是既有公開識別設定。

正式 Firebase Web 設定預設沿用原程式；如有需要，可用 `.env.example` 所列 `VITE_FIREBASE_*` 覆寫。本次不改正式環境變數。

正式上線前需由使用者／管理者完成：

1. 審查 Draft PR 與 Actions 結果。官方 Rules 驗證已完成；另外評估 `npm ci` 回報的既有依賴弱點（含 critical），本次未升級產品依賴。無需手動安裝 Emulator 或新增 Firebase 專案。
2. 確認正式 Authentication 已啟用 Email／Password，指定 UID 的 Email 正確；在 Vercel **Production** 設定 `VITE_EDITOR_EMAIL`，並關閉或移除 `VITE_USE_FIREBASE_EMULATORS`。不把密碼放進環境變數。
3. 另外確認正式上線時段。備份目前資料與 Rules，再由管理者在正式專案發布本次 Rules。優先用 Rules Simulator 驗證，不為測試修改正式班表。
4. Rules 生效後才依核准流程合併至 `main` 並正式發布前端。這兩步之間舊網站仍可閱讀，但未登入編輯會被拒絕，需安排短暫停止編輯。
5. 驗收公開閱讀與登入／登出；正式班表的實際修改留給另經授權的正常操作。回滾前端時仍保留嚴格 Rules，不重新開放匿名寫入。

本次只推送工作分支並更新原 Draft PR，不合併 main、不發布正式 Rules、不部署正式網站。

## 變更檔案

- `src/App.jsx`：唯讀、密碼對話框、UID 檢查、登出與原操作保護；修正既有 lint、訂閱與初始化問題，換班改為逐日期原子更新。
- `src/firebase.js`、`src/firebaseConfig.js`：集中既有 SDK 設定與 Auth，加入記憶體登入及本機 Emulator 支援；Preview 隔離設定檢查。
- `database.rules.json`、`firebase.json`：日期層級 Rules 與本機 Emulator 設定。
- `vite.config.js`、`vercel.json`：Preview 僅放行明確隔離設定；此工作分支仍停用自動部署。
- `.env.example`、`.gitignore`：環境設定範例與忽略本機設定／暫存。
- `package.json`、`eslint.config.js`、`tests/security.test.mjs`、`tests/browser.mjs`、`tests/firebase.mock.js`、`tests/rules.emulator.mjs`：合約、瀏覽器與官方 Emulator 測試；無新增產品依賴、無套件鎖檔變更。
- `.github/workflows/firebase-rules.yml`：以唯讀權限在 PR 自動執行官方 Emulator 與既有檢查。
- `README.md`、`TEST_RESULTS.md`：說明與實際測試記錄。
