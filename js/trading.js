// ==================== TRADING ====================

const TRADING_SHEET_ID = '1ozBB17QMML4CmbtNfLEhm4Hu-ffpN3qTRawCa_tPHG4';

function setTradingTab(tab, btn) {
    document.querySelectorAll('#trading .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['algo', 'manual', 'propfirm', 'shamewall', 'goals'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.style.display = tab === t ? 'block' : 'none';
    });
    // lazy-load iframe on first visit
    if (tab === 'shamewall') {
        const frame = document.getElementById('shamewall-frame');
        if (frame && frame.src === 'about:blank') {
            frame.src = frame.dataset.src;
        }
    }
    // render manual chart on first visit
    if (tab === 'manual' && typeof updateManualChart === 'function') {
        updateManualChart();
    }
    // lazy-load goals on first visit
    if (tab === 'goals' && !goalsLoaded) {
        goalsLoaded = true;
        renderGoals();
        syncGoalsFromNotion(true);
    }
}

// Fetch algo trading data via Vercel API (proxies Google Sheets CSV)
async function fetchAlgoFromSheet() {
    try {
        const res = await fetch('/api/trading-data');
        const json = await res.json();
        if (!json.success || !json.data || json.data.length === 0) {
            throw new Error(json.error || 'No data');
        }

        algoEquity = json.data;
        if (json.manual && json.manual.length > 0) manualEquity = json.manual;
        computeMonthlyReturnsFromData(json.data);
        updateTradingDisplay();
        console.log(`[Trading] Loaded ${json.data.length} algo + ${(json.manual || []).length} manual rows`);
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
        monthly[year][month].push(d.dailyRet);
    });

    const result = {};
    for (const [year, months] of Object.entries(monthly)) {
        result[year] = {};
        let ytdProduct = 1;
        for (let m = 1; m <= 12; m++) {
            if (months[m] && months[m].length > 0) {
                const product = months[m].reduce((acc, r) => acc * (1 + r / 100), 1);
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
    const algoDateEl = document.getElementById('algo-date');
    if (algoDateEl) algoDateEl.value = new Date().toISOString().split('T')[0];
    document.getElementById('prop-record-date').value = new Date().toISOString().split('T')[0];
    if (typeof autoAnalyze === 'function') autoAnalyze('trading');
}

function updateAlgoChart() {
    const data = algoEquity;
    if (data.length === 0) return;

    // Labels: show M/D format (full history)
    algoChart.data.labels = data.map(d => {
        const parts = d.date.split('/');
        return parts.length >= 3 ? parts[1] + '/' + parts[2] : d.date.slice(5);
    });

    // Dataset 0: 程式帳戶 cumulative return
    algoChart.data.datasets[0].data = data.map(d => d.cumRet);

    // Dataset 1: 加權指數 cumulative return
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

function updateManualChart() {
    if (manualEquity.length === 0 || algoEquity.length === 0) return;

    const manualStartDate = manualEquity[0].date;
    const startIdx = algoEquity.findIndex(d => d.date >= manualStartDate);
    if (startIdx < 0) return;
    const chartData = algoEquity.slice(startIdx);

    const manualByDate = {};
    manualEquity.forEach(d => { manualByDate[d.date] = d.cumRet; });

    // Labels
    manualChart.data.labels = chartData.map(d => {
        const parts = d.date.split('/');
        return parts.length >= 3 ? parts[1] + '/' + parts[2] : d.date.slice(5);
    });

    // Dataset 0: 手單帳戶
    manualChart.data.datasets[0].data = chartData.map(d =>
        manualByDate[d.date] !== undefined ? manualByDate[d.date] : null
    );

    // Dataset 1: 加權指數（手單）rebased
    const baseEntry = algoEquity[startIdx];
    if (baseEntry && baseEntry.idxCumRet !== undefined) {
        const baseFactor = 1 + baseEntry.idxCumRet / 100;
        manualChart.data.datasets[1].data = chartData.map(d => {
            if (manualByDate[d.date] === undefined) return null;
            const cur = 1 + (d.idxCumRet || 0) / 100;
            return parseFloat(((cur / baseFactor - 1) * 100).toFixed(2));
        });
    }

    manualChart.update();

    // DD chart (negative values for visual)
    manualDDChart.data.labels = manualChart.data.labels;
    manualDDChart.data.datasets[0].data = chartData.map(d => {
        if (manualByDate[d.date] === undefined) return null;
        const entry = manualEquity.find(e => e.date === d.date);
        return entry ? -(entry.dd || 0) : null;
    });
    manualDDChart.update();

    // Update summary cards
    const last = manualEquity[manualEquity.length - 1];
    document.getElementById('manual-cumret').textContent = last.cumRet.toFixed(2) + '%';
    const cumEl = document.getElementById('manual-cumret');
    cumEl.className = 'summary-value ' + (last.cumRet >= 0 ? 'positive' : 'negative');

    const maxDD = Math.max(...manualEquity.map(d => d.dd || 0));
    const mddEl = document.getElementById('manual-mdd');
    mddEl.textContent = maxDD.toFixed(2) + '%';

    const winDays = manualEquity.filter(d => d.dailyRet > 0).length;
    const totalDays = manualEquity.filter(d => d.dailyRet !== 0).length;
    document.getElementById('manual-winrate').textContent = totalDays > 0 ? (winDays / totalDays * 100).toFixed(2) + '%' : '--';
    document.getElementById('manual-days').textContent = manualEquity.length;
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

// ==================== TRADING GOALS ====================

const GOALS_DB_ID = '33a629ef6a1381039350e8ac6b3466a8';
let tradingGoals = JSON.parse(localStorage.getItem('trading_goals') || '[]');
let goalsPageIndex = JSON.parse(localStorage.getItem('goals_page_index') || '{}');
let goalsLoaded = true;
let goalsSyncInProgress = false;
let _goalsSortable = null;

function saveGoalsToLocal() {
    localStorage.setItem('trading_goals', JSON.stringify(tradingGoals));
    localStorage.setItem('goals_page_index', JSON.stringify(goalsPageIndex));
}

// Custom sections support: each section = { label, count, amountEach, startNum }
function getSections(goal) {
    if (goal.sections && goal.sections.length > 0) return goal.sections;
    // Backward compat: generate from exams + 12 payouts
    const exams = goal.exams || 2;
    return [
        { label: '考試', count: exams, amountEach: 0, startNum: 1 },
        { label: '出金', count: 12, amountEach: goal.target || 0, startNum: 1 }
    ];
}

function getTotalMilestones(goal) {
    return getSections(goal).reduce((sum, s) => sum + s.count, 0);
}

// Ensure milestones array exists (migration for old goals)
function ensureMilestones(goal) {
    const total = getTotalMilestones(goal);
    if (!goal.milestones || goal.milestones.length !== total) {
        const old = goal.milestones || [];
        goal.milestones = new Array(total).fill(false);
        for (let i = 0; i < Math.min(old.length, total); i++) {
            goal.milestones[i] = old[i];
        }
    }
    if (!goal.order) goal.order = 0;
}

function getGoalProgress(goal) {
    ensureMilestones(goal);
    const done = goal.milestones.filter(Boolean).length;
    const total = goal.milestones.length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function renderGoals() {
    const activeContainer = document.getElementById('goals-active');
    const completedContainer = document.getElementById('goals-completed');
    if (!activeContainer || !completedContainer) return;

    const active = tradingGoals.filter(g => g.status === 'active').sort((a, b) => (a.order || 0) - (b.order || 0));
    const completed = tradingGoals.filter(g => g.status === 'completed');

    // Render active goals
    activeContainer.textContent = '';
    if (active.length === 0) {
        const hint = document.createElement('div');
        hint.style.cssText = 'color:var(--text-muted);font-size:13px;padding:12px 0;';
        hint.textContent = '還沒有進行中的目標';
        activeContainer.appendChild(hint);
    } else {
        active.forEach(g => activeContainer.appendChild(buildGoalCard(g, false)));
    }

    // Render completed goals
    completedContainer.textContent = '';
    if (completed.length === 0) {
        const hint = document.createElement('div');
        hint.style.cssText = 'color:var(--text-muted);font-size:13px;padding:12px 0;';
        hint.textContent = '還沒有已完成的目標';
        completedContainer.appendChild(hint);
    } else {
        completed.forEach(g => completedContainer.appendChild(buildGoalCard(g, true)));
    }

    // SortableJS for active goals
    if (_goalsSortable) _goalsSortable.destroy();
    if (typeof Sortable !== 'undefined' && active.length > 1) {
        _goalsSortable = new Sortable(activeContainer, {
            animation: 150,
            delay: 200,
            delayOnTouchOnly: false,
            ghostClass: 'goal-card-ghost',
            handle: '.goal-drag-handle',
            onEnd: async function () {
                const cards = activeContainer.querySelectorAll('.goal-card');
                cards.forEach((card, i) => {
                    const id = card.dataset.goalId;
                    const item = tradingGoals.find(g => g.id === id);
                    if (item) item.order = i + 1;
                });
                saveGoalsToLocal();
                showToast('✓ 順序已更新');
                await syncGoalOrder();
            }
        });
    }
}

function formatMoney(n) {
    return '$' + n.toLocaleString('en-US');
}

function buildGoalCard(goal, isCompleted) {
    ensureMilestones(goal);
    const { done, total, pct } = getGoalProgress(goal);
    const exams = goal.exams || 2;
    const payoutAmt = goal.target || 0;

    const card = document.createElement('div');
    card.className = isCompleted ? 'goal-card completed' : 'goal-card';
    card.dataset.goalId = goal.id;

    // Header: drag handle + title + actions
    const header = document.createElement('div');
    header.className = 'goal-card-header';

    if (!isCompleted) {
        const drag = document.createElement('div');
        drag.className = 'goal-drag-handle';
        drag.textContent = '⠿';
        drag.title = '拖曳排序';
        header.appendChild(drag);
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'goal-card-title';
    titleEl.textContent = goal.title;
    header.appendChild(titleEl);

    const actions = document.createElement('div');
    actions.className = 'goal-card-actions';
    if (isCompleted) {
        const reBtn = document.createElement('button');
        reBtn.textContent = '↩';
        reBtn.title = '重新啟用';
        reBtn.addEventListener('click', () => reactivateGoal(goal.id));
        actions.appendChild(reBtn);
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'goal-btn-delete';
    delBtn.textContent = '✕';
    delBtn.title = '刪除';
    delBtn.addEventListener('click', () => deleteGoal(goal.id));
    actions.appendChild(delBtn);
    header.appendChild(actions);
    card.appendChild(header);

    // Progress bar
    const progressRow = document.createElement('div');
    progressRow.className = 'goal-progress-row';
    const bar = document.createElement('div');
    bar.className = 'goal-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'goal-progress-fill' + (pct >= 100 ? ' complete' : '');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    progressRow.appendChild(bar);
    const pctEl = document.createElement('div');
    pctEl.className = 'goal-progress-pct' + (pct >= 100 ? ' complete' : '');
    pctEl.textContent = pct + '%';
    progressRow.appendChild(pctEl);
    card.appendChild(progressRow);

    // Milestones grid
    const grid = document.createElement('div');
    grid.className = 'goal-milestones';

    // Render milestones by sections
    const sections = getSections(goal);
    let msIdx = 0;
    sections.forEach(section => {
        for (let i = 0; i < section.count; i++) {
            const idx = msIdx++;
            const ms = document.createElement('div');
            ms.className = 'goal-ms' + (goal.milestones[idx] ? ' checked' : '');
            ms.addEventListener('click', () => toggleMilestone(goal.id, idx));
            const check = document.createElement('span');
            check.className = 'goal-ms-check';
            check.textContent = goal.milestones[idx] ? '✓' : '';
            ms.appendChild(check);
            const label = document.createElement('span');
            label.className = 'goal-ms-label';
            const num = (section.startNum || 1) + i;
            if (section.count === 1) {
                label.textContent = section.label;
            } else if (section.amountEach > 0) {
                label.textContent = section.label + ' ×' + num;
            } else {
                label.textContent = section.label + ' ' + num;
            }
            ms.appendChild(label);
            if (section.amountEach > 0) {
                const amt = document.createElement('span');
                amt.className = 'goal-ms-amt';
                amt.textContent = formatMoney(section.amountEach * num);
                ms.appendChild(amt);
            }
            grid.appendChild(ms);
        }
    });

    card.appendChild(grid);

    // Meta info
    const meta = document.createElement('div');
    meta.className = 'goal-meta';
    const progressText = document.createElement('span');
    progressText.textContent = done + ' / ' + total + ' 完成';
    meta.appendChild(progressText);
    const dateText = document.createElement('span');
    let dateStr = goal.createdDate ? goal.createdDate.substring(0, 10) : '';
    if (goal.completedDate) dateStr += ' · 完成於 ' + goal.completedDate.substring(0, 10);
    dateText.textContent = dateStr;
    meta.appendChild(dateText);
    card.appendChild(meta);

    return card;
}

// === Milestone Toggle ===

async function toggleMilestone(goalId, idx) {
    const goal = tradingGoals.find(g => g.id === goalId);
    if (!goal) return;
    ensureMilestones(goal);
    goal.milestones[idx] = !goal.milestones[idx];

    // Update current count
    const { done, total } = getGoalProgress(goal);
    goal.current = done;

    // Auto-complete if all done
    if (done === total && goal.status === 'active') {
        goal.status = 'completed';
        goal.completedDate = new Date().toISOString().substring(0, 10);
        showToast('🎉 全部目標達成！');
    } else if (done < total && goal.status === 'completed') {
        goal.status = 'active';
        goal.completedDate = null;
    }

    saveGoalsToLocal();
    renderGoals();
    await updateGoalInNotion(goalId, {
        current: goal.current,
        status: goal.status,
        completedDate: goal.completedDate,
        milestones: goal.milestones
    });
}

// === CRUD ===

async function addGoal() {
    const titleEl = document.getElementById('tg-title');
    const payoutEl = document.getElementById('tg-payout');
    const examsEl = document.getElementById('tg-exams');
    const title = titleEl.value.trim();
    const payoutAmt = parseInt(payoutEl.value) || 0;
    const exams = Math.max(1, Math.min(3, parseInt(examsEl.value) || 2));

    if (!title) { showToast('請輸入目標名稱', true); return; }
    if (payoutAmt <= 0) { showToast('單次出金金額必須大於 0', true); return; }

    const total = exams + 12;
    const now = new Date().toISOString().substring(0, 10);
    const goal = {
        id: 'goal_' + Date.now(),
        title,
        target: payoutAmt,
        current: 0,
        exams,
        milestones: new Array(total).fill(false),
        order: tradingGoals.filter(g => g.status === 'active').length + 1,
        status: 'active',
        createdDate: now,
        completedDate: null
    };

    tradingGoals.push(goal);
    saveGoalsToLocal();
    renderGoals();
    titleEl.value = '';
    payoutEl.value = '';
    examsEl.value = '2';
    showToast('✓ 目標已新增');
    await createGoalInNotion(goal);
}

async function reactivateGoal(id) {
    const goal = tradingGoals.find(g => g.id === id);
    if (!goal) return;
    goal.status = 'active';
    goal.completedDate = null;
    saveGoalsToLocal();
    renderGoals();
    showToast('✓ 目標已重新啟用');
    await updateGoalInNotion(id, { status: 'active', completedDate: null });
}

async function deleteGoal(id) {
    if (!confirm('確定刪除這個目標？')) return;
    tradingGoals = tradingGoals.filter(g => g.id !== id);
    saveGoalsToLocal();
    renderGoals();
    showToast('✓ 已刪除');

    const pageId = goalsPageIndex[id];
    if (pageId && hasNotionDirect()) {
        try {
            await notionFetch('/pages/' + pageId, 'PATCH', { archived: true });
        } catch (e) {
            console.error('[Goals] Delete from Notion failed:', e);
        }
    }
    delete goalsPageIndex[id];
    saveGoalsToLocal();
}

// === Drag Reorder ===

async function syncGoalOrder() {
    if (!hasNotionDirect()) return;
    const active = tradingGoals.filter(g => g.status === 'active');
    const updates = active.map(g => {
        const pageId = goalsPageIndex[g.id];
        if (!pageId) return Promise.resolve();
        return notionFetch('/pages/' + pageId, 'PATCH', {
            properties: { 'Order': { number: g.order } }
        }).catch(e => console.error('[Goals] Order sync failed:', g.id, e));
    });
    await Promise.all(updates);
}

// === Notion Sync ===

async function syncGoalsFromNotion(silent = false) {
    if (!hasNotionDirect()) return;
    if (goalsSyncInProgress) return;
    goalsSyncInProgress = true;
    if (!silent) showToast('正在從 Notion 同步目標...');

    try {
        const data = await notionFetch('/databases/' + GOALS_DB_ID + '/query', 'POST', {
            page_size: 100,
            sorts: [{ property: 'Order', direction: 'ascending' }]
        });

        const newGoals = [];
        const newIndex = {};

        for (const page of data.results) {
            if (page.archived) continue;
            const props = page.properties;
            const titleArr = props['Title']?.title;
            if (!titleArr || !titleArr[0]) continue;

            const title = titleArr[0].plain_text;
            const target = props['Target']?.number || 0;
            const current = props['Current']?.number || 0;
            const exams = props['Exams']?.number || 2;
            const status = props['Status']?.select?.name || 'active';
            const createdDate = props['CreatedDate']?.date?.start || null;
            const completedDate = props['CompletedDate']?.date?.start || null;
            const order = props['Order']?.number || 0;

            // Parse milestones from rich_text JSON (supports sections format)
            let milestones = null;
            let sections = null;
            const msText = props['Milestones']?.rich_text?.map(r => r.plain_text).join('') || '';
            if (msText) {
                try {
                    const parsed = JSON.parse(msText);
                    if (Array.isArray(parsed)) {
                        milestones = parsed;
                    } else if (parsed && parsed.values) {
                        milestones = parsed.values;
                        sections = parsed.sections;
                    }
                } catch (e) {}
            }
            const expectedTotal = sections
                ? sections.reduce((sum, s) => sum + s.count, 0)
                : exams + 12;
            if (!milestones || milestones.length !== expectedTotal) {
                milestones = new Array(expectedTotal).fill(false);
            }

            const id = 'goal_' + page.id.replace(/-/g, '');
            newIndex[id] = page.id;
            newGoals.push({ id, title, target, current, exams, milestones, sections, order, status, createdDate, completedDate });
        }

        tradingGoals = newGoals;
        goalsPageIndex = newIndex;
        saveGoalsToLocal();
        renderGoals();

        if (!silent) showToast('✓ 已同步 ' + newGoals.length + ' 個目標');
    } catch (e) {
        console.error('[Goals] Sync error:', e);
        if (!silent) showToast('目標同步失敗: ' + e.message, true);
    } finally {
        goalsSyncInProgress = false;
    }
}

async function createGoalInNotion(goal) {
    if (!hasNotionDirect()) return;
    try {
        const props = {
            'Title': { title: [{ text: { content: goal.title } }] },
            'Target': { number: goal.target },
            'Current': { number: goal.current },
            'Exams': { number: goal.exams },
            'Milestones': { rich_text: [{ text: { content: JSON.stringify(goal.sections ? { sections: goal.sections, values: goal.milestones } : goal.milestones) } }] },
            'Order': { number: goal.order || 0 },
            'Status': { select: { name: goal.status } },
            'CreatedDate': { date: { start: goal.createdDate } }
        };
        const result = await notionFetch('/pages', 'POST', {
            parent: { database_id: GOALS_DB_ID },
            properties: props
        });
        if (result?.id) {
            goalsPageIndex[goal.id] = result.id;
            saveGoalsToLocal();
            console.log('[Goals] Created in Notion:', result.id);
        }
    } catch (e) {
        console.error('[Goals] Create in Notion failed:', e);
    }
}

async function updateGoalInNotion(id, updates) {
    if (!hasNotionDirect()) return;
    const pageId = goalsPageIndex[id];
    if (!pageId) return;
    try {
        const props = {};
        if (updates.current !== undefined) props['Current'] = { number: updates.current };
        if (updates.status) props['Status'] = { select: { name: updates.status } };
        if (updates.completedDate) props['CompletedDate'] = { date: { start: updates.completedDate } };
        if (updates.completedDate === null) props['CompletedDate'] = { date: null };
        if (updates.milestones) {
            const goal = tradingGoals.find(g => g.id === id);
            const msData = goal && goal.sections
                ? { sections: goal.sections, values: updates.milestones }
                : updates.milestones;
            props['Milestones'] = { rich_text: [{ text: { content: JSON.stringify(msData) } }] };
        }
        await notionFetch('/pages/' + pageId, 'PATCH', { properties: props });
        console.log('[Goals] Updated in Notion:', pageId);
    } catch (e) {
        console.error('[Goals] Update in Notion failed:', e);
    }
}
