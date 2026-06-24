// ==================== CAROUSEL REVIEW ====================
// Cloud-native replacement for the local review_server.py page. Lists staged
// /create-carousel decks from DataOS (GET /api/carousel-list) and lets Ray tick
// 審核通過, which flips the queue row to status='approved' (POST /api/carousel-approve).
//
// SECURITY: ticking ENQUEUES ONLY — it never sends to IG. Real IG publishing stays
// whitelist-gated (Metricool confirm-gate, #53). The serverless functions hold the
// service_role key; the browser never sees it.

let _carouselLoaded = false;
let _carouselFocusHooked = false;

// When Ray switches back to this tab after Claude regenerated a deck, the server's
// feedback may have been CONSUMED (cleared) while this still-open page holds the old
// text in its textareas — a stale blur-save would then resurrect it (2026-06-11 Ray:
// "已存的重整後應該自己消失"). So on focus/visibility we pull the latest rows and
// re-render, aligning the textareas to DB truth — UNLESS Ray is mid-edit in a note
// (don't yank what he's typing).
function hookCarouselFocusRefresh() {
    if (_carouselFocusHooked) return;
    _carouselFocusHooked = true;
    const refresh = () => {
        const wrap = document.getElementById('carousel-decks');
        if (!wrap || !_carouselLoaded) return;
        const el = document.activeElement;
        if (el && el.classList && el.classList.contains('cr-note')) return; // mid-edit
        loadCarouselReview(true);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refresh();
    });
}

