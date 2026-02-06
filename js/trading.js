// ==================== TRADING ====================

function setTradingTab(tab, btn) {
    document.querySelectorAll('#trading .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-algo').style.display = tab === 'algo' ? 'block' : 'none';
    document.getElementById('tab-propfirm').style.display = tab === 'propfirm' ? 'block' : 'none';
}

function updateTradingDisplay() {
    if (algoEquity.length > 0) {
        const latest = algoEquity[algoEquity.length - 1];
        document.getElementById('algo-cumret').textContent = latest.cumRet.toFixed(2) + '%';
        const wins = algoEquity.filter(e => e.dailyRet > 0).length;
        document.getElementById('algo-winrate').textContent = ((wins / algoEquity.length) * 100).toFixed(2) + '%';
    }
    updateAlgoChart();
    updateMonthlyReturnsTable();
    renderPropChallenges();
    document.getElementById('algo-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('prop-record-date').value = new Date().toISOString().split('T')[0];
    autoAnalyze('trading');
}

function updateAlgoChart() {
    const data = algoEquity.slice(-30);
    if (data.length === 0) return;
    algoChart.data.labels = data.map(d => d.date.slice(5));
    algoChart.data.datasets[0].data = data.map(d => d.cumRet);
    algoChart.update();
}

function updateMonthlyReturnsTable() {
    const tbody = document.getElementById('monthly-returns-body');
    let html = '';
    for (const [year, months] of Object.entries(MONTHLY_RETURNS)) {
        html += '<tr>';
        html += `<td><strong>${year}</strong></td>`;
        for (let m = 1; m <= 12; m++) {
            const val = months[m];
            if (val !== undefined) {
                const cls = val >= 0 ? 'positive' : 'negative';
                html += `<td class="${cls}">${val >= 0 ? '+' : ''}${val.toFixed(2)}%</td>`;
            } else { html += '<td>-</td>'; }
        }
        const ytdCls = months.ytd >= 0 ? 'positive' : 'negative';
        html += `<td class="${ytdCls}"><strong>${months.ytd >= 0 ? '+' : ''}${months.ytd.toFixed(2)}%</strong></td>`;
        html += '</tr>';
    }
    tbody.innerHTML = html;
}

function saveAlgoEquity() {
    const date = document.getElementById('algo-date').value;
    const equity = parseFloat(document.getElementById('algo-equity').value) || 0;
    const dailyRet = parseFloat(document.getElementById('algo-daily-ret').value) || 0;
    const cumRet = ((equity - 1000000) / 1000000 * 100);
    algoEquity.push({ date, equity, dailyRet, cumRet });
    try { localStorage.setItem('algo_equity', JSON.stringify(algoEquity)); } catch(e) {}
    updateTradingDisplay();
    document.getElementById('algo-equity').value = '';
    document.getElementById('algo-daily-ret').value = '';
    showToast('Equity saved');
}

function renderPropChallenges() {
    const container = document.getElementById('prop-challenges');
    if (propRecords.length === 0) {
        container.innerHTML = '<div class="card" style="grid-column:span 2;text-align:center;cursor:default;"><div style="color:var(--text-dim);">No records yet</div></div>';
        return;
    }
    const byFirm = {};
    propRecords.forEach(r => {
        if (!byFirm[r.firm]) byFirm[r.firm] = { fee: 0, payout: 0, count: 0 };
        byFirm[r.firm].fee += r.fee || 0;
        byFirm[r.firm].payout += r.payout || 0;
        byFirm[r.firm].count++;
    });
    container.innerHTML = Object.entries(byFirm).map(([firm, data]) => {
        const net = data.payout - data.fee;
        const netCls = net >= 0 ? 'positive' : 'negative';
        return `<div class="card" style="cursor:default;"><div style="font-weight:600;margin-bottom:8px;">${firm}</div><div style="font-size:11px;">Fee: <span class="negative">$${formatNumber(data.fee)}</span></div><div style="font-size:11px;">Payout: <span class="positive">$${formatNumber(data.payout)}</span></div><div style="font-size:13px;margin-top:4px;">Net: <span class="${netCls}">$${formatNumber(net)}</span></div></div>`;
    }).join('');
}

function savePropRecord() {
    const firm = document.getElementById('prop-firm').value;
    const fee = parseFloat(document.getElementById('prop-challenge-fee').value) || 0;
    const payout = parseFloat(document.getElementById('prop-payout-amount').value) || 0;
    const date = document.getElementById('prop-record-date').value;
    const status = document.getElementById('prop-status').value;
    propRecords.push({ firm, fee, payout, date, status });
    try { localStorage.setItem('prop_records', JSON.stringify(propRecords)); } catch(e) {}
    updateTradingDisplay();
    document.getElementById('prop-challenge-fee').value = '';
    document.getElementById('prop-payout-amount').value = '';
    showToast('Record added');
}

