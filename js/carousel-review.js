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
    <section class="cr-deck ${approved ? 'approved-collapsed' : ''}" data-deck="${crEsc(d.deck_slug)}">
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
    const bar = '<div class="cr-bar">' +
        '<span class="cr-hint">在要改的 slide / 整組備註打字（留空＝驗收）。離開欄位自動存進 DataOS，' +
        'Claude 直接讀 feedback 重生被標的 slide。</span>' +
        '<button type="button" id="cr-copy-all" class="cr-peek-btn">📋 Copy All Feedback</button></div>';
    wrap.innerHTML = bar + decks.map(carouselDeckHTML).join('');

    wrap.querySelectorAll('.cr-approve-box').forEach((box) =>
        box.addEventListener('change', () => onCarouselApprove(box)));
    // 展開/收合 peek: see an approved deck's slides without un-approving it.
    wrap.querySelectorAll('.cr-peek-btn').forEach((btn) => {
        if (btn.id === 'cr-copy-all') return;
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
    const copyBtn = document.getElementById('cr-copy-all');
    if (copyBtn) copyBtn.addEventListener('click', copyAllCarouselFeedback);
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
