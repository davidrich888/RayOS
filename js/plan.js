// ==================== PLAN ====================

let planSyncInProgress = false;

function savePlanToLocal() {
    localStorage.setItem('plan_items', JSON.stringify(planItems));
    localStorage.setItem('plan_page_index', JSON.stringify(planPageIndex));
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
    const plans = planItems.filter(p => p.type === 'plan' && p.status !== 'archived');
    if (plans.length === 0) {
        container.textContent = '';
        const hint = document.createElement('div');
        hint.style.cssText = 'color:var(--text-muted);font-size:13px;padding:12px 0;';
        hint.textContent = '還沒有計劃，點「+ 新增計劃」開始';
        container.appendChild(hint);
        return;
    }
    const prioOrder = { high: 0, medium: 1, low: 2 };
    plans.sort((a, b) => (prioOrder[a.priority] || 1) - (prioOrder[b.priority] || 1) || (a.order || 0) - (b.order || 0));

    container.textContent = '';
    plans.forEach((p, idx) => {
        const prioIcon = p.priority === 'high' ? '🔴' : p.priority === 'low' ? '⚪' : '🟠';
        const descLines = (p.description || '').split('\n');
        const descPreview = descLines.slice(0, 2).join('\n');
        const hasMore = descLines.length > 2 || (p.description || '').length > 120;
        const isExpanded = !!p._expanded;

        const card = document.createElement('div');
        card.className = 'plan-card' + (isExpanded ? ' expanded' : '');
        card.dataset.planId = p.id;
        if (isExpanded) card.style.aspectRatio = 'auto';
        card.draggable = true;

        // Drag events
        card.addEventListener('dragstart', e => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', p.id);
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.plan-card.drag-over').forEach(el => el.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const dragging = container.querySelector('.dragging');
            if (dragging && dragging !== card) {
                card.classList.add('drag-over');
            }
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', e => {
            e.preventDefault();
            card.classList.remove('drag-over');
            const dragId = e.dataTransfer.getData('text/plain');
            if (dragId && dragId !== p.id) {
                reorderPlan(dragId, p.id);
            }
        });

        const header = document.createElement('div');
        header.className = 'plan-card-header';

        // Drag handle
        const handle = document.createElement('div');
        handle.className = 'plan-drag-handle';
        handle.textContent = '⠿';
        handle.title = '拖曳排序';
        header.appendChild(handle);

        const titleEl = document.createElement('div');
        titleEl.className = 'plan-card-title';
        titleEl.textContent = prioIcon + ' ' + p.title;
        titleEl.addEventListener('click', () => togglePlanExpand(p.id));
        header.appendChild(titleEl);

        const actions = document.createElement('div');
        actions.className = 'plan-card-actions';
        // Up/down arrows for mobile
        if (idx > 0) {
            const upBtn = document.createElement('button');
            upBtn.className = 'btn btn-small plan-move-btn';
            upBtn.textContent = '▲';
            upBtn.addEventListener('click', e => { e.stopPropagation(); movePlan(p.id, -1); });
            actions.appendChild(upBtn);
        }
        if (idx < plans.length - 1) {
            const downBtn = document.createElement('button');
            downBtn.className = 'btn btn-small plan-move-btn';
            downBtn.textContent = '▼';
            downBtn.addEventListener('click', e => { e.stopPropagation(); movePlan(p.id, 1); });
            actions.appendChild(downBtn);
        }
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small';
        editBtn.textContent = '編輯';
        editBtn.addEventListener('click', e => { e.stopPropagation(); editPlan(p.id); });
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-small';
        delBtn.textContent = '刪除';
        delBtn.style.color = 'var(--danger)';
        delBtn.addEventListener('click', e => { e.stopPropagation(); deletePlan(p.id); });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        header.appendChild(actions);

        const body = document.createElement('div');
        body.className = 'plan-card-body';
        body.addEventListener('click', () => togglePlanExpand(p.id));
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

        card.appendChild(header);
        card.appendChild(body);
        container.appendChild(card);
    });
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
    const plans = planItems.filter(p => p.type === 'plan' && p.status !== 'archived');
    const prioOrder = { high: 0, medium: 1, low: 2 };
    plans.sort((a, b) => (prioOrder[a.priority] || 1) - (prioOrder[b.priority] || 1) || (a.order || 0) - (b.order || 0));

    const dragIdx = plans.findIndex(p => p.id === dragId);
    const dropIdx = plans.findIndex(p => p.id === dropId);
    if (dragIdx === -1 || dropIdx === -1) return;

    const [moved] = plans.splice(dragIdx, 1);
    plans.splice(dropIdx, 0, moved);

    plans.forEach((p, i) => { p.order = i + 1; });
    savePlanToLocal();
    renderPlanCards();
    syncPlanOrder(plans);
}

