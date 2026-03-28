// ==================== PLAN ====================

let planSyncInProgress = false;
let _planSortable = null;

function savePlanToLocal() {
    localStorage.setItem('plan_items', JSON.stringify(planItems));
    localStorage.setItem('plan_page_index', JSON.stringify(planPageIndex));
}

// Sort plans by order only (priority is visual label, not sort key)
function getSortedPlans() {
    return planItems
        .filter(p => p.type === 'plan' && p.status !== 'archived')
        .sort((a, b) => (a.order || 0) - (b.order || 0));
}

// === Render ===

function renderPlanSection() {
    renderPlanCards();
    renderTodoList();
    const dot = document.getElementById('plan-sync-dot');
    if (dot) dot.className = 'sync-dot ' + (hasNotionDirect() ? 'on' : 'off');
}

function renderPlanCards() {
    const container = document.getElementById('plan-cards');
    if (!container) return;
    const plans = getSortedPlans();

    // Setup event delegation ONCE (not per card)
    if (!container._delegated) {
        container._delegated = true;
        container.addEventListener('click', function(e) {
            const card = e.target.closest('.plan-card');
            if (!card) return;
            const id = card.dataset.planId;
            const title = card.dataset.planTitle;
            console.log('[Plan Click] id:', id, 'title:', title, 'target:', e.target.className);

            // Edit button
            if (e.target.closest('.plan-btn-edit')) {
                e.stopPropagation();
                console.log('[Plan Edit] opening modal for:', id, title);
                editPlan(id);
                return;
            }
            // Delete button
            if (e.target.closest('.plan-btn-delete')) {
                e.stopPropagation();
                deletePlan(id);
                return;
            }
            // Click on card body/header = expand
            if (!e.target.closest('.plan-card-actions')) {
                togglePlanExpand(id);
            }
        });
    }

    if (plans.length === 0) {
        container.textContent = '';
        const hint = document.createElement('div');
        hint.style.cssText = 'color:var(--text-muted);font-size:13px;padding:12px 0;';
        hint.textContent = '還沒有計劃，點「+ 新增計劃」開始';
        container.appendChild(hint);
        return;
    }

    container.textContent = '';
    plans.forEach(p => {
        const prioIcon = p.priority === 'high' ? '🔴' : p.priority === 'low' ? '⚪' : '🟠';
        const descLines = (p.description || '').split('\n');
        const descPreview = descLines.slice(0, 2).join('\n');
        const hasMore = descLines.length > 2 || (p.description || '').length > 120;
        const isExpanded = !!p._expanded;

        const card = document.createElement('div');
        card.className = 'plan-card' + (isExpanded ? ' expanded' : '');
        card.dataset.planId = p.id;
        card.dataset.planTitle = p.title || '';
        card.dataset.planDesc = p.description || '';
        card.dataset.planPriority = p.priority || 'medium';
        if (isExpanded) card.style.aspectRatio = 'auto';

        // Title
        const header = document.createElement('div');
        header.className = 'plan-card-header';
        const titleEl = document.createElement('div');
        titleEl.className = 'plan-card-title';
        titleEl.textContent = prioIcon + ' ' + p.title;
        header.appendChild(titleEl);

        // Description
        const body = document.createElement('div');
        body.className = 'plan-card-body';
        const descEl = document.createElement('div');
        descEl.className = 'plan-card-desc';
        const displayText = isExpanded ? (p.description || '') : descPreview;
        if (displayText) {
            descEl.textContent = displayText;
            descEl.style.whiteSpace = 'pre-wrap';
        } else {
            descEl.style.color = 'var(--text-muted)';
            descEl.textContent = '無描述';
        }
        body.appendChild(descEl);
        if (hasMore && !isExpanded) {
            const more = document.createElement('div');
            more.className = 'plan-card-more';
            more.textContent = '點擊展開 ▼';
            body.appendChild(more);
        }

        // Actions (bottom) — NO event listeners, delegation handles clicks
        const actions = document.createElement('div');
        actions.className = 'plan-card-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small plan-btn-edit';
        editBtn.textContent = '編輯';
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-small plan-btn-delete';
        delBtn.textContent = '刪除';
        delBtn.style.color = 'var(--danger)';
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(actions);
        container.appendChild(card);
    });

    // Init SortableJS
    if (_planSortable) _planSortable.destroy();
    if (typeof Sortable !== 'undefined' && plans.length > 1) {
        _planSortable = new Sortable(container, {
            animation: 150,
            delay: 200,
            delayOnTouchOnly: false,
            ghostClass: 'plan-card-ghost',
            chosenClass: 'plan-card-chosen',
            dragClass: 'plan-card-drag',
            filter: '.plan-card-actions',
            preventOnFilter: false,
            onEnd: async function () {
                const cards = container.querySelectorAll('.plan-card');
                cards.forEach((card, i) => {
                    const id = card.dataset.planId;
                    const item = planItems.find(p => p.id === id);
                    if (item) item.order = i + 1;
                });
                savePlanToLocal();
                showToast('正在同步順序...');
                await syncPlanOrder(getSortedPlans());
                showToast('✓ 順序已同步');
            }
        });
    }
}

