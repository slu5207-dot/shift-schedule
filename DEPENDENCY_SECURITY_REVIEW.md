# 依賴安全評估與上線建議

日期：2026-11-06（Asia/Taipei）。範圍：現有 Vite 靜態網站、Draft PR #1、GitHub-hosted CI；不涵蓋未來 SSR、Functions、Firestore 或對外公開的開發伺服器。

## 結論：GO

建議在完成 PRODUCTION_SOP.md 的帳號、環境、備份與發布步驟後上線。目前沒有確認可由網站訪客觸發的重大依賴漏洞；兩項 Critical 已以相容的傳遞依賴鎖檔修補。剩餘 19 項（0 Critical）不阻擋本次 Vite 靜態發行，接受理由逐項列於下方。GO 是此提交與此部署方式的安全建議，不是合併／發布授權。

## 證據與方法

- [基準 audit、npm explain 與完整檢查](https://github.com/slu5207-dot/shift-schedule/actions/runs/42154828194)。在 runner 實際執行 `npm audit --json`、`npm audit --omit=dev --json`；Codex 本機嘗試因網路政策失敗，未冒充成功。
- [最小修補候選、修補版本查詢與完整驗證](https://github.com/slu5207-dot/shift-schedule/actions/runs/42156015270)。以 npm registry 的已發布版本與各 audit 範圍比對安全版本；不是直接假設下一個版號必定存在。
- 最終提交保留兩個 audit 指令於既有 workflow，完整結果以機器可讀 JSON 寫入 Actions log。exit 1 代表已發現漏洞；不強迫警告清零。網路／JSON 錯誤仍使步驟失敗。最終 PR 的 verify 檢查須綠燈。
- `npm explain` 取得實際路徑；表格列主要／最短引入鏈，完整多路徑與安裝位置可在基準 run 的 AUDIT_PATHS 紀錄查閱。
- 使用實際 Vite `generateBundle` 的 chunk.modules，檢查 renderedLength > 0 的模組：原 22 個通報套件均未包含在瀏覽器產物。不是只用檔名字串搜尋。Firebase 實際使用瀏覽器 exports 的 Auth/Realtime Database，未載入 Firestore。
- 檢查 package.json、Vite 設定、PostCSS 實際 nanoid(6) 呼叫與 ESLint Ajv 設定；確認沒有 SSR／Node API、使用者 CSS/YAML/protobuf 上傳或公開 dev server。

| audit 範圍 | 修補前 | 修補後 | 實際意義 |
| --- | --- | --- | --- |
| 完整 | 22：2 Critical、13 High、6 Moderate、1 Low | 19：0 Critical、13 High、5 Moderate、1 Low | 安裝樹警告，不等於 19 個公開網站攻擊入口 |
| --omit=dev | 4：2 Critical、1 High、1 Moderate | 1 High（@grpc/grpc-js） | 仍包含 Firebase 套件安裝的未使用 Node/Firestore 分支 |
| 正式瀏覽器產物 | 上述通報套件未出現在輸出模組清單 | 修補只改 Node 依賴鏈，產品程式不變 | 不代表未來任意 imports 也安全；改成 Node/Firestore/SSR 時須重評 |

## 兩項 Critical 與最小修補

1. **protobufjs 7.5.4：CVE-2026-41242 / [GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)**。Critical 範圍為 >=7.0.0 <7.5.5，該漏洞於 7.5.5 修補；因另有本次通報到 7.6.4，採用同 major 的 7.6.5。任意程式碼執行需要載入攻擊者可控制的 protobuf schema／JSON descriptor；本站只用 Auth/Database，沒有這個入口。依賴鏈：firebase@12.6.0 → @firebase/firestore@4.9.2 → @grpc/proto-loader@0.7.15 → protobufjs。
2. **websocket-driver 0.7.4：CVE-2026-54466 / [GHSA-xv26-6w52-cph6](https://github.com/advisories/GHSA-xv26-6w52-cph6)**。<0.7.5 受影響，0.7.5 修補。漏洞涉及舊 WebSocket draft frame 的長度解析與訊息毀損；不是一般的瀏覽器 WebSocket API 漏洞。依賴鏈：firebase@12.6.0 → @firebase/database@1.1.0 → faye-websocket@0.11.4 → websocket-driver；compat 入口亦引入同一版本。本站瀏覽器使用原生 WebSocket，Node Emulator 測試只連可信本機服務。

雖然兩者目前都不可從正式網頁到達，仍做小範圍防禦性鎖檔修補，降低 Node 工具面的殘餘風險：protobufjs 7.6.5、websocket-driver 0.7.5，以及同鏈 @protobufjs/utf8 1.1.1。protobuf 自身要求的 codegen/eventemitter/fetch 分別更新到 2.0.5/1.1.1/1.1.1，移除不再需要的 inquire。npm 同時正常化部分 peer metadata；其他套件版本不變。

沒有更改 package.json 的依賴範圍，沒有升級 Firebase／React／Vite、沒有新增正式 overrides、沒有執行 npm audit fix --force。候選以暫時的精確 overrides 產生鎖檔後立即移除並由 npm 重算，所有選定版本均符合原消費者 semver 範圍；一次性產生候選的 workflow 步驟已移除。

## 22 個套件逐項決定

「修復版」是本次查得同 major、避開此 audit 全部影響範圍的最小已發布版本，不代表一定符合所有父套件的原範圍。所有 GHSA 與各別範圍列於後面的索引。B/L/D/N 為下節說明的接受條件。

| 套件／原版本 | 等級與用途 | 主要依賴路徑 | 綜合影響範圍／修復版 | 處置與理由 |
| --- | --- | --- | --- | --- |
| @babel/core 7.28.5 | low；建置／lint | @vitejs/plugin-react → @babel/core | <=7.29.0；7.29.6 | B：只處理受審查的 repo 原始碼／source map；不是網站請求處理器。 |
| @grpc/grpc-js 1.9.15 | high；prod 安裝、Node Firestore | firebase → @firebase/firestore → @grpc/grpc-js | <=1.13.5；1.13.6 | N：未匯入 Firestore，也沒有 gRPC server/client 執行路徑；不進瀏覽器。 |
| @humanfs/node 0.16.7 | moderate；lint | eslint → @humanfs/node | <0.16.8；0.16.8 | L：漏洞在遞迴複製；本站與 lint 腳本沒有使用該複製功能。 |
| @protobufjs/utf8 1.1.0 | moderate；prod 安裝、Node Firestore | firebase → @firebase/firestore → @grpc/proto-loader → protobufjs → @protobufjs/utf8 | <=1.1.0；1.1.1 | 修補：配合 protobuf 最小修補到 1.1.1。 |
| ajv 6.12.6 | moderate；lint | eslint → ajv | <6.14.0；6.14.0 | L：ESLint 的設定 schema 受 repo 控制，未啟用不受信任的 $data schema。 |
| baseline-browser-mapping 2.9.2 | moderate；建置 | autoprefixer → browserslist → baseline-browser-mapping | >=2.0.0 <2.11.0；2.11.0 | B：target/query 是固定建置設定；沒有使用者輸入的查詢服務。 |
| brace-expansion 1.1.12 | high；lint | eslint → minimatch → brace-expansion | <=1.1.20；1.1.21 | L：glob 來自受審查的設定；班表資料不會成為 glob。 |
| browserslist 4.28.1 | high；建置 | autoprefixer → browserslist | <=4.28.6；4.28.7 | B：固定 targets、短生命週期建置；沒有動態 stats 上傳或長期查詢服務。 |
| flatted 3.3.3 | high；lint | eslint → file-entry-cache → flat-cache → flatted | <=3.4.1；3.4.2 | L：eslint . 未啟用 --cache，沒有外部快取反序列化入口。 |
| js-yaml 4.1.1 | high；lint | eslint → @eslint/eslintrc → js-yaml | 4.0.0 - 4.3.1；4.3.2 | L：使用 flat JS config，沒有把使用者資料交給 YAML parser；GitHub 本身解析 workflow 與此套件不同。 |
| minimatch 3.1.2 | high；lint | eslint → minimatch | <=3.1.3；3.1.4 | L：固定 lint glob；不提供使用者指定 pattern 的服務。 |
| nanoid 3.3.11 | high；建置 | postcss → nanoid | <=3.3.17；3.3.18 | B：PostCSS 實際呼叫 nanoid(6)；未使用零／負值、巨大 size 或自訂生成器。 |
| picomatch 2.3.1, 4.0.3 | high；建置／watch | Tailwind → micromatch/anymatch/readdirp → 2.x；Vite/Tailwind → tinyglobby → 4.x | <=2.3.1 \|\| 4.0.0 - 4.0.3；2.3.2 / 4.0.4 | B：Tailwind/Vite 的 glob 由 repo 控制，沒有公開 glob API。 |
| postcss 8.5.6 | high；建置 | postcss | <=8.5.22；8.5.23 | B：僅編譯 repo CSS；產生外部 CSS 檔，沒有把不受信任 CSS 串進 HTML style；不接受外部 source map。 |
| postcss-selector-parser 6.1.2 | moderate；建置 | tailwindcss → postcss-selector-parser | <=6.1.4；6.1.5 | B：selector 只來自 repo CSS，沒有使用者 CSS 解析服務。 |
| protobufjs 7.5.4 | critical；prod 安裝、Node Firestore | firebase → @firebase/firestore → @grpc/proto-loader → protobufjs | <=7.6.4；7.6.5 | 修補：7.5.4 → 7.6.5；同時解除 Critical 與其餘本次通報。 |
| rollup 4.53.3 | high；建置 | vite → rollup | 4.0.0 - 4.58.0；4.59.0 | B：CLI／輸出名稱為固定 Vite 設定，沒有不受信任的 named input、chunk alias 或 plugin。 |
| source-map-js 1.2.1 | high；建置 | postcss → source-map-js | 1.0.0 - 1.2.1；1.2.2 | B：只處理受審查建置來源；沒有外部 indexed map 輸入。 |
| vite 7.2.6 | high；建置／本機開發 | vite | 7.0.0 - 7.3.6；7.3.7 | D：正式只部署 dist；CI 明確綁 127.0.0.1，沒有對外 dev server；Windows editor 問題不作用於 Ubuntu runner。 |
| websocket-driver 0.7.4 | critical；prod 安裝、Node Database | firebase → @firebase/database → faye-websocket → websocket-driver | <=0.7.4；0.7.5 | 修補：0.7.4 → 0.7.5；只影響 Node SDK，瀏覽器走原生 WebSocket。 |
| yaml 2.8.2 | moderate；建置設定 | vite → yaml | 2.0.0 - 2.8.2；2.8.3 | B：只載入 repo 設定，不提供 YAML 上傳／解析 API。 |
| zod 4.1.13 | high；lint | eslint-plugin-react-hooks → zod | <4.6.6；4.6.6 | L：用於 hooks lint 設定驗證，沒有公開大集合驗證端點。 |

## 不立即修補的理由與殘餘風險

- **N：未使用的 Node Firestore**。@grpc/grpc-js 的 TLS 憑證授權、錯誤揭露及畸形訊息問題需要實際建立／使用該 gRPC 服務或通道。本專案不 import Firestore，瀏覽器產物也沒有它，Rules 測試只用 Database。Firebase 的父版本約束為 ~1.9.0，不能直接把 1.13.6 塞進去而宣稱相容。為此升級整個 Firebase 不符合目前必要性，接受其安裝樹警告；未來若新增 Node Firestore 或後端，改為 NO-GO 直到重評與修補。
- **B：建置專用**。source map 檔案讀取、CSS 輸出、Rollup 路徑寫入、selector/glob/query 的 CPU/記憶體耗盡等確實可能危害「處理不受信任來源的建置器」。此 repo 的 config、CSS、輸出名稱／plugin 都隨 PR 審查，班表文字不進入編譯器；沒有公開編譯服務。特別是 [Rollup CVE-2026-27606](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) 需控制 named input／alias／plugin 的輸出名稱，本站沒有該輸入。不是說建置套件永遠無害，而是目前無外部輸入邊界可觸發。
- **L：lint 專用**。只在 CI 或開發機處理 repo 設定／來源；flat JS config、不啟用 ESLint cache，沒有使用者 schema、遞迴複製、YAML 或 glob 服務。惡意 PR 若已能修改 JS/config，本來就能執行任意 Node 指令，這些 parser 漏洞沒有再取得新的正式服務權限。仍須審查 PR，不把不受信任 repo 或 cache 放到有秘密的開發環境執行。
- **D：Vite dev server**。[CVE-2026-39363](https://github.com/advisories/GHSA-p9ff-h696-f583) 的任意檔案讀取需要把 dev server 暴露於網路且 WebSocket 可連線。CI 是 127.0.0.1，正式 Vercel 只供應 dist，沒有 dev server、editor API 或自訂 middleware；Windows 特定分支也不作用於 Ubuntu runner。接受當前警告，但禁止把 npm run dev／preview 當公開正式伺服器；若需 --host 對外測試，先在同 major 修補 Vite。
- **CI／供應鏈**：runner 一次性、contents: read、checkout 不持久保存 token，沒有 Firebase 私密憑證或任何部署命令；不使用 pull_request_target。未審查的 PR 仍是不受信任程式碼，不得改成帶正式 secrets／可部署的工作。npm ci 與 lock integrity 降低非預期解析／檔案被替換的風險，但不證明套件發行者或 action 本身不會被入侵。
- 此兩份 audit 僅涵蓋專案鎖檔，不涵蓋獨立安裝的固定版 Firebase CLI、暫存 Playwright、runner／Java／作業系統。這些工具只在隔離、無正式 secrets、無部署權的 job 使用；它們的殘餘供應鏈風險接受於本輪 CI，不將其安裝到正式靜態網站。
- 接受 19 項不是承諾永久不修；此份評估於本日期、此 imports 與靜態部署方式有效。若增加 SSR/Functions、Node Firestore、公開 Vite、動態 CSS/YAML/schema 或 CI secrets，需先重新評估。這不是本次新增功能的建議。

## 漏洞編號與精確影響範圍索引

下表取自基準 npm audit --json。相同 GHSA 的不同 major 範圍合併；套件綜合修復版本見上表。GHSA 本身就是可追溯漏洞編號；Critical 的 CVE 另已核對原始公告。

| 套件 | GHSA／影響版本 |
| --- | --- |
| @babel/core | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8)：`<=7.29.0` |
| @grpc/grpc-js | [GHSA-5375-pq7m-f5r2](https://github.com/advisories/GHSA-5375-pq7m-f5r2)：`<1.9.16`；[GHSA-99f4-grh7-6pcq](https://github.com/advisories/GHSA-99f4-grh7-6pcq)：`<1.9.16`；[GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j)：`<1.13.6`；[GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4)：`<1.13.6` |
| @humanfs/node | [GHSA-p498-v437-472g](https://github.com/advisories/GHSA-p498-v437-472g)：`<0.16.8` |
| @protobufjs/utf8 | [GHSA-q6x5-8v7m-xcrf](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf)：`<=1.1.0` |
| ajv | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)：`<6.14.0` |
| baseline-browser-mapping | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)：`>=2.0.0 <2.11.0` |
| brace-expansion | [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v)：`<1.1.13`；[GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp)：`<1.1.16`；[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg)：`<1.1.17`；[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895)：`<1.1.18`；[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)：`<1.1.21`；[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7)：`<1.1.20`；[GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)：`<1.1.19` |
| browserslist | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx)：`<=4.28.6`；[GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g)：`<=4.28.6` |
| flatted | [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f)：`<3.4.0`；[GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh)：`<=3.4.1` |
| js-yaml | [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68)：`>=4.0.0 <=4.1.1`；[GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m)：`>=4.0.0 <4.3.0`；[GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)：`>=4.0.0 <4.3.1`；[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh)：`>=4.0.0 <4.3.2` |
| minimatch | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26)：`<3.1.3`；[GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj)：`<3.1.3`；[GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74)：`<3.1.4` |
| nanoid | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv)：`<3.3.16`；[GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8)：`<3.3.18`；[GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w)：`<3.3.12` |
| picomatch | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p)：`<2.3.2 或 >=4.0.0 <4.0.4`；[GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj)：`<2.3.2 或 >=4.0.0 <4.0.4` |
| postcss | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)：`<8.5.10`；[GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q)：`<=8.5.11`；[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)：`<=8.5.22`；[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)：`<=8.5.17` |
| postcss-selector-parser | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92)：`>=6.1.0 <6.1.3`；[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)：`<6.1.5` |
| protobufjs | [GHSA-66ff-xgx4-vchm](https://github.com/advisories/GHSA-66ff-xgx4-vchm)：`<=7.5.5`；[GHSA-2pr8-phx7-x9h3](https://github.com/advisories/GHSA-2pr8-phx7-x9h3)：`<=7.5.5`；[GHSA-fx83-v9x8-x52w](https://github.com/advisories/GHSA-fx83-v9x8-x52w)：`<=7.5.5`；[GHSA-75px-5xx7-5xc7](https://github.com/advisories/GHSA-75px-5xx7-5xc7)：`<=7.5.5`；[GHSA-jvwf-75h9-cwgg](https://github.com/advisories/GHSA-jvwf-75h9-cwgg)：`<=7.5.5`；[GHSA-685m-2w69-288q](https://github.com/advisories/GHSA-685m-2w69-288q)：`<=7.5.5`；[GHSA-q6x5-8v7m-xcrf](https://github.com/advisories/GHSA-q6x5-8v7m-xcrf)：`<=7.5.5`；[GHSA-jggg-4jg4-v7c6](https://github.com/advisories/GHSA-jggg-4jg4-v7c6)：`<=7.5.7`；[GHSA-wcpc-wj8m-hjx6](https://github.com/advisories/GHSA-wcpc-wj8m-hjx6)：`<=7.6.0`；[GHSA-f38q-mgvj-vph7](https://github.com/advisories/GHSA-f38q-mgvj-vph7)：`<=7.6.2`；[GHSA-j3f2-48v5-ccww](https://github.com/advisories/GHSA-j3f2-48v5-ccww)：`>=7.5.0 <=7.6.4`；[GHSA-xq3m-2v4x-88gg](https://github.com/advisories/GHSA-xq3m-2v4x-88gg)：`>=7.0.0 <7.5.5` |
| rollup | [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc)：`>=4.0.0 <4.59.0` |
| source-map-js | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)：`>=1.0.0 <1.2.2` |
| vite | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)：`>=7.0.0 <=7.3.1`；[GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r)：`>=7.1.0 <=7.3.1`；[GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583)：`>=7.0.0 <=7.3.1`；[GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)：`>=7.0.0 <=7.3.4`；[GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv)：`>=7.0.0 <=7.3.6`；[GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw)：`>=7.0.0 <=7.3.6`；[GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm)：`>=7.0.0 <=7.3.6`；[GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw)：`>=7.0.0 <=7.3.6`；[GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22)：`>=7.0.0 <=7.3.6`；[GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)：`>=7.0.0 <=7.3.4` |
| websocket-driver | [GHSA-mp7j-qc5w-4988](https://github.com/advisories/GHSA-mp7j-qc5w-4988)：`<0.7.5`；[GHSA-xv26-6w52-cph6](https://github.com/advisories/GHSA-xv26-6w52-cph6)：`<0.7.5` |
| yaml | [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp)：`>=2.0.0 <2.8.3` |
| zod | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)：`<4.6.6` |

## 最終驗收與上線邊界

候選的 build、lint、15 項合約、官方 Database Emulator 與 14 組瀏覽器測試已全部通過；最終提交會再由原 PR workflow 使用已提交的新鎖檔完整重跑。正式上線以該最新 verify 成功為準，執行網址更新於原 PR，不需要使用者安裝工具。

正式 Auth 的實際帳號／密碼、Vercel Production 設定及正式已發布 Rules 的組合仍須按 PRODUCTION_SOP.md 驗收；未使用正式資料庫寫入測試。沒有合併 main、修改正式 Firebase 或部署 Preview／正式網站。
