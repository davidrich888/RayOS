// ==================== CONFIG + MOODBOARD SYSTEM ====================

const USD_RATE = 32.5, USDT_RATE = 32.5;
const CATEGORY_ICONS = {'備用金':'💵','活期存款':'🏦','股票ETF':'📈','加密貨幣':'🪙','定期存款':'🏛️','外幣存款':'💱','動產':'🚗','不動產':'🏠','債務':'💳','應收貸款':'📄'};
const DEFAULT_ACCOUNTS = [
    {name:'台新主帳戶',platform:'台新',category:'活期存款',currency:'TWD'},
    {name:'WISE',platform:'WISE',category:'活期存款',currency:'USD'},
    {name:'IB 長期投資',platform:'IB',category:'股票ETF',currency:'USD'},
    {name:'幣安',platform:'Binance',category:'加密貨幣',currency:'USDT'},
    {name:'信用貸款_王道',platform:'王道銀行',category:'債務',currency:'TWD'}
];

// ==================== MOODBOARD SYSTEM ====================
const DEFAULT_MOODBOARD_IMAGES = [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800&q=80',
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=800&q=80',
    'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&q=80',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&q=80',
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&q=80',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80'
];

// Seeded random for consistent daily results
function seedHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h);
}

function seededShuffle(arr, seed) {
    const a = [...arr];
    let s = seedHash(seed);
    for (let i = a.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getMoodboardImages() {
    try {
        const cached = JSON.parse(localStorage.getItem('moodboard_images') || '[]');
        if (cached.length > 0) return cached;
    } catch(e) {}
    return DEFAULT_MOODBOARD_IMAGES;
}

function renderMoodboard(forceSeed) {
    const allImages = getMoodboardImages();
    if (allImages.length < 4) return;

    const today = forceSeed || new Date().toISOString().split('T')[0];
    const shuffled = seededShuffle(allImages, today);
    const count = Math.min(shuffled.length, 8);
    const urls = shuffled.slice(0, count);

    const promises = urls.map(url => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ url, ratio: img.naturalWidth / img.naturalHeight });
        img.onerror = () => resolve({ url, ratio: 4/3 });
        img.src = url;
    }));

    Promise.all(promises).then(photos => justifiedLayout(photos));

    const countEl = document.getElementById('moodboard-count');
    if (countEl) {
        const src = localStorage.getItem('drive_script_url') ? '📷 Drive' : '🖼️ Default';
        countEl.textContent = `${src} · ${allImages.length} photos`;
    }
}

function justifiedLayout(photos) {
    const grid = document.getElementById('moodboard-grid');
    const containerWidth = grid.offsetWidth;
    const GAP = 3;

    // Force 2 rows: find best split point
    // Try every split and pick the one where both rows are closest in height
    const ROW_H = window.innerWidth <= 768 ? 180 : 280;
    let bestSplit = Math.floor(photos.length / 2);
    let bestDiff = Infinity;

    for (let s = 2; s <= photos.length - 2; s++) {
        const r1 = photos.slice(0, s);
        const r2 = photos.slice(s);
        const ratio1 = r1.reduce((sum, p) => sum + p.ratio, 0);
        const ratio2 = r2.reduce((sum, p) => sum + p.ratio, 0);
        const h1 = (containerWidth - GAP * (r1.length - 1)) / ratio1;
        const h2 = (containerWidth - GAP * (r2.length - 1)) / ratio2;
        const diff = Math.abs(h1 - h2);
        if (diff < bestDiff) { bestDiff = diff; bestSplit = s; }
    }

    const rows = [photos.slice(0, bestSplit), photos.slice(bestSplit)];
    let html = '';
    let idx = 0;

    rows.forEach(row => {
        const totalRatio = row.reduce((sum, p) => sum + p.ratio, 0);
        const totalGaps = GAP * (row.length - 1);
        const rowHeight = (containerWidth - totalGaps) / totalRatio;

        row.forEach(photo => {
            const w = rowHeight * photo.ratio;
            html += `<div class="mood-item" style="width:${w}px;height:${rowHeight}px;animation-delay:${idx * 0.06}s"><img src="${photo.url}" alt="" loading="lazy"></div>`;
            idx++;
        });
    });

    grid.innerHTML = html;
}

let moodResizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(moodResizeTimer);
    moodResizeTimer = setTimeout(() => renderMoodboard(), 300);
});

function refreshMoodboard() {
    renderMoodboard(Date.now().toString());
}

function copyDriveScript() {
    const code = document.getElementById('drive-script-code').textContent;
    navigator.clipboard.writeText(code).then(() => showToast('程式碼已複製！'));
}

async function syncMoodboardFromDrive() {
    const scriptUrl = localStorage.getItem('drive_script_url');
    if (!scriptUrl) { renderMoodboard(); return; }

    const statusEl = document.getElementById('drive-status');
    if (statusEl) statusEl.textContent = '⏳ 同步中...';

    try {
        const response = await fetch(scriptUrl);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        if (data && data.images && data.images.length > 0) {
            const urls = data.images.map(img => img.url);
            localStorage.setItem('moodboard_images', JSON.stringify(urls));
            localStorage.setItem('moodboard_drive_data', JSON.stringify(data.images));
            localStorage.setItem('moodboard_sync_date', new Date().toISOString().split('T')[0]);
            if (statusEl) statusEl.textContent = '✅ ' + data.images.length + ' 張圖片';
            showToast('🖼️ Moodboard 已同步 ' + data.images.length + ' 張圖片');
        } else {
            if (statusEl) statusEl.textContent = '⚠️ 資料夾沒有圖片';
        }

        // Body Progress photos
        if (data && data.bodyProgress) {
            const normalized = {};
            Object.keys(data.bodyProgress).forEach(k => { normalized[normDate(k)] = data.bodyProgress[k]; });
            const dates = Object.keys(normalized).filter(d => normalized[d].length > 0);
            if (dates.length > 0) {
                bodyProgressDates = normalized;
                localStorage.setItem('body_progress_drive', JSON.stringify(data.bodyProgress));
                loadBodyProgressFromDrive();
                showToast('📷 Body Progress: ' + dates.length + ' dates synced');
            }
        }
    } catch(e) {
        console.error('Drive sync error:', e);
        if (statusEl) statusEl.textContent = '❌ 連線失敗';
        showToast('Drive 同步失敗: ' + e.message, true);
    }
    renderMoodboard();
}

async function testDriveConnection() {
    const url = document.getElementById('drive-script-url').value.replace(/\/+$/, '');
    if (!url) { showToast('請先貼上 Apps Script URL', true); return; }
    localStorage.setItem('drive_script_url', url);
    await syncMoodboardFromDrive();
}
