// ==================== EXPENSE ====================

// Category classification rules (enhanced)
const EXPENSE_CATEGORIES = {
    'Prop Firm': ['E8 FUNDING', 'E8FUNDING', 'TOPSTEP', 'APEX TRADER', 'APEX FUNDING', 'APEXTRADERFUNDING', 'FTMO', 'FUNDEDNEXT', 'FXIFY', 'THE5ERS', '5%ERS', 'PROPW', 'TRADEIFY', 'LUCID TRADING', 'TRADERSCONNECT', 'TAKEPROFITTRADER', 'TRADESYNCER', 'KIT.COM', 'SIM2FUNDED'],
    '事業': ['SKOOL.COM', 'SKOOL', 'TELLA', 'STREAMYARD', 'CAPCUT', 'CAPCUTO', 'SUBEASY', 'MANYCHAT', 'CANVA', 'FUNNEL MASTE', 'ZAC PHUA'],
    'AI/SaaS': ['ANTHROPIC', 'CLAUDE.AI', 'N8N', 'PADDLE', 'APIFY', 'ELEVENLABS', 'UPPIT', 'OPENAI', 'MIDJOURNEY', 'VERCEL', 'GOOGLE*CLOUD', 'GOOGLE CLOUD', 'GOOGLE*WORKSPACE', 'GSUITE', 'ZOOM.COM', 'DESCRIPT', 'AMAZON PRIME', 'TRADINGVIEW', 'SCRIBD', 'NAME-CHEAP', 'NAMECHEAP', 'METACOPIER', 'FORMFLOW', '2CO.COM', 'METAQUOTES', 'MQL5', 'RAPIDAPI', 'PAXCLOUD', 'GOOGLE*GOOGLE ONE', 'GOOGLE *GOOGLE ONE'],
    'Apple': ['APPLE.COM/BILL', 'APPLE.COM'],
    '交通': ['UBER ', 'UBER*', 'GOGORO', 'MOBILE SUICA', 'SUICA', '台灣大車隊', 'GRAB.COM', 'GRAB ', '加油站', '中油', '高鐵', '優步', 'CHARGESPOT', '城市車旅', 'ALPHA FLIGHT'],
    '餐飲': ['UBEREATS', '優食', 'FOODPANDA', '7-ELEVEN', '全家便利', '萊爾富', 'STARBUCKS', '星巴克', 'MOS-', 'MOS ', 'CAFE', 'SUSHI', 'HANDROLL', '全聯', '義美', 'PUTIEN', 'MUNCHIZ', 'XIAOLONGKAN', 'HOTPOT', 'GRILL', 'HOUSE KOREAN', 'ARABICA', 'BOOST JUICE', '拉麵', '燒肉', '鍋物', 'OMAKASE', '日嚐', '木門咖啡', '波奇', 'GELATO', 'DEAN&DELUCA', 'MCD', 'BREAD STREET', '統一超商', 'SEVEN-ELEVEN', 'FAMILYMART', 'MINISTOP', '鐵板燒', '食事', '壽司', 'ICHIRAN', 'UNATOTO', '冒煙的喬', '丰禾', 'HUN混', 'CUPPAVV', '起家', 'DONUT'],
    '旅行': ['AIRBNB', 'BOOKING.COM', 'AGODA', '航空', 'AIRLINES', 'HOTEL', '飯店', 'KIWI.COM', 'STARLUX', 'FLYSCOOT', 'TOKYO', 'SHIBUYA', 'EKKAMAI', '易遊網', 'TRIP.COM', 'BANGKO', 'BANGKOK', 'DUBAI', 'DUTY FREE', 'DUTY_FREE', 'RYANAIR', 'SALA RATTANAKOSIN', 'ICONSIAM', 'EMQUARTIER', 'EMSPHERE', 'SIAM', 'PARAGON', 'SUKHUMVIT', 'THONGLOR', 'ASIATIQUE', 'KING POWER', 'SUVARNA', 'AIR ARABIA', 'NARITA', 'EDELWEISS', 'SOUTH COAST', 'SNOWIN', '滑雪', 'PRINCE HOTEL', 'SOLAMACHI', '行旅', 'WAYSIM', '酷遊天'],
    '保險': ['國泰人壽', '保險'],
    '健身': ['WORLDGY', 'WORLD GY', '大有運動', 'DECATHLON', '迪卡儂', 'JETTS FITNESS', 'NU TRITION DEPOT'],
    '購物': ['PCHOME', '蝦皮', 'LALAPORT', '秀泰', 'GLOBAL MALL', '環球', '富邦MOMO', 'MOMO購物', '無印良品', 'MUJI', '金典', '勤美', 'CONVERSE', '大魯閣', '台灣菸酒', '連加', 'HOLA', 'TSUTAYA', 'BURTON', 'J STREAM', 'K區', 'WHSMITH', 'PIKZELS', 'CHANCHAO'],
    '生活': ['遠傳電信', '遠傳電', '電話費', '寶雅', '屈臣氏', '佑全', '三商藥局', '小北百貨', '全家福', '寶島眼鏡', '昇昌', '燦坤', '年費'],
    '娛樂': ['威秀影城', 'GOOGLE*YOUTUBE', 'GOOGLE *YOUTUBE', 'GOOGLE*TV', 'LINE STO'],
    '其他': []
};

