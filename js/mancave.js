// ==================== MAN CAVE REVIEW ====================
// Project Man Cave (men's self-improvement brand) carousel review board. Same UI and
// review flow as Carousel 審核, scoped to brand=mancave so Man Cave decks stay separate
// from FUNDwithRay. Reads GET /api/carousel-list?brand=mancave; approve/feedback writes
// reuse POST /api/carousel-approve (keyed by deck_slug, brand-agnostic — no 13th function).
//
// This module deliberately REUSES the pure/deck-scoped helpers defined in carousel-review.js
// (carouselDeckHTML, crEsc, carouselIsApproved, openCarouselLightbox, onCarouselApprove,
// onCarouselPublished, onCarouselFeedbackSave, collectDeckFeedback) — carousel-review.js is
// loaded first (index.html). Only the container-bound glue (own IDs, brand fetch, count,
// copy/clear scoped to #mancave) lives here, so the two boards never cross-contaminate.
//
// SECURITY: approving ENQUEUES ONLY — never sends to IG. Man Cave CTA is skool.com/mancave,
// never the 炒股黑客/TFT links. service_role key stays server-side.

let _mancaveLoaded = false;
let _mancaveFocusHooked = false;

// Mirror carousel-review's focus refresh: re-pull DB truth when Ray returns to the tab,
// unless he's mid-edit in a note (don't yank what he's typing).
function hookMancaveFocusRefresh() {
    if (_mancaveFocusHooked) return;
    _mancaveFocusHooked = true;
    const refresh = () => {
        const wrap = document.getElementById('mancave-decks');
        if (!wrap || !_mancaveLoaded) return;
        const el = document.activeElement;
        if (el && el.classList && el.classList.contains('cr-note')) return; // mid-edit
        loadMancaveReview(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh();
    });
}

async function loadMancaveReview(force = false) {
    const wrap = document.getElementById('mancave-decks');
    if (!wrap) return;
    hookMancaveFocusRefresh();
    if (_mancaveLoaded && !force) return;

    const loading = document.getElementById('mancave-loading');
    const errEl = document.getElementById('mancave-error');
    if (loading) loading.style.display = 'block';
    if (errEl) errEl.style.display = 'none';

    try {
        const res = await fetch('/api/carousel-list?brand=mancave');
        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error((data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status));
        }
        renderMancaveDecks(data.decks || []);
        _mancaveLoaded = true;
    } catch (e) {
        if (errEl) {
            errEl.textContent = '⚠️ 載入失敗：' + e.message
                + '（brand 欄尚未 push 到 DataOS，或未設 AIOS_SUPABASE_URL / AIOS_SUPABASE_SERVICE_KEY）';
            errEl.style.display = 'block';
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderMancaveDecks(decks) {
    const wrap = document.getElementById('mancave-decks');
    if (!wrap) return;
    if (!decks.length) {
        wrap.innerHTML = '<div class="cr-empty">目前沒有 Man Cave deck。'
            + '把輪播標成 <code>brand=mancave</code> 寫進 carousel_publish_queue 後會出現在這裡。</div>';
        updateMancaveCount(decks);
        return;
    }
    const bar = '<div class="cr-bar">' +
        '<span class="cr-hint">Man Cave 專屬看板（brand=mancave）。在要改的 slide / 整組備註打字（留空＝驗收）。' +
        '離開欄位自動存進 DataOS，右上「📋 複製反饋」可一鍵複製全部。</span></div>';
    // carouselDeckHTML is pure (from carousel-review.js) — same .cr-* markup, so #mancave's
    // scoped CSS styles it identically.
    wrap.innerHTML = bar + decks.map(carouselDeckHTML).join('');

    // All the row handlers are deck-scoped (operate on the clicked element / deck_slug), so
    // the carousel-review.js versions work unchanged on Man Cave decks.
    wrap.querySelectorAll('.cr-approve-box').forEach((box) =>
        box.addEventListener('change', () => onCarouselApprove(box)));
    wrap.querySelectorAll('.cr-pub-btn').forEach((btn) =>
        btn.addEventListener('click', () => onCarouselPublished(btn)));
    wrap.querySelectorAll('.cr-slide img').forEach((img) =>
        img.addEventListener('click', () => openCarouselLightbox(img.src, img.alt)));
    wrap.querySelectorAll('.cr-zoom').forEach((btn) =>
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCarouselLightbox(btn.dataset.src, '', btn.dataset.vid === '1');
        }));
    wrap.querySelectorAll('.cr-peek-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const sec = btn.closest('.cr-deck');
            const open = sec.classList.toggle('peek');
            btn.textContent = open ? '收合' : '展開';
        });
    });
    wrap.querySelectorAll('.cr-note').forEach((ta) => {
        ta.addEventListener('input', () => ta.classList.toggle('filled', ta.value.trim() !== ''));
        ta.addEventListener('blur', () => onCarouselFeedbackSave(ta.dataset.deck));
    });
    updateMancaveCount(decks);
}

function updateMancaveCount(decks) {
    const el = document.getElementById('mancave-count');
    if (!el) return;
    const pending = decks.filter((d) => !carouselIsApproved(d.status)).length;
    el.textContent = `${pending} 待審 · ${decks.length} 共`;
}

// Copy/clear are scoped to #mancave so they never touch the FUNDwithRay board's decks.
function copyAllMancaveFeedback() {
    const lines = [];
    document.querySelectorAll('#mancave .cr-deck').forEach((sec) => {
        const slug = sec.dataset.deck;
        const fb = collectDeckFeedback(slug);
        const keys = Object.keys(fb);
        if (!keys.length) return;
        lines.push(`## ${slug}`);
        if (fb.top) lines.push(`- (整組) ${fb.top}`);
        keys.filter((k) => k !== 'top').sort().forEach((k) => lines.push(`- ${k}: ${fb[k]}`));
        lines.push('');
    });
    const md = lines.join('\n').trim() || '（目前沒有任何反饋）';
    const done = () => { if (typeof showToast === 'function') showToast('已複製反饋 markdown'); };
    if (navigator.clipboard) navigator.clipboard.writeText(md).then(done, () => done());
    else done();
}

async function clearAllMancaveFeedback() {
    const notes = document.querySelectorAll('#mancave .cr-note');
    const filled = [...notes].filter((ta) => ta.value.trim() !== '');
    if (!filled.length) { if (typeof showToast === 'function') showToast('目前沒有任何反饋'); return; }
    if (!confirm(`確定清除全部 ${filled.length} 則反饋？（本機 + DataOS）`)) return;
    const decks = [...new Set(filled.map((ta) => ta.dataset.deck))];
    notes.forEach((ta) => { ta.value = ''; ta.classList.remove('filled'); });
    await Promise.all(decks.map((slug) => onCarouselFeedbackSave(slug, true)));
    if (typeof showToast === 'function') showToast(`已清除 ${filled.length} 則反饋`);
}
