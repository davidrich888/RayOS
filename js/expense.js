// ==================== EXPENSE ====================

// Category classification rules (enhanced)
const EXPENSE_CATEGORIES = {
    'Prop Firm': ['E8 FUNDING', 'E8FUNDING', 'TOPSTEP', 'APEX TRADER', 'APEX FUNDING', 'APEXTRADERFUNDING', 'FTMO', 'FUNDEDNEXT', 'FXIFY', 'THE5ERS', '5%ERS', 'PROPW', 'TRADEIFY', 'LUCID TRADING', 'TRADERSCONNECT', 'TAKEPROFITTRADER', 'TRADESYNCER', 'KIT.COM', 'SIM2FUNDED'],
    'Skool': ['SKOOL.COM', 'SKOOL'],
    'AI/SaaS': ['ANTHROPIC', 'CLAUDE.AI', 'TELLA', 'STREAMYARD', 'N8N', 'PADDLE', 'APIFY', 'SUBEASY', 'ELEVENLABS', 'UPPIT', 'OPENAI', 'MIDJOURNEY', 'VERCEL', 'CANVA', 'MANYCHAT', 'FUNNEL MASTE', 'ZAC PHUA', 'GOOGLE*CLOUD', 'GOOGLE CLOUD', 'GOOGLE*WORKSPACE', 'GSUITE', 'CAPCUT', 'ZOOM.COM', 'DESCRIPT', 'AMAZON PRIME', 'TRADINGVIEW', 'SCRIBD', 'NAME-CHEAP', 'NAMECHEAP', 'METACOPIER', 'FORMFLOW', '2CO.COM', 'METAQUOTES', 'MQL5', 'RAPIDAPI', 'PAXCLOUD', 'GOOGLE*GOOGLE ONE', 'GOOGLE *GOOGLE ONE'],
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
    'Skool': '#7cb5ec',
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
    document.getElementById('expense-foreign-fee').textContent = 'NT$' + formatNumber(data.categories['國外手續費'] || 0);
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
    document.getElementById('expense-foreign-fee').textContent = '--';
    if (expensePieChart) { expensePieChart.data.labels = []; expensePieChart.data.datasets[0].data = []; expensePieChart.update(); }
    if (expenseTrendChart) { expenseTrendChart.data.labels = []; expenseTrendChart.data.datasets[0].data = []; expenseTrendChart.update(); }
    document.getElementById('expense-history-table').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">尚無支出資料。</div>';
}

function renderExpenseTable(months) {
    let html = '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-dim);">';
    html += '<th style="padding:8px 12px;text-align:left;">月份</th>';
    html += '<th style="padding:8px 12px;text-align:right;">總支出</th>';
    html += '<th style="padding:8px 12px;text-align:right;">筆數</th>';
    html += '<th style="padding:8px 12px;text-align:left;">最大分類</th>';
    html += '<th style="padding:8px 12px;text-align:right;">vs 上月</th>';
    html += '</tr></thead><tbody>';

    months.forEach((m, i) => {
        const prev = months[i + 1] || null;
        const diff = prev ? ((m.total - prev.total) / prev.total * 100).toFixed(0) : null;
        const topCat = Object.entries(m.categories)
            .filter(([k]) => k !== '國外手續費' && k !== '其他')
            .sort((a, b) => b[1] - a[1])[0];
        const isSelected = m.month === selectedExpenseMonth;

        html += `<tr class="expense-row" style="border-bottom:1px solid var(--border);cursor:pointer;${isSelected ? 'background:rgba(212,197,169,0.08);' : ''}" onclick="toggleExpenseDetail('${m.month}', this)">`;
        html += `<td style="padding:8px 12px;color:var(--text);font-weight:${isSelected ? '600' : '400'};">${m.month}</td>`;
        html += `<td style="padding:8px 12px;text-align:right;color:var(--accent);font-weight:600;">NT$${formatNumber(m.total)}</td>`;
        html += `<td style="padding:8px 12px;text-align:right;color:var(--text-dim);">${m.count}</td>`;
        html += `<td style="padding:8px 12px;color:var(--text);">${topCat ? topCat[0] : '--'}</td>`;
        if (diff !== null) {
            html += `<td style="padding:8px 12px;text-align:right;color:${Number(diff) > 0 ? 'var(--danger)' : 'var(--success)'};">${diff > 0 ? '+' : ''}${diff}%</td>`;
        } else {
            html += '<td style="padding:8px 12px;text-align:right;color:var(--text-dim);">--</td>';
        }
        html += '</tr>';

        // Detail row (hidden by default)
        html += `<tr id="expense-detail-${m.month.replace('/', '-')}" style="display:none;"><td colspan="5" style="padding:0;">`;
        html += buildExpenseDetail(m);
        html += '</td></tr>';
    });

    html += '</tbody></table>';
    document.getElementById('expense-history-table').innerHTML = html;
}

function buildExpenseDetail(monthData) {
    const entries = Object.entries(monthData.categories).sort((a, b) => b[1] - a[1]);
    const total = monthData.total;

    let html = '<div style="padding:8px 12px 16px;background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border);">';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;">';

    entries.forEach(([cat, amount]) => {
        const pct = total > 0 ? (amount / total * 100).toFixed(1) : 0;
        const color = CATEGORY_COLORS[cat] || '#555';
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.03);">`;
        html += `<div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>`;
        html += `<div style="flex:1;min-width:0;">`;
        html += `<div style="font-size:11px;color:var(--text-dim);">${cat}</div>`;
        html += `<div style="font-size:13px;color:var(--text);font-weight:500;">NT$${formatNumber(amount)}<span style="font-size:10px;color:var(--text-dim);margin-left:4px;">${pct}%</span></div>`;
        html += '</div></div>';
    });

    html += '</div></div>';
    return html;
}

function toggleExpenseDetail(month, rowEl) {
    const detailId = 'expense-detail-' + month.replace('/', '-');
    const detailRow = document.getElementById(detailId);
    if (!detailRow) return;

    const isVisible = detailRow.style.display !== 'none';
    // Close all other detail rows
    document.querySelectorAll('[id^="expense-detail-"]').forEach(r => r.style.display = 'none');
    document.querySelectorAll('.expense-row').forEach(r => r.style.background = '');

    if (!isVisible) {
        detailRow.style.display = '';
        rowEl.style.background = 'rgba(212,197,169,0.08)';
        // Also update charts to this month
        const sel = document.getElementById('expense-month-select');
        sel.value = month;
        onExpenseMonthChange(month);
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
