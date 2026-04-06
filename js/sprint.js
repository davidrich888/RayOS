// ==================== 30-DAY SPRINT ====================

const SPRINT_DB_ID = '660a7a83e3494fdea794a1a399626f91';

// Local state
let sprintData = JSON.parse(localStorage.getItem('sprint_data') || '[]');
let sprintPageIndex = JSON.parse(localStorage.getItem('sprint_page_index') || '{}');

const MAX_ACTIVE_SPRINTS = 3;

function getActiveSprints() {
    return sprintData.filter(s => s.status === 'active');
}

function renderSprintSection() {
    const container = document.getElementById('sprint-content');
    if (!container) return;

    // Clear and rebuild with DOM methods
    container.textContent = '';

    const actives = getActiveSprints();
    const past = sprintData.filter(s => s.status !== 'active').sort((a, b) => b.startDate.localeCompare(a.startDate));

    // Sortable wrapper for active sprints
    const activeWrap = document.createElement('div');
    activeWrap.id = 'sprint-active-list';
    actives.forEach(s => {
        const card = buildActiveSprintCard(s);
        card.dataset.sprintId = s.id;
        activeWrap.appendChild(card);
    });
    container.appendChild(activeWrap);

    // Init drag-to-reorder (SortableJS already loaded)
    if (actives.length > 1 && typeof Sortable !== 'undefined') {
        Sortable.create(activeWrap, {
            animation: 200,
            handle: '.sprint-active-header',
            ghostClass: 'sprint-drag-ghost',
            onEnd: function () {
                const newOrder = [];
                activeWrap.querySelectorAll('.sprint-active-card').forEach(el => {
                    newOrder.push(el.dataset.sprintId);
                });
                // Reorder sprintData: active ones in new order, then rest
                const activeMap = {};
                sprintData.forEach(s => { if (s.status === 'active') activeMap[s.id] = s; });
                const rest = sprintData.filter(s => s.status !== 'active');
                sprintData = newOrder.map(id => activeMap[id]).concat(rest);
                saveSprintLocal();
            }
        });
    }

    // Show new sprint input if under limit
    if (actives.length < MAX_ACTIVE_SPRINTS) {
        container.appendChild(buildNewSprintForm(actives.length > 0));
    }

    if (past.length > 0) {
        const pastSection = document.createElement('div');
        pastSection.className = 'sprint-past-section';
        const pastTitle = document.createElement('div');
        pastTitle.className = 'form-title';
        pastTitle.style.cssText = 'font-size:14px;margin-bottom:12px;';
        pastTitle.textContent = '📜 歷史衝刺';
        pastSection.appendChild(pastTitle);
        past.forEach(s => pastSection.appendChild(buildPastSprintCard(s)));
        container.appendChild(pastSection);
    }
}

function buildNewSprintForm(compact) {
    const wrap = document.createElement('div');
    wrap.className = 'sprint-new-form';
    wrap.style.cssText = compact ? 'padding:16px 20px;' : 'text-align:center;padding:40px 20px;';

    if (!compact) {
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size:48px;margin-bottom:16px;';
        icon.textContent = '🔥';
        wrap.appendChild(icon);

        const title = document.createElement('div');
        title.style.cssText = "font-size:18px;font-family:'Cormorant Garamond',serif;color:var(--text);margin-bottom:8px;";
        title.textContent = '開始新的 30 天衝刺';
        wrap.appendChild(title);

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:24px;';
        desc.textContent = '每天堅持一個習慣，連續 30 天。';
        wrap.appendChild(desc);
    }

    if (compact) {
        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:8px;';
        label.textContent = '➕ 新增衝刺（最多同時 ' + MAX_ACTIVE_SPRINTS + ' 個）';
        wrap.appendChild(label);
    }

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;' + (compact ? 'align-items:center;' : 'justify-content:center;align-items:center;flex-wrap:wrap;');

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'sprint-name-input';
    input.placeholder = '習慣名稱（如：每天冥想10分鐘）';
    input.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:10px 16px;border-radius:8px;font-size:14px;width:300px;outline:none;';
    input.addEventListener('keypress', e => { if (e.key === 'Enter') createNewSprint(); });
    row.appendChild(input);

    const btn = document.createElement('button');
    btn.className = 'btn btn-accent';
    btn.textContent = '開始衝刺';
    btn.onclick = () => createNewSprint();
    row.appendChild(btn);

    wrap.appendChild(row);
    return wrap;
}

