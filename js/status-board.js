// ==================== STATUS BOARD ====================
// Unified project / workflow / task status tracker
// Data source: Notion "🎯 System Tracker" DB
// Read-only on frontend — updates happen via Claude Code /status-sync

const SYSTEM_TRACKER_DB_ID = '578f08b33c7a48efb4b681329762f6c8';

let systemTrackerData = [];
let statusBoardLoaded = false;
let statusFilterCategory = 'all';
let statusFilterArea = 'all';

async function loadStatusBoard(silent = false) {
    const statsEl = document.getElementById('sb-stats');
    if (!hasNotionDirect()) {
        if (statsEl) statsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-dim);font-size:12px;">請先在 Settings 設定 Notion Token</div>';
        return;
    }
    if (!silent && statsEl) statsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-dim);font-size:12px;">Loading...</div>';
    try {
        const data = await notionFetch('/databases/' + SYSTEM_TRACKER_DB_ID + '/query', 'POST', {
            page_size: 200,
            sorts: [
                { property: 'LastUpdated', direction: 'descending' }
            ]
        });
        systemTrackerData = (data.results || []).map(page => {
            const p = page.properties;
            return {
                id: page.id,
                title: p.Title?.title?.[0]?.plain_text || '',
                category: p.Category?.select?.name || '',
                status: p.Status?.select?.name || '',
                priority: p.Priority?.select?.name || '',
                area: p.Area?.select?.name || '',
                progress: p.Progress?.number || 0,
                nextStep: p.NextStep?.rich_text?.[0]?.plain_text || '',
                blocker: p.Blocker?.rich_text?.[0]?.plain_text || '',
                lastUpdated: p.LastUpdated?.date?.start || '',
                repoPath: p.RepoPath?.rich_text?.[0]?.plain_text || '',
                notes: p.Notes?.rich_text?.[0]?.plain_text || '',
                url: page.url
            };
        }).filter(it => it.title);
        statusBoardLoaded = true;
        populateFilterDropdowns();
        renderStatusBoard();
        if (!silent) showToast('✓ 已載入 ' + systemTrackerData.length + ' 項目');
    } catch (e) {
        console.error('[StatusBoard] Load error:', e);
        if (statsEl) statsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#f44336;font-size:12px;">載入失敗: ' + e.message + '</div>';
        if (!silent) showToast('載入失敗: ' + e.message, true);
    }
}

function populateFilterDropdowns() {
    const catSel = document.getElementById('sb-filter-category');
    const areaSel = document.getElementById('sb-filter-area');
    if (!catSel || !areaSel) return;
    // Only populate once
    if (catSel.options.length > 1) return;
    const cats = [...new Set(systemTrackerData.map(it => it.category).filter(Boolean))].sort();
    const areas = [...new Set(systemTrackerData.map(it => it.area).filter(Boolean))].sort();
    cats.forEach(c => catSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtmlSB(c)}">${escapeHtmlSB(c)}</option>`));
    areas.forEach(a => areaSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtmlSB(a)}">${escapeHtmlSB(a)}</option>`));
}

