// ==================== EXPENSE ====================

// Category definitions for auto-classification
const EXPENSE_CATEGORIES = {
    'Prop Firm': ['E8 FUNDING', 'TOPSTEP', 'APEX TRADER', 'APEX FUNDING', 'FTMO', 'FUNDEDNEXT', 'FXIFY', 'THE5ERS', '5%ERS', 'PROPW'],
    'Skool': ['SKOOL.COM', 'SKOOL'],
    'AI/SaaS': ['ANTHROPIC', 'CLAUDE.AI', 'TELLA', 'STREAMYARD', 'N8N', 'PADDLE', 'APIFY', 'SUBEASY', 'ELEVENLABS', 'UPPIT', 'OPENAI', 'MIDJOURNEY', 'VERCEL'],
    'Apple': ['APPLE.COM/BILL', 'APPLE.COM'],
    '交通': ['UBER ', 'UBER*', 'GOGORO', 'MOBILE SUICA', '台灣大車隊'],
    '餐飲': ['UBEREATS', '優食', 'FOODPANDA', '7-ELEVEN', '全家', '萊爾富', 'STARBUCKS'],
    '旅行': ['AIRBNB', 'BOOKING.COM', 'AGODA', '航空', 'AIRLINES', 'HOTEL', '飯店'],
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
    '國外手續費': '#e4d354',
    '其他': '#555'
};

// State
let expenseData = JSON.parse(localStorage.getItem('expense_data') || '[]');

// Charts (initialized lazily)
let expensePieChart = null;
let expenseTrendChart = null;

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
        data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(212,197,169,0.5)', borderColor: '#d4c5a9', borderWidth: 1 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: { color: '#d4c5a9', font: { size: 10, weight: 'bold' }, anchor: 'end', align: 'top', formatter: v => v >= 1000 ? Math.round(v / 1000) + 'K' : v }
            },
            scales: {
                x: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 10 } } },
                y: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 10 }, callback: v => v >= 1000 ? Math.round(v / 1000) + 'K' : v } }
            }
        }
    });
}

function renderExpense() {
    if (!expenseData.length) {
        renderEmptyExpense();
        return;
    }

    // Group by month
    const byMonth = {};
    expenseData.forEach(e => {
        const key = e.month; // YYYY/MM format
        if (!byMonth[key]) byMonth[key] = { total: 0, categories: {}, foreignFee: 0 };
        byMonth[key].total += e.amount;
        byMonth[key].categories[e.category] = (byMonth[key].categories[e.category] || 0) + e.amount;
        if (e.category === '國外手續費') byMonth[key].foreignFee += e.amount;
    });

    const months = Object.keys(byMonth).sort().reverse();
    const latest = byMonth[months[0]];
    const prev = months[1] ? byMonth[months[1]] : null;

    // Summary cards
    document.getElementById('expense-total').textContent = 'NT$' + formatNumber(Math.round(latest.total));
    if (prev) {
        const diff = ((latest.total - prev.total) / prev.total * 100).toFixed(0);
        const el = document.getElementById('expense-vs-prev');
        el.textContent = (diff > 0 ? '+' : '') + diff + '%';
        el.className = 'summary-value ' + (diff > 0 ? 'negative' : 'positive');
    } else {
        document.getElementById('expense-vs-prev').textContent = '--';
    }

    // Top category (excluding foreign fee)
    const cats = Object.entries(latest.categories).filter(([k]) => k !== '國外手續費').sort((a, b) => b[1] - a[1]);
    if (cats.length) {
        document.getElementById('expense-top-cat').textContent = cats[0][0];
    }
    document.getElementById('expense-foreign-fee').textContent = 'NT$' + formatNumber(Math.round(latest.foreignFee));

    // Pie chart - latest month
    const pieLabels = [];
    const pieData = [];
    const pieColors = [];
    Object.entries(latest.categories).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
        pieLabels.push(cat);
        pieData.push(Math.round(amt));
        pieColors.push(CATEGORY_COLORS[cat] || '#555');
    });
    expensePieChart.data.labels = pieLabels;
    expensePieChart.data.datasets[0].data = pieData;
    expensePieChart.data.datasets[0].backgroundColor = pieColors;
    expensePieChart.update();

    // Trend chart - all months (chronological)
    const sortedMonths = Object.keys(byMonth).sort();
    expenseTrendChart.data.labels = sortedMonths.map(m => m.slice(2)); // YY/MM
    expenseTrendChart.data.datasets[0].data = sortedMonths.map(m => Math.round(byMonth[m].total));
    expenseTrendChart.update();

    // History table
    renderExpenseTable(byMonth, months);
}