function buildActiveSprintCard(sprint) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(sprint.startDate + 'T00:00:00');
    const dayIndex = Math.floor((today - start) / 86400000);
    const days = sprint.days || {};

    let completed = 0;
    for (let i = 0; i < 30; i++) {
        if (days[i + 1] === true) completed++;
    }

    let streak = 0;
    for (let i = dayIndex; i >= 0; i--) {
        if (days[i + 1] === true) streak++;
        else break;
    }

    const pct = Math.round(completed / 30 * 100);
    const isFinished = dayIndex >= 29;

    const card = document.createElement('div');
    card.className = 'sprint-active-card';

    // Header
    const header = document.createElement('div');
    header.className = 'sprint-active-header';

    const left = document.createElement('div');
    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px;';
    label.textContent = '進行中的衝刺';
    left.appendChild(label);

    const nameEl = document.createElement('div');
    nameEl.style.cssText = "font-size:20px;font-family:'Cormorant Garamond',serif;color:var(--text);margin-top:4px;";
    nameEl.textContent = '🔥 ' + sprint.name;
    left.appendChild(nameEl);

    const right = document.createElement('div');
    right.style.cssText = 'text-align:right;';
    const countEl = document.createElement('div');
    countEl.style.cssText = "font-size:24px;font-family:'Cormorant Garamond',serif;color:var(--accent);font-weight:700;";
    countEl.textContent = completed + '/30';
    right.appendChild(countEl);
    const streakEl = document.createElement('div');
    streakEl.style.cssText = 'font-size:11px;color:var(--text-dim);';
    streakEl.textContent = '🔥 連續 ' + streak + ' 天';
    right.appendChild(streakEl);

    header.appendChild(left);
    header.appendChild(right);
    card.appendChild(header);

    // Progress bar
    const pBar = document.createElement('div');
    pBar.className = 'daily-progress-bar';
    pBar.style.margin = '16px 0 20px';
    const pLabel = document.createElement('span');
    pLabel.className = 'daily-progress-label';
    pLabel.style.minWidth = 'auto';
    pLabel.textContent = pct + '%';
    pBar.appendChild(pLabel);
    const pTrack = document.createElement('div');
    pTrack.className = 'daily-progress-track';
    const pFill = document.createElement('div');
    pFill.className = 'daily-progress-fill';
    pFill.style.width = pct + '%';
    pTrack.appendChild(pFill);
    pBar.appendChild(pTrack);
    const pRange = document.createElement('span');
    pRange.style.cssText = 'font-size:11px;color:var(--text-dim);';
    pRange.textContent = sprint.startDate + ' → ' + getEndDate(sprint.startDate);
    pBar.appendChild(pRange);
    card.appendChild(pBar);

    // 30-day grid
    const grid = document.createElement('div');
    grid.className = 'sprint-grid';

    for (let i = 0; i < 30; i++) {
        const dayNum = i + 1;
        const dayDate = new Date(start);
        dayDate.setDate(dayDate.getDate() + i);
        const dateStr = dayDate.toISOString().split('T')[0];
        const isFuture = i > dayIndex;
        const isToday = i === dayIndex;
        const checked = days[dayNum] === true;

        const cell = document.createElement('div');
        cell.className = 'sprint-cell';
        if (checked) cell.classList.add('checked');
        else if (isToday) cell.classList.add('today');
        else if (isFuture) cell.classList.add('future');
        else cell.classList.add('missed');

        cell.title = 'Day ' + dayNum + ' — ' + dateStr;

        if (!isFuture) {
            const sid = sprint.id;
            const dn = dayNum;
            cell.style.cursor = 'pointer';
            cell.onclick = () => toggleSprintDay(sid, dn);
        }

        const numSpan = document.createElement('span');
        numSpan.className = 'sprint-cell-num';
        numSpan.textContent = dayNum;
        cell.appendChild(numSpan);

        if (checked) {
            const checkSpan = document.createElement('span');
            checkSpan.className = 'sprint-cell-check';
            checkSpan.textContent = '✓';
            cell.appendChild(checkSpan);
        }

        grid.appendChild(cell);
    }

    card.appendChild(grid);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'sprint-actions';

    if (isFinished) {
        const completeBtn = document.createElement('button');
        completeBtn.className = 'btn btn-accent';
        completeBtn.textContent = '🎉 完成衝刺';
        completeBtn.onclick = () => completeSprint(sprint.id);
        actions.appendChild(completeBtn);
    }

    const abandonBtn = document.createElement('button');
    abandonBtn.className = 'btn';
    abandonBtn.style.cssText = 'font-size:11px;color:var(--text-dim);';
    abandonBtn.textContent = '放棄衝刺';
    abandonBtn.onclick = () => abandonSprint(sprint.id);
    actions.appendChild(abandonBtn);

    card.appendChild(actions);
    return card;
}

