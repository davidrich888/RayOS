// ==================== CONTENT DASHBOARD ====================
// Reads from Notion Ideas DB (filtered by 📹/📝) + Content Log DB

let contentIdeas = [];
let contentLog = [];
let contentTab = 'inspiration';
let contentPillarFilter = 'all';
let contentStatusFilter = 'all';
let igScripts = [];
let igScriptFilter = 'all';

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
            sorts: [{ property: '建立日期', direction: 'descending' }]
        });
        if (data.results) {
            contentIdeas = data.results.map(page => {
                const p = page.properties;
                return {
                    id: page.id,
                    text: p['主題']?.title?.[0]?.plain_text || '',
                    type: p['來源']?.select?.name || '',
                    status: p['狀態']?.select?.name || '💡 新想法',
                    priority: p['優先級']?.select?.name || '⭐ 中',
                    pillar: p['支柱']?.select?.name || '',
                    hookType: '',
                    interest: '',
                    date: p['建立日期']?.created_time || '',
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
    // Hide all tab areas first
    const ytArea = document.getElementById('content-ytstudio-area');
    const igArea = document.getElementById('content-igscripts-area');
    if (ytArea) ytArea.style.display = 'none';
    if (igArea) igArea.style.display = 'none';

    if (contentTab === 'ytstudio') {
        document.getElementById('content-status-filters').style.display = 'none';
        document.getElementById('content-filters').style.display = 'none';
        document.getElementById('content-production-area').style.display = 'none';
        document.getElementById('content-list').style.display = 'none';
        if (ytArea) ytArea.style.display = '';
        if (typeof renderYTStudio === 'function') renderYTStudio();
    } else if (contentTab === 'igscripts') {
        document.getElementById('content-status-filters').style.display = 'none';
        document.getElementById('content-filters').style.display = 'none';
        document.getElementById('content-production-area').style.display = 'none';
        document.getElementById('content-list').style.display = 'none';
        if (igArea) igArea.style.display = '';
        loadIGScripts();
        renderIGScripts();
    } else if (contentTab === 'inspiration') {
        document.getElementById('content-list').style.display = '';
        renderInspirationPool();
    } else {
        document.getElementById('content-list').style.display = '';
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

// === Status filter ===
function setContentStatusFilter(status) {
    contentStatusFilter = status;
    document.querySelectorAll('.content-status-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.content-status-btn[data-status="${status}"]`);
    if (btn) btn.classList.add('active');
    renderContentSection();
}

// === Idea page content cache ===
const ideaContentCache = {};

// === Inspiration Pool ===
function renderInspirationPool() {
    const container = document.getElementById('content-list');
    if (!container) return;

    let filtered = contentIdeas;
    if (contentStatusFilter !== 'all') {
        filtered = filtered.filter(i => i.status === contentStatusFilter);
    }
    if (contentPillarFilter !== 'all') {
        filtered = filtered.filter(i => i.pillar === contentPillarFilter);
    }

    document.getElementById('content-status-filters').style.display = '';
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
        const statusOptions = ['💡 新想法', '⭐ 核准', '✅ 已採納', '📌 保留', '🏁 已做過', '❌ 放棄'].map(s =>
            `<option value="${s}" ${s === idea.status ? 'selected' : ''}>${s}</option>`
        ).join('');
        const strikethrough = (idea.status === '❌ 放棄' || idea.status === '🏁 已做過' || idea.status === '✅ 已採納');
        const approved = idea.status === '⭐ 核准';
        const cardStyle = strikethrough ? ' style="opacity:0.5"' : approved ? ' style="border:1.5px solid var(--accent);background:rgba(212,197,169,0.15);box-shadow:0 0 20px rgba(212,197,169,0.35)"' : '';
        const cached = ideaContentCache[idea.id];
        return `<div class="content-idea-card" id="idea-card-${idea.id}" onclick="toggleIdeaDetail('${idea.id}', event)"${cardStyle}>
            <div class="content-idea-stars">${interestStars || '—'}</div>
            <div class="content-idea-body">
                <div class="content-idea-text"${strikethrough ? ' style="text-decoration:line-through"' : approved ? ' style="color:var(--accent);font-weight:600"' : ''}>${idea.text}</div>
                <div class="content-idea-meta">
                    ${idea.pillar ? `<span class="content-tag pillar">${idea.pillar}</span>` : ''}
                    ${idea.hookType ? `<span class="content-tag hook">${idea.hookType}</span>` : ''}
                    <span class="content-tag status">${idea.status}</span>
                    ${idea.date ? `<span class="content-tag date">${idea.date}</span>` : ''}
                </div>
                ${idea.notes ? `<div class="content-idea-notes">${idea.notes}</div>` : ''}
            </div>
            <select class="form-input content-idea-select" onchange="updateContentIdeaStatus('${idea.id}',this.value)" onclick="event.stopPropagation()">${statusOptions}</select>
            <div class="content-idea-detail" id="idea-detail-${idea.id}">${cached || ''}</div>
        </div>`;
    }).join('');
}

// === Toggle idea detail (expand/collapse) ===
async function toggleIdeaDetail(ideaId, event) {
    // Don't toggle when clicking the select dropdown
    if (event.target.tagName === 'SELECT' || event.target.tagName === 'OPTION') return;
    // Don't toggle when clicking links inside the detail
    if (event.target.tagName === 'A') return;
    // Don't toggle when clicking inside expanded detail area (allows text selection)
    const detail = document.getElementById('idea-detail-' + ideaId);
    if (detail && detail.contains(event.target)) return;
    // Don't toggle if user has text selected (mid-selection click)
    if (window.getSelection && window.getSelection().toString().length > 0) return;

    const card = document.getElementById('idea-card-' + ideaId);
    if (!card || !detail) return;

    const isExpanded = card.classList.contains('expanded');
    if (isExpanded) {
        card.classList.remove('expanded');
        return;
    }

    card.classList.add('expanded');

    // If already cached, just show
    if (ideaContentCache[ideaId]) {
        detail.innerHTML = ideaContentCache[ideaId];
        return;
    }

    // Fetch from Notion blocks API
    detail.innerHTML = '<div class="detail-loading">載入中...</div>';
    try {
        const data = await notionFetch('/blocks/' + ideaId + '/children?page_size=100', 'GET');
        if (data.results && data.results.length) {
            // For table blocks, fetch their children (table_rows)
            const blocks = data.results;
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].type === 'table' && blocks[i].has_children) {
                    const tableData = await notionFetch('/blocks/' + blocks[i].id + '/children?page_size=100', 'GET');
                    if (tableData.results) {
                        // Insert table_rows right after the table block
                        blocks.splice(i + 1, 0, ...tableData.results);
                        i += tableData.results.length;
                    }
                }
            }
            const html = renderNotionBlocks(blocks);
            ideaContentCache[ideaId] = html;
            detail.innerHTML = `<button class="btn btn-small" onclick="event.stopPropagation();copyIdeaDetail('${ideaId}')" style="float:right;margin:0 0 8px 8px;font-size:10px;">📋 Copy</button>` + html;
        } else {
            detail.innerHTML = '<div class="detail-loading">無內容 — 在 Notion 中新增靈感來源</div>';
        }
    } catch (e) {
        console.error('[RayOS Content] Fetch page blocks error:', e);
        detail.innerHTML = '<div class="detail-loading">載入失敗: ' + e.message + '</div>';
    }
}

// === Render Notion blocks to HTML ===
function renderNotionBlocks(blocks) {
    let html = '';
    let inTable = false;
    let tableRows = [];

    for (const block of blocks) {
        // Close table if we hit a non-table-row block
        if (inTable && block.type !== 'table_row') {
            html += renderTable(tableRows);
            inTable = false;
            tableRows = [];
        }

        switch (block.type) {
            case 'heading_1':
                html += '<h1>' + richTextToHtml(block.heading_1.rich_text) + '</h1>';
                break;
            case 'heading_2':
                html += '<h2>' + richTextToHtml(block.heading_2.rich_text) + '</h2>';
                break;
            case 'heading_3':
                html += '<h2>' + richTextToHtml(block.heading_3.rich_text) + '</h2>';
                break;
            case 'paragraph':
                const text = richTextToHtml(block.paragraph.rich_text);
                if (text) html += '<p>' + text + '</p>';
                break;
            case 'bulleted_list_item':
                html += '<ul><li>' + richTextToHtml(block.bulleted_list_item.rich_text) + '</li></ul>';
                break;
            case 'numbered_list_item':
                html += '<ol><li>' + richTextToHtml(block.numbered_list_item.rich_text) + '</li></ol>';
                break;
            case 'table':
                inTable = true;
                tableRows = [];
                break;
            case 'table_row':
                if (!inTable) { inTable = true; tableRows = []; }
                tableRows.push(block.table_row.cells);
                break;
            case 'divider':
                html += '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0;">';
                break;
            default:
                break;
        }
    }

    if (inTable && tableRows.length) {
        html += renderTable(tableRows);
    }

    // Merge consecutive same-type lists
    html = html.replace(/<\/ul>\s*<ul>/g, '').replace(/<\/ol>\s*<ol>/g, '');

    return html || '<div class="detail-loading">無詳細內容</div>';
}

function renderTable(rows) {
    if (!rows.length) return '';
    let html = '<table>';
    rows.forEach((row, i) => {
        html += '<tr>';
        row.forEach(cell => {
            const tag = i === 0 ? 'th' : 'td';
            html += '<' + tag + '>' + richTextToHtml(cell) + '</' + tag + '>';
        });
        html += '</tr>';
    });
    html += '</table>';
    return html;
}

function richTextToHtml(richTextArr) {
    if (!richTextArr || !richTextArr.length) return '';
    return richTextArr.map(rt => {
        let text = escapeHtml(rt.plain_text || '');
        if (rt.annotations) {
            if (rt.annotations.bold) text = '<strong>' + text + '</strong>';
            if (rt.annotations.italic) text = '<em>' + text + '</em>';
            if (rt.annotations.code) text = '<code style="background:var(--bg-input);padding:1px 4px;border-radius:3px;">' + text + '</code>';
        }
        if (rt.href) {
            text = '<a href="' + escapeHtml(rt.href) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' + text + '</a>';
        }
        return text;
    }).join('');
}

function copyIdeaDetail(ideaId) {
    const detail = document.getElementById('idea-detail-' + ideaId);
    if (!detail) return;
    const text = detail.innerText;
    navigator.clipboard.writeText(text);
    showToast('已複製內容');
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// === Content Log Detail Cache ===
const logDetailCache = {};

// === Open log item detail modal ===
async function openLogItemDetail(logItem) {
    const modal = document.getElementById('content-detail-modal');
    const titleEl = document.getElementById('content-detail-title');
    const metaEl = document.getElementById('content-detail-meta');
    const bodyEl = document.getElementById('content-detail-body');
    if (!modal) return;

    titleEl.textContent = logItem.title;
    const platformIcon = { 'YouTube': '🎬', 'IG Reels': '📱', 'IG 輪播': '🎠', 'Skool': '💬', 'Email': '📧' }[logItem.platform] || '📄';
    const statusColor = { '草稿': 'var(--text-muted)', '待審': '#e6a817', '已核': '#4a7c59', '已發布': 'var(--accent)' }[logItem.status] || 'var(--text-dim)';
    metaEl.innerHTML = `${platformIcon} ${logItem.platform} · ${logItem.date}${logItem.pillar ? ' · ' + logItem.pillar : ''} · <span style="color:${statusColor}">${logItem.status}</span>${logItem.source ? ' · 來源: ' + logItem.source : ''}`;
    bodyEl.innerHTML = '<div class="detail-loading">載入中...</div>';
    modal.style.display = 'flex';

    // Find matching idea by title
    const matchedIdea = contentIdeas.find(i => i.text === logItem.title);
    const pageId = matchedIdea ? matchedIdea.id : null;

    if (!pageId) {
        bodyEl.innerHTML = '<div class="detail-loading">找不到對應的 Idea 頁面。請確認靈感池中有同名項目。</div>';
        return;
    }

    // Check cache
    if (logDetailCache[pageId]) {
        bodyEl.innerHTML = logDetailCache[pageId];
        return;
    }

    // Fetch Notion blocks
    try {
        const data = await notionFetch('/blocks/' + pageId + '/children?page_size=100', 'GET');
        if (data.results && data.results.length) {
            const blocks = data.results;
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].type === 'table' && blocks[i].has_children) {
                    const tableData = await notionFetch('/blocks/' + blocks[i].id + '/children?page_size=100', 'GET');
                    if (tableData.results) {
                        blocks.splice(i + 1, 0, ...tableData.results);
                        i += tableData.results.length;
                    }
                }
            }
            const html = renderNotionBlocks(blocks);
            logDetailCache[pageId] = html;
            bodyEl.innerHTML = html;
        } else {
            bodyEl.innerHTML = '<div class="detail-loading">此頁面尚無內容</div>';
        }
    } catch (e) {
        console.error('[RayOS Content] Log detail fetch error:', e);
        bodyEl.innerHTML = '<div class="detail-loading">載入失敗: ' + e.message + '</div>';
    }
}

