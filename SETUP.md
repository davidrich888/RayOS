# RayOS × n8n 自動化設定指南

## 架構

```
RayOS (瀏覽器) ←→ n8n Webhook ←→ Notion API
```

- **打開 RayOS** → 自動從 Notion 拉最新資料
- **勾選 Habit** → 即時寫回 Notion
- **新的一天** → 自動在 Notion 建立條目

---

## Step 1: Notion Integration Token

1. 打開 https://www.notion.so/my-integrations
2. 點 **+ New integration**
3. 命名為 `RayOS Sync`
4. 權限選 **Read content** + **Update content** + **Insert content**
5. 複製 **Internal Integration Token** (`ntn_xxxxx`)
6. 回到你的 Daily Habits 資料庫頁面，點右上角 **⋯** → **Connections** → 加入 `RayOS Sync`

---

## Step 2: 匯入 n8n Workflow

1. 打開 n8n → **Workflows** → **Import from File**
2. 選擇 `n8n-rayos-workflow.json`
3. 匯入後你會看到這個流程：

```
Webhook → Route (Switch)
  ├── fetch_habits → Query All Habits → Transform → Respond
  ├── update_habit → Prepare Update → Update Page → Respond  
  ├── create_day → Prepare Create → Create Page → Respond
  └── default → Respond Health
```

---

## Step 3: 設定 Credential

1. 在 n8n 左側選 **Credentials**
2. **+ Add Credential** → 搜尋 **Header Auth**
3. 設定：
   - **Name**: `Notion API`
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer ntn_你的TOKEN`
4. 存檔

5. 回到 workflow，點每個 **HTTP Request** 節點（共 4 個）：
   - `Query All Habits`
   - `Update Page`
   - `Create Page`
6. 在每個節點的 **Authentication** 區域選擇剛建立的 `Notion API` credential

---

## Step 4: 啟用 Workflow

1. 點右上角 **Activate** 開關（切成綠色）
2. 記下 **Production Webhook URL**：
   - 點 `Webhook` 節點 → 看到 `Production URL`
   - 格式：`https://你的n8n.com/webhook/rayos-sync`

---

## Step 5: 設定 RayOS

1. 打開 RayOS → 點右上角 **⚙️ Settings**
2. 在 **n8n Webhook URL** 填入你的 Production URL
3. 點 **🔍 Test Connection** 確認連線成功
4. 點 **Save**

完成！現在每次打開 RayOS 都會自動同步。

---

## 工作原理

### RayOS 發送的請求格式

**拉取所有 Habits：**
```json
{ "type": "fetch_habits" }
```

**更新一個 Checkbox：**
```json
{ 
  "type": "update_habit", 
  "pageId": "notion-page-id", 
  "field": "Trading", 
  "value": true 
}
```

**建立新的一天：**
```json
{ 
  "type": "create_day", 
  "date": "2026-02-06",
  "habits": { "Trading": false, "Advertise": false, ... }
}
```

### Notion 資料庫結構

| 欄位 | 類型 | 說明 |
|------|------|------|
| Date | Title | 日期 (YYYY-MM-DD) |
| Trading | Checkbox | ✅ |
| Advertise | Checkbox | ✅ |
| Deliver | Checkbox | ✅ |
| Gym | Checkbox | ✅ |
| FatLoss | Checkbox | ✅ |
| AI | Checkbox | ✅ |
| Total | Number | 完成數量 |

Database ID: `58da82d689ed42029274234183f77bb6`

---

## 未來擴展

這個 n8n workflow 設計為 **RayOS 的統一 API Hub**。要加新功能：

1. 在 Switch 節點加新的 route（例如 `sync_wealth`、`sync_body`）
2. 加對應的 Notion API 節點
3. RayOS 用同一個 webhook URL 發送不同 type

例如未來要同步財富數據：
```json
{ "type": "sync_wealth", "data": { "date": "2026-02-01", "totalAssets": 4113482 } }
```

---

## Troubleshooting

| 問題 | 解決 |
|------|------|
| Test Connection 失敗 | 確認 workflow 已 **Activate**（綠色）|
| CORS 錯誤 | 確認 Webhook 節點 Options 裡有設定 Allowed Origins |
| Notion 401 | 確認 Integration Token 正確，且已連接到資料庫 |
| 資料沒更新 | 檢查 n8n Execution Log 看錯誤訊息 |
