# 測試記錄

日期：2026-11-04（Asia/Taipei）。基準提交：`55a159d093777d7dc1e5fdfeca8daf715739b862`。

## GitHub Actions 實際結果

[首次全部通過的執行紀錄](https://github.com/slu5207-dot/shift-schedule/actions/runs/41843177693)，測試提交 `5a75fc410d3a9c76ea225b823fe9de2c62d9ba41`。已讀取 job 步驟及完整紀錄，確認 run 為 `completed / success`。

Runner 是 GitHub-hosted Ubuntu 24.04，專案命令使用 Node.js 22.23.4、Java 21；Firebase CLI 14.26.0 下載並啟動官方 Database Emulator 4.11.2。紀錄明確顯示使用 `demo-shift-schedule`。Workflow 權限為 `contents: read`（GitHub 另隱含唯讀 metadata），沒有 Firebase 密碼、管理者金鑰或部署步驟。

| 檢查 | 實際結果 |
| --- | --- |
| `npm ci` | 通過，使用既有鎖檔；同時回報既有依賴弱點，見下方風險。 |
| `npm run build` | 通過。 |
| `npm run lint` | 通過。 |
| `npm test` | 15 項合約測試通過；與官方引擎測試分開記錄。 |
| 官方 `firebase emulators:exec --only database --project demo-shift-schedule` | 通過。既有 `tests/rules.emulator.mjs` 的一個整合案例完整執行，`pass 1 / fail 0`，測試腳本結束碼 0。 |
| `npm run test:browser` | 14 組瀏覽器模擬檢查通過；資料庫為記憶體 mock，Firebase Auth SDK 使用攔截的 HTTP 回應。 |
| `git diff --check` | 通過。 |

官方引擎已實際驗證：

- 匿名及非指定 UID 可讀取四個既有節點；根與未知節點拒絕讀取。
- 匿名與非指定 UID 的日期新增、修改、刪除及多路徑寫入被拒絕。
- 指定 UID 可寫入班別、調班紀錄，並標記／取消待確認及禁止換班；取消最後一筆標記仍可用。
- shifts 空字串及 19 字元可用，20 字元、物件、數字、布林被拒絕；刪除班別被拒絕。
- 指定 UID 直接覆寫／刪除根、整年、整月及整個標記節點被拒絕。
- 換班逐日期多路徑更新成功；包含非法班別或父節點刪除的更新整筆被拒絕，班別保持原值。
- 換回原班別、清除修改紀錄／待確認及無驗證的登出後寫入拒絕。

紀錄中的 `permission_denied` 是上述負向案例預期的拒絕訊息，已由斷言確認，不是未處理的測試錯誤。安全規則未為通過測試而修改；本輪 `database.rules.json`、Firebase 設定及產品排班／登入程式均保持原樣。

## 第一次失敗與修正

[第一次執行](https://github.com/slu5207-dot/shift-schedule/actions/runs/41842738664)已啟動官方 Emulator，但因測試使用 `ref(db, '')` 代表根路徑，在 SDK 本身的路徑檢查失敗；尚未執行後續權限斷言。當次 build、lint、合約測試成功，官方步驟失敗，瀏覽器步驟因上一步失敗而略過。

修正為省略根路徑參數（`ref(db, undefined)`，等同 `ref(db)`）；一般日期路徑不變。另將 runner actions 改為目前支援的 v5，移除第一輪已確認的舊版 action 警告。重跑後，官方測試與瀏覽器測試全部成功。沒有放寬、停用或略過任何安全規則與斷言。

## 保留的既有驗證

合約測試涵蓋四節點讀取、UID、日期寫入範圍、原始 `length < 20` 格式、父節點拒絕及設定檢查。瀏覽器模擬涵蓋公開閱讀、密碼錯誤、不同 UID、登入／登出、原有三項功能、換回原班別、離線、重新整理、空資料庫、新舊資料相容及手機畫面。

前一階段的建置矩陣也已通過：一般與明確 Vercel Production 可建置；完整合成隔離 Preview 設定可建置；缺值或正式／混用 Firebase 設定被拒絕。本輪未修改 Preview 保護，`feature/editor-password` 的 Git 自動部署仍停用，沒有部署 Preview。

## 剩餘風險與正式上線

- `npm ci` 實際回報 **22 項既有依賴弱點：1 low、6 moderate、13 high、2 critical**。這是整個鎖檔的稽核摘要，尚未區分產品執行期與開發工具的影響，本輪沒有升級依賴或執行 `npm audit fix`。正式上線審查仍應評估及處理；不能由本次測試成功推論漏洞已排除。
- Build 仍有 Browserslist 過期及單檔超過 500 kB 的提示，皆非建置錯誤。
- 真實 Firebase Email／Password 帳號、正式 Vercel 環境變數及已發布 Rules 的串接沒有在本次測試；不使用正式憑證，也不對正式班表做寫入驗收。
- 本次要求的官方 Rules 與既有自動化測試已完成。PR 仍是 Draft；整體正式上線仍待依賴風險評估、正式 Auth／Email 設定確認、備份、審查與另外授權。沒有合併 main、發布正式 Rules 或部署任何網站。

所有測試資料與模擬密碼／token 都是合成值。正式 Firebase 資料、私密憑證、環境檔與 Emulator log 不納入提交。未來更新原 PR 會自動重跑，不需使用者手動安裝工具或輸入指令。
