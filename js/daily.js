// ==================== DAILY HABITS ====================


function updateDailyProgress() {
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
    Object.keys(habits).forEach(h => { if(oldH[h]!==habits[h]) writeHabitToNotion(today,h,habits[h]); });
    updateDailyHistoryTable();
}

function loadDailyHabits(skipNotionCreate = false) {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('daily-date').textContent = today;
    if (!dailyHabitsData[today]) {
        dailyHabitsData[today] = {trading:false,advertise:false,deliver:false,gym:false,fatloss:false,ai:false};
        localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
        // Only create in Notion if explicitly allowed (not during initial page load)
        if (!skipNotionCreate) createDayInNotion(today);
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
    
    const today = new Date();
    const habits = ['trading', 'advertise', 'deliver', 'gym', 'fatloss', 'ai'];
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    
    // Check if we have meaningful data
    const dataKeys = Object.keys(dailyHabitsData).filter(k => {
        const dh = dailyHabitsData[k];
        return dh && Object.values(dh).some(v => v === true);
    });
    
    if (dataKeys.length === 0 && syncInProgress) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:40px;font-size:12px;">⏳ 正在從 Notion 同步資料...</td></tr>';
        return;
    }
    
    let rows = [];
    
    // 從最近的日期開始往前顯示 60 天
    for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayHabits = dailyHabitsData[dateStr] || {};
        
        const dateLabel = `${d.getMonth() + 1}/${d.getDate()} ${dayNames[d.getDay()]}`;
        const isToday = i === 0;
        
        let completed = 0;
        let cells = '';
        habits.forEach(h => {
            const done = dayHabits[h] === true;
            if (done) completed++;
            const checkStyle = done 
                ? 'color:#4a7c59;font-weight:bold;font-size:14px;' 
                : 'color:var(--text-muted);font-size:12px;';
            cells += `<td style="text-align:center;cursor:pointer;${checkStyle}" onclick="toggleHistoryHabit('${dateStr}','${h}')">${done ? '✓' : '−'}</td>`;
        });
        
        const rowClass = isToday ? 'today-row' : '';
        const totalStyle = completed > 0 ? 'color:var(--accent);font-weight:600;' : 'color:var(--text-muted);';
        rows.push(`<tr class="${rowClass}"><td>${dateLabel}</td>${cells}<td style="${totalStyle}">${completed}/6</td></tr>`);
    }
    
    tbody.innerHTML = rows.join('');
}

function toggleHistoryHabit(dateStr, habit) {
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
    writeHabitToNotion(dateStr, habit, nv);
}
