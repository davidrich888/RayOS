// IG Hook 戰報 — which caption opening actually gets distributed.
// Data: /data/ig-hook-report.json, written+pushed daily 09:45 by
// scripts/instagram/ig_hook_report.py (launchd com.aios.ig-hook-report).
// Static file, not a Vercel function: api/ is already at the Hobby cap of 12.

let _igHookLoaded = false;

async function loadIgHook(firstVisit) {
    if (_igHookLoaded && !firstVisit) return;

    const loading = document.getElementById('ig-hook-loading');
    const error = document.getElementById('ig-hook-error');
    const body = document.getElementById('ig-hook-body');
    if (!body) return;

    loading.style.display = 'block';
    error.style.display = 'none';
    body.innerHTML = '';

    try {
        const res = await fetch('/data/ig-hook-report.json?ts=' + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        renderIgHook(await res.json());
        _igHookLoaded = true;
    } catch (e) {
        error.textContent = '讀不到戰報：' + e.message;
        error.style.display = 'block';
    } finally {
        loading.style.display = 'none';
    }
}

function _igHookAgo(iso) {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return '今天';
    return days + ' 天前';
}

function renderIgHook(d) {
    const body = document.getElementById('ig-hook-body');
    const baseline = Math.round(d.baseline || 0);
    const ranked = d.ranked || [];
    const fresh = d.fresh || [];

    // Bar width is relative to the best median, so the gap between 故事 and 金句
    // is visible at a glance instead of buried in a number column.
    const top = ranked.length ? ranked[0].median : 1;

    let h = `<div class="igh-meta">
        更新於 ${new Date(d.generated_at).toLocaleString('zh-TW', { hour12: false })}
        · 近 ${d.window_days} 天 ${d.in_window} 篇 · 全體基準中位數 <b>${baseline}</b>
    </div>`;

    h += '<h3 class="igh-h">Hook 排名（48h 互動中位數）</h3>';
    if (!ranked.length) {
        h += '<p class="igh-dim">樣本不足，還排不出來。</p>';
    } else {
        h += '<div class="igh-bars">';
        ranked.forEach((r, i) => {
            const pct = Math.max(2, Math.round((r.median / top) * 100));
            const cls = r.median >= baseline ? 'igh-good' : 'igh-bad';
            h += `<div class="igh-row">
                <div class="igh-rank">${i + 1}</div>
                <div class="igh-name">${r.hook}<span class="igh-n">n=${r.n}</span></div>
                <div class="igh-track"><div class="igh-fill ${cls}" style="width:${pct}%"></div></div>
                <div class="igh-val">${Math.round(r.median)}<span class="igh-best">最佳 ${r.best}</span></div>
            </div>`;
        });
        h += '</div>';
    }

    if (d.thin && d.thin.length) {
        h += `<p class="igh-dim">樣本不足 (n&lt;${d.min_sample})，只記錄不排名：${d.thin.join('、')}</p>`;
    }

    h += '<h3 class="igh-h">剛成熟的貼文</h3>';
    if (!fresh.length) {
        h += '<p class="igh-dim">近 4 天沒有滿 48h 的新貼文。</p>';
    } else {
        h += '<div class="igh-fresh">';
        fresh.forEach(p => {
            const r = p.ratio;
            const tag = r == null ? '' :
                r >= 2 ? `<span class="igh-pill igh-up">${r}x</span>` :
                r < 0.5 ? `<span class="igh-pill igh-down">${r}x</span>` :
                `<span class="igh-pill">${r}x</span>`;
            const label = `${p.hook} · ${p.engagement} 互動 · ${_igHookAgo(p.posted_at)}`;
            h += p.url
                ? `<a class="igh-card" href="${p.url}" target="_blank" rel="noopener">${label}${tag}</a>`
                : `<div class="igh-card">${label}${tag}</div>`;
        });
        h += '</div>';
    }

    // Ray's standing rule: never present an auto-inferred label as authored intent.
    h += `<p class="igh-warn">⚠️ ${Math.round((d.auto_share || 0) * 100)}% 的 hook 標籤是從 caption
        自動推斷的，不是寫稿時標的。互動 = 讚 + 留言；reach / saves 需 Meta Graph token（目前失效）。</p>`;

    body.innerHTML = h;
}
