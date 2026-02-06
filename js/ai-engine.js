// ==================== CLAUDE AI ENGINE — LIFE COACH ====================
// 統一的 AI 人生導師，整合所有領域數據 + 影片知識

const aiChatHistory = { life: [] };
let aiAutoAnalyzed = { life: false };

const AI_SYSTEM_PROMPTS = {
    life: `You are Ray's personal AI Life Coach — 他最信任的人生導師。
你能看到 Ray 所有的人生數據：財富、體態、交易績效、每日習慣、點子、以及他正在學習的影片知識。

你的角色：
- 綜合分析所有領域的數據，發現問題和機會
- 引用 Ray 正在學習的影片知識，將學到的理論應用到他的實際情況
- 給出直接、具體、可執行的建議
- 用數據說話，不要空洞的心靈雞湯
- 當某個領域表現不好時，主動提醒
- 當 Ray 的影片庫裡有相關知識時，主動引用並告訴他如何應用

回答用繁體中文，混合英文術語。直接、數據驅動、可執行。Max 500 words.`
};

// Model display names
function getModelDisplayName() {
    const m = localStorage.getItem('ai_model') || 'claude-haiku-4-5-20251001';
    if (m.includes('haiku')) return 'Haiku 4.5';
    if (m.includes('sonnet-4-5')) return 'Sonnet 4.5';
    if (m.includes('sonnet-4')) return 'Sonnet 4';
    return m.split('-').slice(1,3).join(' ');
}
function updateModelBadges() {
    const name = getModelDisplayName();
    document.querySelectorAll('.ai-model-badge').forEach(b => b.textContent = name);
}

// === 影片知識上下文（混合模式）===
function buildVideoKnowledgeContext() {
    if (!videoKnowledge || videoKnowledge.length === 0) return '';

    const pending = videoKnowledge.filter(v => v.status === '待看').length;
    const inProgress = videoKnowledge.filter(v => v.status === '進行中').length;
    const completed = videoKnowledge.filter(v => v.status === '已完成').length;

    let ctx = `\n\n=== VIDEO KNOWLEDGE (YouTube Lab) ===`;
    ctx += `\n影片統計: ${pending} 部待看 / ${inProgress} 部進行中 / ${completed} 部已完成`;

    // 有摘要的影片（已完成/進行中優先），最多 15 部
    const withSummary = videoKnowledge
        .filter(v => v.summary)
        .sort((a, b) => {
            const order = { '已完成': 0, '進行中': 1, '待看': 2 };
            return (order[a.status] || 2) - (order[b.status] || 2);
        })
        .slice(0, 15);

    if (withSummary.length > 0) {
        ctx += `\n\n[有摘要的影片]`;
        withSummary.forEach((v, i) => {
            ctx += `\n${i + 1}. 「${v.title}」(${v.channel || '未知'}) [${v.category || '未分類'}]`;
            if (v.rating) ctx += ` ⭐${v.rating}`;
            ctx += ` [${v.status}]`;
            if (v.summary) ctx += `\n   摘要: ${v.summary.substring(0, 200)}`;
            if (v.keyTakeaway) ctx += `\n   一句話: ${v.keyTakeaway}`;
            if (v.notes) ctx += `\n   筆記: ${v.notes.substring(0, 150)}`;
        });
    }

    // 沒摘要的影片，只列標題，最多 10 部
    const noSummary = videoKnowledge
        .filter(v => !v.summary)
        .slice(0, 10);

    if (noSummary.length > 0) {
        ctx += `\n\n[其他影片]`;
        noSummary.forEach(v => {
            ctx += `\n- 「${v.title}」(${v.channel || ''}) [${v.category || '未分類'}] ${v.status}`;
        });
    }

    return ctx;
}