function movePlan(id, direction) {
    const plans = planItems.filter(p => p.type === 'plan' && p.status !== 'archived');
    const prioOrder = { high: 0, medium: 1, low: 2 };
    plans.sort((a, b) => (prioOrder[a.priority] || 1) - (prioOrder[b.priority] || 1) || (a.order || 0) - (b.order || 0));

    const idx = plans.findIndex(p => p.id === id);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= plans.length) return;

    [plans[idx], plans[targetIdx]] = [plans[targetIdx], plans[idx]];
    plans.forEach((p, i) => { p.order = i + 1; });
    savePlanToLocal();
    renderPlanCards();
    syncPlanOrder(plans);
}

async function syncPlanOrder(plans) {
    if (!hasNotionDirect()) return;
    for (const p of plans) {
        const pageId = planPageIndex[p.id];
        if (!pageId) continue;
        try {
            await notionFetch('/pages/' + pageId, 'PATCH', {
                properties: { 'Order': { number: p.order } }
            });
        } catch (e) {
            console.error('[Plan] Order sync failed:', p.id, e);
        }
    }
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
        const item = planItems.find(p => p.id === editId);
        if (!item) return;
        titleEl.textContent = '編輯計劃';
        idEl.value = editId;
        titleInput.value = item.title || '';
        descInput.value = item.description || '';
        prioInput.value = item.priority || 'medium';
    } else {
        titleEl.textContent = '新增計劃';
        idEl.value = '';
        titleInput.value = '';
        descInput.value = '';
        prioInput.value = 'medium';
    }
    showModal('plan-modal');
}

function editPlan(id) {
    showPlanModal(id);
}

async function savePlan() {
    const idEl = document.getElementById('plan-edit-id');
    const title = document.getElementById('plan-title-input').value.trim();
    const desc = document.getElementById('plan-desc-input').value.trim();
    const priority = document.getElementById('plan-priority-input').value;

    if (!title) { showToast('請輸入標題', true); return; }

    const editId = idEl.value;

    if (editId) {
        const item = planItems.find(p => p.id === editId);
        if (item) {
            item.title = title;
            item.description = desc;
            item.priority = priority;
            savePlanToLocal();
            renderPlanCards();
            hideModal('plan-modal');
            showToast('✓ 計劃已更新');
            await updatePlanInNotion(editId, { title, description: desc, priority });
        }
    } else {
        const id = 'plan_' + Date.now();
        const newItem = {
            id, type: 'plan', title, description: desc,
            status: 'active', priority,
            order: planItems.filter(p => p.type === 'plan').length + 1
        };
        planItems.push(newItem);
        savePlanToLocal();
        renderPlanCards();
        hideModal('plan-modal');
        showToast('✓ 計劃已新增');
        await createPlanInNotion(newItem);
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
        if (updates.title !== undefined) {
            props['Title'] = { title: [{ text: { content: updates.title } }] };
        }
        if (updates.description !== undefined) {
            props['Description'] = { rich_text: [{ text: { content: updates.description } }] };
        }
        if (updates.status !== undefined) {
            props['Status'] = { select: { name: updates.status } };
        }
        if (updates.priority !== undefined) {
            props['Priority'] = { select: { name: updates.priority } };
        }
        if (updates.order !== undefined) {
            props['Order'] = { number: updates.order };
        }
        await notionFetch('/pages/' + pageId, 'PATCH', { properties: props });
        console.log('[Plan] Updated in Notion:', id);
    } catch (e) {
        console.error('[Plan] Update in Notion failed:', e);
    }
}
