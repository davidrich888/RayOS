// ==================== DAILY HABITS ====================


async function updateDailyProgress() {
    const checks = document.querySelectorAll('.habit-check');
    const done = Array.from(checks).filter(c => c.checked).length;
    const totalCount = checks.length;
    document.getElementById('daily-done').textContent = done;
    document.getElementById('daily-total').textContent = totalCount;
    document.getElementById('daily-bar').style.width = (done / totalCount * 100) + '%';
    const today = new Date().toISOString().split('T')[0];
    const oldH = dailyHabitsData[today] || {};
    const habits = {};
    checks.forEach(c => { habits[c.dataset.habit] = c.checked; });
    dailyHabitsData[today] = habits;
    try { localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData)); } catch(e) {}
    // 按需建立：若今天不在 Notion，先建立再寫入
    const changed = Object.keys(habits).filter(h => oldH[h] !== habits[h]);
    if (changed.length > 0 && !notionPageIndex[today]) {
        await createDayInNotion(today);
    }
    changed.forEach(h => writeHabitToNotion(today, h, habits[h]));
    updateDailyHistoryTable();
}

function loadDailyHabits() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('daily-date').textContent = today;
    if (!dailyHabitsData[today]) {
        dailyHabitsData[today] = {trading:false,advertise:false,deliver:false,gym:false,fatloss:false,ai:false};
        localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
    }
    const todayHabits = dailyHabitsData[today] || {};
    document.querySelectorAll('.habit-check').forEach(c => { c.checked = todayHabits[c.dataset.habit] === true; });
    let streak=0;const d=new Date();
    while(true){const ds=d.toISOString().split('T')[0];const dh=dailyHabitsData[ds];if(!dh)break;if(Object.values(dh).some(v=>v===true)){streak++;d.setDate(d.getDate()-1);}else break;}
    document.getElementById('stat-streak').textContent = streak;
    updateDailyProgress();
    updateDailyHistoryTable();
}

function updateDailyHistoryTable() {
    const tbody = document.getElementById('daily-history-body');
    if (!tbody) return;

    const habits = ['trading', 'advertise', 'deliver', 'gym', 'fatloss', 'ai'];
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const todayStr = new Date().toISOString().split('T')[0];

    if (syncInProgress && Object.keys(dailyHabitsData).length === 0) {
        tbody.textContent = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.style.cssText = 'text-align:center;color:var(--text-dim);padding:40px;font-size:12px;';
        td.textContent = '⏳ 正在從 Notion 同步資料...';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    // 收集所有有資料的日期，加上今天
    const dates = new Set(Object.keys(dailyHabitsData));
    dates.add(todayStr);
    // 按日期降序排列
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

        // 各習慣欄
        let completed = 0;
        habits.forEach(h => {
            const done = dayHabits[h] === true;
            if (done) completed++;
            const td = document.createElement('td');
            td.style.cssText = 'text-align:center;cursor:pointer;' + (done
                ? 'color:#4a7c59;font-weight:bold;font-size:14px;'
                : 'color:var(--text-muted);font-size:12px;');
            td.textContent = done ? '✓' : '−';
            td.onclick = () => toggleHistoryHabit(dateStr, h);
            tr.appendChild(td);
        });

        // Total 欄
        const totalTd = document.createElement('td');
        totalTd.style.cssText = completed > 0 ? 'color:var(--accent);font-weight:600;' : 'color:var(--text-muted);';
        totalTd.textContent = completed + '/6';
        tr.appendChild(totalTd);

        tbody.appendChild(tr);
    }
}

async function toggleHistoryHabit(dateStr, habit) {
    if (!dailyHabitsData[dateStr]) dailyHabitsData[dateStr] = {};
    const nv = !dailyHabitsData[dateStr][habit];
    dailyHabitsData[dateStr][habit] = nv;
    localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
    updateDailyHistoryTable();
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) {
        const cb = document.querySelector(`.habit-check[data-habit="${habit}"]`);
        if (cb) { cb.checked = nv; updateDailyProgress(); return; }
    }
    // 按需建立：若該日期不在 Notion，先建立再寫入
    if (!notionPageIndex[dateStr]) {
        await createDayInNotion(dateStr);
    }
    writeHabitToNotion(dateStr, habit, nv);
}
