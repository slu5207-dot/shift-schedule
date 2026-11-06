# 正式上線 SOP

適用：原 Draft PR #1、Vite 靜態部署至 Vercel、Firebase Auth 與 Realtime Database。依賴安全建議為 **GO**，理由與接受的殘餘風險見 DEPENDENCY_SECURITY_REVIEW.md；執行本 SOP 仍須使用者另行核准，本次不代為發布。

1. **確認版本與編輯帳號**：原 PR 最新 `verify` 必須全部成功並完成審查。Firebase 專案為 `shift-schedule-a6daf`，Authentication 啟用 Email／Password，現有編輯帳號 UID 必須是 `ceockx7WIPfKWZuyqOaxImBdQ1P2`，記下該帳號 Email。不要重新建立導致 UID 改變，也不把密碼存入 Git 或環境變數。
2. **確認 Vercel Production**：Production Branch 是 main、Framework 是 Vite、Build 是 npm run build、輸出是 dist。`VITE_EDITOR_EMAIL` 等於上一步的 Email；`VITE_USE_FIREBASE_EMULATORS` 為 false 或移除。Firebase Web 設定沿用正式專案（或確認五個 VITE_FIREBASE_* 均指向正式專案），不能混入測試值。不要放服務帳戶、Firebase 密碼或 Admin SDK 金鑰；這些 VITE 值會出現在瀏覽器。
3. **備份當下狀態**：從正式 Realtime Database 匯出最新完整 JSON，另外複製當下已發布的 Rules，記錄目前 Vercel 正式部署的版本／網址。妥善保存備份，勿加入 Git。先約定短暫停止編輯的時段。
4. **先 Rules、後前端**：在確認專案名稱無誤後，由管理者發布 PR 的 database.rules.json。以 Rules Playground 確認四節點公開讀取、匿名寫入拒絕，不對正式資料送測試寫入。確認 Rules 生效後，再依核准流程將原 PR 合併 main，讓 Vercel 發布前端。兩步之間舊站可讀，但舊版未登入編輯會被拒絕；不要為縮短空檔而恢復匿名寫入。
5. **正式驗收**：
   - 用無痕視窗開正式網址，不登入可讀取班表／日期資料，換班與標記不可操作。
   - 點「編輯班表」，錯誤密碼維持唯讀；正確密碼顯示完成編輯入口，沒有 Email／註冊流程。
   - 由兩位使用者同意一筆本來就需要的真實換班，確認班別、修改紀錄與待確認更新正確，另一個未登入視窗同步可讀且仍不能編輯。不為驗收任意改班；若當時沒有授權的正常操作，這一項留到首次正常換班驗收。
   - 點「完成編輯／登出」立即回唯讀，重新整理仍是唯讀。不使用正式資料庫做合成資料、非法格式或刪除測試；這些已由官方 Emulator 驗證。
6. **問題時回復**：先停止編輯；必要時將四節點維持公開讀取、所有寫入關閉，再由 Vercel 回滾到先前正式部署。保留安全的拒絕寫入規則，不直接還原原本匿名可寫的舊 Rules。回滾前端不會自動回復資料；若有誤改，另經確認後只從備份還原受影響日期與相關紀錄，不直接覆寫整庫。核對原因後重新走審查與發布流程。

完成後記錄正式部署版本與驗收結果。此文件不是合併、修改正式 Firebase 或部署網站的執行授權。
