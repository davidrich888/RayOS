// ==================== IDEAS (Notion-first) ====================
// Notion 是唯一資料來源，網頁只做讀取和操作

let ideasData = [];
let currentIdeasFilter = 'all';

// === 新增 Idea → 直接寫入 Notion ===
async function saveIdea() {
    const text = document.getElementById('idea-text').value;
    const type = document.getElementById('idea-type').value;
    const priority = document.getElementById('idea-priority') ? document.getElementById('idea-priority').value : '⭐ 中';
    const notes = document.getElementById('idea-notes') ? document.getElementById('idea-notes').value : '';
    if (!text) return;

    const date = new Date().toISOString().split('T')[0];

    if (!hasNotionDirect()) {
        showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }

    showToast('正在儲存...');
    try {
        const props = {
            '想法': { title: (() => { const c = []; for (let i = 0; i < text.length; i += 2000) c.push({ text: { content: text.slice(i, i + 2000) } }); return c; })() },
            '類型': { select: { name: type } },
            '狀態': { select: { name: '💡 新想法' } },
            '優先度': { select: { name: priority } },
            '建立日期': { date: { start: date } }
        };
        if (notes) {
            // Notion rich_text 每個 block 最多 2000 字元，需分段
            const chunks = [];
            for (let i = 0; i < notes.length; i += 2000) {
                chunks.push({ text: { content: notes.slice(i, i + 2000) } });
            }
            props['備註'] = { rich_text: chunks };
        }
        const result = await notionFetch('/pages', 'POST', {
            parent: { database_id: IDEAS_DB_ID },
            properties: props
        });
        console.log('[RayOS Direct] Idea created:', result.id);

        // 清空表單
        document.getElementById('idea-text').value = '';
        if (document.getElementById('idea-notes')) document.getElementById('idea-notes').value = '';

        // 加入記憶體並重新 render（不等 full sync）
        ideasData.unshift({
            id: result.id,
            text, type, priority,
            status: '💡 新想法',
            date, notes
        });
        renderIdeasList();
        updateIdeasStats();
        showToast('✓ 已儲存到 Notion');
    } catch (e) {
        console.error('[RayOS Direct] Save idea error:', e);
        showToast('儲存失敗: ' + e.message, true);
    }
}

// === 從 Notion 載入全部 Ideas ===
async function syncIdeasFromNotionDirect(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }
    if (!silent) showToast('正在載入 Ideas...');
    try {
        console.log('[RayOS Direct] Loading ideas from Notion');
        const data = await notionFetch('/databases/' + IDEAS_DB_ID + '/query', 'POST', {
            page_size: 100,
            sorts: [{ property: '建立日期', direction: 'descending' }]
        });
        if (data.results) {
            ideasData = data.results.map(page => {
                const p = page.properties;
                return {
                    id: page.id,
                    text: p['想法']?.title?.[0]?.plain_text || '',
                    type: p['類型']?.select?.name || '🤔 其他',
                    status: p['狀態']?.select?.name || '💡 新想法',
                    priority: p['優先度']?.select?.name || '⭐ 中',
                    date: p['建立日期']?.date?.start || '',
                    notes: p['備註']?.rich_text?.[0]?.plain_text || ''
                };
            }).filter(i => i.text);
            renderIdeasList();
            updateIdeasStats();
            updateIdeasSyncDot();
            console.log('[RayOS Direct] Ideas loaded:', ideasData.length);
            if (!silent) showToast('✓ 已載入 ' + ideasData.length + ' 個想法');
        } else {
            ideasData = [];
            renderIdeasList();
            updateIdeasStats();
            if (!silent) showToast('Notion 中沒有找到 Ideas');
        }
    } catch (e) {
        console.error('[RayOS Direct] Ideas load error:', e);
        if (!silent) showToast('Ideas 載入失敗: ' + e.message, true);
    }
}

// === 更新 Idea 狀態 → 直接寫入 Notion ===
async function updateIdeaStatus(ideaId, newStatus) {
    const idea = ideasData.find(i => i.id === ideaId);
    if (!idea) return;

    // 先更新 UI
    idea.status = newStatus;
    renderIdeasList();
    updateIdeasStats();

    if (!hasNotionDirect()) return;
    try {
        await notionFetch('/pages/' + ideaId, 'PATCH', {
            properties: { '狀態': { select: { name: newStatus } } }
        });
        console.log('[RayOS Direct] Idea status updated:', ideaId, '→', newStatus);
    } catch (e) {
        console.error('[RayOS Direct] Status update error:', e);
        showToast('狀態更新失敗: ' + e.message, true);
    }
}

// === 刪除 Idea → archive Notion page ===
async function deleteIdea(ideaId) {
    if (!confirm('確定要刪除這個想法嗎？')) return;

    // 先更新 UI
    const idx = ideasData.findIndex(i => i.id === ideaId);
    if (idx !== -1) ideasData.splice(idx, 1);
    renderIdeasList();
    updateIdeasStats();

    if (!hasNotionDirect()) return;
    try {
        await notionFetch('/pages/' + ideaId, 'PATCH', { archived: true });
        console.log('[RayOS Direct] Idea archived:', ideaId);
        showToast('已刪除');
    } catch (e) {
        console.error('[RayOS Direct] Delete error:', e);
        showToast('刪除失敗: ' + e.message, true);
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
                <button onclick="deleteIdea('${idea.id}')" style="background:none;border:1px solid var(--border);border-radius:6px;color:#e74c3c;cursor:pointer;font-size:14px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="刪除">✕</button>
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
    if (d) d.className = 'sync-dot ' + (hasNotionDirect() ? 'on' : 'off');
}