function renderEmptyExpense() {
    document.getElementById('expense-total').textContent = '--';
    document.getElementById('expense-vs-prev').textContent = '--';
    document.getElementById('expense-top-cat').textContent = '--';
    document.getElementById('expense-foreign-fee').textContent = '--';
    if (expensePieChart) { expensePieChart.data.labels = []; expensePieChart.data.datasets[0].data = []; expensePieChart.update(); }
    if (expenseTrendChart) { expenseTrendChart.data.labels = []; expenseTrendChart.data.datasets[0].data = []; expenseTrendChart.update(); }
    document.getElementById('expense-history-table').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">尚無支出資料。貼上信用卡 CSV 帳單開始追蹤。</div>';
}

function renderExpenseTable(byMonth, months) {
    // Collect all categories used
    const allCats = new Set();
    Object.values(byMonth).forEach(m => Object.keys(m.categories).forEach(c => allCats.add(c)));
    const catList = [...allCats].filter(c => c !== '國外手續費').sort();

    let html = '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-dim);">';
    html += '<th style="padding:8px;text-align:left;">月份</th>';
    html += '<th style="padding:8px;text-align:right;">總支出</th>';
    catList.forEach(c => { html += `<th style="padding:8px;text-align:right;">${c}</th>`; });
    html += '<th style="padding:8px;text-align:right;">手續費</th>';
    html += '</tr></thead><tbody>';

    months.forEach(m => {
        const d = byMonth[m];
        html += `<tr style="border-bottom:1px solid var(--border);">`;
        html += `<td style="padding:8px;color:var(--text);">${m}</td>`;
        html += `<td style="padding:8px;text-align:right;color:var(--accent);font-weight:600;">${formatNumber(Math.round(d.total))}</td>`;
        catList.forEach(c => {
            const v = d.categories[c] || 0;
            html += `<td style="padding:8px;text-align:right;color:${v > 0 ? 'var(--text)' : 'var(--text-muted)'};">${v > 0 ? formatNumber(Math.round(v)) : '-'}</td>`;
        });
        html += `<td style="padding:8px;text-align:right;color:var(--text-dim);">${formatNumber(Math.round(d.foreignFee))}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('expense-history-table').innerHTML = html;
}

// CSV import with AI classification
async function importExpenseCSV() {
    const csvText = document.getElementById('expense-paste').value.trim();
    if (!csvText) { showToast('請先貼上 CSV 資料', true); return; }

    const apiKey = localStorage.getItem('anthropic_key');
    if (!apiKey) { showToast('請先在 Settings 設定 API Key', true); return; }

    const statusEl = document.getElementById('expense-import-status');
    statusEl.style.display = 'block';
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
- Skip header rows and summary rows
- For ambiguous items, use "其他"`,
                messages: [{ role: 'user', content: csvText }]
            })
        });

        if (!response.ok) throw new Error('API error: ' + response.status);
        const data = await response.json();
        const text = data.content?.[0]?.text || '';

        // Extract JSON from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('AI did not return valid JSON');

        const items = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(items) || items.length === 0) throw new Error('No items parsed');

        // Merge with existing data (avoid duplicates by date+desc+amount)
        const existingKeys = new Set(expenseData.map(e => `${e.date}|${e.desc}|${e.amount}`));
        let added = 0;
        items.forEach(item => {
            const key = `${item.date}|${item.desc}|${item.amount}`;
            if (!existingKeys.has(key)) {
                expenseData.push(item);
                existingKeys.add(key);
                added++;
            }
        });

        localStorage.setItem('expense_data', JSON.stringify(expenseData));
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
    expenseData = [];
    localStorage.removeItem('expense_data');
    renderExpense();
    showToast('支出資料已清除');
}
