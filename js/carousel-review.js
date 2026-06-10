// ==================== CAROUSEL REVIEW ====================
// Cloud-native replacement for the local review_server.py page. Lists staged
// /create-carousel decks from DataOS (GET /api/carousel-list) and lets Ray tick
// 審核通過, which flips the queue row to status='approved' (POST /api/carousel-approve).
//
// SECURITY: ticking ENQUEUES ONLY — it never sends to IG. Real IG publishing stays
// whitelist-gated (Metricool confirm-gate, #53). The serverless functions hold the
// service_role key; the browser never sees it.

let _carouselLoaded = false;

async function loadCarouselReview(force = false) {
    const wrap = document.getElementById('carousel-decks');
    if (!wrap) return;
    if (_carouselLoaded && !force) return;

    const loading = document.getElementById('carousel-loading');
    const errEl = document.getElementById('carousel-error');
    if (loading) loading.style.display = 'block';
    if (errEl) errEl.style.display = 'none';

    try {
        const res = await fetch('/api/carousel-list');
        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error((data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status));
        }
        renderCarouselDecks(data.decks || []);
        _carouselLoaded = true;
    } catch (e) {
        if (errEl) {
            errEl.textContent = '⚠️ 載入失敗：' + e.message + '（確認 Vercel 已設 AIOS_SUPABASE_URL / AIOS_SUPABASE_SERVICE_KEY）';
            errEl.style.display = 'block';
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function crEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function carouselIsApproved(status) {
    return status === 'approved' || status === 'scheduled' || status === 'published';
}

function carouselDeckHTML(d) {
    const approved = carouselIsApproved(d.status);
    const urls = Array.isArray(d.slide_urls) ? d.slide_urls : [];
    const grid = urls.length
        ? urls.map((u, i) =>
            `<figure class="cr-slide"><img src="${crEsc(u)}" alt="slide${i + 1}" loading="lazy"/>` +
            `<figcaption>slide${String(i + 1).padStart(2, '0')}</figcaption></figure>`).join('')
        : '<div class="cr-noimg">（無 slide_urls，重跑 upload_deck_slides.py）</div>';
    return `
    <section class="cr-deck ${approved ? 'approved-collapsed' : ''}" data-deck="${crEsc(d.deck_slug)}">
      <header class="cr-head">
        <div class="cr-head-l">
          <h3>${crEsc(d.deck_slug)}</h3>
          <p class="cr-sub">${d.slide_count || urls.length} slides · <code>${crEsc(d.style || '')}</code>` +
            `${d.topic ? ' · ' + crEsc(d.topic) : ''} <span class="cr-status cr-status-${crEsc(d.status)}">${crEsc(d.status)}</span></p>
        </div>
        <div class="cr-head-actions">
          <button type="button" class="cr-peek-btn">展開</button>
          <label class="cr-approve ${approved ? 'done' : ''}" title="打勾＝核准可發，寫入 DataOS 待發佇列（不會自動發 IG）">
            <input type="checkbox" class="cr-approve-box" data-deck="${crEsc(d.deck_slug)}" ${approved ? 'checked' : ''}/>
            <span class="cr-approve-label">✅ 審核通過</span>
          </label>
        </div>
      </header>
      <div class="cr-grid">${grid}</div>
    </section>`;
}

function renderCarouselDecks(decks) {
    const wrap = document.getElementById('carousel-decks');
    if (!wrap) return;
    if (!decks.length) {
        wrap.innerHTML = '<div class="cr-empty">目前沒有 deck。render 後跑 ' +
            '<code>python3 scripts/content/upload_deck_slides.py outputs/create-carousel/&lt;deck&gt;</code> 上架。</div>';
        updateCarouselCount(decks);
        return;
    }
    wrap.innerHTML = decks.map(carouselDeckHTML).join('');

    wrap.querySelectorAll('.cr-approve-box').forEach((box) =>
        box.addEventListener('change', () => onCarouselApprove(box)));
    // 展開/收合 peek: see an approved deck's slides without un-approving it.
    wrap.querySelectorAll('.cr-peek-btn').forEach((btn) =>
        btn.addEventListener('click', () => {
            const sec = btn.closest('.cr-deck');
            const open = sec.classList.toggle('peek');
            btn.textContent = open ? '收合' : '展開';
        }));
    updateCarouselCount(decks);
}

function updateCarouselCount(decks) {
    const el = document.getElementById('carousel-count');
    if (!el) return;
    const pending = decks.filter((d) => !carouselIsApproved(d.status)).length;
    el.textContent = `${pending} 待審 · ${decks.length} 共`;
}

async function onCarouselApprove(box) {
    const wrap = box.closest('.cr-approve');
    const sec = box.closest('.cr-deck');
    wrap.classList.remove('err');
    const approved = box.checked;
    try {
        const res = await fetch('/api/carousel-approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deck_slug: box.dataset.deck, approved }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
            throw new Error((data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status));
        }
        wrap.classList.toggle('done', approved);
        sec.classList.toggle('approved-collapsed', approved);
        if (!approved) sec.classList.remove('peek');
        const pill = sec.querySelector('.cr-status');
        if (pill) {
            const st = approved ? 'approved' : 'pending';
            pill.className = 'cr-status cr-status-' + st;
            pill.textContent = st;
        }
        if (typeof showToast === 'function') {
            showToast(approved ? '已核准（進待發佇列，不會自動發 IG）' : '已退回待審');
        }
    } catch (e) {
        box.checked = !approved; // revert so the box never lies about what's queued
        wrap.classList.toggle('done', box.checked);
        wrap.classList.add('err');
        if (typeof showToast === 'function') showToast('寫入失敗：' + e.message, true);
        else alert('寫入失敗：' + e.message);
    }
}
