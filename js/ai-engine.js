// ==================== CLAUDE AI ENGINE ====================

const aiChatHistory = { wealth: [], trading: [], business: [], physic: [] };
let aiAutoAnalyzed = { wealth: false, trading: false, business: false, physic: false };

const AI_SYSTEM_PROMPTS = {
    wealth: `You are Ray's personal wealth advisor embedded in his RayOS dashboard. Respond in Traditional Chinese (繁體中文) mixed with English terms where natural. Be concise, data-driven, and actionable. Use bullet points. Max 200 words.
Your role: Analyze Ray's asset allocation, growth trajectory, and provide strategic wealth advice based on his real data.`,
    trading: `You are Ray's algorithmic trading coach embedded in his RayOS dashboard. Respond in Traditional Chinese mixed with English trading terms. Be concise and analytical. Max 200 words.
Your role: Analyze Ray's trading performance metrics (cumulative return, MDD, win rate, monthly returns) and provide strategy insights. Ray runs algorithmic/systematic trading strategies and also does prop firm challenges.`,
    business: `You are Ray's business growth coach embedded in his RayOS dashboard. Respond in Traditional Chinese mixed with English business terms. Be concise and action-oriented. Max 200 words.
Your role: Analyze Ray's business metrics (Skool communities, YouTube, MRR, member growth) and provide growth strategies. Ray runs online education communities.`,
    physic: `You are Ray's body transformation coach embedded in his RayOS dashboard. Respond in Traditional Chinese mixed with English fitness terms. Be concise, scientific, and motivating. Max 200 words.
Your role: Analyze Ray's body composition data (weight, body fat %, muscle mass) and provide evidence-based advice for fat loss while preserving muscle.`
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

// Build full system prompt with personal profile + cross-domain overview
function buildSystemPrompt(domain) {
    let prompt = AI_SYSTEM_PROMPTS[domain];
    const profile = localStorage.getItem('ai_profile');
    if (profile) {
        prompt += `\n\n=== RAY'S PERSONAL PROFILE & GOALS ===\n${profile}`;
    }
    // Cross-domain snapshot so AI understands the full picture
    prompt += `\n\n=== CROSS-DOMAIN OVERVIEW ===`;
    const lat = wealthHistory[wealthHistory.length - 1] || {};
    prompt += `\n- Wealth: ${formatNumber(lat.totalAssets || 0)} TWD (Goal: ${formatNumber(wealthGoal)} TWD, ${((lat.totalAssets || 0) / wealthGoal * 100).toFixed(0)}%)`;
    const latBody = bodyHistory[bodyHistory.length - 1] || {};
    prompt += `\n- Body: ${latBody.fatpct || '?'}% fat, ${latBody.weight || '?'}kg (Goal: ${physicGoal.target}% fat)`;
    const latAlgo = algoEquity[algoEquity.length - 1] || {};
    prompt += `\n- Trading: ${latAlgo.cumRet?.toFixed(1) || '?'}% cumulative return`;
    // Daily habits recent streak
    const today = new Date().toISOString().split('T')[0];
    const todayH = dailyHabitsData[today] || {};
    const todayDone = Object.values(todayH).filter(v => v === true).length;
    // Last 7 days completion
    let last7done = 0, last7total = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const dh = dailyHabitsData[ds] || {};
        last7done += Object.values(dh).filter(v => v === true).length;
        last7total += 6;
    }
    prompt += `\n- Daily Habits: Today ${todayDone}/6, Last 7 days ${last7done}/${last7total} (${(last7done/last7total*100).toFixed(0)}%)`;
    prompt += `\n\nUse this context to give holistic advice. Reference goals from the profile when relevant. Be direct and data-driven.`;
    return prompt;
}

