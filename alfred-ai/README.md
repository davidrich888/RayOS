# Alfred AI — Ray 的個人 AI 管家

透過 Telegram Bot 提供兩個核心功能：

1. **點子收集**（Idea Bot）— 用 Claude AI 分析你的想法，分類後存入 Notion
2. **每日情報**（Daily Digest）— 每天 8AM/8PM 自動抓取 X、IG、YouTube 資訊，用 Claude 整理成摘要

## 架構

```
Telegram Bot (@YT_video_DB_bot)
    ↕
N8N Workflows (2 個)
    ↕
├── Claude API（分析 / 摘要）
├── Notion API（存入點子 / 讀取 YouTube 訂閱）
└── Apify API（抓取 X / IG / YouTube）
```

## 資料夾結構

```
alfred-ai/
├── workflows/          ← N8N workflow JSON（匯入用）
│   ├── archive/        ← 舊版備份
│   └── README.md
├── prompts/            ← Claude API prompt 模板（參考用）
├── configs/            ← 帳號清單和 Apify 設定（參考用）
├── docs/               ← 使用說明和修改紀錄
│   ├── CHANGELOG.md
│   └── setup-guide.md
├── CLAUDE.md           ← Claude Code 專案設定
└── README.md           ← 這個檔案
```

## 快速開始

詳見 `docs/setup-guide.md`

## 版本

- Idea Bot: v3.0
- Daily Digest: v5.0