const CATEGORY_COLORS = {
    'Prop Firm': '#d4c5a9',
    '事業': '#7cb5ec',
    'AI/SaaS': '#90ed7d',
    'Apple': '#a0a0a0',
    '交通': '#f7a35c',
    '餐飲': '#8085e9',
    '旅行': '#f15c80',
    '保險': '#2b908f',
    '健身': '#e4d354',
    '購物': '#f45b5b',
    '國外手續費': '#c4a35a',
    '生活': '#91dcea',
    '娛樂': '#ff9ff3',
    '其他': '#555'
};

// State: use preloaded monthly data, merge with any localStorage additions
let expenseMonthly = JSON.parse(JSON.stringify(PRELOAD_EXPENSE_MONTHLY));

// Merge localStorage additions (from CSV import) into monthly aggregates
(function mergeLocalExpense() {
    const localData = JSON.parse(localStorage.getItem('expense_data') || '[]');
    if (!localData.length) return;
    const byMonth = {};
    localData.forEach(e => {
        const key = e.month;
        if (!byMonth[key]) byMonth[key] = { total: 0, categories: {}, count: 0 };
        byMonth[key].total += e.amount;
        byMonth[key].count += 1;
        byMonth[key].categories[e.category] = (byMonth[key].categories[e.category] || 0) + e.amount;
    });
    // Merge: if month already in preload, skip (preload is authoritative)
    const existingMonths = new Set(expenseMonthly.map(m => m.month));
    Object.entries(byMonth).forEach(([month, data]) => {
        if (!existingMonths.has(month)) {
            expenseMonthly.push({ month, ...data });
        }
    });
    expenseMonthly.sort((a, b) => a.month.localeCompare(b.month));
})();

// Charts (initialized lazily)
let expensePieChart = null;
let expenseTrendChart = null;
let selectedExpenseMonth = null;

function setWealthTab(tab, btn) {
    document.querySelectorAll('#wealth .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-assets').style.display = tab === 'assets' ? 'block' : 'none';
    document.getElementById('tab-expense-page').style.display = tab === 'expense' ? 'block' : 'none';
    if (tab === 'expense') {
        initExpenseCharts();
        renderExpense();
    }
}

function initExpenseCharts() {
    if (expensePieChart) return;

    const pieCtx = document.getElementById('expensePieChart').getContext('2d');
    expensePieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#a0a0a0', font: { size: 11 }, padding: 12, boxWidth: 12 } },
                datalabels: {
                    color: '#e0e0e0',
                    font: { size: 10, weight: 'bold' },
                    formatter: (v, ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? (v / total * 100).toFixed(0) : 0;
                        return pct > 3 ? pct + '%' : '';
                    }
                }
            },
            cutout: '55%'
        }
    });

    const trendCtx = document.getElementById('expenseTrendChart').getContext('2d');
    expenseTrendChart = new Chart(trendCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: [], borderWidth: 1 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { color: '#d4c5a9', font: { size: 10, weight: 'bold' }, anchor: 'end', align: 'top', formatter: v => formatNumber(v) }
            },
            scales: {
                x: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 10 } } },
                y: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 10 }, callback: v => formatNumber(v) } }
            },
            onClick: (evt, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const chronological = [...expenseMonthly].sort((a, b) => a.month.localeCompare(b.month));
                    const sel = document.getElementById('expense-month-select');
                    sel.value = chronological[idx].month;
                    onExpenseMonthChange(sel.value);
                }
            }
        }
    });
}

function onExpenseMonthChange(monthKey) {
    selectedExpenseMonth = monthKey;
    const months = [...expenseMonthly].sort((a, b) => b.month.localeCompare(a.month));
    const selected = months.find(m => m.month === monthKey);
    if (!selected) return;

    const idx = months.indexOf(selected);
    const prev = months[idx + 1] || null;

    updateExpenseSummary(selected, prev);
    updateExpensePie(selected);
    updateTrendHighlight(monthKey);
}

