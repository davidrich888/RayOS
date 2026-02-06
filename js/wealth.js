// ==================== WEALTH ====================

function setWealthTab(tab, btn) {
    document.querySelectorAll('#wealth .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-snapshot').style.display = tab === 'snapshot' ? 'block' : 'none';
    document.getElementById('tab-expense').style.display = tab === 'expense' ? 'block' : 'none';
}

function editQuote() {
    document.getElementById('quote-text-input').value = quote.text;
    document.getElementById('quote-author-input').value = quote.author;
    showModal('quote-modal');
}

function saveQuote() {
    quote.text = document.getElementById('quote-text-input').value;
    quote.author = document.getElementById('quote-author-input').value;
    localStorage.setItem('wealth_quote', JSON.stringify(quote));
    document.getElementById('wealth-quote-text').textContent = '"' + quote.text + '"';
    document.getElementById('wealth-quote-author').textContent = '— ' + quote.author;
    hideModal('quote-modal');
    showToast('Quote saved');
}

function editGoal() {
    document.getElementById('wealth-goal-input').value = wealthGoal;
    showModal('goal-modal');
}

function saveGoal() {
    wealthGoal = parseInt(document.getElementById('wealth-goal-input').value) || 6500000;
    localStorage.setItem('wealth_goal', wealthGoal);
    document.getElementById('goal-target').textContent = formatNumber(wealthGoal);
    updateWealthDisplay();
    hideModal('goal-modal');
    showToast('Goal saved');
}

function renderAccountManager() {
    const c = document.getElementById('account-manager-list');
    const g = {};
    accounts.forEach((a, i) => { if (!g[a.category]) g[a.category] = []; g[a.category].push({ ...a, idx: i }); });
    let h = '';
    Object.keys(g).forEach(cat => {
        h += `<div style="margin-bottom:12px;"><div style="font-size:11px;color:var(--accent);margin-bottom:6px;">${CATEGORY_ICONS[cat] || ''} ${cat}</div>`;
        g[cat].forEach(a => {
            h += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;"><span>${a.name} (${a.currency})</span><button class="btn btn-small btn-danger" onclick="deleteAccount(${a.idx})">Delete</button></div>`;
        });
        h += '</div>';
    });
    c.innerHTML = h;
}

function addAccount() {
    const n = document.getElementById('new-account-name').value;
    const p = document.getElementById('new-account-platform').value;
    const cat = document.getElementById('new-account-category').value;
    const cur = document.getElementById('new-account-currency').value;
    if (!n) return showToast('Enter name', true);
    accounts.push({ name: n, platform: p, category: cat, currency: cur });
    localStorage.setItem('accounts', JSON.stringify(accounts));
    renderAccountManager();
    document.getElementById('new-account-name').value = '';
    showToast('Account added');
}

function deleteAccount(idx) {
    if (confirm('Delete?')) {
        accounts.splice(idx, 1);
        localStorage.setItem('accounts', JSON.stringify(accounts));
        renderAccountManager();
        showToast('Deleted');
    }
}

async function syncAccountsFromNotion(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('請先設定 Notion Token', true);
        return;
    }
    if (!silent) showToast('正在同步帳戶...');
    try {
        const data = await notionFetch('/databases/' + ACCOUNTS_DB_ID + '/query', 'POST', {
            sorts: [{ property: '排序', direction: 'ascending' }]
        });
        if (data.results && data.results.length > 0) {
            accounts = data.results.map(page => {
                const p = page.properties;
                const getTitle = (prop) => prop?.title?.[0]?.plain_text || '';
                const getNum = (prop) => prop?.number ?? 0;
                const getText = (prop) => prop?.rich_text?.[0]?.plain_text || '';
                const getSelect = (prop) => prop?.select?.name || '';
                return {
                    name: getTitle(p['Name']),
                    platform: getText(p['平台']),
                    category: getSelect(p['分類']),
                    currency: getSelect(p['幣別']) || 'TWD',
                    amount: getNum(p['金額']),
                    twdValue: getNum(p['台幣現值']),
                    rate: getNum(p['匯率']),
                    interestRate: getNum(p['利率']),
                    description: getText(p['說明']),
                    sortOrder: getNum(p['排序']),
                    pageId: page.id
                };
            }).filter(a => a.name);
            localStorage.setItem('accounts', JSON.stringify(accounts));
            if (!silent) showToast('Synced ' + accounts.length + ' accounts');
            console.log('[RayOS Direct] Accounts synced:', accounts.length);
        }
    } catch(e) {
        console.error('[RayOS] Accounts sync error:', e);
        if (!silent) showToast('帳戶同步失敗: ' + e.message, true);
    }
}