function renderTodoList() {
    const container = document.getElementById('todo-list');
    if (!container) return;
    const todos = planItems.filter(p => p.type === 'todo' && p.status !== 'archived');
    if (todos.length === 0) {
        container.textContent = '';
        const hint = document.createElement('div');
        hint.style.cssText = 'color:var(--text-muted);font-size:13px;padding:12px 0;';
        hint.textContent = '沒有代辦事項';
        container.appendChild(hint);
        return;
    }
    todos.sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        return (a.order || 0) - (b.order || 0);
    });

    container.textContent = '';
    todos.forEach(t => {
        const done = t.status === 'done';
        const row = document.createElement('div');
        row.className = 'todo-item' + (done ? ' done' : '');
        row.dataset.todoId = t.id;

        const checkbox = document.createElement('div');
        checkbox.className = 'todo-checkbox';
        checkbox.textContent = done ? '✓' : '';
        checkbox.addEventListener('click', () => toggleTodo(t.id));

        const text = document.createElement('div');
        text.className = 'todo-text';
        text.textContent = t.title;

        const del = document.createElement('button');
        del.className = 'todo-delete';
        del.textContent = '✕';
        del.addEventListener('click', () => deletePlan(t.id));

        row.appendChild(checkbox);
        row.appendChild(text);
        row.appendChild(del);
        container.appendChild(row);
    });
}

// === Reorder ===

function reorderPlan(dragId, dropId) {
    const plans = getSortedPlans();
    const dragIdx = plans.findIndex(p => p.id === dragId);
    const dropIdx = plans.findIndex(p => p.id === dropId);
    if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) return;

    const [moved] = plans.splice(dragIdx, 1);
    plans.splice(dropIdx, 0, moved);
    plans.forEach((p, i) => { p.order = i + 1; });

    savePlanToLocal();
    renderPlanCards();
    syncPlanOrder(plans);
    showToast('✓ 順序已更新');
}

function movePlan(id, direction) {
    const plans = getSortedPlans();
    const idx = plans.findIndex(p => p.id === id);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= plans.length) return;

    // Swap order values
    const tmpOrder = plans[idx].order;
    plans[idx].order = plans[targetIdx].order;
    plans[targetIdx].order = tmpOrder;

    savePlanToLocal();
    renderPlanCards();
    syncPlanOrder([plans[idx], plans[targetIdx]]);
    showToast('✓ 順序已更新');
}

async function syncPlanOrder(plans) {
    if (!hasNotionDirect()) return;
    const updates = plans.map(p => {
        const pageId = planPageIndex[p.id];
        if (!pageId) return Promise.resolve();
        return notionFetch('/pages/' + pageId, 'PATCH', {
            properties: { 'Order': { number: p.order } }
        }).catch(e => console.error('[Plan] Order sync failed:', p.id, e));
    });
    await Promise.all(updates);
    console.log('[Plan] Order synced to Notion');
}

// === Actions ===

