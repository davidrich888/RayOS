# Alfred AI Workflows

## Workflow 清單

### 1. n8n-telegram-idea-bot-v3.json
- **名稱**: Ray AI 管家 — 點子收集 v3.0
- **功能**: Telegram 接收訊息 → Claude 分析（點子/YouTube追蹤/聊天）→ 存入 Notion
- **觸發**: Telegram Trigger（即時）
- **需要的 Credentials**:
  - `Alfred Bot`（Telegram Bot API）
  - `Anthropic API Key`（HTTP Header Auth）
  - `Alfred Notion`（Notion API）

### 2. n8n-telegram-daily-digest-v5.json
- **名稱**: Ray AI 管家 — 每日資訊整理 v5.0
- **功能**: 定時抓取 X/IG/YouTube → Claude 摘要 → 發送 Telegram 每日情報
- **觸發**: Schedule（每天 8AM + 8PM，台北時間）
- **需要的 Credentials**:
  - `Alfred Bot`（Telegram Bot API）
  - `Anthropic API Key`（HTTP Header Auth）
  - `Alfred Notion`（Notion API）
  - `Apify API Token`（HTTP Header Auth）

## 匯入步驟

1. 開啟 n8n
2. 點 "Import from File"
3. 選擇 workflow JSON
4. 設定所有 Credentials（見 docs/setup-guide.md）
5. 啟用 workflow

## Archive

`archive/` 資料夾包含舊版 workflow 備份，請勿匯入。