function buildPastSprintCard(sprint) {
    const days = sprint.days || {};
    let completed = 0;
    for (let i = 1; i <= 30; i++) {
        if (days[i] === true) completed++;
    }
    const pct = Math.round(completed / 30 * 100);
    const statusEmoji = sprint.status === 'completed' ? '🏆' : '❌';
    const statusText = sprint.status === 'completed' ? '完成' : '放棄';

    const card = document.createElement('div');
    card.className = 'sprint-past-card';

    // Top row
    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

    const leftInfo = document.createElement('div');
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-size:14px;color:var(--text);';
    nameSpan.textContent = sprint.name;
    leftInfo.appendChild(nameSpan);
    const dateSpan = document.createElement('span');
    dateSpan.style.cssText = 'font-size:11px;color:var(--text-dim);margin-left:8px;';
    dateSpan.textContent = sprint.startDate + ' → ' + getEndDate(sprint.startDate);
    leftInfo.appendChild(dateSpan);

    const rightInfo = document.createElement('div');
    rightInfo.style.cssText = 'font-size:12px;';
    rightInfo.textContent = statusEmoji + ' ' + statusText + ' · ';
    const pctSpan = document.createElement('span');
    pctSpan.style.color = 'var(--accent)';
    pctSpan.textContent = completed + '/30 (' + pct + '%)';
    rightInfo.appendChild(pctSpan);

    topRow.appendChild(leftInfo);
    topRow.appendChild(rightInfo);
    card.appendChild(topRow);

    // Mini grid
    const grid = document.createElement('div');
    grid.className = 'sprint-grid sprint-grid-small';
    for (let i = 0; i < 30; i++) {
        const cell = document.createElement('div');
        cell.className = 'sprint-cell sprint-cell-sm ' + (days[i + 1] === true ? 'checked' : 'missed-past');
        grid.appendChild(cell);
    }
    card.appendChild(grid);

    return card;
}

function getEndDate(startDate) {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + 29);
    return d.toISOString().split('T')[0];
}