async function loadCarouselReview(force = false) {
    const wrap = document.getElementById('carousel-decks');
    if (!wrap) return;
    hookCarouselFocusRefresh();
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
    const published = d.status === 'published';
    const urls = Array.isArray(d.slide_urls) ? d.slide_urls : [];
    const fb = (d.feedback && typeof d.feedback === 'object') ? d.feedback : {};
    const grid = urls.length
        ? urls.map((u, i) => {
            const key = 'slide' + String(i + 1).padStart(2, '0');
            const raw = fb[key] || '';
            return `<figure class="cr-slide"><img src="${crEsc(u)}" alt="slide${i + 1}" loading="lazy"/>` +
                `<figcaption>${key}</figcaption>` +
                `<textarea class="cr-note${raw ? ' filled' : ''}" data-deck="${crEsc(d.deck_slug)}" data-scope="${key}" ` +
                `placeholder="改什麼？（留空 = 驗收，跳過重生）">${crEsc(raw)}</textarea></figure>`;
        }).join('')
        : '<div class="cr-noimg">（無 slide_urls，重跑 upload_deck_slides.py）</div>';
    return `
    <section class="cr-deck ${approved ? 'approved-collapsed' : ''}${published ? ' published' : ''}" data-deck="${crEsc(d.deck_slug)}">
      <header class="cr-head">
        <div class="cr-head-l">
          <h3>${crEsc(d.deck_slug)}</h3>
          ${d.source_yt_title ? `<p class="cr-src">📺 來源 YT：${crEsc(d.source_yt_title)}</p>` : ''}
          <p class="cr-sub">${d.slide_count || urls.length} slides · <code>${crEsc(d.style || '')}</code>` +
            `${d.topic ? ' · ' + crEsc(d.topic) : ''} <span class="cr-status cr-status-${crEsc(d.status)}">${crEsc(d.status)}</span>` +
            ` <span class="cr-saved" data-deck="${crEsc(d.deck_slug)}"></span></p>
        </div>
        <div class="cr-head-actions">
          <button type="button" class="cr-peek-btn">展開</button>
          <label class="cr-approve ${approved ? 'done' : ''}" title="打勾＝核准可發，寫入 DataOS 待發佇列（不會自動發 IG）">
            <input type="checkbox" class="cr-approve-box" data-deck="${crEsc(d.deck_slug)}" ${approved ? 'checked' : ''}/>
            <span class="cr-approve-label">✅ 審核通過</span>
          </label>
          ${approved ? `<button type="button" class="cr-pub-btn ${published ? 'done' : ''}" data-deck="${crEsc(d.deck_slug)}" title="你在 IG 手動發完後點這個；標記後標題會劃掉。再點一次取消">${published ? '✅ 已發布' : '標記已發布'}</button>` : ''}
        </div>
      </header>
      <textarea class="cr-note cr-note-top${fb.top ? ' filled' : ''}" data-deck="${crEsc(d.deck_slug)}" data-scope="top" ` +
        `placeholder="整組層級的備註（例如：全部背景換暖色 / 語氣太硬）">${crEsc(fb.top || '')}</textarea>
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
    // The 📋 複製反饋 button lives in the sticky page header (always visible); this bar is
    // just the hint, which can scroll away with the deck list without hiding the action.
    const bar = '<div class="cr-bar">' +
        '<span class="cr-hint">在要改的 slide / 整組備註打字（留空＝驗收）。離開欄位自動存進 DataOS，' +
        'Claude 直接讀 feedback 重生被標的 slide。右上「📋 複製反饋」可一鍵複製全部。</span></div>';
    wrap.innerHTML = bar + decks.map(carouselDeckHTML).join('');

    wrap.querySelectorAll('.cr-approve-box').forEach((box) =>
        box.addEventListener('change', () => onCarouselApprove(box)));
    // 已發布: Ray ticks this after manually posting to IG → strikethrough on the title.
    wrap.querySelectorAll('.cr-pub-btn').forEach((btn) =>
        btn.addEventListener('click', () => onCarouselPublished(btn)));
    // click a slide thumbnail (object-fit:cover, so cropped) to view it full-size in a lightbox.
    wrap.querySelectorAll('.cr-slide img').forEach((img) =>
        img.addEventListener('click', () => openCarouselLightbox(img.src, img.alt)));
    // 展開/收合 peek: see an approved deck's slides without un-approving it.
    wrap.querySelectorAll('.cr-peek-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const sec = btn.closest('.cr-deck');
            const open = sec.classList.toggle('peek');
            btn.textContent = open ? '收合' : '展開';
        });
    });
    // feedback: persist a deck's notes to DataOS when Ray leaves any of its textareas.
    wrap.querySelectorAll('.cr-note').forEach((ta) => {
        ta.addEventListener('input', () => ta.classList.toggle('filled', ta.value.trim() !== ''));
        ta.addEventListener('blur', () => onCarouselFeedbackSave(ta.dataset.deck));
    });
    updateCarouselCount(decks);
}

// Gather a deck's textarea notes into a { top, slideNN } object, omitting empties.
function collectDeckFeedback(deckSlug) {
    const fb = {};
    document.querySelectorAll(`.cr-note[data-deck="${CSS.escape(deckSlug)}"]`).forEach((ta) => {
        const v = ta.value.trim();
        if (v) fb[ta.dataset.scope] = v;
    });
    return fb;
}

async function onCarouselFeedbackSave(deckSlug) {
    if (!deckSlug) return;
    const tag = document.querySelector(`.cr-saved[data-deck="${CSS.escape(deckSlug)}"]`);
    const feedback = collectDeckFeedback(deckSlug);
    try {
        // Shares /api/carousel-approve (feedback mode) — a separate endpoint would be a
        // 13th serverless function, over Vercel Hobby's 12 limit, breaking every deploy.
        const res = await fetch('/api/carousel-approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deck_slug: deckSlug, feedback }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
            throw new Error((data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status));
        }
        if (tag) {
            const n = Object.keys(feedback).length;
            tag.textContent = n ? `· 已存 ${n} 則反饋` : '· 反饋已清空';
            tag.classList.remove('err');
        }
    } catch (e) {
        if (tag) { tag.textContent = '· 反饋存檔失敗'; tag.classList.add('err'); }
        if (typeof showToast === 'function') showToast('反饋存檔失敗：' + e.message, true);
    }
}

// Build a markdown digest of every deck's notes for pasting back to Claude Code (the notes
// already live in DataOS; this is the manual escape hatch / quick copy Ray liked).
function copyAllCarouselFeedback() {
    const lines = [];
    document.querySelectorAll('.cr-deck').forEach((sec) => {
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

// Lightbox: a single reused overlay appended to <body> on first use. Click anywhere
// (or press Esc) to close. Shows the slide at full resolution with object-fit:contain.
function openCarouselLightbox(src, cap) {
    let box = document.getElementById('cr-lightbox');
    if (!box) {
        box = document.createElement('div');
        box.id = 'cr-lightbox';
        box.innerHTML = '<button type="button" class="cr-lb-close" aria-label="關閉">&times;</button>' +
            '<img alt=""/><div class="cr-lb-cap"></div>';
        document.body.appendChild(box);
        const close = () => box.classList.remove('open');
        box.addEventListener('click', close);
        box.querySelector('img').addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }
    box.querySelector('img').src = src;
    box.querySelector('.cr-lb-cap').textContent = (cap || '') + ' · 點任意處關閉';
    box.classList.add('open');
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

// 已發布 toggle: marks the queue row 'published' (or back to 'approved'). This only records
// that Ray ALREADY posted it by hand — it never sends to IG. Title gets a strikethrough.
async function onCarouselPublished(btn) {
    const sec = btn.closest('.cr-deck');
    const makePublished = !btn.classList.contains('done');
    btn.disabled = true;
    try {
        const res = await fetch('/api/carousel-approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deck_slug: btn.dataset.deck, published: makePublished }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
            throw new Error((data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status));
        }
        btn.classList.toggle('done', makePublished);
        btn.textContent = makePublished ? '✅ 已發布' : '標記已發布';
        sec.classList.toggle('published', makePublished);
        const pill = sec.querySelector('.cr-status');
        if (pill) {
            const st = makePublished ? 'published' : 'approved';
            pill.className = 'cr-status cr-status-' + st;
            pill.textContent = st;
        }
        if (typeof showToast === 'function') {
            showToast(makePublished ? '已標記發布（標題劃線）' : '已取消發布標記');
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('標記失敗：' + e.message, true);
        else alert('標記失敗：' + e.message);
    } finally {
        btn.disabled = false;
    }
}