function togglePlanExpand(id) {
    const item = planItems.find(p => p.id === id);
    if (item) item._expanded = !item._expanded;
    renderPlanCards();
}

function showPlanModal(editId) {
    const titleEl = document.getElementById('plan-modal-title');
    const idEl = document.getElementById('plan-edit-id');
    const titleInput = document.getElementById('plan-title-input');
    const descInput = document.getElementById('plan-desc-input');
    const prioInput = document.getElementById('plan-priority-input');

    if (editId) {
        // Read data directly from DOM card (not planItems — avoids stale data after drag)
        const card = document.querySelector('.plan-card[data-plan-id="' + editId + '"]');
        if (!card) {
            showToast('找不到計劃項目', true);
            return;
        }
        titleEl.textContent = '編輯計劃';
        idEl.value = editId;
        titleInput.value = card.dataset.planTitle || '';
        descInput.value = card.dataset.planDesc || '';
        prioInput.value = card.dataset.planPriority || 'medium';
    } else {
        titleEl.textContent = '新增計劃';
        idEl.value = '';
        titleInput.value = '';
        descInput.value = '';
        prioInput.value = 'medium';
    }
    showModal('plan-modal');
}

function editPlan(id) { showPlanModal(id); }

async function savePlan() {
    const idEl = document.getElementById('plan-edit-id');
    const title = document.getElementById('plan-title-input').value.trim();
    const desc = document.getElementById('plan-desc-input').value.trim();
    const priority = document.getElementById('plan-priority-input').value;

    if (!title) { showToast('請輸入標題', true); return; }

    const editId = idEl.value;

    if (editId) {
        // Update planItems
        const item = planItems.find(p => p.id === editId);
        if (item) {
            item.title = title;
            item.description = desc;
            item.priority = priority;
        }
        // Also update DOM card data attributes directly
        const card = document.querySelector('.plan-card[data-plan-id="' + editId + '"]');
        if (card) {
            card.dataset.planTitle = title;
            card.dataset.planDesc = desc;
            card.dataset.planPriority = priority;
        }
        savePlanToLocal();
        renderPlanCards();
        hideModal('plan-modal');
        showToast('✓ 計劃已更新');
        await updatePlanInNotion(editId, { title, description: desc, priority });
    } else {
        // New plan: high priority gets order 0 (front), others append
        const plans = getSortedPlans();
        let newOrder;
        if (priority === 'high') {
            // Insert at front, shift others
            plans.forEach(p => { p.order = (p.order || 0) + 1; });
            newOrder = 1;
        } else {
            newOrder = plans.length + 1;
        }

        const id = 'plan_' + Date.now();
        const newItem = {
            id, type: 'plan', title, description: desc,
            status: 'active', priority, order: newOrder
        };
        planItems.push(newItem);
        savePlanToLocal();
        renderPlanCards();
        hideModal('plan-modal');
        showToast('✓ 計劃已新增');
        await createPlanInNotion(newItem);
        // Sync shifted orders if high priority
        if (priority === 'high' && plans.length > 0) syncPlanOrder(plans);
    }
}

async function addTodo() {
    const input = document.getElementById('todo-input');
    const title = input.value.trim();
    if (!title) return;

    const id = 'todo_' + Date.now();
    const newItem = {
        id, type: 'todo', title, description: '',
        status: 'active', priority: 'medium',
        order: planItems.filter(p => p.type === 'todo').length + 1
    };
    planItems.push(newItem);
    input.value = '';
    savePlanToLocal();
    renderTodoList();
    showToast('✓ 代辦已新增');
    await createPlanInNotion(newItem);
}

async function toggleTodo(id) {
    const item = planItems.find(p => p.id === id);
    if (!item) return;
    item.status = item.status === 'done' ? 'active' : 'done';
    savePlanToLocal();
    renderTodoList();
    await updatePlanInNotion(id, { status: item.status });
}

