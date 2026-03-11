# RayOS

## 這是什麼
Ray 的個人生活數據儀表板，整合每日習慣追蹤、體態數據、資產管理、交易績效、事業指標和靈感管理。前端為單一 HTML 檔案，透過 n8n webhook 與 Notion 資料庫雙向同步。

## 技術堆疊
- **Frontend**: `rayos-v4.html`（單一 HTML/JS/CSS 檔案）
- **Backend**: n8n webhook 做為中間層，根據 `type` 欄位路由到不同 Notion 操作
- **Database**: Notion databases
- **部署**: GitHub → Vercel 自動部署
- **Repo**: github.com/davidrich888/RayOS

## Notion Databases

### Daily Habits
- **Database ID**: `58da82d6-89ed-4202-9274-234183f77bb6`
- **Data Source (Collection)**: `9741700d-6168-42d3-92da-4d6868b29bcd`
- **Fields**（全部是 checkbox）:
  - `Trading` → frontend key: `trading`
  - `Advertise` → frontend key: `advertise`
  - `Deliver` → frontend key: `deliver` ⚠️ Notion 欄位名是 "Deliver"（不是 "Deliever"）
  - `FatLoss` → frontend key: `fatloss` ⚠️ Notion 欄位名是 "FatLoss"（不是 "Fat Loss"）
  - `Gym` → frontend key: `gym`
  - `AI` → frontend key: `ai`
  - `NoFap` → frontend key: `nofap`
- **三態機制**: 前端支援 null/true/false 三態，Notion checkbox 只有 true/false（null 寫入為 false）
- **Title field**: `Name`（格式為日期字串，如 "2026-02-12"）

### Physic Tracker
- **Database ID**: `f481a3da00de4d9391d293a88cf1c9c1`
- **Data Source (Collection)**: `6b8fea6a-9249-4a7b-a36e-5cd7f6ceb61f`
- **Fields**: Date, Weight, Muscle, Fat%, BMI(formula), Notes

### YouTube 研究庫
- **Database ID**: `76fb8600-ae96-49bc-b6c4-75f75f0ec818`
- **Data Source (Collection)**: `39cec6aa-a921-4ce9-bbf6-26c80aacc197`
- **位置**: 📊 RayOS Data 底下
- **前端**: `Youtube_Lab/index.html`（YouTube Lab tab）
- **Webhooks**: `youtube-videos`（拉取）、`update-video`（更新）、`delete-video`（刪除）
- **Fields**: 影片標題(title), 頻道, 影片長度, 分類(multi_select), 狀態(select), 優先度(select), 縮圖網址(url), 網址(url), AI 摘要, 一句話學到, 精華片段, 我的評分(number), 我的筆記, 收藏縮圖(checkbox)
- **Telegram Bot**: @YT_video_DB_bot — 混合用途，YouTube 連結走 YouTube 流程，其他連結走 Resource Library 流程

### Resource Library
- **Database ID**: `397a6457-079c-419e-ba44-df992b6ba1d4`
- **Data Source (Collection)**: `f5c590e7-9670-4f23-98ab-743bcd808d62`
- **位置**: 📊 RayOS Data 底下
- **前端**: `Youtube_Lab/index.html`（Resource Library tab）
- **Webhook**: `resource-library`（type 路由：fetch_resources / add_resource / delete_resource）
- **n8n Workflow ID**: `vM3L8XI0sbu3uRZL`
- **Fields**: 標題(title), URL(url), 來源類型(select: X/Instagram/Article/YouTube/Note/Other), 原始內容(rich_text), AI 摘要(rich_text), 一句話重點(rich_text), 分類標籤(multi_select), 來源(select: manual/telegram)
- **AI 處理**: n8n 呼叫 Claude 做分類+摘要，前端不直接呼叫 AI
- **URL 自動抓取**:
  - X/Twitter URL → n8n 透過 oEmbed API (`publish.twitter.com/oembed`) 自動抓取推文內容，前端不需手動貼
  - Instagram URL → n8n 透過 Apify (`apify/instagram-scraper`) 自動抓取貼文 caption、按讚數、留言數，前端不需手動貼
  - 其他 URL → 用戶需提供內容，走原有流程
