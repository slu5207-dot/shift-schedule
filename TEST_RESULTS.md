# 測試記錄

日期：2026-11-04（Asia/Taipei）。基準提交：`55a159d093777d7dc1e5fdfeca8daf715739b862`。

## 範圍

只處理 `feature/editor-password` 的密碼編輯功能。Rules 依使用者提供的 Console 原始規則修正，shifts 驗證完整保留 `newData.isString() && newData.val().length < 20`，沒有新增非空限制；另外三個節點只縮小寫入授權。

所有資料庫寫入驗收都使用合成資料或記憶體 mock；沒有匯出、讀取或寫入正式班表。測試中的固定密碼與回應 token 都是模擬值，不是真實帳號憑證。既有 Firebase Web 設定與允許的 UID 是公開識別資訊。

## 實際結果

| 檢查 | 結果 |
| --- | --- |
| `npm run lint` | 通過；未停用原有檢查規則。 |
| `npm test` | 12 項合約測試通過，範圍如下。 |
| `npm run test:browser` | 14 組瀏覽器檢查通過；真正 Firebase Auth SDK 的部分使用攔截的 HTTP 回應，資料庫使用 mock。 |
| `npm run build` | 通過。 |
| Vercel Preview／缺少正式環境識別 | 如預期停止建置；包含繼承正式設定與提供合成隔離設定的情況。本輪不產生 Preview。 |
| `vercel.json` | 停用 `feature/editor-password` Git 自動部署，未停用 main 的部署。 |
| `npm run test:rules:emulator` | **未通過環境前置檢查**：本機 Database Emulator 未啟動；沒有 Firebase CLI／Emulator JAR，無法下載。真實 Rules 引擎案例未執行，不能視為通過。 |
| `git diff --check` | 通過。 |
| 提交檔案檢查 | 僅程式、規則、設定範例、合成測試與文件；不含 `.env.local`、密碼、私密金鑰、資料庫匯出或真實班表快照。 |

合約測試讀取實際 `database.rules.json`，檢查：

1. 只有四個既有節點公開讀取；根與未知節點拒絕讀寫。
2. 未登入、非指定 UID、登出後都不能新增／修改／刪除日期紀錄。
3. 指定 UID 的換班、紀錄更新與標記取消。
4. 指定 UID 也不能直接覆寫／刪除根、年、月或整個標記節點。
5. shifts 空字串、19 字元可用；20 字元、數字、布林、物件及刪除被拒絕。
6. shifts 只授權原有巢狀日期路徑，舊平面資料仍可公開讀取。
7. 其他三個節點保留既有物件格式，不加入新的欄位限制。
8. 換班逐日期更新可授權，混入父節點刪除或非法 shifts 值時拒絕。
9. 本機 Emulator 強制 demo 專案；Preview 建置停止，工作分支 Git 自動部署停用。

這些是運算式與設定合約測試，**不是完整 Firebase Rules 引擎模擬**；真實的級聯權限與多路徑原子性尚未由官方引擎驗證。

瀏覽器測試涵蓋未登入閱讀、錯誤密碼、其他 UID、登入成功、三種原有操作與取消、換回原班別清除紀錄、立即登出、失效登入、離線、重新整理、空資料庫、新舊資料相容、手機寬度與缺少 Email 設定。攔截非預期外連，確認沒有正式 Firebase 請求或未捕捉的頁面錯誤。

本環境使用既有工具的命令：

```bash
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules npm run test:browser
```

## 未驗證與必要後續

- 官方 Emulator 測試腳本已列出四節點讀取、根／未知節點拒絕、匿名／其他 UID／指定 UID、shifts 型別與邊界、父節點刪除、取消最後標記，以及逐日期更新的整筆成功／失敗案例；需在工具可用的本機補跑，命令見 README。
- 沒有使用真實 Firebase 帳號密碼驗證雲端設定，沒有修改或發布正式 Rules。
- 不要求另建測試專案，不部署 Preview。正式上線前另行確認 Auth、Production Email、備份與發布時段。
- Build 仍有既有 Browserslist 過期及 SDK 納入後單檔超過 500 kB 的提示，皆不是建置錯誤；本輪不升級依賴或加入拆包重構。