function getAIContext(domain) {
    switch (domain) {
        case 'wealth': {
            const lat = wealthHistory[wealthHistory.length - 1] || {};
            const prev = wealthHistory[wealthHistory.length - 2] || {};
            return `Current Data (${lat.date || 'N/A'}):
- Total Assets: ${formatNumber(lat.totalAssets || 0)} TWD
- Net Worth: ${formatNumber(lat.netWorth || 0)} TWD
- Monthly Growth: ${lat.monthlyGrowth != null ? lat.monthlyGrowth.toFixed(2) + '%' : 'N/A'}
- Categories: 活期存款 ${formatNumber(lat.categories?.['活期存款'] || 0)}, 股票ETF ${formatNumber(lat.categories?.['股票ETF'] || 0)}, 加密貨幣 ${formatNumber(lat.categories?.['加密貨幣'] || 0)}, 債務 ${formatNumber(lat.categories?.['債務'] || 0)}
- 2026 Goal: ${formatNumber(wealthGoal)} TWD (Progress: ${((lat.totalAssets || 0) / wealthGoal * 100).toFixed(1)}%)
- Previous snapshot (${prev.date || 'N/A'}): ${formatNumber(prev.totalAssets || 0)} TWD
- History points: ${wealthHistory.length} records from ${wealthHistory[0]?.date || 'N/A'} to ${lat.date || 'N/A'}`;
        }
        case 'trading': {
            const latAlgo = algoEquity[algoEquity.length - 1] || {};
            const recent5 = algoEquity.slice(-5).map(e => `${e.date}: ${e.dailyRet > 0 ? '+' : ''}${e.dailyRet}% (cum: ${e.cumRet.toFixed(2)}%)`).join('\n');
            const monthlyStr = Object.entries(MONTHLY_RETURNS).map(([yr, m]) => {
                const months = Object.entries(m).filter(([k]) => k !== 'ytd').map(([k, v]) => `${k}月:${v > 0 ? '+' : ''}${v}%`).join(', ');
                return `${yr}: ${months} | YTD: ${m.ytd > 0 ? '+' : ''}${m.ytd}%`;
            }).join('\n');
            return `Algo Trading Performance:
- Cumulative Return: ${latAlgo.cumRet?.toFixed(2) || 0}%
- Latest Equity: ${formatNumber(latAlgo.equity || 0)} TWD (started at 1,000,000)
- Win Rate: ${((algoEquity.filter(e => e.dailyRet > 0).length / Math.max(1, algoEquity.length)) * 100).toFixed(1)}%
- MDD: 26.01%
- Recent 5 days:\n${recent5}
- Monthly Returns:\n${monthlyStr}
Prop Firm: Fee $38,918 / Payout $64,043 / Net $29,648 / Pass Rate 25%`;
        }
        case 'business': {
            const bizData = JSON.parse(localStorage.getItem(`biz_${currentBusiness}`) || '[]');
            const latBiz = bizData[bizData.length - 1] || {};
            const prevBiz = bizData[bizData.length - 2] || {};
            return `Business: ${currentBusiness}
- Current Members: ${latBiz.members || 0}
- Current Revenue: $${latBiz.revenue || 0}/mo
- Previous: ${prevBiz.members || 0} members, $${prevBiz.revenue || 0}/mo
- Data points: ${bizData.length}
- Business model: Skool free community, Skool paid community, YouTube channel`;
        }
        case 'physic': {
            const sorted = bodyHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
            const lat = sorted[sorted.length - 1] || {};
            const first = sorted[0] || {};
            const prev = sorted[sorted.length - 2] || {};
            return `Body Composition Data:
- Latest (${lat.date || 'N/A'}): Weight ${lat.weight}kg, Fat ${lat.fatpct}%, Muscle ${lat.muscle}kg
- First record (${first.date || 'N/A'}): Weight ${first.weight}kg, Fat ${first.fatpct}%, Muscle ${first.muscle}kg
- Previous (${prev.date || 'N/A'}): Weight ${prev.weight}kg, Fat ${prev.fatpct}%, Muscle ${prev.muscle}kg
- Goal: ${physicGoal.target}% body fat (from ${physicGoal.start}%)
- Height: ${physicGoal.height}cm
- Total records: ${sorted.length}
- Total fat change: ${(lat.fatpct - first.fatpct).toFixed(1)}%
- Total muscle change: ${((lat.muscle || 0) - (first.muscle || 0)).toFixed(1)}kg`;
        }
        default: return '';
    }
}

async function callClaudeAPI(domain, userMessage) {
    const apiKey = localStorage.getItem('anthropic_key');
    if (!apiKey) {
        return '⚠️ 請先到 Settings 設定 Anthropic API Key。\n\n取得方式：[console.anthropic.com](https://console.anthropic.com/settings/keys) → API Keys';
    }
    const systemPrompt = buildSystemPrompt(domain);
    const context = getAIContext(domain);
    const model = localStorage.getItem('ai_model') || 'claude-haiku-4-5-20251001';
    const maxTokens = model.includes('haiku') ? 600 : 1000;
    const messages = [];
    const history = aiChatHistory[domain].slice(-6);
    let userContent = `Here is my current ${domain} data:\n\n${context}\n\n`;
    if (history.length > 0) {
        userContent += `Previous conversation:\n${history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}\n\n`;
    }
    userContent += `Current question: ${userMessage}`;
    messages.push({ role: 'user', content: userContent });
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
                messages: messages
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
    // Simple markdown-like rendering
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n- /g, '<br>• ')
        .replace(/\n\d+\. /g, (m) => '<br>' + m.trim() + ' ')
        .replace(/\n/g, '<br>');
}

async function askAI(domain, inputId, suggestionId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(suggestionId);
    const question = input.value.trim();
    if (!question) return;
    if (!localStorage.getItem('anthropic_key')) {
        showToast('請先到 ⚙️ Settings 設定 Anthropic API Key', true);
        return;
    }
    input.value = '';
    const safeQ = question.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Show user message
    aiChatHistory[domain].push({ role: 'user', content: question });
    container.innerHTML += `<div class="ai-msg user"><div class="ai-role">You</div>${safeQ}</div>`;
    container.innerHTML += `<div class="ai-msg assistant" id="ai-loading-${domain}"><div class="ai-role">Claude</div><span class="ai-loading">Thinking</span></div>`;
    container.scrollTop = container.scrollHeight;
    // Call Claude
    const response = await callClaudeAPI(domain, question);
    aiChatHistory[domain].push({ role: 'assistant', content: response });
    // Replace loading with response
    const loadingEl = document.getElementById(`ai-loading-${domain}`);
    if (loadingEl) loadingEl.outerHTML = `<div class="ai-msg assistant"><div class="ai-role">Claude</div>${renderAIResponse(response)}</div>`;
    container.scrollTop = container.scrollHeight;
}

