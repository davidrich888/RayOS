// ==================== NAVIGATION + UTILS ====================

// Sidebar collapse (desktop)
function toggleSidebarCollapse() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('rayos-sidebar-collapsed', sidebar.classList.contains('collapsed'));
}
// Restore collapsed state on load
if (localStorage.getItem('rayos-sidebar-collapsed') === 'true') {
    document.querySelector('.sidebar').classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
}

function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('show');
    document.querySelector('.mobile-menu-btn').innerHTML = document.querySelector('.sidebar').classList.contains('open') ? '\u2715' : '\u2630';
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
        document.querySelector('.mobile-menu-btn').innerHTML = '\u2630';
    }

    // === Auto-sync & refresh on section navigation ===
    const canSync = (typeof hasNotionDirect === 'function' && hasNotionDirect()) || (typeof getN8nUrl === 'function' && getN8nUrl());
    const firstVisit = !_sectionSynced[section];
    if (firstVisit) _sectionSynced[section] = true;

    switch (section) {
        case 'daily':
            if (typeof loadDailyHabits === 'function') loadDailyHabits();
            if (typeof renderSprintSection === 'function') renderSprintSection();
            if (firstVisit && canSync) {
                if (typeof syncDailyFromNotionDirect === 'function') syncDailyFromNotionDirect(true);
                if (typeof syncSprintsFromNotion === 'function') syncSprintsFromNotion(true);
            }
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
        case 'plan':
            if (typeof renderPlanSection === 'function') renderPlanSection();
            if (firstVisit && canSync && typeof syncPlanFromNotion === 'function') syncPlanFromNotion(true);
            break;
        case 'information':
            if (typeof renderVideoKnowledgeSummary === 'function') renderVideoKnowledgeSummary();
            if (firstVisit && canSync && typeof syncVideosFromNotion === 'function') syncVideosFromNotion(true);
            break;
        case 'lifecoach':
            if (typeof updateLifeOverview === 'function') updateLifeOverview();
            if (typeof autoAnalyzeLife === 'function') autoAnalyzeLife();
            break;
        case 'business':
            if (typeof loadBusinessMetrics === 'function') loadBusinessMetrics(true);
            break;
        case 'gtd':
            if (typeof loadGTDSnapshot === 'function') loadGTDSnapshot(firstVisit);
            break;
        case 'carousel-review':
            if (typeof loadCarouselReview === 'function') loadCarouselReview(firstVisit);
            break;
        case 'mancave':
            if (typeof loadMancaveReview === 'function') loadMancaveReview(firstVisit);
            break;
        case 'pipeline':
            if (typeof loadPipelineBoard === 'function') loadPipelineBoard(firstVisit);
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
    batcave: {
        title: '🥊 Man Cave — $100,000 USD',
        html: `
            <div style="margin-bottom:16px;">
                <img src="icons/mancave.jpg" alt="Man Cave" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;" onerror="this.style.display='none'">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：Man Cave 男人窩（第二優先）</p>
                    <p><strong style="color:var(--accent);">預算</strong>：$100,000 USD</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：研究中</p>
                </div>
            </div>`
    },
    mustang: {
        title: '🐎 Mustang 5.0',
        html: `
            <div style="margin-bottom:16px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
                    <img src="icons/mustang-real-1.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;grid-column:1/-1;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/mustang-real-1.jpg')">
                    <img src="icons/mustang-real-2.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/mustang-real-2.jpg')">
                    <img src="icons/mustang-real-3.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/mustang-real-3.jpg')">
                </div>
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：Mustang 5.0（第三優先）</p>
                    <p><strong style="color:var(--accent);">達標門檻</strong>：資產 &gt; 台幣 1,000 萬</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：研究中</p>
                </div>
            </div>`
    },
    bali: {
        title: '🏝️ Bali Villa — 資產 > 台幣 2,500 萬',
        html: `
            <div style="margin-bottom:16px;">
                <img src="icons/bali-villa.jpg" alt="Bali Villa" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：峇里島私人別墅</p>
                    <p><strong style="color:var(--accent);">達標門檻</strong>：資產 &gt; 台幣 2,500 萬</p>
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
        title: '🏎️ McLaren — 資產 > 台幣 6,000 萬',
        html: `
            <div style="margin-bottom:16px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
                    <img src="icons/mclaren-real-1.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/mclaren-real-1.jpg')">
                    <img src="icons/mclaren-real-2.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/mclaren-real-2.jpg')">
                </div>
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：McLaren</p>
                    <p><strong style="color:var(--accent);">達標門檻</strong>：資產 &gt; 台幣 6,000 萬</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：研究中</p>
                </div>
            </div>`
    },
    kawasaki: {
        title: '🏍️ Kawasaki Ninja ZX-4RR — ✅ 已達標',
        html: `
            <div style="margin-bottom:16px;">
                <img src="icons/kawasaki-zx10r.png" alt="Kawasaki ZX-10R" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;" onerror="this.style.display='none'">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">車款</strong>：Kawasaki Ninja ZX-4RR</p>
                    <p><strong style="color:var(--accent);">金額</strong>：$12,300 USD</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：✅ 已達標</p>
                </div>
            </div>`
    },
    move: {
        title: '📦 搬家 — 西區 2房',
        html: `
            <div style="margin-bottom:16px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
                    <div style="position:relative;">
                        <img src="icons/move-1.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-1.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">32,000 元/月</div>
                    </div>
                    <div style="position:relative;">
                        <img src="icons/move-2.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-2.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">32,000 元/月</div>
                    </div>
                    <div style="position:relative;">
                        <img src="icons/move-3.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-3.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">27,000 元/月</div>
                    </div>
                    <div style="position:relative;">
                        <img src="icons/move-4.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-4.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">23,500 元/月</div>
                    </div>
                    <div style="position:relative;">
                        <img src="icons/move-5.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-5.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">32,000 元/月</div>
                    </div>
                    <div style="position:relative;">
                        <img src="icons/move-6.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-6.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">30,000 元/月</div>
                    </div>
                    <div style="position:relative;grid-column:1/-1;">
                        <img src="icons/move-7.jpg" style="width:100%;display:block;border-radius:4px;object-fit:cover;object-position:top;height:180px;cursor:zoom-in;" onerror="this.parentElement.style.display='none'" onclick="openTargetLightbox('icons/move-7.jpg')">
                        <div style="position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.72);color:#fff;font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;pointer-events:none;">34,000 元/月</div>
                    </div>
                </div>
                <div style="font-size:13px;color:var(--text-dim);line-height:1.9;">
                    <p><strong style="color:var(--accent);">區域</strong>：台中西區・近勤美/科博館/草悟道</p>
                    <p><strong style="color:var(--accent);">格局</strong>：2房 2廳</p>
                    <p><strong style="color:var(--accent);">租金範圍</strong>：$23,500 – $34,000 / 月</p>
                    <p><strong style="color:var(--accent);">達標條件</strong>：資產 &gt; 台幣 650 萬</p>
                    <p><strong style="color:var(--accent);">條件</strong>：可養寵物・有車位・近商圈</p>
                </div>
            </div>`
    },
    skoolPlatinum: {
        title: '💎 Skool Platinum — $100,000 MRR',
        html: `
            <div style="margin-bottom:16px;">
                <img src="icons/skool-platinum.png" alt="Skool Platinum" style="width:100%;border-radius:4px;border:1px solid var(--border);margin-bottom:12px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：Skool Platinum 白金里程碑</p>
                    <p><strong style="color:var(--accent);">指標</strong>：MRR $100,000 USD／月</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：進行中</p>
                </div>
            </div>`
    },
    socialGrowth: {
        title: '📈 FUNDwithRay IG + YT 成長',
        html: `
            <div style="margin-bottom:16px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：FUNDwithRay Instagram + YouTube 帳號成長</p>
                    <p><strong style="color:var(--accent);">指標</strong>：IG 粉絲數 &gt; 100,000 ／ YouTube 訂閱數 &gt; 10,000</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：進行中</p>
                </div>
            </div>`
    },
    totalAssets: {
        title: '💰 總資產 — 目標 NT$30,000,000',
        html: `
            <div style="margin-bottom:16px;">
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：個人總資產成長</p>
                    <p><strong style="color:var(--accent);">指標</strong>：總資產 &gt; NT$30,000,000（3000 萬）</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：進行中</p>
                </div>
            </div>`
    },
    kawasaki: {
        title: '🏍️ Kawasaki Ninja ZX-4RR — ✅ 已達標',
        html: `
            <div style="margin-bottom:16px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
                    <img src="icons/kawasaki-real-1.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;grid-column:1/-1;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/kawasaki-real-1.jpg')">
                    <img src="icons/kawasaki-real-2.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/kawasaki-real-2.jpg')">
                    <img src="icons/kawasaki-real-3.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/kawasaki-real-3.jpg')">
                    <img src="icons/kawasaki-real-4.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/kawasaki-real-4.jpg')">
                    <img src="icons/kawasaki-real-5.jpg" style="width:100%;border-radius:4px;object-fit:cover;height:180px;cursor:zoom-in;" onerror="this.style.display='none'" onclick="openTargetLightbox('icons/kawasaki-real-5.jpg')">
                </div>
                <div style="font-size:14px;color:var(--text-dim);line-height:1.8;">
                    <p><strong style="color:var(--accent);">目標</strong>：Kawasaki Ninja ZX-4RR</p>
                    <p><strong style="color:var(--accent);">預算</strong>：NT$400,000（約 $12,300 USD，匯率約 32.5 估算）</p>
                    <p><strong style="color:var(--accent);">狀態</strong>：✅ 已達標</p>
                </div>
            </div>`
    },
};

function showTargetModal(key) {
    const data = TARGET_DATA[key];
    if (!data) return;
    document.getElementById('target-modal-title').textContent = data.title;
    document.getElementById('target-modal-body').innerHTML = data.html;
    document.getElementById('target-modal').classList.add('show');
}
function hideModal(id) { document.getElementById(id).classList.remove('show'); }
function openTargetLightbox(url) {
    document.getElementById('target-lightbox-img').src = url;
    document.getElementById('target-lightbox').classList.add('active');
}
function closeTargetLightbox() { document.getElementById('target-lightbox').classList.remove('active'); }
function formatNumber(n) { return new Intl.NumberFormat('zh-TW').format(Math.round(n)); }
function formatMoney(n) { if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'; if (n >= 1000) return Math.round(n / 1000) + 'K'; return formatNumber(n); }
function toTWD(a, c) { if (c === 'USD') return a * USD_RATE; if (c === 'USDT') return a * USDT_RATE; return a; }
