// ==================== DAILY HABITS ====================

const ALL_HABITS = ['trading', 'advertise', 'deliver', 'gym', 'fatloss', 'ai', 'nofap'];

// 三態循環：null → true → false → null
function cycleHabit(habit) {
    const today = new Date().toISOString().split('T')[0];
    if (!dailyHabitsData[today]) {
        dailyHabitsData[today] = {};
        ALL_HABITS.forEach(h => { dailyHabitsData[today][h] = null; });
    }
    const current = dailyHabitsData[today][habit];
    let next;
    if (current === null || current === undefined) next = true;
    else if (current === true) next = false;
    else next = null;
    dailyHabitsData[today][habit] = next;
    try { localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData)); } catch(e) {}
    // 更新 UI
    updateHabitItemUI(habit, next);
    updateDailyProgress();
    // 同步到 Notion（Notion checkbox: true→true, false→false, null→false）
    syncHabitToNotion(today, habit, next);
}

async function syncHabitToNotion(dateStr, habit, value) {
    // 按需建立：若該日期不在 Notion，先建立再寫入
    if (!notionPageIndex[dateStr]) {
        await createDayInNotion(dateStr);
    }
    writeHabitToNotion(dateStr, habit, value === true);
}

function updateHabitItemUI(habit, value) {
    const el = document.querySelector(`.habit-item[data-habit="${habit}"]`);
    if (!el) return;
    el.classList.remove('state-true', 'state-false');
    if (value === true) el.classList.add('state-true');
    else if (value === false) el.classList.add('state-false');
}

function updateDailyProgress() {
    const today = new Date().toISOString().split('T')[0];
    const todayHabits = dailyHabitsData[today] || {};
    const done = ALL_HABITS.filter(h => todayHabits[h] === true).length;
    const totalCount = ALL_HABITS.length;
    document.getElementById('daily-done').textContent = done;
    document.getElementById('daily-total').textContent = totalCount;
    document.getElementById('daily-bar').style.width = (done / totalCount * 100) + '%';
    updateDailyHistoryTable();
}

// 向下相容：舊 localStorage 的 false 轉成 null（舊資料的 false 其實是「未記錄」）
function migrateOldData() {
    let changed = false;
    Object.keys(dailyHabitsData).forEach(dateStr => {
        const day = dailyHabitsData[dateStr];
        if (!day || typeof day !== 'object') return;
        Object.keys(day).forEach(h => {
            if (day[h] === false) {
                day[h] = null;
                changed = true;
            }
        });
    });
    if (changed) {
        try { localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData)); } catch(e) {}
    }
}

function loadDailyHabits() {
    migrateOldData();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('daily-date').textContent = today;
    if (!dailyHabitsData[today]) {
        dailyHabitsData[today] = {};
        ALL_HABITS.forEach(h => { dailyHabitsData[today][h] = null; });
        localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
    }
    const todayHabits = dailyHabitsData[today] || {};
    // 更新所有 habit item 的 UI 狀態
    ALL_HABITS.forEach(h => updateHabitItemUI(h, todayHabits[h]));
    // 計算 streak：一天中只要有任何 habit 值為 true 就算有記錄
    let streak = 0;
    const d = new Date();
    while (true) {
        const ds = d.toISOString().split('T')[0];
        const dh = dailyHabitsData[ds];
        if (!dh) break;
        if (Object.values(dh).some(v => v === true)) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else break;
    }
    document.getElementById('stat-streak').textContent = streak;
    updateDailyProgress();
    updateDailyHistoryTable();
}

function updateDailyHistoryTable() {
    const tbody = document.getElementById('daily-history-body');
    if (!tbody) return;

    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const todayStr = new Date().toISOString().split('T')[0];

    if (syncInProgress && Object.keys(dailyHabitsData).length === 0) {
        tbody.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = ALL_HABITS.length + 2;
        td.style.cssText = 'text-align:center;color:var(--text-dim);padding:40px;font-size:12px;';
        td.textContent = '⏳ 正在從 Notion 同步資料...';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    // 收集所有有資料的日期，加上今天
    const dates = new Set(Object.keys(dailyHabitsData));
    dates.add(todayStr);
    const sortedDates = Array.from(dates).filter(d => d.match(/^\d{4}-\d{2}-\d{2}$/)).sort((a, b) => b.localeCompare(a));

    tbody.textContent = '';
    for (const dateStr of sortedDates) {
        const d = new Date(dateStr + 'T00:00:00');
        const dayHabits = dailyHabitsData[dateStr] || {};
        const dateLabel = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + dayNames[d.getDay()];
        const isToday = dateStr === todayStr;
        const inNotion = !!notionPageIndex[dateStr];

        const tr = document.createElement('tr');
        if (isToday) tr.className = 'today-row';

        // 日期欄
        const dateTd = document.createElement('td');
        dateTd.textContent = dateLabel + (inNotion ? '' : ' ⚠️');
        tr.appendChild(dateTd);

        // 各習慣欄（三態顯示）
        let completed = 0;
        ALL_HABITS.forEach(h => {
            const val = dayHabits[h];
            const td = document.createElement('td');
            td.style.cssText = 'text-align:center;cursor:pointer;';
            if (val === true) {
                completed++;
                td.style.cssText += 'color:#4a7c59;font-weight:bold;font-size:14px;';
                td.textContent = '✓';
            } else if (val === false) {
                td.style.cssText += 'color:var(--danger);font-weight:bold;font-size:14px;';
                td.textContent = '✗';
            } else {
                td.style.cssText += 'color:var(--text-muted);font-size:12px;';
                td.textContent = '∅';
            }
            td.onclick = () => toggleHistoryHabit(dateStr, h);
            tr.appendChild(td);
        });

        // Total 欄（只計算 true）
        const totalTd = document.createElement('td');
        totalTd.style.cssText = completed > 0 ? 'color:var(--accent);font-weight:600;' : 'color:var(--text-muted);';
        totalTd.textContent = completed + '/' + ALL_HABITS.length;
        tr.appendChild(totalTd);

        tbody.appendChild(tr);
    }
}

// 歷史表格點擊：三態循環
async function toggleHistoryHabit(dateStr, habit) {
    if (!dailyHabitsData[dateStr]) dailyHabitsData[dateStr] = {};
    const current = dailyHabitsData[dateStr][habit];
    let next;
    if (current === null || current === undefined) next = true;
    else if (current === true) next = false;
    else next = null;
    dailyHabitsData[dateStr][habit] = next;
    localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
    updateDailyHistoryTable();
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) {
        updateHabitItemUI(habit, next);
        updateDailyProgress();
    }
    // 同步到 Notion
    await syncHabitToNotion(dateStr, habit, next);
}
