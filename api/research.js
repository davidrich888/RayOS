module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { topic, anthropic_key, youtube_api_key } = req.body;
    if (!topic || !anthropic_key) {
        return res.status(400).json({ error: 'Missing topic or anthropic_key' });
    }

    try {
        // Step 1: YouTube Data API search for competitor videos
        let competitorVideos = 'YouTube search skipped (no API key)';
        if (youtube_api_key) {
            try {
                const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(topic)}&type=video&maxResults=10&order=viewCount&key=${youtube_api_key}`;
                const searchRes = await fetch(searchUrl);
                const searchData = await searchRes.json();
                const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean).join(',');

                if (videoIds) {
                    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${youtube_api_key}`;
                    const statsRes = await fetch(statsUrl);
                    const statsData = await statsRes.json();
                    competitorVideos = (statsData.items || []).map(v => {
                        const s = v.snippet;
                        const st = v.statistics;
                        return `- 「${s.title}」by ${s.channelTitle} — ${parseInt(st.viewCount).toLocaleString()} views, ${parseInt(st.likeCount || 0).toLocaleString()} likes (${s.publishedAt.slice(0, 10)})`;
                    }).join('\n');
                }
            } catch (e) {
                competitorVideos = 'YouTube search failed: ' + e.message;
            }
        }

        // Step 2: Call Claude API with 100x content system prompt
        const today = new Date().toISOString().slice(0, 10);
        const systemPrompt = SYSTEM_PROMPT;
        const userPrompt = `請為「${topic}」這個主題產出 Research Brief。

## YouTube 競品影片搜尋結果
${competitorVideos}

## 請產出以下格式的 Research Brief

# Research Brief: ${topic}
> 日期：${today} | 支柱：[判斷歸屬哪個支柱] | 研究員：Claude

---

## TL;DR（一句話結論）
[要不要拍？為什麼？]

## 拍片決策矩陣
| 維度 | 評分 | 說明 |
|------|------|------|
| 受眾需求 | ⭐⭐⭐⭐☆ | [有多少人在問這個問題] |
| 競品飽和度 | ⭐⭐☆☆☆ | [越低越好 = 機會越大] |
| Ray 差異化 | ⭐⭐⭐⭐⭐ | [Ray 做這個的獨特優勢] |
| 時效性 | ⭐⭐⭐☆☆ | [時間窗口] |
| 預估觀看潛力 | ⭐⭐⭐⭐☆ | [參考同主題競品表現] |
| **總分** | **X/25** | [建議：🟢 立即拍 / 🟡 可以拍 / 🔴 暫緩] |

---

## 競品影片分析
### 表現最好的同主題影片（Top 5）
[從上面的 YouTube 搜尋結果分析，列出表格]

### 競品標題模式（可借鏡）
[分析標題共同點]

### 競品沒做到的（= Ray 的機會）
[空白點]

---

## 建議切入角度（3 個，按推薦排序）

### 角度 A：[名稱]（🟢 最推薦）
- **Hook 方向**：[一句話]
- **為什麼這個角度**：[理由]
- **參考 Hook 類型**：[從成功模式中選]
- **預估影片長度**：X-Y 分鐘
- **需要準備的素材**：[螢幕錄製 / 截圖 / 數據]

### 角度 B：[名稱]
...

### 角度 C：[名稱]
...

---

## 風險與注意事項
- [最大風險]
- [需要避免的坑]

---

## 下一步
- [ ] 確認要拍 → 執行標題生成
- [ ] 不拍 → 記錄原因，留給未來參考`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropic_key,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });

        const claudeData = await claudeRes.json();

        if (claudeData.error) {
            return res.status(500).json({ success: false, error: claudeData.error.message });
        }

        const output = claudeData.content?.[0]?.text || '';
        return res.status(200).json({ success: true, output });

    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};

// 100x Content System — embedded system prompt
const SYSTEM_PROMPT = `You are Ray Wang's content research assistant for FUNDwithRay YouTube channel.
Output ONLY in Traditional Chinese (繁體中文). Use markdown format.

## Ray's Profile
- YouTube: FUNDwithRay (~5,100 subscribers, 459 videos, 513K total views)
- FTMO payout record: 180萬 TWD
- Free community: 炒股黑客 (Skool, 5,363 members)
- Paid community: TFT (Skool, 113 members)
- IG: @fundwithray (11,894 followers)
- Trading: YM E-mini Dow (Prop Firm), 台指期 (algo/Multicharts)

## 5 Content Pillars
1. **Prop Firm 實戰** — 通關策略、出金紀錄、失敗分析、Prop Firm 比較
2. **程式交易 / EA 開發** — MT5/MQL5、回測、AI 輔助 EA
3. **交易心態** — 耐損、風控紀律、情緒管理、贏家思維
4. **AI 自動化交易** — Claude + MQL5、N8N 自動化、AI 看盤
5. **個人成長** — 財務自由路線、一人公司、紅藥丸觀點

## Ray's Voice Style
- Walk the talk: results first, then explain how
- Short sentences (12 chars max), line breaks for rhythm
- Specific numbers ("180萬" not "很多", "23%" not "不少")
- Honest about failures, show real screenshots
- Openers: "說真的" "老實說" "你知道嗎"
- NEVER use ChatGPT-style: "首先" "此外" "總的來說" "值得注意的是"
- Story structure: "[時間]前[做了什麼] → [失敗] → [發現轉折] → [改用方法] → [成功數字]"

## What Works (proven high-performance patterns)
1. **脆弱揭露型** — highest views + comments (YT 16K views + IG 13.6K plays)
   - Show real P&L curve, honest about losses → reversal story
2. **反直覺型** — highest engagement 3.5-4% (YT)
   - "根本沒用" "完全錯了" type titles
3. **心態韌性型** — IG Reel main theme, stable high engagement 2.29%
   - "我本來不適合交易，靠[一個關鍵]做到[具體成果]"
4. **結果數字型** — highest views (16K), medium engagement
   - "我用一招交易賺200萬" pattern
5. **長程教育型** — 40-60 min, engagement 3%+, loyal audience

## Top YT Videos (benchmarks)
- 「我用一招交易賺200萬」16K views, 2.49% engagement
- 「如果不想再繼續賠錢」13K views, 2.75%
- 「Prop Firm是不是詐騙？」10K views (SEO)
- 「為什麼越努力越失敗？」9.5K views, 3.43% (反直覺 best)
- 「我爆倉了...」9.1K views, 2.32% (脆弱揭露)

## Key Competitors
- **JadeCap Kyle Ng** (198K subs): $4.5M Prop Firm payout world record, Daily Sweep brand. Ray's benchmark.
- **Anson Tan Balaena Quant** (128K): MY, algo/quant + AI, but NO Prop Firm angle → gap for Ray
- **Lester 路肖南** (60K): HK, institutional background → different narrative than Ray
- **交易雜貨店-維均** (5.6K): TW, Topstep specialist → most direct competitor
- **交易倫 AT** (24.8K): MY, ICT/SMC, crypto focus

## Ray's Unique Advantages (use in differentiation analysis)
- Real FTMO payout proof (180萬 TWD, 18-19 payouts)
- Algo trading + manual trading dual skill
- AI automation (Claude + N8N) background
- Honest "散戶出身" narrative (not institutional)
- TFT student success stories as social proof

## CTA Rules
- Public content (YT/IG) → 炒股黑客 (free Skool)
- Private content (Skool/Email) → TFT (paid)
- NEVER promote TFT in public content`;
