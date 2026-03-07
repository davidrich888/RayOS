// ==================== CONTENT DASHBOARD ====================
// Reads from Notion Ideas DB (filtered by 📹/📝) + Content Log DB

let contentIdeas = [];
let contentLog = [];
let contentTab = 'inspiration';
let contentPillarFilter = 'all';

const CONTENT_LOG_DB_ID = '60354141f1fe4f858b065f0101a72e89';

// Weekly targets per platform
const WEEKLY_TARGETS = {
    'YouTube': 1,
    'IG Reels': 7,
    'IG 輪播': 2,
    'Skool': 2,
    'Email': 1
};

// === Sync Ideas (filtered for content: 📹 影片點子 + 📝 內容點子) ===
async function syncContentIdeasFromNotion(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }
    if (!silent) showToast('正在載入靈感池...');
    try {
        const data = await notionFetch('/databases/' + IDEAS_DB_ID + '/query', 'POST', {
            page_size: 100,
            filter: {
                or: [
                    { property: '類型', select: { equals: '📹 影片點子' } },
                    { property: '類型', select: { equals: '📝 內容點子' } }
                ]
            },
            sorts: [{ property: '建立日期', direction: 'descending' }]
        });
        if (data.results) {
            contentIdeas = data.results.map(page => {
                const p = page.properties;
                return {
                    id: page.id,
                    text: p['想法']?.title?.[0]?.plain_text || '',
                    type: p['類型']?.select?.name || '',
                    status: p['狀態']?.select?.name || '💡 新想法',
                    priority: p['優先度']?.select?.name || '⭐ 中',
                    pillar: p['支柱']?.select?.name || '',
                    hookType: p['Hook 類型']?.select?.name || '',
                    interest: p['興趣度']?.select?.name || '',
                    date: p['建立日期']?.date?.start || '',
                    notes: p['備註']?.rich_text?.[0]?.plain_text || ''
                };
            }).filter(i => i.text);
            console.log('[RayOS Content] Ideas loaded:', contentIdeas.length);
            if (!silent) showToast('✓ 靈感池 ' + contentIdeas.length + ' 個');
        }
        renderContentSection();
    } catch (e) {
        console.error('[RayOS Content] Ideas load error:', e);
        if (!silent) showToast('靈感池載入失敗: ' + e.message, true);
    }
}

// === Sync Content Log ===
async function syncContentLogFromNotion(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }
    if (!silent) showToast('正在載入產出記錄...');
    try {
        const data = await notionFetch('/databases/' + CONTENT_LOG_DB_ID + '/query', 'POST', {
            page_size: 100,
            sorts: [{ property: '日期', direction: 'descending' }]
        });
        if (data.results) {
            contentLog = data.results.map(page => {
                const p = page.properties;
                return {
                    id: page.id,
                    title: p['標題']?.title?.[0]?.plain_text || '',
                    date: p['日期']?.date?.start || '',
                    platform: p['平台']?.select?.name || '',
                    pillar: p['支柱']?.select?.name || '',
                    hookType: p['Hook 類型']?.select?.name || '',
                    status: p['狀態']?.select?.name || '草稿',
                    source: p['指令來源']?.select?.name || '',
                    notes: p['備註']?.rich_text?.[0]?.plain_text || ''
                };
            }).filter(i => i.title);
            console.log('[RayOS Content] Log loaded:', contentLog.length);
            if (!silent) showToast('✓ 產出記錄 ' + contentLog.length + ' 筆');
        }
        renderContentSection();
    } catch (e) {
        console.error('[RayOS Content] Log load error:', e);
        if (!silent) showToast('產出記錄載入失敗: ' + e.message, true);
    }
}

// === Sync both ===
async function syncContentFromNotion(silent = false) {
    await Promise.all([
        syncContentIdeasFromNotion(silent),
        syncContentLogFromNotion(silent)
    ]);
}

// === Render main entry ===
function renderContentSection() {
    renderWeeklyProgress();
    if (contentTab === 'inspiration') {
        renderInspirationPool();
    } else {
        renderProductionLog();
    }
    updateContentStats();
}

