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
- **Title field**: `Name`（格式為日期字串，如 "2026-02-12"）

### Physic Tracker
- **Database ID**: `f481a3da00de4d9391d293a88cf1c9c1`
- **Data Source (Collection)**: `6b8fea6a-9249-4a7b-a36e-5cd7f6ceb61f`
- **Fields**: Date, Weight, Muscle, Fat%, BMI(formula), Notes

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

## 工作規則
1. 先讀懂相關檔案，再動手改東西
2. 任何改動前先跟我確認計畫
3. 改動越小越好，一次只改一件事
4. 推到 GitHub 前確認不會影響現有功能
5. 維護這份 CLAUDE.md，有新的重要資訊就更新

## 部署流程
程式碼推到 GitHub → Vercel 自動部署，不需要手動操作

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
