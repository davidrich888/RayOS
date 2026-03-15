// ==================== TRADING ====================

const TRADING_SHEET_ID = '1ozBB17QMML4CmbtNfLEhm4Hu-ffpN3qTRawCa_tPHG4';

function setTradingTab(tab, btn) {
    document.querySelectorAll('#trading .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-algo').style.display = tab === 'algo' ? 'block' : 'none';
    document.getElementById('tab-propfirm').style.display = tab === 'propfirm' ? 'block' : 'none';
    document.getElementById('tab-shamewall').style.display = tab === 'shamewall' ? 'block' : 'none';
    // lazy-load iframe on first visit
    if (tab === 'shamewall') {
        const frame = document.getElementById('shamewall-frame');
        if (frame && frame.src === 'about:blank') {
            frame.src = frame.dataset.src;
        }
    }
}

// Fetch algo trading data from Google Sheets
async function fetchAlgoFromSheet() {
    const query = encodeURIComponent('select A,E,G,H,J,K where G is not null');
    const sheet = encodeURIComponent('Daily權益紀錄表');
    const url = `https://docs.google.com/spreadsheets/d/${TRADING_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheet}&tq=${query}`;

    try {
        const res = await fetch(url);
        const text = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/);
        if (!match) throw new Error('Invalid gviz response');
        const json = JSON.parse(match[1]);
        const rows = json.table.rows;

        const sheetData = [];
        rows.forEach(r => {
            const dateCell = r.c[0];
            if (!dateCell) return;
            const date = dateCell.f || '';
            const idxCumRet = (r.c[1]?.v || 0) * 100;
            const equity = r.c[2]?.v || 0;
            const dailyRet = (r.c[3]?.v || 0) * 100;
            const cumRet = (r.c[4]?.v || 0) * 100;
            const dd = (r.c[5]?.v || 0) * 100;
            sheetData.push({ date, equity, dailyRet, cumRet, dd, idxCumRet });
        });

        if (sheetData.length > 0) {
            algoEquity = sheetData;
            computeMonthlyReturnsFromData(sheetData);
            updateTradingDisplay();
            console.log(`[Trading] Loaded ${sheetData.length} rows from Google Sheet`);
        }
    } catch (e) {
        console.warn('[Trading] Sheet fetch failed, using preloaded data:', e.message);
    }
}

// Compute monthly returns by compounding daily returns
function computeMonthlyReturnsFromData(data) {
    const monthly = {};
    data.forEach(d => {
        if (!d.date) return;
        const parts = d.date.split('/');
        if (parts.length < 3) return;
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        if (!monthly[year]) monthly[year] = {};
        if (!monthly[year][month]) monthly[year][month] = [];
        monthly[year][month].push(d.dailyRet / 100);
    });

    const result = {};
    for (const [year, months] of Object.entries(monthly)) {
        result[year] = {};
        let ytdProduct = 1;
        for (let m = 1; m <= 12; m++) {
            if (months[m] && months[m].length > 0) {
                const product = months[m].reduce((acc, r) => acc * (1 + r), 1);
                result[year][m] = (product - 1) * 100;
                ytdProduct *= product;
            }
        }
        result[year].ytd = (ytdProduct - 1) * 100;
    }

    // Overwrite global MONTHLY_RETURNS
    Object.keys(MONTHLY_RETURNS).forEach(k => delete MONTHLY_RETURNS[k]);
    Object.assign(MONTHLY_RETURNS, result);
}

function parseTradingDate(dateStr) {
    const parts = dateStr.split('/');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

function updateTradingDisplay() {
    if (algoEquity.length > 0) {
        const latest = algoEquity[algoEquity.length - 1];

        // Cumulative return
        document.getElementById('algo-cumret').textContent = latest.cumRet.toFixed(2) + '%';

        // Win rate
        const wins = algoEquity.filter(e => e.dailyRet > 0).length;
        document.getElementById('algo-winrate').textContent = ((wins / algoEquity.length) * 100).toFixed(2) + '%';

        // MDD (max drawdown from sheet DD column)
        if (latest.dd !== undefined) {
            const maxDD = Math.max(...algoEquity.map(e => Math.abs(e.dd || 0)));
            const mddEl = document.getElementById('algo-mdd');
            if (mddEl) mddEl.textContent = maxDD.toFixed(2) + '%';
        }

        // Annualized return
        const first = algoEquity[0];
        const firstDate = parseTradingDate(first.date);
        const lastDate = parseTradingDate(latest.date);
        const years = (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000);
        if (years > 0) {
            const annualized = (Math.pow(1 + latest.cumRet / 100, 1 / years) - 1) * 100;
            const annEl = document.getElementById('algo-annual');
            if (annEl) annEl.textContent = annualized.toFixed(2) + '%';
        }
    }
    updateAlgoChart();
    updateMonthlyReturnsTable();
    renderPropChallenges();
    document.getElementById('algo-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('prop-record-date').value = new Date().toISOString().split('T')[0];
    autoAnalyze('trading');
}

function updateAlgoChart() {
    const data = algoEquity;
    if (data.length === 0) return;

    // Labels: show M/D format
    algoChart.data.labels = data.map(d => {
        const parts = d.date.split('/');
        return parts.length >= 3 ? parts[1] + '/' + parts[2] : d.date.slice(5);
    });

    // Dataset 0: 程式帳戶 cumulative return
    algoChart.data.datasets[0].data = data.map(d => d.cumRet);

    // Dataset 1: 加權指數 cumulative return (if available)
    if (data[0].idxCumRet !== undefined) {
        algoChart.data.datasets[1].data = data.map(d => d.idxCumRet);
    }

    algoChart.update();

    // DD chart
    if (typeof algoDDChart !== 'undefined' && data[0].dd !== undefined) {
        algoDDChart.data.labels = algoChart.data.labels;
        algoDDChart.data.datasets[0].data = data.map(d => d.dd || 0);
        algoDDChart.update();
    }
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