async function deletePlan(id) {
    const item = planItems.find(p => p.id === id);
    if (!item) return;
    const label = item.type === 'plan' ? '計劃' : '代辦';
    if (!confirm('確定刪除這個' + label + '？')) return;

    item.status = 'archived';
    savePlanToLocal();
    renderPlanCards();
    renderTodoList();
    showToast('✓ 已刪除');

    const pageId = planPageIndex[id];
    if (pageId && hasNotionDirect()) {
        try {
            await notionFetch('/pages/' + pageId, 'PATCH', { archived: true });
        } catch (e) {
            console.error('[Plan] Delete from Notion failed:', e);
        }
    }
}

// === Notion Sync ===

async function syncPlanFromNotion(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('需要設定 Notion Token', true);
        return;
    }
    if (planSyncInProgress) return;
    planSyncInProgress = true;
    if (!silent) showToast('正在從 Notion 同步計劃...');

    try {
        const data = await notionFetch('/databases/' + PLAN_DB_ID + '/query', 'POST', {
            page_size: 100,
            filter: { property: 'Status', select: { does_not_equal: 'archived' } },
            sorts: [{ property: 'Order', direction: 'ascending' }]
        });

        const newItems = [];
        const newIndex = {};

        for (const page of data.results) {
            if (page.archived) continue;
            const props = page.properties;
            const titleArr = props['Title']?.title;
            if (!titleArr || !titleArr[0]) continue;

            const title = titleArr[0].plain_text;
            const type = props['Type']?.select?.name || 'todo';
            const status = props['Status']?.select?.name || 'active';
            const priority = props['Priority']?.select?.name || 'medium';
            const description = props['Description']?.rich_text?.map(r => r.plain_text).join('') || '';
            const order = props['Order']?.number || 0;
            const dueDate = props['DueDate']?.date?.start || null;

            const id = type + '_' + page.id.replace(/-/g, '').substring(0, 8);
            newIndex[id] = page.id;
            newItems.push({ id, type, title, description, status, priority, order, dueDate });
        }

        planItems = newItems;
        planPageIndex = newIndex;
        savePlanToLocal();
        renderPlanSection();

        if (!silent) showToast('✓ 已同步 ' + newItems.length + ' 個項目');
    } catch (e) {
        console.error('[Plan] Sync error:', e);
        if (!silent) showToast('同步失敗: ' + e.message, true);
    } finally {
        planSyncInProgress = false;
    }
}

async function createPlanInNotion(item) {
    if (!hasNotionDirect()) return;
    try {
        const props = {
            'Title': { title: [{ text: { content: item.title } }] },
            'Type': { select: { name: item.type } },
            'Status': { select: { name: item.status } },
            'Priority': { select: { name: item.priority } },
            'Order': { number: item.order || 0 }
        };
        if (item.description) {
            props['Description'] = { rich_text: [{ text: { content: item.description } }] };
        }
        if (item.dueDate) {
            props['DueDate'] = { date: { start: item.dueDate } };
        }
        const page = await notionFetch('/pages', 'POST', {
            parent: { database_id: PLAN_DB_ID },
            properties: props
        });
        planPageIndex[item.id] = page.id;
        localStorage.setItem('plan_page_index', JSON.stringify(planPageIndex));
        console.log('[Plan] Created in Notion:', item.title, '→', page.id);
    } catch (e) {
        console.error('[Plan] Create in Notion failed:', e);
        showToast('Notion 寫入失敗: ' + e.message, true);
    }
}

async function updatePlanInNotion(id, updates) {
    if (!hasNotionDirect()) return;
    const pageId = planPageIndex[id];
    if (!pageId) return;
    try {
        const props = {};
        if (updates.title !== undefined)
            props['Title'] = { title: [{ text: { content: updates.title } }] };
        if (updates.description !== undefined)
            props['Description'] = { rich_text: [{ text: { content: updates.description } }] };
        if (updates.status !== undefined)
            props['Status'] = { select: { name: updates.status } };
        if (updates.priority !== undefined)
            props['Priority'] = { select: { name: updates.priority } };
        if (updates.order !== undefined)
            props['Order'] = { number: updates.order };
        await notionFetch('/pages/' + pageId, 'PATCH', { properties: props });
        console.log('[Plan] Updated in Notion:', id);
    } catch (e) {
        console.error('[Plan] Update in Notion failed:', e);
    }
}
