// ==================== YT STUDIO (準上架) ====================
// Reads from Notion YT影片 DB, renders cards with Research buttons

const YT_STUDIO_DB_ID = '10f629ef6a13803fbb7dc965c499fedd';

let ytStudioItems = [];
let ytStudioFilter = 'Next One';
const ytStudioDetailCache = {};
let ytStudioResearching = {};
let ytDragSrcIndex = null;
let ytDragDidDrag = false;

// === Sync from Notion ===
async function syncYTStudioFromNotion(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }
    if (!silent) showToast('正在載入 YT 工作室...');
    try {
        const data = await notionFetch('/databases/' + YT_STUDIO_DB_ID + '/query', 'POST', {
            page_size: 100,
            sorts: [
                { property: '排序', direction: 'ascending' },
                { property: '發布日期', direction: 'ascending' }
            ]
        });
        if (data.results) {
            ytStudioItems = data.results.map(page => {
                const p = page.properties;
                return {
                    id: page.id,
                    title: p['名稱']?.title?.[0]?.plain_text || '',
                    description: p['描述']?.rich_text?.[0]?.plain_text || '',
                    publishDate: p['發布日期']?.date?.start || '',
                    progress: p['進度']?.multi_select?.map(s => s.name) || [],
                    type: p['類型']?.multi_select?.map(s => s.name) || [],
                    sortOrder: p['排序']?.number ?? null,
                    hasChildren: page.has_children || false
                };
            }).filter(i => i.title);
            console.log('[RayOS YT Studio] Loaded:', ytStudioItems.length);
            if (!silent) showToast('✓ YT 工作室 ' + ytStudioItems.length + ' 部影片');
        }
        renderYTStudio();
    } catch (e) {
        console.error('[RayOS YT Studio] Load error:', e);
        if (!silent) showToast('YT 工作室載入失敗: ' + e.message, true);
    }
}

// === Filter buttons ===
function setYTStudioFilter(filter) {
    ytStudioFilter = filter;
    document.querySelectorAll('.yt-studio-filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.yt-studio-filter-btn[data-filter="${filter}"]`);
    if (btn) btn.classList.add('active');
    renderYTStudio();
}

// === Determine card status for button rendering ===
function getYTCardStatus(item) {
    if (item.progress.includes('Done')) return 'done';
    if (item._hasResearch) return 'researched';
    return 'pending';
}

// === Render ===
function renderYTStudio() {
    const container = document.getElementById('yt-studio-list');
    if (!container) return;

    const filtered = getYTFilteredItems();

    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">沒有符合條件的影片</div>';
        updateYTStudioStats();
        return;
    }

    container.innerHTML = filtered.map((item, idx) => {
        const isDone = item.progress.includes('Done');
        const isResearching = ytStudioResearching[item.id];
        const cached = ytStudioDetailCache[item.id];

        // Progress tags (exclude Next One and Done for cleaner display)
        const progressTags = item.progress.filter(p => p !== 'Next One' && p !== 'Done');
        const typeTags = item.type;

        // Determine action button
        let actionBtn = '';
        if (isDone) {
            actionBtn = '<span class="yt-studio-status-badge done">✅ 已完成</span>';
        } else if (isResearching) {
            actionBtn = '<span class="yt-studio-status-badge researching">⏳ 研究中...</span>';
        } else if (cached || item._hasResearch) {
            actionBtn = '<span class="yt-studio-status-badge researched">📊 已研究</span>';
        } else {
            actionBtn = `<button class="btn btn-small yt-studio-research-btn" onclick="event.stopPropagation();runYTResearch('${item.id}')" title="跑深度研究">🔍 Research</button>`;
        }

        const cardClass = isDone ? ' yt-done' : '';

        return `<div class="yt-studio-card${cardClass}" id="yt-card-${item.id}" draggable="true" data-yt-idx="${idx}" data-yt-id="${item.id}"
            ondragstart="ytDragStart(event)" ondragover="ytDragOver(event)" ondragenter="ytDragEnter(event)" ondragleave="ytDragLeave(event)" ondrop="ytDrop(event)" ondragend="ytDragEnd(event)"
            onclick="toggleYTStudioDetail('${item.id}', event)">
            <div class="yt-studio-card-main">
                <div class="yt-drag-handle" title="拖曳排序">⠿</div>
                <div class="yt-studio-card-body">
                    <div class="yt-studio-card-title">${escapeHtml(item.title)}</div>
                    <div class="yt-studio-card-meta">
                        ${item.progress.includes('Next One') ? '<span class="content-tag yt-next">Next One</span>' : ''}
                        ${isDone ? '<span class="content-tag yt-done-tag">Done</span>' : ''}
                        ${progressTags.map(p => `<span class="content-tag yt-progress">${p}</span>`).join('')}
                        ${typeTags.map(t => `<span class="content-tag pillar">${t}</span>`).join('')}
                        ${item.publishDate ? `<span class="content-tag date">${item.publishDate}</span>` : ''}
                    </div>
                    ${item.description ? `<div class="yt-studio-card-desc">${escapeHtml(item.description)}</div>` : ''}
                </div>
                <div class="yt-studio-card-action">${actionBtn}</div>
            </div>
            <div class="yt-studio-detail" id="yt-detail-${item.id}"></div>
        </div>`;
    }).join('');

    updateYTStudioStats();
}

