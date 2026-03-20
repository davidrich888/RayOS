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
        case 'content':
            if (typeof renderContentSection === 'function') renderContentSection();
            if (firstVisit && canSync) {
                if (typeof syncContentFromNotion === 'function') syncContentFromNotion(true);
                if (typeof syncYTStudioFromNotion === 'function') syncYTStudioFromNotion(true);
            }
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

// Target modal data
const TARGET_DATA = {
    bali: {
        title: '🏝️ Bali Villa — $200,000 USD',
        html: `
            <div style="margin-bottom:16px;">
                <img src="icons/bali-villa.jpg" alt="Bali Villa" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：峇里島私人別墅</p>
                    <p><strong style="color:var(--accent);">預算</strong>：$200,000 USD</p>
                    <p><strong style="color:var(--accent);">用途</strong>：度假 + 遠端工作基地</p>
                    <p><strong style="color:var(--accent);">靈感參考</strong>：</p>
                    <p>📸 <a href="https://www.instagram.com/axelrayne/saved/_/18034424416904428/" target="_blank" style="color:var(--accent);">IG 收藏 — Bali Villa 靈感</a></p>
                </div>
            </div>`
    },
    yuzawa: {
        title: '🏔️ Yuzawa Villa — $80,000 USD',
        html: `
            <div style="margin-bottom:16px;">
                <img src="https://www.angel-f.com/smp/yuzawa/mansion/img/2124_1.jpg" alt="Yuzawa Villa" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;" onerror="this.style.display='none'">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：日本湯澤別墅（滑雪度假用）</p>
                    <p><strong style="color:var(--accent);">預算</strong>：$80,000 USD</p>
                    <p><strong style="color:var(--accent);">相關連結</strong>：</p>
                    <p>📍 <a href="https://maps.app.goo.gl/gsx13XfxXKfgnWHr5?g_st=il" target="_blank" style="color:var(--accent);">Google Maps 位置</a></p>
                    <p>🏠 <a href="https://www.angel-f.com/smp/yuzawa/mansion/2124.html" target="_blank" style="color:var(--accent);">物件資訊（Angel-F）</a></p>
                </div>
            </div>`
    },
    bangkok: {
        title: '🏠 Bangkok House — $100,000 USD',
        html: `
            <div style="margin-bottom:16px;">
                <img src="https://images.unsplash.com/photo-1583511655826-05700442b31b?w=400&q=80" alt="Bangkok" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：曼谷房子</p>
                    <p><strong style="color:var(--accent);">預算</strong>：$100,000 USD</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：研究中</p>
                </div>
            </div>`
    },
    mclaren: {
        title: '🏎️ McLaren — $300,000 USD',
        html: `
            <div style="margin-bottom:16px;">
                <img src="https://images.unsplash.com/photo-1621135802920-133df287f89c?w=800&q=80" alt="McLaren" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：McLaren</p>
                    <p><strong style="color:var(--accent);">預算</strong>：$300,000 USD</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：研究中</p>
                </div>
            </div>`
    }
};

function showTargetModal(key) {
    const data = TARGET_DATA[key];
    if (!data) return;
    document.getElementById('target-modal-title').textContent = data.title;
    document.getElementById('target-modal-body').innerHTML = data.html;
    document.getElementById('target-modal').style.display = 'flex';
}
function hideModal(id) { document.getElementById(id).classList.remove('show'); }
function formatNumber(n) { return new Intl.NumberFormat('zh-TW').format(Math.round(n)); }
function formatMoney(n) { if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'; if (n >= 1000) return Math.round(n / 1000) + 'K'; return formatNumber(n); }
function toTWD(a, c) { if (c === 'USD') return a * USD_RATE; if (c === 'USDT') return a * USDT_RATE; return a; }