- **Apify 設定**: API Token 存在 n8n workflow HTTP Request 節點中，每月 $5 免費額度
- **n8n add_resource 流程**: Webhook → 路由 → 判斷URL類型(Switch) → [X: oEmbed抓取 / IG: Apify抓取 / 其他: 直接] → 準備AI分類 → Claude API → 解析 → 存入Notion → 回傳

### Moodboard
- 使用 Google Drive（不是 Notion）
- Ray 在 Drive 建立 "RayOS Moodboard" 資料夾，內有分類子資料夾
- 透過 Google Apps Script 部署，URL 貼到 Settings 自動同步

## n8n Webhook System

前端透過統一的 webhook URL 發送 POST 請求，n8n 根據 `type` 欄位路由：

```json
{
  "type": "update_daily_habit",   // 更新單一習慣 checkbox
  "type": "create_daily_entry",   // 建立新日期的 row
  "type": "fetch_daily_habits",   // 從 Notion 拉取所有習慣數據
  "type": "wealth",               // 儲存資產快照
  "type": "body",                 // 儲存體態數據
  "database_id": "...",
  "data": { ... },
  "ts": "ISO timestamp"
}
```

## Critical Rules

1. **前端不應自動建立 Notion 日期 row** — 避免重複條目。日期建立由 n8n 每週批次處理（週日 23:59 建立下週 7 天），或使用者手動觸發。
2. **Field name mapping 必須精確** — Notion 欄位名和前端 key 不完全一致（見上方對照表）。
3. **Sync 邏輯應完整替換而非合併** — 從 Notion 拉取資料時，完全覆寫 localStorage 中對應日期的數據。
4. **Character encoding** — HTML 使用 `charset="UTF-8"` 和 `lang="zh-TW"`。
5. **Daily History 只顯示有資料的日期** — 不要為未來或不存在的日期生成空 row。

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Notion 出現重複日期 | 前端 auto-create + n8n 也 create | 移除前端 auto-create |
| Habit checkbox 不同步 | Field name mismatch (Deliever vs Deliver) | 使用正確的 Notion 欄位名 |
| 中文亂碼 | encoding 問題 | 確保 UTF-8，byte-level 檢查 |
| Sync 後舊資料殘留 | merge 邏輯沒有清除舊值 | 用完整替換而非合併 |
| 未來日期顯示空 row | History table 固定生成 60 天 | 只顯示 dailyHabitsData 中存在的日期 |
| X URL 分析出登入頁面 | 前端 fetch 社群 URL 拿到登入頁 HTML | 走 n8n server-side oEmbed 抓取 |
| IG Apify 抓取失敗 | 私人帳號或 Apify 額度用完 | fallback 到用戶手動貼內容 |
| IG Apify 超時 | Apify scraper 執行時間較長 | timeout 設 60 秒，超時走 fallback |

## 工作規則
1. 先讀懂相關檔案，再動手改東西
2. 任何改動前先跟我確認計畫
3. 改動越小越好，一次只改一件事
4. 推到 GitHub 前確認不會影響現有功能
5. 維護這份 CLAUDE.md，有新的重要資訊就更新

## 部署流程
程式碼推到 GitHub → Vercel 自動部署，不需要手動操作

## 檔案結構
- index.html — 主頁面（單一 HTML 檔）
- style.css — 樣式
- js/ — JavaScript 模組（ai-engine, business, charts, daily, trading, wealth...）
- api/ — API 路由（notion.js）
- icons/ — PWA 圖示
- workflows/ — n8n workflow JSON（RayOS 正式 workflow）
- Youtube_Lab/ — YouTube 研究庫前端
- archive/ — 舊版備份和棄用檔案
  - (alfred-ai/ 已刪除 2026-03-08)
  - html-backups/ — 舊版 HTML 備份
  - workflows/ — 舊版 n8n workflow
  - miro/ — Miro 心智圖相關（屬 FundwithRay 02 專案）
  - scripts/ — 舊版工具腳本
- sw.js — Service Worker（PWA）
- manifest.json / package.json / vercel.json — 設定檔

## 常用指令
```bash
cd ~/Projects/RayOS
git add . && git commit -m "描述" && git push
```

## Style & Design
- 深色主題，accent color: `#d4c5a9`（溫暖金色）
- 字體：Cormorant Garamond（標題）+ Inter（內文）+ Noto Sans TC（中文）
- 極簡風格，卡片式佈局
- Mobile responsive（sidebar 可收合）