// === Toggle detail (expand/collapse) ===
async function toggleYTStudioDetail(pageId, event) {
    if (ytDragDidDrag) { ytDragDidDrag = false; return; }
    if (event.target.tagName === 'BUTTON') return;
    if (event.target.tagName === 'A') return;
    const detail = document.getElementById('yt-detail-' + pageId);
    if (detail && detail.contains(event.target) && event.target !== detail) return;
    if (window.getSelection && window.getSelection().toString().length > 0) return;

    const card = document.getElementById('yt-card-' + pageId);
    if (!card || !detail) return;

    const isExpanded = card.classList.contains('expanded');
    if (isExpanded) {
        card.classList.remove('expanded');
        return;
    }

    card.classList.add('expanded');

    if (ytStudioDetailCache[pageId]) {
        detail.innerHTML = ytStudioDetailCache[pageId];
        return;
    }

    detail.innerHTML = '<div class="detail-loading">載入中...</div>';
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
            ytStudioDetailCache[pageId] = html;

            // Mark item as having research if content is substantial
            const item = ytStudioItems.find(i => i.id === pageId);
            if (item && html.length > 200) {
                item._hasResearch = true;
            }

            detail.innerHTML = `<button class="btn btn-small" onclick="event.stopPropagation();copyYTDetail('${pageId}')" style="float:right;margin:0 0 8px 8px;font-size:10px;">📋 Copy</button>` + html;
        } else {
            detail.innerHTML = '<div class="detail-loading">尚無內容 — 點 Research 按鈕開始研究</div>';
        }
    } catch (e) {
        console.error('[RayOS YT Studio] Detail fetch error:', e);
        detail.innerHTML = '<div class="detail-loading">載入失敗: ' + e.message + '</div>';
    }
}

function copyYTDetail(pageId) {
    const detail = document.getElementById('yt-detail-' + pageId);
    if (!detail) return;
    navigator.clipboard.writeText(detail.innerText);
    showToast('已複製內容');
}

// === Run Research via Bridge Server ===
async function runYTResearch(pageId) {
    const item = ytStudioItems.find(i => i.id === pageId);
    if (!item) return;

    if (!hasBridge()) {
        navigator.clipboard.writeText('/research ' + item.title);
        showToast('Bridge 未設定，已複製指令到剪貼簿');
        return;
    }

    ytStudioResearching[pageId] = true;
    renderYTStudio();
    showToast('🔍 正在研究「' + item.title + '」...');

    const bridgeUrl = localStorage.getItem('bridge_url');
    const bridgeToken = localStorage.getItem('bridge_token');

    try {
        const res = await fetch(bridgeUrl + '/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + bridgeToken
            },
            body: JSON.stringify({ command: '/research', args: item.title })
        });

        const data = await res.json();

        if (data.success && data.output) {
            // Write research output to Notion page body
            await writeResearchToNotion(pageId, data.output);

            // Clear cache so it reloads
            delete ytStudioDetailCache[pageId];
            item._hasResearch = true;

            showToast('✓ Research Brief 已寫入「' + item.title + '」');

            // If card is expanded, reload detail
            const card = document.getElementById('yt-card-' + pageId);
            if (card && card.classList.contains('expanded')) {
                const detail = document.getElementById('yt-detail-' + pageId);
                if (detail) {
                    detail.innerHTML = '<div class="detail-loading">重新載入...</div>';
                    const blocksRes = await notionFetch('/blocks/' + pageId + '/children?page_size=100', 'GET');
                    if (blocksRes.results) {
                        const blocks = blocksRes.results;
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
                        ytStudioDetailCache[pageId] = html;
                        detail.innerHTML = `<button class="btn btn-small" onclick="event.stopPropagation();copyYTDetail('${pageId}')" style="float:right;margin:0 0 8px 8px;font-size:10px;">📋 Copy</button>` + html;
                    }
                }
            }
        } else {
            showToast('Research 失敗: ' + (data.error || 'Unknown error'), true);
        }
    } catch (e) {
        console.error('[RayOS YT Studio] Research error:', e);
        showToast('Research 連線失敗: ' + e.message, true);
    } finally {
        delete ytStudioResearching[pageId];
        renderYTStudio();
    }
}

