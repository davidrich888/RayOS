# Alfred AI 修改紀錄

## v3.0 — 點子收集（2026-02-16）

### 安全修復
- 移除所有硬寫的 Telegram Bot Token，改用 n8n Telegram 節點 + credential
- 移除硬寫的 Notion Token，改用 `this.helpers.getCredentials('notionApi')`
- 所有 Telegram 發訊息改用 `n8n-nodes-base.telegram` 節點

### 技術修復
- `fetch` API 全部替換為 `this.helpers.httpRequest`（n8n 內建，相容性更好）
- 新增 `Has Valid Idea?` IF 節點，處理 Retrieve State 找不到暫存點子的情況
- 新增 `Remove Buttons (Error)` + `Send Error Reply` 節點，錯誤時通知使用者
- Claude prompt 加入「不要使用 Markdown 特殊字元」規則，避免 Telegram 送出失敗
- Telegram 送出不使用 parse_mode，避免特殊字元導致失敗

### 架構改動
- HTTP Request (Telegram) → n8n Telegram 節點（sendMessage 類）
- HTTP Request (Telegram editMessageReplyMarkup / answerCallbackQuery) → Code 節點 + credential（n8n 沒有內建這些操作）

## v5.0 — 每日資訊整理（2026-02-16）

### 重大變更
- 完全移除 RSS 和 YouTube RSS 抓取方式
- 新增 Apify 統一抓取：X/Twitter、Instagram、YouTube
- 三個平台的 Apify actor 同時執行（Promise.allSettled）
- Claude 一次看完所有來源，統一整理成一則情報

### 安全修復
- 移除硬寫的 Notion Token
- Apify API Token 透過 n8n HTTP Header Auth credential 管理
- Telegram 改用 n8n 內建節點 + credential

### 技術修復
- `fetch` 替換為 `this.helpers.httpRequest`
- Telegram 改用 HTML parse_mode（比 Markdown 更穩定）
- Claude prompt 明確要求輸出 HTML 格式
- 新增抓取統計（X/IG/YT 各抓了幾則）
- 新增 Error Notification 節點（出錯時通知）
- Claude 模型升級為 claude-sonnet-4-5-20250929

### 架構變更
- 資訊來源從 RSS + YouTube Atom → Apify（X + IG + YouTube）
- 從 Notion 動態載入 YouTube 訂閱頻道（保留原有功能）
- 帳號清單定義在 Code 節點頂部，對應 configs/ 資料夾的設定