// === Production Log ===
function renderProductionLog() {
    const container = document.getElementById('content-list');
    if (!container) return;

    document.getElementById('content-status-filters').style.display = 'none';
    document.getElementById('content-filters').style.display = 'none';
    document.getElementById('content-production-area').style.display = '';

    // Recent 7 days
    const recent = contentLog.slice(0, 20);

    const recentEl = document.getElementById('content-recent-list');
    if (recentEl) {
        if (recent.length === 0) {
            recentEl.innerHTML = '<div style="color:var(--text-muted);padding:12px;">尚無記錄。用 /waterfall 或 /ig-post 開始產出！</div>';
        } else {
            recentEl.innerHTML = recent.map((c, idx) => {
                const platformIcon = { 'YouTube': '🎬', 'IG Reels': '📱', 'IG 輪播': '🎠', 'Skool': '💬', 'Email': '📧' }[c.platform] || '📄';
                const statusColor = { '草稿': 'var(--text-muted)', '待審': '#e6a817', '已核': '#4a7c59', '已發布': 'var(--accent)' }[c.status] || 'var(--text-dim)';
                return `<div class="content-log-item clickable" onclick="openLogItemDetail(contentLog[${idx}])">
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
        'Prop Firm實戰': '#e63946',
        'Prop Firm 實戰': '#e63946',
        '程式交易': '#457b9d',
        '交易心態': '#e6a817',
        'AI自動化': '#7b2d8e',
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

    // Record feedback to AI memory (local Alfred + N8N Agent Memory for /ideas)
    const feedbackMap = {
        '⭐ 核准': '👍 喜歡',
        '✅ 已採納': '🎬 採納要拍',
        '📌 保留': '📌 有興趣但先不拍',
        '❌ 放棄': '👎 不要'
    };
    if (feedbackMap[newStatus]) {
        const title = idea.text || idea.title || '';
        const pillar = idea.pillar || '';
        const hook = idea.hookType || '';
        const label = feedbackMap[newStatus];
        const summary = `${label}：「${title}」${pillar ? ' [' + pillar + ']' : ''}${hook ? ' Hook:' + hook : ''}`;

        // Local Alfred AI memory
        if (typeof saveAIMemory === 'function') saveAIMemory('選題回饋 ' + summary);

        // N8N Agent Memory (for /ideas command in Claude Code)
        const n8nBase = typeof getN8nUrl === 'function' && getN8nUrl();
        if (n8nBase) {
            const webhookUrl = n8nBase.replace(/\/webhook\/.*$/, '/webhook/agent-memory-write');
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: '選題回饋：' + title,
                    type: '選題偏好',
                    summary: summary,
                    score: newStatus === '✅ 已採納' ? 5 : newStatus === '⭐ 核准' ? 4 : newStatus === '📌 保留' ? 3 : 1,
                    platform: 'YouTube',
                    tags: ['選題回饋', pillar, newStatus].filter(Boolean),
                    source: 'RayOS Content'
                })
            }).catch(() => {}); // Fire and forget
        }
    }

    if (!hasNotionDirect()) return;
    try {
        await notionFetch('/pages/' + ideaId, 'PATCH', {
            properties: { '狀態': { select: { name: newStatus } } }
        });
        // Auto-trigger research brief when idea is approved
        if (newStatus === '⭐ 核准') {
            triggerAutoResearch(ideaId, idea.title);
        }
    } catch (e) {
        showToast('狀態更新失敗: ' + e.message, true);
    }
}

// === Auto Research on Approval ===
async function triggerAutoResearch(ideaId, title) {
    if (!hasBridge()) {
        console.log('[RayOS] Bridge not configured, skipping auto-research');
        return;
    }

    showToast('Research Brief 產生中...（背景執行）');

    const bridgeUrl = localStorage.getItem('bridge_url');
    const bridgeToken = localStorage.getItem('bridge_token');

    try {
        const res = await fetch(bridgeUrl + '/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + bridgeToken
            },
            body: JSON.stringify({ command: '/research', args: title })
        });

        const data = await res.json();

        if (data.success && data.output) {
            try {
                await writeResearchToNotion(ideaId, data.output);
            } catch (notionErr) {
                console.error('[RayOS] Auto-research Notion write failed:', notionErr);
                showToast('Research 產出成功但 Notion 寫入失敗: ' + notionErr.message, true);
                return;
            }
            delete ideaContentCache[ideaId];
            // Auto-refresh if card is expanded
            const card = document.getElementById('idea-card-' + ideaId);
            const detail = document.getElementById('idea-detail-' + ideaId);
            if (card && card.classList.contains('expanded') && detail) {
                detail.innerHTML = '<div class="detail-loading">重新載入...</div>';
                try {
                    const blocksRes = await notionFetch('/blocks/' + ideaId + '/children?page_size=100');
                    const html = renderNotionBlocks(blocksRes.results || []);
                    ideaContentCache[ideaId] = html;
                    detail.innerHTML = html;
                } catch (err) {
                    detail.innerHTML = '<div style="color:var(--text-dim);">載入失敗</div>';
                }
            }
            showToast('Research Brief 已生成');
        } else {
            console.error('[RayOS] Auto-research failed:', data);
            showToast('Research Brief 生成失敗: ' + (data.error || 'N8N 回傳無資料'), true);
        }
    } catch (e) {
        console.error('[RayOS] Auto-research error:', e);
        showToast('Research Brief 生成失敗: ' + e.message, true);
    }
}

async function writeResearchToNotion(ideaId, markdown) {
    if (!hasNotionDirect()) {
        throw new Error('Notion 未設定（Settings → Notion API Token）');
    }

    const blocks = markdownToNotionBlocks(markdown);
    if (!blocks.length) {
        throw new Error('Markdown 轉換後無 blocks（內容可能為空）');
    }

    console.log('[RayOS] Writing', blocks.length, 'blocks to Notion page:', ideaId);

    // Notion API: max 100 blocks per request
    for (let i = 0; i < blocks.length; i += 100) {
        const chunk = blocks.slice(i, i + 100);
        const res = await notionFetch('/blocks/' + ideaId + '/children', 'PATCH', {
            children: chunk
        });
        if (res.error || res.status === 'error' || res.code) {
            throw new Error('Notion API: ' + (res.message || res.error || JSON.stringify(res).slice(0, 200)));
        }
        console.log('[RayOS] Written chunk', Math.floor(i / 100) + 1, '/', Math.ceil(blocks.length / 100));
    }
}

function markdownToNotionBlocks(md) {
    const lines = md.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // Divider
        if (/^---+$/.test(line.trim())) {
            blocks.push({ type: 'divider', divider: {} });
            i++; continue;
        }

        // Heading 1
        if (/^# [^#]/.test(line)) {
            blocks.push({ type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: line.slice(2).trim() } }] } });
            i++; continue;
        }

        // Heading 2
        if (/^## [^#]/.test(line)) {
            blocks.push({ type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3).trim() } }] } });
            i++; continue;
        }

        // Heading 3
        if (/^### /.test(line)) {
            blocks.push({ type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: line.slice(4).trim() } }] } });
            i++; continue;
        }

        // Blockquote
        if (line.startsWith('> ')) {
            blocks.push({ type: 'quote', quote: { rich_text: [{ type: 'text', text: { content: line.slice(2).trim() } }] } });
            i++; continue;
        }

        // Table (collect consecutive | rows)
        if (line.trim().startsWith('|')) {
            const tableLines = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                const tl = lines[i].trim();
                // Skip separator rows (|---|---|)
                if (!/^\|[\s\-:|]+\|$/.test(tl)) {
                    tableLines.push(tl);
                }
                i++;
            }
            if (tableLines.length > 0) {
                const cells = tableLines.map(tl =>
                    tl.split('|').slice(1, -1).map(c => c.trim())
                );
                const width = Math.max(...cells.map(r => r.length));
                // Pad rows to same width
                const padded = cells.map(row => {
                    while (row.length < width) row.push('');
                    return row;
                });
                blocks.push({
                    type: 'table',
                    table: {
                        table_width: width,
                        has_column_header: true,
                        has_row_header: false,
                        children: padded.map(row => ({
                            type: 'table_row',
                            table_row: {
                                cells: row.map(c => [{ type: 'text', text: { content: c } }])
                            }
                        }))
                    }
                });
            }
            continue;
        }

        // Checkbox list
        if (line.trim().startsWith('- [ ]') || line.trim().startsWith('- [x]')) {
            const checked = line.trim().startsWith('- [x]');
            blocks.push({ type: 'to_do', to_do: { rich_text: [{ type: 'text', text: { content: line.trim().slice(6).trim() } }], checked } });
            i++; continue;
        }

        // Bullet list
        if (/^[-*] /.test(line.trim())) {
            blocks.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.trim().slice(2).trim() } }] } });
            i++; continue;
        }

        // Numbered list
        if (/^\d+\. /.test(line.trim())) {
            const text = line.trim().replace(/^\d+\.\s*/, '');
            blocks.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } });
            i++; continue;
        }

        // Paragraph (default)
        blocks.push({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: line.trim() } }] } });
        i++;
    }

    return blocks;
}

// ==================== IG SCRIPTS ====================

const IG_SCRIPTS_KEY = 'igScripts';

const DEFAULT_IG_SCRIPTS = [
    { id: 'ig-001', title: 'AI 幫我寫的 EA，出金 180 萬', hook: '開頭秀出金截圖，倒帶講怎麼做到的', status: '💡 待拍', pillar: 'AI 自動化', created: '2026-03-20' },
    { id: 'ig-002', title: '我叫 AI 寫一個交易策略，然後拿去跑真錢', hook: '螢幕錄影 Claude Code → MQL5 → 回測 → 實盤結果', status: '💡 待拍', pillar: 'AI 自動化', created: '2026-03-20' },
    { id: 'ig-003', title: 'AI 寫的交易策略 vs 我自己寫的，誰贏？', hook: 'PK 對比，有懸念有結果', status: '💡 待拍', pillar: '程式交易', created: '2026-03-20' },
    { id: 'ig-004', title: '用 AI 寫交易機器人的 3 個致命錯誤', hook: '踩坑經驗，反向切入（真實犯過的錯誤）', status: '💡 待拍', pillar: 'AI 自動化', created: '2026-03-20' },
    { id: 'ig-005', title: '我每天花 0 分鐘盯盤，因為 AI 幫我做了這件事', hook: '展示 RayOS 儀表板 + 自動化 pipeline', status: '💡 待拍', pillar: 'AI 自動化', created: '2026-03-20' },
    { id: 'ig-006', title: 'Prop Firm 考試可以用 AI 嗎？可以，但...', hook: '爭議性標題，講 AI 能幫什麼、不能幫什麼', status: '💡 待拍', pillar: 'Prop Firm 實戰', created: '2026-03-20' },
    { id: 'ig-007', title: '我用 Claude Code 10 分鐘寫出一個均線策略，能賺錢嗎？', hook: '限時挑戰，回測揭曉', status: '💡 待拍', pillar: '程式交易', created: '2026-03-20' },
    { id: 'ig-008', title: '交易員會被 AI 取代嗎？我用了一年的真實感受', hook: '觀點型，有資格講因為真的在用', status: '💡 待拍', pillar: '交易心態', created: '2026-03-20' },
    { id: 'ig-009', title: '一個指令讓 AI 自動分析我的交易績效', hook: '展示 Claude Code 跑分析、生成報告的過程', status: '💡 待拍', pillar: 'AI 自動化', created: '2026-03-20' },
    { id: 'ig-010', title: 'AI 寫的策略上線第一天就虧錢，然後我做了這件事', hook: '故事型，從虧到調整到獲利的過程', status: '💡 待拍', pillar: '程式交易', created: '2026-03-20' },
];

function loadIGScripts() {
    const saved = localStorage.getItem(IG_SCRIPTS_KEY);
    if (saved) {
        igScripts = JSON.parse(saved);
    } else {
        igScripts = [...DEFAULT_IG_SCRIPTS];
        saveIGScripts();
    }
}

function saveIGScripts() {
    localStorage.setItem(IG_SCRIPTS_KEY, JSON.stringify(igScripts));
}

function setIGScriptFilter(filter) {
    igScriptFilter = filter;
    document.querySelectorAll('.ig-script-filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.ig-script-filter-btn[data-filter="${filter}"]`);
    if (btn) btn.classList.add('active');
    renderIGScripts();
}

function renderIGScripts() {
    const container = document.getElementById('ig-scripts-list');
    if (!container) return;

    let filtered = igScripts;
    if (igScriptFilter !== 'all') {
        filtered = filtered.filter(s => s.status === igScriptFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">沒有符合的腳本</div>';
        return;
    }

    container.innerHTML = filtered.map(s => {
        const dimClass = s.status === '✅ 已發布' ? ' published' : s.status === '❌ 放棄' ? ' abandoned' : '';
        return `<div class="ig-script-card${dimClass}" data-id="${s.id}">
            <div class="ig-script-card-main">
                <div class="ig-script-card-body">
                    <div class="ig-script-card-title">${escapeHtml(s.title)}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
                        <span class="content-tag ig-platform">IG Reels</span>
                        ${s.pillar ? `<span class="content-tag pillar">${escapeHtml(s.pillar)}</span>` : ''}
                        <span class="content-tag">${s.created || ''}</span>
                        ${s.notionId ? '<span class="content-tag" style="color:#4a7c59;">✓ Notion</span>' : ''}
                    </div>
                    ${s.hook ? `<div class="ig-script-card-hook">${escapeHtml(s.hook)}</div>` : ''}
                </div>
                <div class="ig-script-card-actions">
                    <select onchange="updateIGScriptStatus('${s.id}', this.value)">
                        ${['💡 待拍', '🎬 拍攝中', '✅ 已發布', '❌ 放棄'].map(st =>
                            `<option value="${st}"${s.status === st ? ' selected' : ''}>${st}</option>`
                        ).join('')}
                    </select>
                    <button class="btn-icon" onclick="event.stopPropagation();deleteIGScript('${s.id}')" title="刪除">🗑</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function updateIGScriptStatus(id, status) {
    const s = igScripts.find(s => s.id === id);
    if (s) { s.status = status; saveIGScripts(); renderIGScripts(); }
}

function deleteIGScript(id) {
    if (!confirm('確定刪除這個腳本？')) return;
    igScripts = igScripts.filter(s => s.id !== id);
    saveIGScripts();
    renderIGScripts();
}

function addIGScript() {
    const title = prompt('腳本標題：');
    if (!title || !title.trim()) return;
    const hook = prompt('Hook 描述（可留空）：') || '';
    const pillar = prompt('支柱（Prop Firm 實戰 / 程式交易 / 交易心態 / AI 自動化 / 個人成長）：') || '';
    const id = 'ig-' + Date.now();
    igScripts.unshift({
        id, title: title.trim(), hook: hook.trim(), pillar: pillar.trim(),
        status: '💡 待拍', created: new Date().toISOString().split('T')[0]
    });
    saveIGScripts();
    renderIGScripts();
    showToast('✓ 已新增 IG 腳本');
}

// Sync IG scripts TO Notion (write to Ideas DB)
async function syncIGScriptsToNotion() {
    if (!hasNotionDirect()) { showToast('請先設定 Notion Token', true); return; }
    const unsynced = igScripts.filter(s => !s.notionId);
    if (unsynced.length === 0) { showToast('所有腳本已同步到 Notion'); return; }

    showToast(`正在寫入 ${unsynced.length} 個腳本到 Notion...`);
    let success = 0;
    for (const s of unsynced) {
        try {
            const result = await notionFetch('/pages', 'POST', {
                parent: { database_id: IDEAS_DB_ID },
                properties: {
                    '主題': { title: [{ text: { content: s.title } }] },
                    '來源': { select: { name: '📸 IG 腳本' } },
                    '狀態': { select: { name: s.status === '💡 待拍' ? '💡 新想法' : s.status === '✅ 已發布' ? '✅ 已採納' : '💡 新想法' } },
                    '支柱': s.pillar ? { select: { name: s.pillar } } : undefined,
                    '備註': { rich_text: [{ text: { content: s.hook || '' } }] }
                }
            });
            if (result && result.id) {
                s.notionId = result.id;
                success++;
            }
        } catch (e) {
            console.error('[IG Scripts] Notion write error:', e);
        }
    }
    saveIGScripts();
    renderIGScripts();
    showToast(`✓ ${success}/${unsynced.length} 個寫入 Notion`);
}

// Sync IG scripts FROM Notion (pull IG-tagged ideas)
async function syncIGScriptsFromNotion() {
    if (!hasNotionDirect()) { showToast('請先設定 Notion Token', true); return; }
    showToast('正在從 Notion 拉取 IG 腳本...');
    try {
        const data = await notionFetch('/databases/' + IDEAS_DB_ID + '/query', 'POST', {
            page_size: 100,
            filter: { property: '來源', select: { equals: '📸 IG 腳本' } },
            sorts: [{ property: '建立日期', direction: 'descending' }]
        });
        if (!data.results || data.results.length === 0) {
            showToast('Notion 沒有 IG 腳本');
            return;
        }
        let added = 0;
        for (const page of data.results) {
            const p = page.properties;
            const notionId = page.id;
            // Skip if already exists locally
            if (igScripts.some(s => s.notionId === notionId)) continue;
            const title = p['主題']?.title?.[0]?.plain_text || '';
            if (!title) continue;
            igScripts.unshift({
                id: 'ig-' + Date.now() + '-' + added,
                notionId,
                title,
                hook: p['備註']?.rich_text?.[0]?.plain_text || '',
                pillar: p['支柱']?.select?.name || '',
                status: '💡 待拍',
                created: (p['建立日期']?.created_time || '').split('T')[0]
            });
            added++;
        }
        saveIGScripts();
        renderIGScripts();
        showToast(`✓ 從 Notion 拉取 ${added} 個新腳本（共 ${data.results.length} 個）`);
    } catch (e) {
        console.error('[IG Scripts] Notion read error:', e);
        showToast('Notion 拉取失敗: ' + e.message, true);
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

// === Quick Research (N8N: research + title + description) ===
function promptQuickResearch() {
    const topic = prompt('輸入研究主題（會同時產出標題+描述）');
    if (!topic || !topic.trim()) return;
    runQuickResearch(topic.trim());
}

async function runQuickResearch(topic) {
    if (!hasNotionDirect()) {
        showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }

    showToast('🔍 正在研究「' + topic + '」+ 標題 + 描述（約 60-90 秒）...');

    try {
        const res = await fetch('https://david86726.app.n8n.cloud/webhook/yt-research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic })
        });

        if (!res.ok) {
            showToast('研究失敗: N8N HTTP ' + res.status, true);
            return;
        }

        let data;
        try {
            data = await res.json();
        } catch (e) {
            showToast('研究失敗: 回傳格式錯誤', true);
            return;
        }

        if (data.success && data.output) {
            // Show output in modal
            document.getElementById('bridge-output-title').textContent = '研究 + 標題 + 描述：' + topic;
            document.getElementById('bridge-output-content').textContent = data.output;
            document.getElementById('bridge-output-modal').style.display = 'flex';
            showToast('✓ 研究 + 標題 + 描述 已完成');
        } else {
            showToast('研究失敗: ' + (data.error || '無產出'), true);
        }
    } catch (e) {
        showToast('研究連線失敗: ' + e.message, true);
    }
}

// === Bridge Server Remote Execution ===
let bridgeRunning = false;

function hasBridge() {
    return !!(localStorage.getItem('bridge_url') && localStorage.getItem('bridge_token'));
}

function promptBridgeCommand(command, placeholder) {
    const input = prompt(placeholder || '輸入參數');
    if (!input || !input.trim()) return;
    runBridgeCommand(command, input.trim());
}

async function runBridgeCommand(command, args) {
    if (bridgeRunning) {
        showToast('已有指令執行中，請稍候', true);
        return;
    }
    if (!hasBridge()) {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(command + (args ? ' ' + args : ''));
        showToast('Bridge 未設定，已複製指令到剪貼簿');
        return;
    }

    const bridgeUrl = localStorage.getItem('bridge_url');
    const bridgeToken = localStorage.getItem('bridge_token');
    const statusEl = document.getElementById('bridge-status');

    bridgeRunning = true;
    if (statusEl) {
        statusEl.style.display = '';
        statusEl.innerHTML = '<span style="color:var(--accent);">&#9679;</span> 正在執行 <code>' + command + '</code>...';
    }

    // Disable all quick action buttons
    document.querySelectorAll('.content-quick-action').forEach(b => {
        b.style.opacity = '0.5';
        b.style.pointerEvents = 'none';
    });

    try {
        const res = await fetch(bridgeUrl + '/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + bridgeToken
            },
            body: JSON.stringify({ command, args: args || '' })
        });

        const data = await res.json();

        if (data.success) {
            // Show output in modal
            document.getElementById('bridge-output-title').textContent = command;
            document.getElementById('bridge-output-content').textContent = data.output;
            document.getElementById('bridge-output-modal').style.display = 'flex';

            if (statusEl) {
                statusEl.innerHTML = '<span style="color:#4a7c59;">&#9679;</span> ' + command + ' 完成';
                setTimeout(() => { statusEl.style.display = 'none'; }, 5000);
            }

            // Auto sync content from Notion
            syncContentFromNotion(true);
            showToast('&#10003; ' + command + ' 執行完成');
        } else {
            const errMsg = data.error || 'Unknown error';
            if (statusEl) {
                statusEl.innerHTML = '<span style="color:#ff6b6b;">&#9679;</span> <span style="color:#ff6b6b;">失敗:</span> ' + errMsg;
            }
            showToast(command + ' 失敗: ' + errMsg, true);
        }
    } catch (e) {
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#ff6b6b;">&#9679;</span> <span style="color:#ff6b6b;">連線失敗:</span> ' + e.message;
        }
        showToast('Bridge 連線失敗: ' + e.message, true);
    } finally {
        bridgeRunning = false;
        document.querySelectorAll('.content-quick-action').forEach(b => {
            b.style.opacity = '';
            b.style.pointerEvents = '';
        });
    }
}

function copyBridgeOutput() {
    const content = document.getElementById('bridge-output-content').textContent;
    navigator.clipboard.writeText(content);
    showToast('已複製輸出內容');
}