function generateSprintId() {
    return 'sprint_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// === CRUD Operations ===

async function createNewSprint() {
    const input = document.getElementById('sprint-name-input');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
        showToast('請輸入習慣名稱', true);
        return;
    }

    if (getActiveSprints().length >= MAX_ACTIVE_SPRINTS) {
        showToast('最多同時 ' + MAX_ACTIVE_SPRINTS + ' 個衝刺', true);
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const sprint = {
        id: generateSprintId(),
        name: name,
        startDate: today,
        status: 'active',
        days: {}
    };

    sprintData.push(sprint);
    saveSprintLocal();
    renderSprintSection();
    showToast('🔥 衝刺開始！加油！');

    await createSprintInNotion(sprint);
}

function toggleSprintDay(sprintId, dayNum) {
    const sprint = sprintData.find(s => s.id === sprintId);
    if (!sprint) return;

    if (!sprint.days) sprint.days = {};
    sprint.days[dayNum] = !sprint.days[dayNum];

    saveSprintLocal();
    renderSprintSection();
    updateSprintInNotion(sprint);

    let allDone = true;
    for (let i = 1; i <= 30; i++) {
        if (!sprint.days[i]) { allDone = false; break; }
    }
    if (allDone) {
        showToast('🎉 恭喜！30 天全部完成！');
    }
}

function completeSprint(sprintId) {
    const sprint = sprintData.find(s => s.id === sprintId);
    if (!sprint) return;
    sprint.status = 'completed';
    saveSprintLocal();
    renderSprintSection();
    showToast('🏆 衝刺完成！太厲害了！');
    updateSprintInNotion(sprint);
}

function abandonSprint(sprintId) {
    if (!confirm('確定要放棄這個衝刺嗎？')) return;
    const sprint = sprintData.find(s => s.id === sprintId);
    if (!sprint) return;
    sprint.status = 'abandoned';
    saveSprintLocal();
    renderSprintSection();
    showToast('衝刺已放棄');
    updateSprintInNotion(sprint);
}

function saveSprintLocal() {
    localStorage.setItem('sprint_data', JSON.stringify(sprintData));
}

// === Notion Sync ===

async function createSprintInNotion(sprint) {
    if (!hasNotionDirect()) return;
    try {
        const page = await notionFetch('/pages', 'POST', {
            parent: { database_id: SPRINT_DB_ID },
            properties: {
                'Name': { title: [{ text: { content: sprint.name } }] },
                'StartDate': { date: { start: sprint.startDate } },
                'Status': { select: { name: sprint.status } },
                'Days': { rich_text: [{ text: { content: JSON.stringify(sprint.days || {}) } }] }
            }
        });
        sprintPageIndex[sprint.id] = page.id;
        localStorage.setItem('sprint_page_index', JSON.stringify(sprintPageIndex));
        console.log('[Sprint] Created in Notion:', sprint.id, '→', page.id);
    } catch (e) {
        console.error('[Sprint] Notion create error:', e);
    }
}

async function updateSprintInNotion(sprint) {
    if (!hasNotionDirect()) return;
    const pageId = sprintPageIndex[sprint.id];
    if (!pageId) {
        await createSprintInNotion(sprint);
        return;
    }
    try {
        await notionFetch('/pages/' + pageId, 'PATCH', {
            properties: {
                'Status': { select: { name: sprint.status } },
                'Days': { rich_text: [{ text: { content: JSON.stringify(sprint.days || {}) } }] }
            }
        });
        console.log('[Sprint] Updated in Notion:', sprint.id);
    } catch (e) {
        console.error('[Sprint] Notion update error:', e);
    }
}

async function syncSprintsFromNotion(silent = false) {
    if (!hasNotionDirect()) return;
    if (!silent) showToast('正在同步衝刺資料...');
    try {
        const data = await notionFetch('/databases/' + SPRINT_DB_ID + '/query', 'POST', {
            page_size: 50,
            sorts: [{ property: 'StartDate', direction: 'descending' }]
        });
        if (!data.results) return;

        const newData = [];
        const newIndex = {};

        for (const page of data.results) {
            const p = page.properties;
            const name = p['Name']?.title?.[0]?.plain_text || '';
            const startDate = p['StartDate']?.date?.start || '';
            const status = p['Status']?.select?.name || 'active';
            let days = {};
            try {
                const daysStr = p['Days']?.rich_text?.[0]?.plain_text || '{}';
                days = JSON.parse(daysStr);
            } catch (e) { days = {}; }

            if (!name || !startDate) continue;

            const localId = 'sprint_notion_' + page.id.replace(/-/g, '');
            newIndex[localId] = page.id;

            newData.push({
                id: localId,
                name,
                startDate,
                status,
                days
            });
        }

        sprintData = newData;
        sprintPageIndex = newIndex;
        saveSprintLocal();
        localStorage.setItem('sprint_page_index', JSON.stringify(sprintPageIndex));
        renderSprintSection();
        if (!silent) showToast('✓ 已同步 ' + newData.length + ' 個衝刺');
        console.log('[Sprint] Synced from Notion:', newData.length);
    } catch (e) {
        console.error('[Sprint] Sync error:', e);
        if (!silent) showToast('衝刺同步失敗: ' + e.message, true);
    }
}