function renderStatusBoard() {
    const filtered = systemTrackerData.filter(it => {
        if (statusFilterCategory !== 'all' && it.category !== statusFilterCategory) return false;
        if (statusFilterArea !== 'all' && it.area !== statusFilterArea) return false;
        return true;
    });

    // Stats
    const stats = { total: filtered.length, done: 0, wip: 0, blocked: 0, backlog: 0, active: 0 };
    for (const it of filtered) {
        if (it.status === 'Done') stats.done++;
        else if (it.status === 'WIP') stats.wip++;
        else if (it.status === 'Blocked') stats.blocked++;
        else if (it.status === 'Backlog') stats.backlog++;
        else if (it.status === 'Active') stats.active++;
    }

    const statsEl = document.getElementById('sb-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="sb-stat"><div class="sb-stat-num">${stats.total}</div><div class="sb-stat-label">Total</div></div>
            <div class="sb-stat"><div class="sb-stat-num" style="color:#f44336;">${stats.blocked}</div><div class="sb-stat-label">Blocked</div></div>
            <div class="sb-stat"><div class="sb-stat-num" style="color:#FF9800;">${stats.wip}</div><div class="sb-stat-label">WIP</div></div>
            <div class="sb-stat"><div class="sb-stat-num" style="color:#9e9e9e;">${stats.backlog}</div><div class="sb-stat-label">Backlog</div></div>
            <div class="sb-stat"><div class="sb-stat-num" style="color:#2196F3;">${stats.active}</div><div class="sb-stat-label">Active</div></div>
            <div class="sb-stat"><div class="sb-stat-num" style="color:#4CAF50;">${stats.done}</div><div class="sb-stat-label">Done</div></div>
        `;
    }

    // Columns
    const priOrder = { 'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3, '': 4 };
    const byPri = (a, b) => (priOrder[a.priority] || 5) - (priOrder[b.priority] || 5);
    const byDateDesc = (a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || '');

    const wipCol = filtered.filter(it => ['WIP', 'Blocked'].includes(it.status)).sort((a, b) => {
        // Blocked first, then by priority
        if (a.status === 'Blocked' && b.status !== 'Blocked') return -1;
        if (b.status === 'Blocked' && a.status !== 'Blocked') return 1;
        return byPri(a, b);
    });
    const backlogCol = filtered.filter(it => it.status === 'Backlog').sort(byPri);
    const doneCol = filtered.filter(it => ['Done', 'Active'].includes(it.status)).sort(byDateDesc);

    const wipEl = document.getElementById('sb-col-wip');
    const backlogEl = document.getElementById('sb-col-backlog');
    const doneEl = document.getElementById('sb-col-done');
    if (wipEl) wipEl.innerHTML = wipCol.map(cardHtml).join('') || emptyColHtml();
    if (backlogEl) backlogEl.innerHTML = backlogCol.map(cardHtml).join('') || emptyColHtml();
    if (doneEl) doneEl.innerHTML = doneCol.map(cardHtml).join('') || emptyColHtml();

    const wipCountEl = document.getElementById('sb-wip-count');
    const backlogCountEl = document.getElementById('sb-backlog-count');
    const doneCountEl = document.getElementById('sb-done-count');
    if (wipCountEl) wipCountEl.textContent = wipCol.length;
    if (backlogCountEl) backlogCountEl.textContent = backlogCol.length;
    if (doneCountEl) doneCountEl.textContent = doneCol.length;
}

function cardHtml(it) {
    const statusColors = { 'Blocked': '#f44336', 'WIP': '#FF9800', 'Backlog': '#9e9e9e', 'Done': '#4CAF50', 'Active': '#2196F3', 'Archived': '#6b6b6b' };
    const priColors = { 'P0': '#f44336', 'P1': '#FF9800', 'P2': '#FFC107', 'P3': '#9e9e9e' };
    const border = statusColors[it.status] || '#6b6b6b';
    const priColor = priColors[it.priority] || '#9e9e9e';
    const nextLine = it.nextStep ? `<div class="sb-card-next">→ ${escapeHtmlSB(it.nextStep)}</div>` : '';
    const blockerLine = it.blocker ? `<div class="sb-card-blocker">🚫 ${escapeHtmlSB(it.blocker)}</div>` : '';
    const areaBadge = it.area ? `<span class="sb-badge">${escapeHtmlSB(it.area)}</span>` : '';
    const catBadge = it.category ? `<span class="sb-badge sb-badge-cat">${escapeHtmlSB(it.category)}</span>` : '';
    const prog = (it.progress > 0 && it.progress < 100) ? `<div class="sb-progress"><div class="sb-progress-fill" style="width:${it.progress}%;background:${border};"></div></div>` : '';
    const priBadge = it.priority ? `<span class="sb-pri" style="background:${priColor};">${escapeHtmlSB(it.priority)}</span>` : '';
    return `
        <div class="sb-card" style="border-left-color:${border};" onclick="openStatusCardDetail('${it.id}')">
            <div class="sb-card-title">${priBadge}<span style="flex:1;">${escapeHtmlSB(it.title)}</span></div>
            <div class="sb-card-meta">${catBadge}${areaBadge}</div>
            ${nextLine}
            ${blockerLine}
            ${prog}
        </div>
    `;
}

function emptyColHtml() {
    return '<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:11px;opacity:0.5;">No items</div>';
}

function escapeHtmlSB(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function applyStatusBoardFilter() {
    const catEl = document.getElementById('sb-filter-category');
    const areaEl = document.getElementById('sb-filter-area');
    if (catEl) statusFilterCategory = catEl.value;
    if (areaEl) statusFilterArea = areaEl.value;
    renderStatusBoard();
}

function openStatusCardDetail(id) {
    const it = systemTrackerData.find(x => x.id === id);
    if (!it) return;
    const modal = document.getElementById('sb-detail-modal');
    const body = document.getElementById('sb-detail-body');
    const title = document.getElementById('sb-detail-title');
    if (!modal || !body || !title) return;
    title.textContent = it.title;
    const rows = [
        ['Status', it.status],
        ['Priority', it.priority],
        ['Category', it.category],
        ['Area', it.area],
        ['Progress', it.progress + '%'],
        ['LastUpdated', it.lastUpdated],
        ['NextStep', it.nextStep],
        ['Blocker', it.blocker],
        ['RepoPath', it.repoPath],
        ['Notes', it.notes]
    ].filter(([_, v]) => v !== '' && v != null);
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:120px 1fr;gap:10px 16px;font-size:13px;line-height:1.6;">
            ${rows.map(([k, v]) => {
                const isBlocker = k === 'Blocker';
                const isPath = k === 'RepoPath';
                const color = isBlocker ? '#f44336' : 'var(--text)';
                const family = isPath ? 'font-family:monospace;font-size:12px;' : '';
                return `<div style="color:var(--text-dim);text-transform:uppercase;font-size:10px;letter-spacing:1px;padding-top:2px;">${k}</div><div style="${family}color:${color};">${escapeHtmlSB(v)}</div>`;
            }).join('')}
        </div>
        <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);text-align:right;">
            <a href="${it.url}" target="_blank" style="color:var(--accent);font-size:12px;text-decoration:none;">在 Notion 開啟 ↗</a>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeStatusCardDetail() {
    const modal = document.getElementById('sb-detail-modal');
    if (modal) modal.style.display = 'none';
}

function switchAgentsView(view) {
    document.querySelectorAll('.view-tab').forEach(t => {
        const isActive = t.dataset.view === view;
        t.classList.toggle('active', isActive);
        if (isActive) {
            t.style.background = 'var(--accent)';
            t.style.color = 'var(--bg)';
            t.style.fontWeight = '600';
        } else {
            t.style.background = 'transparent';
            t.style.color = 'var(--text-dim)';
            t.style.fontWeight = '500';
        }
    });
    const agentsEl = document.getElementById('agents-view');
    const boardEl = document.getElementById('status-board-view');
    if (agentsEl) agentsEl.style.display = view === 'agents' ? '' : 'none';
    if (boardEl) boardEl.style.display = view === 'status-board' ? '' : 'none';
    if (view === 'status-board' && !statusBoardLoaded) {
        loadStatusBoard();
    }
    if (view === 'agents') {
        loadThinkingAgents();
    }
}

// ── 思考型 Agent 卡片（DataOS agent_runs 心跳）──────────────────────────────
// Distinct from launchd cron: these agents detect work + draft content, then report in.
let thinkingAgentsLoaded = false;
const AGENT_LABELS = {
    churn_save: { name: '流失救援 Agent', desc: '偵測活躍下降學員 → 寫個人化挽留信草稿' },
    milestone: { name: '里程碑 Agent', desc: '偵測學員進度里程碑 → 寫鼓勵信草稿' },
    journal_to_tft: { name: '盤中日誌轉文 Agent', desc: '每天抓 TradeZella 盤中檢討 → 寫 TFT 做單解析貼文草稿' },
};

async function loadThinkingAgents() {
    const box = document.getElementById('thinking-agents');
    const countEl = document.getElementById('thinking-agents-count');
    if (!box) return;
    try {
        const r = await fetch('/api/agent-runs');
        const data = await r.json();
        const agents = (data && data.agents) || [];
        if (countEl) countEl.textContent = agents.length || '0';
        if (!agents.length) {
            box.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:14px;">還沒有任何 agent 跑過（agent_runs 是空的）。第一次 live run 後這裡就會亮起來。</div>';
            return;
        }
        const healthMap = {
            ok: { dot: '#4CAF50', label: '健康 ✓' },
            warn: { dot: '#FFB74D', label: '上次出錯 ⚠' },
            stale: { dot: '#FFB74D', label: '太久沒跑 ⚠' },
        };
        box.innerHTML = agents.map(a => {
            const meta = AGENT_LABELS[a.agent_name] || { name: a.agent_name, desc: '' };
            const h = healthMap[a.health] || healthMap.ok;
            const when = a.run_at ? new Date(a.run_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const segs = a.segment_counts && typeof a.segment_counts === 'object'
                ? Object.entries(a.segment_counts).map(([k, v]) => `${k} ${v}`).join(' · ') : '';
            return `<div style="padding:14px 16px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:10px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${h.dot};box-shadow:0 0 6px ${h.dot};"></span>
                    <span style="font-weight:600;color:var(--text);font-size:14px;">${meta.name}</span>
                </div>
                <div style="font-size:11px;color:var(--text-dim);line-height:1.5;margin-bottom:10px;">${meta.desc}</div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);">
                    <span>上次跑</span><span style="color:var(--text);">${when}</span></div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);margin-top:3px;">
                    <span>本次偵測</span><span style="color:var(--accent);">${a.found_count ?? 0} 人${a.sent_count ? `（已寄 ${a.sent_count}）` : ''}</span></div>
                ${segs ? `<div style="font-size:10px;color:var(--text-dim);margin-top:6px;">${segs}</div>` : ''}
                <div style="font-size:10px;color:${h.dot};margin-top:8px;">${h.label} · 累計跑 ${a.run_total} 次</div>
            </div>`;
        }).join('');
        thinkingAgentsLoaded = true;
    } catch (e) {
        box.innerHTML = `<div style="font-size:12px;color:#FFB74D;padding:14px;">讀取 agent_runs 失敗：${e.message}</div>`;
    }
}

// 自動化頁是預設可見，DOMContentLoaded 時若 agents-view 正顯示就先抓一次。
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('agents-view');
    if (el && el.style.display !== 'none') loadThinkingAgents();
});