function updateExpenseSummary(data, prev) {
    document.getElementById('expense-total').textContent = 'NT$' + formatNumber(data.total);
    if (prev) {
        const diff = ((data.total - prev.total) / prev.total * 100).toFixed(0);
        const el = document.getElementById('expense-vs-prev');
        el.textContent = (diff > 0 ? '+' : '') + diff + '%';
        el.className = 'summary-value ' + (Number(diff) > 0 ? 'negative' : 'positive');
    } else {
        document.getElementById('expense-vs-prev').textContent = '--';
        document.getElementById('expense-vs-prev').className = 'summary-value';
    }
    const cats = Object.entries(data.categories)
        .filter(([k]) => k !== '國外手續費' && k !== '其他')
        .sort((a, b) => b[1] - a[1]);
    document.getElementById('expense-top-cat').textContent = cats.length ? cats[0][0] : '--';
    // Monthly average (all months)
    const avgTotal = expenseMonthly.length > 0 ? Math.round(expenseMonthly.reduce((s, m) => s + m.total, 0) / expenseMonthly.length) : 0;
    document.getElementById('expense-avg').textContent = 'NT$' + formatNumber(avgTotal);
}

function updateExpensePie(data) {
    const pieEntries = Object.entries(data.categories).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    expensePieChart.data.labels = pieEntries.map(([c]) => c);
    expensePieChart.data.datasets[0].data = pieEntries.map(([, v]) => v);
    expensePieChart.data.datasets[0].backgroundColor = pieEntries.map(([c]) => CATEGORY_COLORS[c] || '#555');
    expensePieChart.update();
}

function updateTrendHighlight(monthKey) {
    const chronological = [...expenseMonthly].sort((a, b) => a.month.localeCompare(b.month));
    const bgColors = chronological.map(m => m.month === monthKey ? 'rgba(212,197,169,0.8)' : 'rgba(212,197,169,0.3)');
    const borderColors = chronological.map(m => m.month === monthKey ? '#d4c5a9' : 'rgba(212,197,169,0.5)');
    expenseTrendChart.data.datasets[0].backgroundColor = bgColors;
    expenseTrendChart.data.datasets[0].borderColor = borderColors;
    expenseTrendChart.update();
}

function renderExpense() {
    if (!expenseMonthly.length) {
        renderEmptyExpense();
        return;
    }

    const months = [...expenseMonthly].sort((a, b) => b.month.localeCompare(a.month));

    // Populate month dropdown
    const sel = document.getElementById('expense-month-select');
    const currentVal = selectedExpenseMonth || months[0].month;
    sel.innerHTML = months.map(m => `<option value="${m.month}"${m.month === currentVal ? ' selected' : ''}>${m.month}</option>`).join('');
    selectedExpenseMonth = currentVal;

    const selected = months.find(m => m.month === currentVal);
    const idx = months.indexOf(selected);
    const prev = months[idx + 1] || null;

    updateExpenseSummary(selected, prev);
    updateExpensePie(selected);

    // Trend chart - chronological with highlight
    const chronological = [...expenseMonthly].sort((a, b) => a.month.localeCompare(b.month));
    expenseTrendChart.data.labels = chronological.map(m => m.month.slice(2));
    expenseTrendChart.data.datasets[0].data = chronological.map(m => m.total);
    updateTrendHighlight(currentVal);

    // History table
    renderExpenseTable(months);
}

function renderEmptyExpense() {
    document.getElementById('expense-total').textContent = '--';
    document.getElementById('expense-vs-prev').textContent = '--';
    document.getElementById('expense-top-cat').textContent = '--';
    document.getElementById('expense-avg').textContent = '--';
    if (expensePieChart) { expensePieChart.data.labels = []; expensePieChart.data.datasets[0].data = []; expensePieChart.update(); }
    if (expenseTrendChart) { expenseTrendChart.data.labels = []; expenseTrendChart.data.datasets[0].data = []; expenseTrendChart.update(); }
    document.getElementById('expense-history-table').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">尚無支出資料。</div>';
}

// Fixed category column order
const EXPENSE_COL_ORDER = ['Prop Firm', '事業', 'AI/SaaS', 'Apple', '交通', '餐飲', '旅行', '保險', '健身', '購物', '生活', '娛樂', '國外手續費', '其他'];