// Build full system prompt with all data
function buildSystemPrompt() {
    let prompt = AI_SYSTEM_PROMPTS.life;
    const profile = localStorage.getItem('ai_profile');
    if (profile) {
        prompt += `\n\n=== RAY'S PERSONAL PROFILE & GOALS ===\n${profile}`;
    }

    // Cross-domain overview
    prompt += `\n\n=== CROSS-DOMAIN OVERVIEW ===`;
    const lat = wealthHistory[wealthHistory.length - 1] || {};
    prompt += `\n- Wealth: ${formatNumber(lat.totalAssets || 0)} TWD (Goal: ${formatNumber(wealthGoal)} TWD, ${((lat.totalAssets || 0) / wealthGoal * 100).toFixed(0)}%)`;
    const latBody = bodyHistory[bodyHistory.length - 1] || {};
    prompt += `\n- Body: ${latBody.fatpct || '?'}% fat, ${latBody.weight || '?'}kg (Goal: ${physicGoal.target}% fat)`;
    const latAlgo = algoEquity[algoEquity.length - 1] || {};
    prompt += `\n- Trading: ${latAlgo.cumRet?.toFixed(1) || '?'}% cumulative return`;
    // Daily habits
    const today = new Date().toISOString().split('T')[0];
    const todayH = dailyHabitsData[today] || {};
    const todayDone = Object.values(todayH).filter(v => v === true).length;
    let last7done = 0, last7total = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const dh = dailyHabitsData[ds] || {};
        last7done += Object.values(dh).filter(v => v === true).length;
        last7total += 6;
    }
    prompt += `\n- Daily Habits: Today ${todayDone}/6, Last 7 days ${last7done}/${last7total} (${(last7done/last7total*100).toFixed(0)}%)`;
    // Ideas
    const ideasNew = ideasData.filter(i => i.status === '💡 新想法').length;
    const ideasActive = ideasData.filter(i => i.status === '🚀 執行中').length;
    const ideasDone = ideasData.filter(i => i.status === '✅ 已完成').length;
    prompt += `\n- Ideas: ${ideasData.length} total (${ideasNew} new, ${ideasActive} active, ${ideasDone} done)`;
    // Video knowledge
    prompt += `\n- Learning: ${videoKnowledge.length} videos in library`;

    // Video knowledge context
    prompt += buildVideoKnowledgeContext();

    prompt += `\n\n根據以上所有數據和影片知識，給出全方位的人生建議。當影片知識與問題相關時，主動引用並告訴 Ray 如何應用。`;
    return prompt;
}

function getAIContext() {
    // 整合所有領域的詳細數據
    let context = '';

    // Wealth
    const latW = wealthHistory[wealthHistory.length - 1] || {};
    const prevW = wealthHistory[wealthHistory.length - 2] || {};
    context += `=== WEALTH ===
- Total Assets: ${formatNumber(latW.totalAssets || 0)} TWD (${latW.date || 'N/A'})
- Net Worth: ${formatNumber(latW.netWorth || 0)} TWD
- Monthly Growth: ${latW.monthlyGrowth != null ? latW.monthlyGrowth.toFixed(2) + '%' : 'N/A'}
- Categories: 活期存款 ${formatNumber(latW.categories?.['活期存款'] || 0)}, 股票ETF ${formatNumber(latW.categories?.['股票ETF'] || 0)}, 加密貨幣 ${formatNumber(latW.categories?.['加密貨幣'] || 0)}, 債務 ${formatNumber(latW.categories?.['債務'] || 0)}
- Goal: ${formatNumber(wealthGoal)} TWD (Progress: ${((latW.totalAssets || 0) / wealthGoal * 100).toFixed(1)}%)
- Previous: ${formatNumber(prevW.totalAssets || 0)} TWD (${prevW.date || 'N/A'})
- Records: ${wealthHistory.length}`;

    // Body
    const sorted = bodyHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
    const latB = sorted[sorted.length - 1] || {};
    const firstB = sorted[0] || {};
    context += `\n\n=== BODY ===
- Latest (${latB.date || 'N/A'}): Weight ${latB.weight}kg, Fat ${latB.fatpct}%, Muscle ${latB.muscle}kg
- First (${firstB.date || 'N/A'}): Weight ${firstB.weight}kg, Fat ${firstB.fatpct}%, Muscle ${firstB.muscle}kg
- Goal: ${physicGoal.target}% body fat (from ${physicGoal.start}%)
- Fat change: ${latB.fatpct && firstB.fatpct ? (latB.fatpct - firstB.fatpct).toFixed(1) : '?'}%
- Muscle change: ${latB.muscle && firstB.muscle ? ((latB.muscle || 0) - (firstB.muscle || 0)).toFixed(1) : '?'}kg`;

    // Trading
    const latAlgo = algoEquity[algoEquity.length - 1] || {};
    const recent5 = algoEquity.slice(-5).map(e => `${e.date}: ${e.dailyRet > 0 ? '+' : ''}${e.dailyRet}% (cum: ${e.cumRet.toFixed(2)}%)`).join('\n');
    const monthlyStr = Object.entries(MONTHLY_RETURNS).map(([yr, m]) => {
        const months = Object.entries(m).filter(([k]) => k !== 'ytd').map(([k, v]) => `${k}月:${v > 0 ? '+' : ''}${v}%`).join(', ');
        return `${yr}: ${months} | YTD: ${m.ytd > 0 ? '+' : ''}${m.ytd}%`;
    }).join('\n');
    context += `\n\n=== TRADING ===
- Cumulative Return: ${latAlgo.cumRet?.toFixed(2) || 0}%
- Equity: ${formatNumber(latAlgo.equity || 0)} TWD
- Win Rate: ${((algoEquity.filter(e => e.dailyRet > 0).length / Math.max(1, algoEquity.length)) * 100).toFixed(1)}%
- MDD: 26.01%
- Recent 5:\n${recent5}
- Monthly:\n${monthlyStr}
- Prop Firm: Fee $38,918 / Payout $64,043 / Net $29,648 / Pass Rate 25%`;

    // Business
    const bizData = JSON.parse(localStorage.getItem(`biz_${currentBusiness}`) || '[]');
    const latBiz = bizData[bizData.length - 1] || {};
    context += `\n\n=== BUSINESS ===
- ${currentBusiness}: ${latBiz.members || 0} members, $${latBiz.revenue || 0}/mo`;

    // Daily Habits
    const today = new Date().toISOString().split('T')[0];
    const todayH = dailyHabitsData[today] || {};
    const habitNames = ['trading', 'advertise', 'deliver', 'gym', 'fatloss', 'ai'];
    const todayStatus = habitNames.map(h => `${h}: ${todayH[h] ? '✓' : '✗'}`).join(', ');
    context += `\n\n=== DAILY HABITS ===
- Today (${today}): ${todayStatus}`;

    // Ideas
    context += `\n\n=== IDEAS ===
- Total: ${ideasData.length} (New: ${ideasData.filter(i => i.status === '💡 新想法').length}, Active: ${ideasData.filter(i => i.status === '🚀 執行中').length}, Done: ${ideasData.filter(i => i.status === '✅ 已完成').length})`;

    return context;
}