function toggleWealthForm() {
    const f = document.getElementById('wealth-form');
    const b = document.getElementById('wealth-form-toggle');
    if (f.style.display === 'none') { f.style.display = 'block'; b.innerHTML = '✕ Close'; renderWealthForm(); }
    else { f.style.display = 'none'; b.innerHTML = '📝 New Snapshot'; }
}

function renderWealthForm() {
    const f = document.getElementById('wealth-form');
    const g = {};
    accounts.forEach(a => { if (!g[a.category]) g[a.category] = []; g[a.category].push(a); });
    let h = `<div class="form-section"><div class="form-title">📅 Date</div><input type="date" class="form-input" id="wealth-date" value="${new Date().toISOString().split('T')[0]}" style="max-width:180px;"></div>`;
    Object.keys(g).forEach(cat => {
        const isDebt = cat === '債務';
        h += `<div class="form-section ${isDebt ? 'debt-section' : ''}"><div class="form-title">${CATEGORY_ICONS[cat] || ''} ${cat}</div><div class="account-grid">`;
        g[cat].forEach(a => {
            h += `<div class="account-row"><div><div class="account-name">${a.name}</div><div class="account-bank">${a.platform}</div></div><span style="font-size:10px;color:var(--text-muted);">${a.currency}</span><input type="number" class="form-input account-input" data-account="${a.name}" data-category="${a.category}" data-currency="${a.currency}" ${isDebt ? 'data-debt="true"' : ''} placeholder=""><span></span></div>`;
        });
        h += `</div><div class="category-total">Subtotal: <span id="subtotal-${cat}">0</span></div></div>`;
    });
    h += `<div class="form-section" style="background:var(--bg-elevated);border-color:var(--accent);"><div class="summary-grid" style="margin-bottom:0;"><div class="summary-item" style="background:transparent;border:none;"><div class="summary-label">Total Assets</div><div class="summary-value" id="total-assets">0</div></div><div class="summary-item" style="background:transparent;border:none;"><div class="summary-label">Total Debt</div><div class="summary-value negative" id="total-debt">0</div></div><div class="summary-item" style="background:transparent;border:none;"><div class="summary-label">Net Worth</div><div class="summary-value accent" id="net-worth">0</div></div></div></div><div class="form-actions" style="justify-content:center;"><button class="btn" onclick="toggleWealthForm()">Cancel</button><button class="btn btn-accent" onclick="saveWealthSnapshot()">💾 Save</button></div>`;
    f.innerHTML = h;
    document.querySelectorAll('.account-input').forEach(i => i.addEventListener('input', calculateWealth));
}

function calculateWealth() {
    const inputs = document.querySelectorAll('.account-input');
    const cats = {};
    let totalA = 0, totalD = 0;
    inputs.forEach(i => {
        const v = parseFloat(i.value) || 0;
        const cur = i.dataset.currency || 'TWD';
        const cat = i.dataset.category;
        const isDebt = i.dataset.debt === 'true';
        const twd = toTWD(v, cur);
        if (!cats[cat]) cats[cat] = 0;
        cats[cat] += twd;
        if (isDebt) totalD += twd; else totalA += twd;
    });
    Object.keys(cats).forEach(c => { const e = document.getElementById('subtotal-' + c); if (e) e.textContent = formatNumber(cats[c]); });
    document.getElementById('total-assets').textContent = formatNumber(totalA);
    document.getElementById('total-debt').textContent = formatNumber(totalD);
    document.getElementById('net-worth').textContent = formatNumber(totalA - totalD);
    return { totalAssets: totalA, totalDebt: totalD, netWorth: totalA - totalD, categories: cats };
}

async function saveWealthSnapshot() {
    const date = document.getElementById('wealth-date').value;
    const r = calculateWealth();
    const data = { date, ...r };
    // Calculate monthly growth
    if (wealthHistory.length > 0) {
        const prev = wealthHistory[wealthHistory.length - 1];
        if (prev.totalAssets > 0) {
            data.monthlyGrowth = ((data.totalAssets - prev.totalAssets) / prev.totalAssets) * 100;
        }
    }
    // Calculate yearly growth (compare to same month last year)
    const targetYear = parseInt(date.slice(0, 4)) - 1;
    const targetMonth = date.slice(5, 7);
    const lastYearRecord = wealthHistory.find(h => h.date && h.date.startsWith(targetYear + '-' + targetMonth));
    if (lastYearRecord && lastYearRecord.totalAssets > 0) {
        data.yearlyGrowth = ((data.totalAssets - lastYearRecord.totalAssets) / lastYearRecord.totalAssets) * 100;
    }
    wealthHistory.push(data);
    localStorage.setItem('wealth_history', JSON.stringify(wealthHistory));
    updateWealthDisplay();
    toggleWealthForm();
    // Sync to Notion (Direct → N8N fallback)
    const synced = await writeWealthToNotion(data);
    showToast(synced ? 'Saved & Synced' : 'Saved');
}

