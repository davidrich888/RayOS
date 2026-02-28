// ==================== NAVIGATION + UTILS ====================

function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('show');
    document.querySelector('.mobile-menu-btn').innerHTML = document.querySelector('.sidebar').classList.contains('open') ? 'â' : 'â°';
}

// Track which sections have been synced this session
const _sectionSynced = {};

function go(section) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(section)?.classList.add('active');
    window.scrollTo(0, 0);
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
        document.querySelector('.sidebar-overlay').classList.remove('show');
        document.querySelector('.mobile-menu-btn').innerHTML = 'â°';
    }

    // === Auto-sync & refresh on section navigation ===
    const canSync = (typeof hasNotionDirect === 'function' && hasNotionDirect()) || (typeof getN8nUrl === 'function' && getN8nUrl());
    const firstVisit = !_sectionSynced[section];
    if (firstVisit) _sectionSynced[section] = true;

    switch (section) {
        case 'daily':
            if (typeof loadDailyHabits === 'function') loadDailyHabits();
            if (firstVisit && canSync && typeof syncDailyFromNotionDirect === 'function') syncDailyFromNotionDirect(true);
            break;
        case 'ideas':
            if (typeof renderIdeasList === 'function') renderIdeasList();
            if (firstVisit && canSync && typeof syncIdeasFromNotionDirect === 'function') syncIdeasFromNotionDirect(true);
            break;
        case 'wealth':
            if (typeof updateWealthDisplay === 'function') updateWealthDisplay();
            if (firstVisit) {
                if (typeof syncWealthFromGoogleSheets === 'function') syncWealthFromGoogleSheets(true);
                if (typeof syncAccountsFromGoogleSheets === 'function') syncAccountsFromGoogleSheets(true);
            }
            break;
        case 'physic':
                        if (typeof loadBodyProgressFromDrive === 'function') loadBodyProgressFromDrive();
            if (typeof updatePhysicDisplay === 'function') updatePhysicDisplay();
            if (firstVisit && canSync && typeof syncBodyFromNotion === 'function') syncBodyFromNotion();
            break;
        case 'dashboard':
            if (typeof renderMoodboard === 'function') renderMoodboard();
            if (firstVisit && typeof syncMoodboardFromDrive === 'function') syncMoodboardFromDrive();
            break;
        case 'information':
            if (typeof renderVideoKnowledgeSummary === 'function') renderVideoKnowledgeSummary();
            if (firstVisit && canSync && typeof syncVideosFromNotion === 'function') syncVideosFromNotion(true);
            break;
        case 'lifecoach':
            if (typeof updateLifeOverview === 'function') updateLifeOverview();
            if (typeof autoAnalyzeLife === 'function') autoAnalyzeLife();
            break;
    }
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => go(item.dataset.section));
});


// === Dashboard moodboard: auto-sync on initial page load ===
// Dashboard is the default section, so go('dashboard') is never called on first load.
// We trigger renderMoodboard + syncMoodboardFromDrive here with a delay.
setTimeout(() => {
    if (typeof renderMoodboard === 'function') renderMoodboard();
    if (typeof syncMoodboardFromDrive === 'function') syncMoodboardFromDrive();
    _sectionSynced['dashboard'] = true;
}, 1500);

// ==================== UTILS ====================
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => t.classList.remove('show'), 3000);
}
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }
function formatNumber(n) { return new Intl.NumberFormat('zh-TW').format(Math.round(n)); }
function formatMoney(n) { if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'; if (n >= 1000) return Math.round(n / 1000) + 'K'; return formatNumber(n); }
function toTWD(a, c) { if (c === 'USD') return a * USD_RATE; if (c === 'USDT') return a * USDT_RATE; return a; }
