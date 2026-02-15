# Alfred AI

## 這是什麼
Ray 的個人 AI 管家系統，由兩個 N8N workflow 組成，透過 Telegram Bot 運作。

## 架構
- **Workflow 1**: 點子收集 v3（`workflows/n8n-telegram-idea-bot-v3.json`）
- **Workflow 2**: 每日情報 v5（`workflows/n8n-telegram-daily-digest-v5.json`）
- **外部服務**: Telegram Bot API、Claude API、Notion API、Apify API

## Notion Databases
- **Ideas DB**: `ed035c908cc04b7b999ef0c023557add`
- **YouTube 追蹤 DB**: `b57a9c1760784b93b003f221262ff635`

## Apify Actors
- Twitter/X: `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest`（搜尋推文用）
- Instagram: `apify/instagram-scraper`
- YouTube: 改用免費 Atom RSS feed（不用 Apify）

## 檔案結構
- `workflows/` — N8N workflow JSON，匯入 n8n 使用
- `workflows/archive/` — 舊版備份
- `configs/` — 帳號清單和 Apify 設定（文件用途，實際設定在 workflow Code 節點中）
- `prompts/` — Claude API prompt 模板（文件用途，實際 prompt 在 workflow 中）
- `docs/` — 使用說明和修改紀錄

## 安全規則
- 所有 API Token 必須存在 n8n credential 中，絕對不能硬寫在 JSON 裡
- Telegram Bot Token、Notion Token、Apify Token、Claude API Key 都是敏感資訊
- 修改 workflow 時不要把 token 值寫進 Code 節點

## 工作規則
- 修改 workflow JSON 後，更新 `docs/CHANGELOG.md`
- 帳號清單如有變動，同步更新 `configs/` 對應檔案
- Prompt 如有變動，同步更新 `prompts/` 對應檔案
- Telegram 訊息格式：Idea Bot 用純文字（不用 parse_mode），Daily Digest 用 HTML

## 常見問題
| Issue | Fix |
|-------|-----|
| Telegram 送出失敗 | 確認沒用 Markdown 特殊字元，或改用 HTML |
| Apify 超時 | 增加 TIMEOUT 值，或減少抓取數量 |
| Notion credential 找不到 | 確認 Code 節點有掛 notionApi credential |
| configs/ 改了沒生效 | configs/ 是文件，需要同步改 workflow Code 節點 |