async function writeWealthToNotion(data) {
    // Try Notion Direct first
    if (hasNotionDirect()) {
        try {
            console.log('[RayOS] Writing wealth to Notion Direct');
            const cats = data.categories || {};
            const props = {
                'Date': { title: [{ text: { content: data.date } }] },
                'TotalAssets': { number: Math.round(data.totalAssets || 0) },
                'NetWorth': { number: Math.round(data.netWorth || 0) },
                'MonthlyGrowth': { number: data.monthlyGrowth ? data.monthlyGrowth / 100 : 0 },
                'YearlyGrowth': { number: data.yearlyGrowth ? data.yearlyGrowth / 100 : 0 },
                '備用金': { number: Math.round(cats['備用金'] || 0) },
                '活期存款': { number: Math.round(cats['活期存款'] || 0) },
                '股票ETF': { number: Math.round(cats['股票ETF'] || 0) },
                '加密貨幣': { number: Math.round(cats['加密貨幣'] || 0) },
                '外幣存款': { number: Math.round(cats['外幣存款'] || 0) },
                '債務': { number: Math.round(cats['債務'] || 0) },
                '定期存款': { number: Math.round(cats['定期存款'] || 0) }
            };
            if (data.notes) props['備註'] = { rich_text: [{ text: { content: data.notes } }] };
            const result = await notionFetch('/pages', 'POST', {
                parent: { database_id: WEALTH_DB_ID },
                properties: props
            });
            if (result.id) {
                wealthNotionIndex[data.date] = result.id;
                localStorage.setItem('wealth_notion_index', JSON.stringify(wealthNotionIndex));
            }
            console.log('[RayOS Direct] Wealth written:', data.date);
            return true;
        } catch(e) {
            console.warn('[RayOS] Notion Direct wealth write failed:', e.message);
        }
    }
    // Fallback: N8N
    const url = getN8nUrl();
    if (!url) return false;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'create_wealth',
                data: {
                    Date: data.date,
                    TotalAssets: Math.round(data.totalAssets || 0),
                    MonthlyGrowth: data.monthlyGrowth ? data.monthlyGrowth / 100 : 0,
                    categories: data.categories || {}
                }
            })
        });
        const result = await res.json();
        if (result.pageId) {
            wealthNotionIndex[data.date] = result.pageId;
            localStorage.setItem('wealth_notion_index', JSON.stringify(wealthNotionIndex));
        }
        return result.ok;
    } catch(e) { console.error('[RayOS] Wealth N8N sync error:', e); return false; }
}

function mapNotionWealthPage(page) {
    const p = page.properties || {};
    const getTitle = (prop) => prop?.title?.[0]?.plain_text || '';
    const getNum = (prop) => prop?.number ?? 0;
    const getText = (prop) => prop?.rich_text?.[0]?.plain_text || '';
    const date = getTitle(p['Date']);
    const mg = getNum(p['MonthlyGrowth']);
    const yg = getNum(p['YearlyGrowth']);
    return {
        date,
        totalAssets: getNum(p['TotalAssets']),
        netWorth: getNum(p['NetWorth']),
        monthlyGrowth: mg !== 0 ? mg * 100 : null,
        yearlyGrowth: yg !== 0 ? yg * 100 : null,
        notes: getText(p['備註']),
        categories: {
            '備用金': getNum(p['備用金']),
            '活期存款': getNum(p['活期存款']),
            '股票ETF': getNum(p['股票ETF']),
            '加密貨幣': getNum(p['加密貨幣']),
            '外幣存款': getNum(p['外幣存款']),
            '定期存款': getNum(p['定期存款']),
            '債務': getNum(p['債務']),
            '保險': getNum(p['保險']),
            '退休金': getNum(p['退休金']),
            'PropFirm': getNum(p['PropFirm'])
        },
        pageId: page.id
    };
}