// === Weekly Progress (5 platform boxes) ===
function renderWeeklyProgress() {
    const el = document.getElementById('content-weekly-progress');
    if (!el) return;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const thisWeek = contentLog.filter(c => c.date >= weekStartStr);
    const platformCounts = {};
    thisWeek.forEach(c => {
        platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
    });

    const platforms = [
        { key: 'YouTube', icon: '🎬', label: 'YT' },
        { key: 'IG Reels', icon: '📱', label: 'Reels' },
        { key: 'IG 輪播', icon: '🎠', label: '輪播' },
        { key: 'Skool', icon: '💬', label: 'Skool' },
        { key: 'Email', icon: '📧', label: 'Email' }
    ];

    const totalDone = Object.keys(WEEKLY_TARGETS).reduce((s, k) => s + (platformCounts[k] || 0), 0);
    const totalTarget = Object.values(WEEKLY_TARGETS).reduce((s, v) => s + v, 0);

    el.innerHTML = `<div class="content-progress-bar">` +
        platforms.map(p => {
            const count = platformCounts[p.key] || 0;
            const target = WEEKLY_TARGETS[p.key];
            const done = count >= target;
            return `<div class="content-progress-item${done ? ' done' : ''}" title="${p.key}: ${count}/${target}">
                <span class="content-progress-icon">${p.icon}</span>
                <span class="content-progress-label">${p.label}</span>
                <span class="content-progress-count">${count}/${target}</span>
            </div>`;
        }).join('<span class="content-progress-sep">·</span>') +
        `</div>
        <div class="content-progress-total">${totalDone}/${totalTarget}</div>`;
}