async function callClaudeAPI(userMessage) {
    const apiKey = localStorage.getItem('anthropic_key');
    if (!apiKey) {
        return '⚠️ 請先到 Settings 設定 Anthropic API Key。\n\n取得方式：[console.anthropic.com](https://console.anthropic.com/settings/keys) → API Keys';
    }
    const systemPrompt = buildSystemPrompt();
    const context = getAIContext();
    const model = localStorage.getItem('ai_model') || 'claude-haiku-4-5-20251001';
    // Life Coach 需要更多 tokens
    const maxTokens = model.includes('haiku') ? 1000 : 1500;
    const history = aiChatHistory.life.slice(-6);
    let userContent = `Here is my current life data:\n\n${context}\n\n`;
    if (history.length > 0) {
        userContent += `Previous conversation:\n${history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}\n\n`;
    }
    userContent += `Current question: ${userMessage}`;
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }]
            })
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            if (response.status === 401) return '⚠️ API Key 無效，請到 Settings 重新設定。';
            if (response.status === 429) return '⚠️ 請求太頻繁，請稍後再試。';
            return '⚠️ API 錯誤 (' + response.status + '): ' + (errData.error?.message || 'Unknown error');
        }
        const data = await response.json();
        const text = data.content?.map(b => b.type === 'text' ? b.text : '').join('') || 'No response';
        return text;
    } catch (err) {
        console.error('Claude API error:', err);
        return '⚠️ 連線失敗：' + err.message;
    }
}

function renderAIResponse(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n- /g, '<br>• ')
        .replace(/\n\d+\. /g, (m) => '<br>' + m.trim() + ' ')
        .replace(/\n/g, '<br>');
}

async function askLifeAI() {
    const input = document.getElementById('life-ai-input');
    const container = document.getElementById('life-ai-suggestion');
    const question = input.value.trim();
    if (!question) return;
    if (!localStorage.getItem('anthropic_key')) {
        showToast('請先到 ⚙️ Settings 設定 Anthropic API Key', true);
        return;
    }
    input.value = '';
    const safeQ = question.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    aiChatHistory.life.push({ role: 'user', content: question });
    container.innerHTML += `<div class="ai-msg user"><div class="ai-role">You</div>${safeQ}</div>`;
    container.innerHTML += `<div class="ai-msg assistant" id="ai-loading-life"><div class="ai-role">Claude</div><span class="ai-loading">Thinking</span></div>`;
    container.scrollTop = container.scrollHeight;
    const response = await callClaudeAPI(question);
    aiChatHistory.life.push({ role: 'assistant', content: response });
    const loadingEl = document.getElementById('ai-loading-life');
    if (loadingEl) loadingEl.outerHTML = `<div class="ai-msg assistant"><div class="ai-role">Claude</div>${renderAIResponse(response)}</div>`;
    container.scrollTop = container.scrollHeight;
}