async function syncWealthFromNotion(silent = false) {
    // Try Notion Direct first
    if (hasNotionDirect()) {
        if (!silent) showToast('正在同步 Wealth 資料...');
        try {
            console.log('[RayOS] Syncing wealth via Notion Direct');
            const data = await notionFetch('/databases/' + WEALTH_DB_ID + '/query', 'POST', {
                sorts: [{ property: 'Date', direction: 'ascending' }]
            });
            if (data.results && data.results.length > 0) {
                wealthNotionIndex = {};
                wealthHistory = data.results.map(page => {
                    const record = mapNotionWealthPage(page);
                    if (record.date) wealthNotionIndex[record.date] = page.id;
                    return record;
                }).filter(r => r.date);
                localStorage.setItem('wealth_notion_index', JSON.stringify(wealthNotionIndex));
                localStorage.setItem('wealth_history', JSON.stringify(wealthHistory));
                updateWealthDisplay();
                updateWealthSyncDot();
                if (!silent) showToast('Synced ' + wealthHistory.length + ' wealth records');
                console.log('[RayOS Direct] Wealth synced:', wealthHistory.length, 'records');
                return;
            }
        } catch(e) {
            console.warn('[RayOS] Notion Direct wealth sync failed, trying N8N:', e.message);
        }
    }
    // Fallback: N8N
    const url = getN8nUrl();
    if (!url) { if (!silent) showToast('請先在 Settings 設定 Notion Token 或 n8n URL', true); return; }
    if (!silent) showToast('正在同步 Wealth 資料...');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'fetch_wealth' })
        });
        if (!res.ok) throw new Error('n8n returned ' + res.status);
        const data = await res.json();
        if (data.records && data.records.length > 0) {
            wealthNotionIndex = data.pageIndex || {};
            localStorage.setItem('wealth_notion_index', JSON.stringify(wealthNotionIndex));
            wealthHistory = data.records.map(r => ({
                date: r.Date || r.date || '',
                totalAssets: r.TotalAssets || r.totalAssets || 0,
                totalDebt: r.totalDebt || 0,
                netWorth: r.netWorth || (r.TotalAssets || 0),
                monthlyGrowth: r.MonthlyGrowth != null ? r.MonthlyGrowth * 100 : null,
                yearlyGrowth: r.YearlyGrowth != null ? r.YearlyGrowth * 100 : null,
                categories: r.categories || {}
            })).filter(r => r.date).sort((a,b) => a.date.localeCompare(b.date));
            localStorage.setItem('wealth_history', JSON.stringify(wealthHistory));
            updateWealthDisplay();
            updateWealthSyncDot();
            if (!silent) showToast('Synced ' + wealthHistory.length + ' wealth records');
        } else {
            if (!silent) showToast('No wealth records found', true);
        }
    } catch(e) {
        console.error('[RayOS] Wealth sync error:', e);
        if (!silent) showToast('Wealth 同步失敗: ' + e.message, true);
    }
}

function updateWealthSyncDot() {
    const d = document.getElementById('wealth-sync-dot');
    if (d) d.className = 'sync-dot ' + (hasNotionDirect() || getN8nUrl() ? 'on' : 'off');
}

function updateWealthDisplay() {
    if (wealthHistory.length > 0) {
        const lat = wealthHistory[wealthHistory.length - 1];
        const total = lat.totalAssets || 0;
        document.getElementById('display-total').textContent = formatMoney(total);
        document.getElementById('stat-wealth').textContent = formatMoney(total);
        document.getElementById('display-lastdate').textContent = lat.date || '--';
        document.getElementById('goal-current').textContent = formatNumber(total);
        const pct = Math.min(100, (total / wealthGoal) * 100);
        document.getElementById('goal-bar').style.width = pct + '%';
        document.getElementById('goal-pct').textContent = pct.toFixed(1) + '%';
        document.getElementById('goal-remain').textContent = '還差 ' + formatMoney(Math.max(0, wealthGoal - total));
        if (lat.monthlyGrowth !== null && lat.monthlyGrowth !== undefined) {
            const mg = lat.monthlyGrowth;
            document.getElementById('display-monthly').textContent = (mg > 0 ? '+' : '') + mg.toFixed(2) + '%';
            document.getElementById('display-monthly').className = 'summary-value ' + (mg >= 0 ? 'positive' : 'negative');
        }
        if (lat.yearlyGrowth !== null && lat.yearlyGrowth !== undefined) {
            const yg = lat.yearlyGrowth;
            document.getElementById('display-yearly').textContent = (yg > 0 ? '+' : '') + yg.toFixed(2) + '%';
            document.getElementById('display-yearly').className = 'summary-value ' + (yg >= 0 ? 'positive' : 'negative');
        }
        updateWealthChart();
    }
    document.getElementById('wealth-ai-suggestion').innerHTML = '<strong>目標進度：</strong> ' + ((wealthHistory[wealthHistory.length-1]?.totalAssets || 0) / wealthGoal * 100).toFixed(1) + '%';
    // Auto-trigger AI analysis on wealth display update
    autoAnalyze('wealth');
}

