// ==================== IDEAS ====================

let ideasData = JSON.parse(localStorage.getItem('ideas_data') || '[]');
let ideasNotionIndex = JSON.parse(localStorage.getItem('ideas_notion_index') || '{}');
let currentIdeasFilter = 'all';

async function saveIdea() {
    const text = document.getElementById('idea-text').value;
    const type = document.getElementById('idea-type').value;
    const priority = document.getElementById('idea-priority') ? document.getElementById('idea-priority').value : '⭐ 中';
    const notes = document.getElementById('idea-notes') ? document.getElementById('idea-notes').value : '';
    if (!text) return;
    const idea = {
        id: 'local-' + Date.now(),
        text, type, priority,
        status: '💡 新想法',
        date: new Date().toISOString().split('T')[0],
        notes
    };
    ideasData.unshift(idea);
    localStorage.setItem('ideas_data', JSON.stringify(ideasData));
    document.getElementById('idea-text').value = '';
    if (document.getElementById('idea-notes')) document.getElementById('idea-notes').value = '';
    renderIdeasList();
    updateIdeasStats();
    // Sync to Notion
    const url = getN8nUrl();
    if (url) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'create_idea',
                    data: { text: idea.text, type: idea.type, status: idea.status, priority: idea.priority, date: idea.date, notes: idea.notes }
                })
            });
            const data = await res.json();
            if (data.pageId) {
                idea.id = data.pageId;
                ideasNotionIndex[data.pageId] = data.pageId;
                localStorage.setItem('ideas_data', JSON.stringify(ideasData));
                localStorage.setItem('ideas_notion_index', JSON.stringify(ideasNotionIndex));
            }
        } catch(e) { console.error('[RayOS] Idea sync error:', e); }
    }
    showToast('Idea saved');
}

async function syncIdeasFromNotion(silent = false) {
    const url = getN8nUrl();
    if (!url) { if (!silent) showToast('請先設定 n8n Webhook URL', true); return; }
    if (!silent) showToast('正在同步 Ideas...');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'fetch_ideas' })
        });
        if (!res.ok) throw new Error('n8n returned ' + res.status);
        const data = await res.json();
        if (data.records && data.records.length > 0) {
            ideasNotionIndex = data.pageIndex || {};
            localStorage.setItem('ideas_notion_index', JSON.stringify(ideasNotionIndex));
            ideasData = data.records.map(r => ({
                id: r.id || r.pageId || ('notion-' + Math.random()),
                text: r.text || '',
                type: r.type || '🤔 其他',
                status: r.status || '💡 新想法',
                priority: r.priority || '⭐ 中',
                date: r.date || '',
                notes: r.notes || ''
            })).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
            localStorage.setItem('ideas_data', JSON.stringify(ideasData));
            renderIdeasList();
            updateIdeasStats();
            updateIdeasSyncDot();
            if (!silent) showToast('Synced ' + ideasData.length + ' ideas');
        } else {
            if (!silent) showToast('No ideas found in Notion');
        }
    } catch(e) {
        console.error('[RayOS] Ideas sync error:', e);
        if (!silent) showToast('Ideas 同步失敗: ' + e.message, true);
    }
}

async function updateIdeaStatus(ideaId, newStatus) {
    const idea = ideasData.find(i => i.id === ideaId);
    if (!idea) return;
    idea.status = newStatus;
    localStorage.setItem('ideas_data', JSON.stringify(ideasData));
    renderIdeasList();
    updateIdeasStats();
    // Sync to Notion
    const url = getN8nUrl();
    if (url && ideasNotionIndex[ideaId]) {
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'update_idea', pageId: ideaId, data: { status: newStatus } })
            });
        } catch(e) { console.error('[RayOS] Idea update error:', e); }
    }
}

function setIdeasFilter(filter) {
    currentIdeasFilter = filter;
    document.querySelectorAll('.ideas-filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.ideas-filter-btn[data-filter="${filter}"]`);
    if (btn) btn.classList.add('active');
    renderIdeasList();
}

function renderIdeasList() {
    const container = document.getElementById('ideas-list');
    if (!container) return;
    const statusMap = {
        'all': null,
        'new': '💡 新想法',
        'research': '🔍 研究中',
        'active': '🚀 執行中',
        'done': '✅ 已完成'
    };
    const filterStatus = statusMap[currentIdeasFilter];
    const filtered = filterStatus ? ideasData.filter(i => i.status === filterStatus) : ideasData;

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">No ideas yet. Start capturing!</div>';
        return;
    }

    container.innerHTML = filtered.map(idea => {
        const statusOptions = ['💡 新想法','🔍 研究中','🚀 執行中','✅ 已完成','❌ 放棄'].map(s =>
            `<option value="${s}" ${s === idea.status ? 'selected' : ''}>${s}</option>`
        ).join('');
        return `<div class="idea-card" style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                <div style="flex:1;">
                    <div style="font-weight:600;margin-bottom:4px;">${idea.text}</div>
                    <div style="font-size:12px;color:var(--text-muted);">
                        <span style="margin-right:10px;">${idea.type}</span>
                        <span style="margin-right:10px;">${idea.priority}</span>
                        <span>${idea.date}</span>
                    </div>
                    ${idea.notes ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;font-style:italic;">${idea.notes}</div>` : ''}
                </div>
                <select class="form-input" style="width:auto;font-size:12px;padding:4px 8px;" onchange="updateIdeaStatus('${idea.id}',this.value)">${statusOptions}</select>
            </div>
        </div>`;
    }).join('');
    document.getElementById('stat-ideas').textContent = ideasData.length;
}

function updateIdeasStats() {
    const total = ideasData.length;
    const newCount = ideasData.filter(i => i.status === '💡 新想法').length;
    const activeCount = ideasData.filter(i => i.status === '🚀 執行中').length;
    const doneCount = ideasData.filter(i => i.status === '✅ 已完成').length;
    const el = document.getElementById('ideas-stats');
    if (el) el.innerHTML = `<span>Total: ${total}</span> <span>New: ${newCount}</span> <span>Active: ${activeCount}</span> <span>Done: ${doneCount}</span>`;
    document.getElementById('stat-ideas').textContent = total;
}

function updateIdeasSyncDot() {
    const d = document.getElementById('ideas-sync-dot');
    if (d) d.className = 'sync-dot ' + (getN8nUrl() ? 'on' : 'off');
}