async function autoAnalyzeLife() {
    if (aiAutoAnalyzed.life) return;
    aiAutoAnalyzed.life = true;
    const container = document.getElementById('life-ai-suggestion');
    if (!container) return;

    if (!localStorage.getItem('anthropic_key')) {
        container.innerHTML = getLifeFallback();
        return;
    }

    container.innerHTML = `<span class="ai-loading">Claude 正在分析你的全方位數據</span>`;
    const response = await callClaudeAPI('請綜合分析我目前人生各領域的進展（財富、體態、交易、習慣、想法），找出最需要改進的地方，給我 3 個具體的行動建議。也請參考我的影片學習庫，告訴我哪些影片的知識可以立即應用到我的生活中。用繁體中文回答。');
    aiChatHistory.life.push({ role: 'assistant', content: response });
    container.innerHTML = `<div class="ai-msg assistant">${renderAIResponse(response)}</div>`;
}

function getLifeFallback() {
    const latW = wealthHistory[wealthHistory.length - 1] || {};
    const pctW = ((latW.totalAssets || 0) / wealthGoal * 100).toFixed(1);
    const sortedB = bodyHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
    const latB = sortedB[sortedB.length - 1] || {};
    const latAlgo = algoEquity[algoEquity.length - 1] || {};
    return `<strong>🧠 Life Overview</strong><br><br>
        💰 財富: ${formatNumber(latW.totalAssets || 0)} TWD (目標 ${pctW}%)<br>
        🏋️ 體脂: ${latB.fatpct || '--'}% / 體重: ${latB.weight || '--'}kg<br>
        📈 交易: ${latAlgo.cumRet?.toFixed(2) || 0}% 累積報酬<br>
        📚 學習: ${videoKnowledge.length} 部影片<br>
        💡 想法: ${ideasData.length} 個<br><br>
        <span style="color:var(--text-muted);font-size:11px;">💡 設定 Anthropic API Key 可獲得 Claude AI 全方位人生教練建議</span>`;
}

function updateLifeOverview() {
    const el = document.getElementById('life-overview');
    if (!el) return;
    const latW = wealthHistory[wealthHistory.length - 1] || {};
    const pctW = ((latW.totalAssets || 0) / wealthGoal * 100).toFixed(0);
    const sortedB = bodyHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
    const latB = sortedB[sortedB.length - 1] || {};
    const latAlgo = algoEquity[algoEquity.length - 1] || {};
    const today = new Date().toISOString().split('T')[0];
    const todayH = dailyHabitsData[today] || {};
    const todayDone = Object.values(todayH).filter(v => v === true).length;
    el.innerHTML = `
        <div class="stat-box" onclick="go('wealth')"><div class="stat-value">${pctW}%</div><div class="stat-label">Wealth Goal</div></div>
        <div class="stat-box" onclick="go('physic')"><div class="stat-value">${latB.fatpct || '--'}%</div><div class="stat-label">Body Fat</div></div>
        <div class="stat-box" onclick="go('trading')"><div class="stat-value">${latAlgo.cumRet?.toFixed(1) || '0'}%</div><div class="stat-label">Trading</div></div>
        <div class="stat-box" onclick="go('daily')"><div class="stat-value">${todayDone}/6</div><div class="stat-label">Habits</div></div>
        <div class="stat-box" onclick="go('ideas')"><div class="stat-value">${ideasData.length}</div><div class="stat-label">Ideas</div></div>
        <div class="stat-box" onclick="go('information')"><div class="stat-value">${videoKnowledge.length}</div><div class="stat-label">Learning</div></div>
    `;
}

// Expense analyzer (standalone, kept for wealth page)
async function analyzeExpenses() {
    const csvText = document.getElementById('expense-paste').value.trim();
    if (!csvText) { showToast('Please paste CSV data first', true); return; }
    const apiKey = localStorage.getItem('anthropic_key');
    if (!apiKey) { showToast('Please set API key in Settings first', true); return; }
    const resultEl = document.getElementById('expense-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<div style="text-align:center;padding:20px;">Analyzing expenses...</div>';
    try {
        const model = localStorage.getItem('ai_model') || 'claude-haiku-4-5-20251001';
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                system: 'You are an expense analyzer. Analyze the CSV data. Respond in Traditional Chinese mixed with English. Output: 1) Category breakdown table (category, count, total) 2) Top 3 spending categories 3) One actionable saving tip. Use simple HTML formatting with inline styles matching dark theme (color:#e0e0e0). Keep it concise.',
                messages: [{ role: 'user', content: 'Analyze these expenses:\n' + csvText }]
            })
        });
        if (!response.ok) throw new Error('API error: ' + response.status);
        const data = await response.json();
        const text = data.content?.[0]?.text || 'No response';
        resultEl.innerHTML = '<div class="form-section" style="margin-top:12px;">' + text + '</div>';
    } catch(e) {
        resultEl.innerHTML = '<div style="color:var(--danger);padding:12px;">Analysis failed: ' + e.message + '</div>';
    }
}