// === Tab switching ===
function setContentTab(tab) {
    contentTab = tab;
    document.querySelectorAll('.content-tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.content-tab-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    renderContentSection();
}

// === Pillar filter ===
function setContentPillarFilter(pillar) {
    contentPillarFilter = pillar;
    document.querySelectorAll('.content-pillar-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.content-pillar-btn[data-pillar="${pillar}"]`);
    if (btn) btn.classList.add('active');
    renderContentSection();
}

// === Inspiration Pool ===
function renderInspirationPool() {
    const container = document.getElementById('content-list');
    if (!container) return;

    let filtered = contentIdeas;
    if (contentPillarFilter !== 'all') {
        filtered = filtered.filter(i => i.pillar === contentPillarFilter);
    }

    document.getElementById('content-filters').style.display = '';
    document.getElementById('content-production-area').style.display = 'none';

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">靈感池是空的。跑 <code>/ideas</code> 來填充！</div>';
        return;
    }

    // Sort by interest (more stars first)
    filtered.sort((a, b) => (b.interest || '').length - (a.interest || '').length);

    container.innerHTML = filtered.map(idea => {
        const interestStars = idea.interest || '';
        const statusOptions = ['💡 新想法', '🚀 執行中', '✅ 已完成', '📌 保留', '🏁 已做過', '❌ 放棄'].map(s =>
            `<option value="${s}" ${s === idea.status ? 'selected' : ''}>${s}</option>`
        ).join('');
        const strikethrough = (idea.status === '❌ 放棄' || idea.status === '🏁 已做過');
        return `<div class="content-idea-card"${strikethrough ? ' style="opacity:0.5"' : ''}>
            <div class="content-idea-stars">${interestStars || '—'}</div>
            <div class="content-idea-body">
                <div class="content-idea-text"${strikethrough ? ' style="text-decoration:line-through"' : ''}>${idea.text}</div>
                <div class="content-idea-meta">
                    ${idea.pillar ? `<span class="content-tag pillar">${idea.pillar}</span>` : ''}
                    ${idea.hookType ? `<span class="content-tag hook">${idea.hookType}</span>` : ''}
                    <span class="content-tag status">${idea.status}</span>
                    ${idea.date ? `<span class="content-tag date">${idea.date}</span>` : ''}
                </div>
                ${idea.notes ? `<div class="content-idea-notes">${idea.notes}</div>` : ''}
            </div>
            <select class="form-input content-idea-select" onchange="updateContentIdeaStatus('${idea.id}',this.value)">${statusOptions}</select>
        </div>`;
    }).join('');
}

// === Production Log ===
function renderProductionLog() {
    const container = document.getElementById('content-list');
    if (!container) return;

    document.getElementById('content-filters').style.display = 'none';
    document.getElementById('content-production-area').style.display = '';

    // Recent 7 days
    const recent = contentLog.slice(0, 20);

    const recentEl = document.getElementById('content-recent-list');
    if (recentEl) {
        if (recent.length === 0) {
            recentEl.innerHTML = '<div style="color:var(--text-muted);padding:12px;">尚無記錄。用 /waterfall 或 /ig-post 開始產出！</div>';
        } else {
            recentEl.innerHTML = recent.map(c => {
                const platformIcon = { 'YouTube': '🎬', 'IG Reels': '📱', 'IG 輪播': '🎠', 'Skool': '💬', 'Email': '📧' }[c.platform] || '📄';
                const statusColor = { '草稿': 'var(--text-muted)', '待審': '#e6a817', '已核': '#4a7c59', '已發布': 'var(--accent)' }[c.status] || 'var(--text-dim)';
                return `<div class="content-log-item">
                    <span class="content-log-icon">${platformIcon}</span>
                    <div class="content-log-info">
                        <div class="content-log-title">${c.title}</div>
                        <div class="content-log-meta">${c.date} · ${c.platform}${c.pillar ? ' · ' + c.pillar : ''}</div>
                    </div>
                    <span class="content-log-status" style="color:${statusColor}">${c.status}</span>
                </div>`;
            }).join('');
        }
    }

    // Pillar chart
    renderPillarChart();

    // Clear main list
    container.innerHTML = '';
}

// === Pillar Chart (pie) ===
function renderPillarChart() {
    const ctx = document.getElementById('pillarChart');
    if (!ctx) return;

    const pillarCounts = {};
    contentLog.forEach(c => {
        if (c.pillar) pillarCounts[c.pillar] = (pillarCounts[c.pillar] || 0) + 1;
    });

    const labels = Object.keys(pillarCounts);
    const data = Object.values(pillarCounts);
    const colors = {
        'Prop Firm 實戰': '#e63946',
        '程式交易': '#457b9d',
        '交易心態': '#e6a817',
        'AI 自動化': '#7b2d8e',
        '個人成長': '#4a7c59'
    };
    const bgColors = labels.map(l => colors[l] || '#6b6b6b');

    if (window._pillarChart) {
        window._pillarChart.data.labels = labels;
        window._pillarChart.data.datasets[0].data = data;
        window._pillarChart.data.datasets[0].backgroundColor = bgColors;
        window._pillarChart.update();
    } else if (labels.length > 0) {
        window._pillarChart = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: bgColors, borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#6b6b6b', font: { size: 11 } } },
                    datalabels: { display: false }
                }
            }
        });
    } else {
        // Empty state
        const ctxEl = ctx.getContext('2d');
        ctxEl.clearRect(0, 0, ctx.width, ctx.height);
        ctxEl.fillStyle = '#3a3a3a';
        ctxEl.font = '12px Inter';
        ctxEl.textAlign = 'center';
        ctxEl.fillText('尚無資料', ctx.width / 2, ctx.height / 2);
    }
}

// === Update idea status ===
async function updateContentIdeaStatus(ideaId, newStatus) {
    const idea = contentIdeas.find(i => i.id === ideaId);
    if (!idea) return;
    idea.status = newStatus;
    renderInspirationPool();

    // Also update in main ideasData if loaded
    const mainIdea = ideasData.find(i => i.id === ideaId);
    if (mainIdea) mainIdea.status = newStatus;

    if (!hasNotionDirect()) return;
    try {
        await notionFetch('/pages/' + ideaId, 'PATCH', {
            properties: { '狀態': { select: { name: newStatus } } }
        });
    } catch (e) {
        showToast('狀態更新失敗: ' + e.message, true);
    }
}

// === Dashboard stat box ===
function updateContentStats() {
    const el = document.getElementById('stat-content');
    if (!el) return;

    // Count this week's output
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const thisWeekCount = contentLog.filter(c => c.date >= weekStartStr).length;
    const totalTarget = Object.values(WEEKLY_TARGETS).reduce((a, b) => a + b, 0);
    el.textContent = thisWeekCount + '/' + totalTarget;
}

// === Content sync dot ===
function updateContentSyncDot() {
    const d = document.getElementById('content-sync-dot');
    if (d) d.className = 'sync-dot ' + (hasNotionDirect() ? 'on' : 'off');
}