function renderExpenseTable(months) {
    const thStyle = 'padding:6px 8px;text-align:right;white-space:nowrap;font-size:11px;';
    const totalCols = EXPENSE_COL_ORDER.length + 3; // month + total + categories + count

    let html = '<table style="width:100%;font-size:11px;border-collapse:collapse;min-width:900px;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-dim);">';
    html += `<th style="${thStyle}text-align:left;">月份</th>`;
    html += `<th style="${thStyle}font-weight:600;">總支出</th>`;
    EXPENSE_COL_ORDER.forEach(cat => {
        html += `<th style="${thStyle}">${cat}</th>`;
    });
    html += `<th style="${thStyle}">筆數</th>`;
    html += '</tr></thead><tbody>';

    months.forEach((m, i) => {
        const isSelected = m.month === selectedExpenseMonth;
        const rowBg = isSelected ? 'background:rgba(212,197,169,0.08);' : '';

        html += `<tr class="expense-row" style="border-bottom:1px solid var(--border);cursor:pointer;${rowBg}" onclick="onExpenseRowClick('${m.month}', this)">`;
        html += `<td style="padding:6px 8px;color:var(--text);font-weight:${isSelected ? '600' : '400'};">${m.month}</td>`;
        html += `<td style="padding:6px 8px;text-align:right;color:var(--accent);font-weight:600;">NT$${formatNumber(m.total)}</td>`;

        EXPENSE_COL_ORDER.forEach(cat => {
            const val = m.categories[cat];
            if (val && val > 0) {
                const color = CATEGORY_COLORS[cat] || 'var(--text)';
                html += `<td style="padding:6px 8px;text-align:right;color:${color};cursor:pointer;" onclick="event.stopPropagation();showCategoryDetail('${m.month}','${cat}')">${formatNumber(val)}</td>`;
            } else {
                html += '<td style="padding:6px 8px;text-align:right;color:var(--text-dim);">-</td>';
            }
        });

        html += `<td style="padding:6px 8px;text-align:right;color:var(--text-dim);">${m.count}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('expense-history-table').innerHTML = html;
}

function onExpenseRowClick(month, rowEl) {
    document.querySelectorAll('.expense-row').forEach(r => r.style.background = '');
    rowEl.style.background = 'rgba(212,197,169,0.08)';
    const sel = document.getElementById('expense-month-select');
    sel.value = month;
    onExpenseMonthChange(month);
}

// Show category detail modal with merchant breakdown (from Notion)
async function showCategoryDetail(month, category) {
    const modalId = 'expense-detail-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:9999;justify-content:center;align-items:center;';
        modal.innerHTML = '<div style="background:var(--card-bg,#1a1a1a);border:1px solid var(--border,#333);border-radius:12px;max-width:500px;width:90%;max-height:80vh;overflow:hidden;"><div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border,#333);"><h3 id="expense-detail-title" style="margin:0;font-size:16px;color:var(--text,#e0e0e0);"></h3><button class="btn btn-small" onclick="document.getElementById(\'expense-detail-modal\').style.display=\'none\'">✕</button></div><div id="expense-detail-body" style="max-height:60vh;overflow-y:auto;padding:0;"></div></div>';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }

    document.getElementById('expense-detail-title').textContent = `${month} — ${category}`;
    const body = document.getElementById('expense-detail-body');
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-dim);">載入中...</div>';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/expense-detail?month=${encodeURIComponent(month)}&category=${encodeURIComponent(category)}`);
        const json = await res.json();
        if (!json.success || !json.data || json.data.length === 0) {
            body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-dim);">此分類無明細資料</div>';
            return;
        }

        // Group by merchant (description)
        const byMerchant = {};
        json.data.forEach(t => {
            const key = t.desc || '未知';
            if (!byMerchant[key]) byMerchant[key] = { total: 0, count: 0 };
            byMerchant[key].total += t.amount;
            byMerchant[key].count += 1;
        });

        const sorted = Object.entries(byMerchant).sort((a, b) => b[1].total - a[1].total);
        const color = CATEGORY_COLORS[category] || '#555';

        let html = '<div style="padding:8px 0;">';
        sorted.forEach(([merchant, data]) => {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);">`;
            html += `<div style="font-size:12px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${merchant}</div>`;
            html += `<div style="text-align:right;white-space:nowrap;margin-left:12px;">`;
            html += `<span style="color:${color};font-weight:600;font-size:13px;">NT$${formatNumber(data.total)}</span>`;
            html += `<span style="color:var(--text-dim);font-size:11px;margin-left:6px;">(${data.count}筆)</span>`;
            html += '</div></div>';
        });
        html += `<div style="display:flex;justify-content:space-between;padding:10px 12px;font-weight:600;color:var(--accent);font-size:13px;">`;
        html += `<div>合計</div><div>NT$${formatNumber(json.data.reduce((s, t) => s + t.amount, 0))} (${json.data.length}筆)</div>`;
        html += '</div></div>';
        body.innerHTML = html;
    } catch (e) {
        body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--danger);">載入失敗：${e.message}</div>`;
    }
}

