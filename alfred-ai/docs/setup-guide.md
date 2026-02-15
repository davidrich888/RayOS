# Alfred AI 設定指南

## 前置準備

### 1. Apify 帳號設定

1. 到 [apify.com](https://www.apify.com/) 註冊帳號（有免費額度 $5/月）
2. 登入後到 Settings → Integrations → API Tokens
3. 建立一個新的 API Token，複製下來
4. 到 Apify Store 確認以下 actor 可用：
   - `apidojo/tweet-scraper`（X/Twitter 抓取）
   - `apify/instagram-scraper`（Instagram 抓取）
   - `bernardo/youtube-scraper`（YouTube 抓取）
5. 每個 actor 頁面點 "Try for free" 先試跑一次，確認可以正常運作

### 2. Telegram Bot

如果你已經有 `@YT_video_DB_bot`，可以沿用同一個 bot token。
如果沒有，到 Telegram 找 @BotFather 建立新的 bot。

### 3. Claude API

到 [console.anthropic.com](https://console.anthropic.com/) 取得 API Key。

### 4. Notion

到 [notion.so/my-integrations](https://www.notion.so/my-integrations) 建立 Internal Integration，取得 API Token。
確保以下 Notion databases 有分享給這個 integration：
- Ideas DB（ID: `ed035c908cc04b7b999ef0c023557add`）
- YouTube 追蹤 DB（ID: `b57a9c1760784b93b003f221262ff635`）

---

## N8N Credential 設定

在 n8n 中建立以下 4 個 Credentials：

### Credential 1: Alfred Bot（Telegram）
- **類型**: Telegram API
- **Bot Token**: 你的 Telegram bot token
- **名稱**: `Alfred Bot`

### Credential 2: Anthropic API Key（HTTP Header Auth）
- **類型**: Header Auth
- **Header Name**: `x-api-key`（不需要填，workflow 自己處理）
- **Header Value**: 你的 Anthropic API Key
- **名稱**: `Anthropic API Key`

### Credential 3: Alfred Notion（Notion API）
- **類型**: Notion API
- **API Key**: 你的 Notion Internal Integration Token
- **名稱**: `Alfred Notion`

### Credential 4: Apify API Token（HTTP Header Auth）
- **類型**: Header Auth
- **Header Name**: `Authorization`（不需要填，workflow 自己處理）
- **Header Value**: 你的 Apify API Token
- **名稱**: `Apify API Token`

---

## 匯入 Workflow

### Workflow 1: 點子收集 v3
1. 打開 n8n → Workflows → Import from File
2. 選擇 `workflows/n8n-telegram-idea-bot-v3.json`
3. 匯入後，每個節點會顯示紅色警告（credential 未連結）
4. 逐一點開有紅色警告的節點，選擇對應的 credential：
   - Telegram 相關節點 → 選 `Alfred Bot`
   - Claude Analyze → 選 `Anthropic API Key`
   - Save to Notion Ideas → 選 `Alfred Notion`
   - Save to YouTube DB → 選 `Alfred Notion`（Code 節點需要手動設定）
5. 點 "Save" 然後 "Activate"

### Workflow 2: 每日情報 v5
1. 同上步驟匯入 `workflows/n8n-telegram-daily-digest-v5.json`
2. 連結 credentials：
   - Fetch All Sources via Apify → 選 `Apify API Token` + `Alfred Notion`
   - Claude Curate Digest → 選 `Anthropic API Key`
   - Send Daily Digest → 選 `Alfred Bot`
   - Send Error Notification → 選 `Alfred Bot`
3. 點 "Save" 然後 "Activate"

---

## 自訂設定

### 修改追蹤帳號
在 `Fetch All Sources via Apify` 節點的 Code 中，修改頂部的設定區：

```javascript
// X/Twitter 帳號
const xAccounts = ['@AnthropicAI', '@OpenAI', ...];

// Instagram 帳號
const igAccounts = ['openai', 'anthropicai', ...];

// YouTube 固定頻道
const ytFixedChannels = [{ name: '...', url: '...' }];
```

同時更新 `configs/` 資料夾的對應檔案作為文件紀錄。

### 修改 Apify Actor
如果你找到更好的 Apify actor，修改 Code 節點頂部的 actor ID：

```javascript
const TWITTER_ACTOR = 'apidojo/tweet-scraper';
const IG_ACTOR = 'apify/instagram-scraper';
const YT_ACTOR = 'bernardo/youtube-scraper';
```

### 修改 Claude Prompt
Prompt 模板在 `prompts/` 資料夾供參考。
實際使用的 prompt 在 workflow 的 HTTP Request 節點中。
如需修改，直接在 n8n 編輯 `Claude Curate Digest` 節點的 JSON body。

### 修改排程時間
編輯 `Every Day 8AM` / `Every Day 8PM` 節點的 cron expression。

---

## 疑難排解

| 問題 | 解決方式 |
|------|----------|
| Apify 抓取超時 | 檢查 Apify 帳號額度，或增加 Code 節點中的 TIMEOUT 值 |
| Telegram 送出失敗 | 確認 bot token 正確，檢查 chat_id 是否正確 |
| Claude API 錯誤 | 確認 API key 有效，檢查帳號額度 |
| Notion 存入失敗 | 確認 integration 有權限存取目標 database |
| 全部來源都失敗 | 檢查 n8n 能否連上外網，或 Apify 是否維護中 |