// === Drag and Drop ===
function ytDragStart(e) {
    const card = e.target.closest('.yt-studio-card');
    if (!card) return;
    // Don't drag expanded cards (user is reading content)
    if (card.classList.contains('expanded')) { e.preventDefault(); return; }
    ytDragSrcIndex = parseInt(card.dataset.ytIdx);
    ytDragDidDrag = true;
    card.classList.add('yt-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.ytIdx);
}

function ytDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function ytDragEnter(e) {
    e.preventDefault();
    const card = e.target.closest('.yt-studio-card');
    if (!card || parseInt(card.dataset.ytIdx) === ytDragSrcIndex) return;
    // Remove all existing indicators
    document.querySelectorAll('.yt-studio-card.yt-drag-over-top, .yt-studio-card.yt-drag-over-bottom').forEach(c => {
        c.classList.remove('yt-drag-over-top', 'yt-drag-over-bottom');
    });
    const targetIdx = parseInt(card.dataset.ytIdx);
    card.classList.add(targetIdx > ytDragSrcIndex ? 'yt-drag-over-bottom' : 'yt-drag-over-top');
}

function ytDragLeave(e) {
    const card = e.target.closest('.yt-studio-card');
    if (!card) return;
    // Only remove if actually leaving the card (not entering a child)
    if (!card.contains(e.relatedTarget)) {
        card.classList.remove('yt-drag-over-top', 'yt-drag-over-bottom');
    }
}

function ytDrop(e) {
    e.preventDefault();
    const card = e.target.closest('.yt-studio-card');
    if (!card) return;
    card.classList.remove('yt-drag-over-top', 'yt-drag-over-bottom');

    const fromIdx = ytDragSrcIndex;
    const toIdx = parseInt(card.dataset.ytIdx);
    if (fromIdx === null || fromIdx === toIdx) return;

    // Get the currently filtered list to find the actual items
    let filtered = getYTFilteredItems();
    const movedItem = filtered[fromIdx];
    if (!movedItem) return;

    // Reorder in the filtered context — find positions in main array
    const fromMainIdx = ytStudioItems.indexOf(movedItem);
    const targetItem = filtered[toIdx];
    const toMainIdx = ytStudioItems.indexOf(targetItem);

    // Remove from old position and insert at new
    ytStudioItems.splice(fromMainIdx, 1);
    const newToIdx = ytStudioItems.indexOf(targetItem);
    if (fromIdx < toIdx) {
        ytStudioItems.splice(newToIdx + 1, 0, movedItem);
    } else {
        ytStudioItems.splice(newToIdx, 0, movedItem);
    }

    renderYTStudio();
    ytSyncSortOrderToNotion();
}

function ytDragEnd(e) {
    ytDragSrcIndex = null;
    document.querySelectorAll('.yt-studio-card.yt-dragging, .yt-studio-card.yt-drag-over-top, .yt-studio-card.yt-drag-over-bottom').forEach(c => {
        c.classList.remove('yt-dragging', 'yt-drag-over-top', 'yt-drag-over-bottom');
    });
}

function getYTFilteredItems() {
    let filtered = ytStudioItems;
    if (ytStudioFilter !== 'all') {
        if (ytStudioFilter === 'in-progress') {
            filtered = filtered.filter(i =>
                !i.progress.includes('Done') &&
                i.progress.some(p => p !== 'Next One')
            );
        } else {
            filtered = filtered.filter(i => i.progress.includes(ytStudioFilter));
        }
    }
    return filtered;
}

// Write sort order back to Notion (debounced, background)
let ytSortTimer = null;
function ytSyncSortOrderToNotion() {
    clearTimeout(ytSortTimer);
    ytSortTimer = setTimeout(async () => {
        console.log('[RayOS YT Studio] Syncing sort order to Notion...');
        const updates = ytStudioItems.map((item, idx) => ({ id: item.id, order: (idx + 1) * 10 }));
        let ok = 0;
        for (const u of updates) {
            try {
                await notionFetch('/pages/' + u.id, 'PATCH', {
                    properties: { '排序': { number: u.order } }
                });
                ok++;
            } catch (e) {
                if (ok === 0 && e.message && e.message.includes('排序')) {
                    showToast('請先在 Notion DB 新增「排序」Number 欄位', true);
                    return;
                }
                console.warn('[RayOS YT Studio] Sort write failed for', u.id, e.message);
            }
        }
        console.log('[RayOS YT Studio] Sort synced:', ok + '/' + updates.length);
        if (ok > 0) showToast('✓ 排序已同步 Notion');
    }, 800);
}

// === Dashboard stat ===
function updateYTStudioStats() {
    const el = document.getElementById('stat-ytstudio');
    if (!el) return;
    const nextOne = ytStudioItems.filter(i => i.progress.includes('Next One') && !i.progress.includes('Done'));
    el.textContent = nextOne.length;
}