// CSV import with AI classification (for future months)
async function importExpenseCSV() {
    const csvText = document.getElementById('expense-paste').value.trim();
    if (!csvText) { showToast('請先貼上 CSV 資料', true); return; }

    const apiKey = localStorage.getItem('anthropic_key');
    if (!apiKey) { showToast('請先在 Settings 設定 API Key', true); return; }

    const statusEl = document.getElementById('expense-import-status');
    statusEl.style.display = 'block';
    statusEl.style.color = 'var(--text-dim)';
    statusEl.innerHTML = '⏳ AI 正在分類帳單...';

    try {
        const model = localStorage.getItem('ai_model') || 'claude-haiku-4-5-20251001';
        const categoryList = Object.keys(EXPENSE_CATEGORIES).filter(c => c !== '其他').join(', ');
        const keywordInfo = Object.entries(EXPENSE_CATEGORIES)
            .filter(([k]) => k !== '其他')
            .map(([cat, keywords]) => `${cat}: ${keywords.join(', ')}`)
            .join('\n');

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
                max_tokens: 4096,
                system: `You are an expense classifier. Classify each transaction into one of these categories: ${categoryList}, 國外手續費, 其他.

Keyword hints:
${keywordInfo}
國外手續費: any row with "國外交易手續費" or "海外手續費"

Output ONLY a JSON array. Each item: {"date":"YYYY/MM/DD","desc":"description","amount":number,"category":"category","month":"YYYY/MM"}
- amount should be positive numbers (convert negative to positive if needed)
- month is derived from date (YYYY/MM)
- Skip header rows, summary rows, and payment/繳款 rows
- For ambiguous items, use "其他"`,
                messages: [{ role: 'user', content: csvText }]
            })
        });

        if (!response.ok) throw new Error('API error: ' + response.status);
        const data = await response.json();
        const text = data.content?.[0]?.text || '';

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('AI did not return valid JSON');

        const items = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(items) || items.length === 0) throw new Error('No items parsed');

        // Save raw transactions to localStorage
        const localData = JSON.parse(localStorage.getItem('expense_data') || '[]');
        const existingKeys = new Set(localData.map(e => `${e.date}|${e.desc}|${e.amount}`));
        let added = 0;
        items.forEach(item => {
            const key = `${item.date}|${item.desc}|${item.amount}`;
            if (!existingKeys.has(key)) {
                localData.push(item);
                existingKeys.add(key);
                added++;
            }
        });
        localStorage.setItem('expense_data', JSON.stringify(localData));

        // Aggregate new items into monthly and merge
        const newByMonth = {};
        items.forEach(e => {
            const key = e.month;
            if (!newByMonth[key]) newByMonth[key] = { total: 0, categories: {}, count: 0 };
            newByMonth[key].total += e.amount;
            newByMonth[key].count += 1;
            newByMonth[key].categories[e.category] = (newByMonth[key].categories[e.category] || 0) + e.amount;
        });

        const existingMonthSet = new Set(expenseMonthly.map(m => m.month));
        Object.entries(newByMonth).forEach(([month, data]) => {
            if (!existingMonthSet.has(month)) {
                expenseMonthly.push({ month, ...data });
            }
        });
        expenseMonthly.sort((a, b) => a.month.localeCompare(b.month));

        statusEl.innerHTML = `✅ 匯入完成：${items.length} 筆交易，新增 ${added} 筆（${items.length - added} 筆重複跳過）`;
        statusEl.style.color = 'var(--success)';
        renderExpense();
        showToast(`匯入 ${added} 筆支出紀錄`);

    } catch (e) {
        statusEl.innerHTML = '❌ 匯入失敗：' + e.message;
        statusEl.style.color = 'var(--danger)';
    }
}

function clearExpenseData() {
    if (!confirm('確定要清除所有支出資料？此操作無法復原。')) return;
    expenseMonthly = JSON.parse(JSON.stringify(PRELOAD_EXPENSE_MONTHLY));
    localStorage.removeItem('expense_data');
    renderExpense();
    showToast('支出資料已清除（保留預載數據）');
}