async function autoAnalyze(domain) {
    if (aiAutoAnalyzed[domain]) return;
    aiAutoAnalyzed[domain] = true;
    const suggestionIds = { wealth: 'wealth-ai-suggestion', trading: 'trading-ai-suggestion', business: 'biz-ai-suggestion', physic: 'body-ai-suggestion' };
    const container = document.getElementById(suggestionIds[domain]);
    if (!container) return;
    
    // Check if API key exists
    if (!localStorage.getItem('anthropic_key')) {
        container.innerHTML = getFallbackAnalysis(domain);
        return;
    }
    
    const prompts = {
        wealth: '請分析我目前的資產配置和成長趨勢，給我 2-3 個具體的財務建議。用繁體中文回答。',
        trading: '請分析我的交易績效，包括月報酬率趨勢、MDD和勝率，給我 2-3 個改善建議。用繁體中文回答。',
        business: '請分析我目前的社群經營數據，給我 2-3 個增長策略。用繁體中文回答。',
        physic: '請分析我的體態數據變化趨勢，評估減脂進度，給我飲食和訓練建議。用繁體中文回答。'
    };
    container.innerHTML = `<span class="ai-loading">Claude 正在分析你的數據</span>`;
    const response = await callClaudeAPI(domain, prompts[domain]);
    aiChatHistory[domain].push({ role: 'assistant', content: response });
    container.innerHTML = `<div class="ai-msg assistant">${renderAIResponse(response)}</div>`;
}

function getFallbackAnalysis(domain) {
    switch (domain) {
        case 'wealth': {
            const lat = wealthHistory[wealthHistory.length - 1] || {};
            const pct = ((lat.totalAssets || 0) / wealthGoal * 100).toFixed(1);
            return `<strong>📊 目標進度：${pct}%</strong><br><br>
                總資產: ${formatNumber(lat.totalAssets || 0)} TWD<br>
                月成長: ${lat.monthlyGrowth != null ? (lat.monthlyGrowth > 0 ? '+' : '') + lat.monthlyGrowth.toFixed(2) + '%' : 'N/A'}<br><br>
                <span style="color:var(--text-muted);font-size:11px;">💡 設定 Anthropic API Key 可獲得 Claude AI 個人化深度分析</span>`;
        }
        case 'trading': {
            const lat = algoEquity[algoEquity.length - 1] || {};
            const wins = algoEquity.filter(e => e.dailyRet > 0).length;
            const wr = algoEquity.length > 0 ? ((wins / algoEquity.length) * 100).toFixed(1) : '0';
            return `<strong>📈 交易績效概覽</strong><br><br>
                累積報酬: ${lat.cumRet?.toFixed(2) || 0}%<br>
                日勝率: ${wr}%<br>
                MDD: 26.01%<br><br>
                <span style="color:var(--text-muted);font-size:11px;">💡 設定 Anthropic API Key 可獲得 Claude AI 交易策略分析</span>`;
        }
        case 'business': {
            const bizData = JSON.parse(localStorage.getItem(`biz_${currentBusiness}`) || '[]');
            const lat = bizData[bizData.length - 1] || {};
            return `<strong>🏢 商業數據</strong><br><br>
                會員: ${lat.members || 0}<br>
                收入: $${lat.revenue || 0}/mo<br><br>
                <span style="color:var(--text-muted);font-size:11px;">💡 設定 Anthropic API Key 可獲得 Claude AI 增長策略建議</span>`;
        }
        case 'physic': {
            const sorted = bodyHistory.slice().sort((a, b) => a.date.localeCompare(b.date));
            const lat = sorted[sorted.length - 1] || {};
            const first = sorted[0] || {};
            const fatChange = lat.fatpct && first.fatpct ? (first.fatpct - lat.fatpct).toFixed(1) : '0';
            return `<strong>💪 體態數據</strong><br><br>
                體脂: ${lat.fatpct || '--'}% (已降 ${fatChange}%)<br>
                體重: ${lat.weight || '--'} kg<br>
                肌肉: ${lat.muscle || '--'} kg<br><br>
                <span style="color:var(--text-muted);font-size:11px;">💡 設定 Anthropic API Key 可獲得 Claude AI 專業體態教練建議</span>`;
        }
        default: return '';
    }
}

function askWealthAI() { askAI('wealth', 'wealth-ai-input', 'wealth-ai-suggestion'); }
function askBizAI() { askAI('business', 'biz-ai-input', 'biz-ai-suggestion'); }
function askTradingAI() { askAI('trading', 'trading-ai-input', 'trading-ai-suggestion'); }
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
