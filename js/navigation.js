// ==================== NAVIGATION + UTILS ====================

function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('open');
    document.querySelector('.sidebar-overlay').classList.toggle('show');
    document.querySelector('.mobile-menu-btn').innerHTML = document.querySelector('.sidebar').classList.contains('open') ? '✕' : '☰';
}

function go(section) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(section)?.classList.add('active');
    window.scrollTo(0, 0);
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
        document.querySelector('.sidebar-overlay').classList.remove('show');
        document.querySelector('.mobile-menu-btn').innerHTML = '☰';
    }
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => go(item.dataset.section));
});

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

