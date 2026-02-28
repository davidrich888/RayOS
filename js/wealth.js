// ==================== WEALTH ====================

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
    accounts.forEach(a => { if (!g[a.category]) g[a.category] = []; g[a.category].push(a); });
    let h = '';
    Object.keys(g).forEach(cat => {
        h += `<div style="margin-bottom:12px;"><div style="font-size:11px;color:var(--accent);margin-bottom:6px;">${CATEGORY_ICONS[cat] || ''} ${cat}</div>`;
        g[cat].forEach(a => {
            const amtDisplay = a.amount ? ` — ${a.currency} ${formatNumber(a.amount)}` : '';
            h += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;"><span>${a.name} (${a.platform})${amtDisplay}</span></div>`;
        });
        h += '</div>';
    });
    if (!h) h = '<div style="text-align:center;padding:20px;color:var(--text-muted);">No accounts synced yet</div>';
    c.innerHTML = h;
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
    const aiSuggestion = document.getElementById('wealth-ai-suggestion');
    if (aiSuggestion) aiSuggestion.innerHTML = '<strong>目標進度：</strong> ' + ((wealthHistory[wealthHistory.length-1]?.totalAssets || 0) / wealthGoal * 100).toFixed(1) + '%';
    if (typeof autoAnalyze === 'function') autoAnalyze('wealth');
}
