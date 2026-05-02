// ==================== BUSINESS (DataOS-driven) ====================
// Reads /data/business-metrics.json (auto-refreshed daily by scripts/update_data.sh on Mac mini).
// Vercel serves this JSON statically, so no API needed.

const BIZ_JSON_URL = '/data/business-metrics.json';
let bizMetricsCache = null;

function fmtInt(v) {
    if (v == null) return '—';
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(v) {
    if (v == null) return '—';
    return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPct(v) {
    if (v == null) return '—';
    return Number(v).toFixed(1) + '%';
}

function fmtDelta(d) {
    if (d == null) return '';
    if (d === 0) return '±0';
    const sign = d > 0 ? '+' : '';
    return `${sign}${fmtInt(d)}`;
}

function fmtMtd(v, kind) {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    if (kind === 'money') return `${sign}$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    return `${sign}${fmtInt(v)}`;
}

function paceCell(pace, lastMtd, days) {
    if (lastMtd == null) return '<span class="pace-cell">N/A（首月）</span>';
    if (pace == null) return '<span class="pace-cell">—</span>';
    if (days <= 3) return '<span class="pace-cell">—</span>';
    const pct = pace * 100;
    let emoji;
    if (pct >= 20) emoji = '🟢';
    else if (pct >= -20) emoji = '🟡';
    else emoji = '🔴';
    const sign = pct >= 0 ? '+' : '';
    return `<span class="pace-cell">${emoji} ${sign}${pct.toFixed(0)}%</span>`;
}

async function loadBusinessMetrics(forceReload = false) {
    if (!forceReload && bizMetricsCache) {
        renderBusinessDashboard(bizMetricsCache);
        return;
    }
    const loadingEl = document.getElementById('biz-loading');
    const dashEl = document.getElementById('biz-dashboard');
    const errEl = document.getElementById('biz-error');
    if (loadingEl) loadingEl.style.display = 'block';
    if (dashEl) dashEl.style.display = 'none';
    if (errEl) errEl.style.display = 'none';

    try {
        const res = await fetch(`${BIZ_JSON_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        bizMetricsCache = data;
        renderBusinessDashboard(data);
    } catch (e) {
        console.error('[business] load failed:', e);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errEl) errEl.style.display = 'block';
    }
}

function renderBusinessDashboard(data) {
    document.getElementById('biz-loading').style.display = 'none';
    document.getElementById('biz-error').style.display = 'none';
    document.getElementById('biz-dashboard').style.display = 'block';

    // Generation timestamp
    const tsEl = document.getElementById('biz-data-ts');
    if (tsEl && data.generated_at) {
        const dt = new Date(data.generated_at);
        tsEl.textContent = `Generated ${dt.toLocaleString('zh-TW', { hour12: false })}`;
    }

    renderKpis(data.kpis || {});
    renderMtd(data.mtd || {});
    renderSkoolFunnel(data.skool_funnel || {});
    renderTraffic(data.skool_traffic || {});
    renderYt28d(data.youtube_28d || {});
    renderFreshness(data.freshness || []);

    // Update dashboard stat-mrr (TFT MRR is the headline number)
    const mrrEl = document.getElementById('stat-mrr');
    if (mrrEl && data.kpis?.tft_mrr?.value != null) {
        mrrEl.textContent = fmtMoney(data.kpis.tft_mrr.value);
    }
}

function renderKpis(kpis) {
    const items = [
        { key: 'audience_total', label: 'Audience Total', icon: '🎯', fmt: fmtInt },
        { key: 'tft_mrr', label: 'TFT MRR', icon: '💵', fmt: fmtMoney },
        { key: 'yt_fundwithray', label: 'YT FUNDwithRay', icon: '📺', fmt: fmtInt },
        { key: 'yt_tft_story', label: 'YT TFT Story', icon: '🎬', fmt: fmtInt },
        { key: 'ig_fundwithray', label: 'IG @fundwithray', icon: '📸', fmt: fmtInt },
        { key: 'skool_free', label: '炒股黑客 (Free)', icon: '🎓', fmt: fmtInt },
        { key: 'skool_tft', label: 'TFT (Paid)', icon: '💎', fmt: fmtInt },
        { key: 'email_free', label: 'Email 炒股黑客', icon: '📧', fmt: fmtInt },
    ];
    const html = items.map(i => {
        const k = kpis[i.key] || {};
        const v = k.value;
        const d = k.delta_7d;
        let deltaCls = '';
        let deltaTxt = '';
        if (d != null && d !== 0) {
            deltaCls = d > 0 ? 'up' : 'down';
            deltaTxt = `${d > 0 ? '↑' : '↓'} ${fmtDelta(d)} (7d)`;
        } else if (d === 0) {
            deltaTxt = '±0 (7d)';
        }
        return `
            <div class="stat-box biz-kpi">
                <div class="lbl">${i.icon} ${i.label}</div>
                <div class="val">${i.fmt(v)}</div>
                <div class="delta ${deltaCls}">${deltaTxt}</div>
            </div>`;
    }).join('');
    document.getElementById('biz-kpis').innerHTML = html;
}

function renderMtd(mtd) {
    const days = mtd.days_into_month || 0;
    const noteEl = document.getElementById('biz-mtd-note');
    if (days <= 3) {
        noteEl.textContent = `⚠️ 本月才第 ${days} 天，分母小，Pace % 暫顯示 — 規則：🟢 ≥ +20% / 🟡 ±20% / 🔴 ≤ −20%`;
    } else {
        noteEl.textContent = `Pace 規則：🟢 ≥ +20% / 🟡 ±20% / 🔴 ≤ −20%（vs 上月同期 day ${days}）`;
    }

    const labels = {
        yt_main_subs: 'YT FUNDwithRay 訂閱',
        ig_followers: 'IG @fundwithray followers',
        skool_free_members: '炒股黑客 members',
        skool_tft_members: 'TFT members',
        tft_mrr: 'TFT MRR',
    };
    const order = ['yt_main_subs', 'ig_followers', 'skool_free_members', 'skool_tft_members', 'tft_mrr'];

    const tbody = document.querySelector('#biz-mtd-table tbody');
    tbody.innerHTML = order.map(k => {
        const m = mtd[k];
        if (!m) return '';
        const thisStr = fmtMtd(m.this_mtd, m.kind);
        const lastStr = m.last_mtd != null ? fmtMtd(m.last_mtd, m.kind) : 'N/A';
        const diff = (m.this_mtd != null && m.last_mtd != null) ? fmtMtd(m.this_mtd - m.last_mtd, m.kind) : '—';
        const pace = paceCell(m.pace, m.last_mtd, days);
        return `<tr>
            <td>${labels[k]}</td>
            <td class="num">${thisStr}</td>
            <td class="num">${lastStr}</td>
            <td class="num">${diff}</td>
            <td>${pace}</td>
        </tr>`;
    }).join('');
}

function renderSkoolFunnel(funnel) {
    const cards = [
        { key: 'free', name: '🎓 炒股黑客 (Free)' },
        { key: 'tft', name: '💎 TFT (Paid)' },
    ];
    const html = cards.map(c => {
        const f = funnel[c.key] || {};
        return `
            <div class="card biz-funnel-card">
                <div style="font-weight:600;font-size:13px;margin-bottom:10px;">${c.name}</div>
                <div class="row"><span class="k">Members</span><span class="v">${fmtInt(f.members)}</span></div>
                <div class="row"><span class="k">Active</span><span class="v">${fmtInt(f.active_members)}</span></div>
                <div class="row"><span class="k">MRR</span><span class="v">${fmtMoney(f.mrr_usd)}</span></div>
                <div class="row"><span class="k">Engagement</span><span class="v">${fmtPct(f.engagement_pct)}</span></div>
                <div class="row"><span class="k">Retention</span><span class="v">${fmtPct(f.retention_pct)}</span></div>
                <div class="row"><span class="k">Visitors 30d</span><span class="v">${fmtInt(f.visitors_30d)}</span></div>
                <div class="row"><span class="k">Signups 30d</span><span class="v">${fmtInt(f.signups_30d)}</span></div>
                <div class="row"><span class="k">Conversion</span><span class="v">${fmtPct(f.conversion_rate)}</span></div>
                <div class="row"><span class="k">New MRR 30d</span><span class="v">${fmtMoney(f.new_mrr_30d_usd)}</span></div>
                <div class="row"><span class="k">As of</span><span class="v" style="color:var(--text-dim);">${f.date || '—'}</span></div>
            </div>`;
    }).join('');
    document.getElementById('biz-skool-cards').innerHTML = html;
}

function renderTraffic(traffic) {
    const cards = [
        { key: 'free', name: '🎓 炒股黑客' },
        { key: 'tft', name: '💎 TFT' },
    ];
    const html = cards.map(c => {
        const rows = traffic[c.key] || [];
        if (!rows.length) {
            return `<div class="card"><div style="font-weight:600;font-size:13px;margin-bottom:10px;">${c.name}</div><div style="color:var(--text-dim);font-size:12px;">No data</div></div>`;
        }
        const rowsHtml = rows.map(r => {
            const pct = r.percent != null ? Number(r.percent).toFixed(1) : '—';
            const barW = r.percent != null ? Math.min(100, Number(r.percent)) : 0;
            return `<div class="biz-traffic-row">
                <span class="name">${r.source}</span>
                <span class="bar"><i style="width:${barW}%"></i></span>
                <span class="pct">${pct}%</span>
            </div>`;
        }).join('');
        return `<div class="card"><div style="font-weight:600;font-size:13px;margin-bottom:10px;">${c.name}</div>${rowsHtml}</div>`;
    }).join('');
    document.getElementById('biz-traffic-cards').innerHTML = html;
}

function renderYt28d(yt) {
    const order = [
        { key: 'fundwithray', name: 'FUNDwithRay' },
        { key: 'tft_story', name: 'TFT Story' },
    ];
    const tbody = document.querySelector('#biz-yt28-table tbody');
    tbody.innerHTML = order.map(c => {
        const d = yt[c.key];
        if (!d) return `<tr><td>${c.name}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`;
        const gained = d.subs_gained_28d;
        const lost = d.subs_lost_28d;
        const net = (gained != null && lost != null) ? gained - lost : null;
        const netStr = net == null ? '—' : (net >= 0 ? `+${fmtInt(net)}` : fmtInt(net));
        return `<tr>
            <td>${c.name}</td>
            <td class="num">${fmtInt(gained)}</td>
            <td class="num">${fmtInt(lost)}</td>
            <td class="num">${netStr}</td>
            <td class="num">${fmtInt(d.views_28d)}</td>
            <td class="num">${d.watch_hours_28d != null ? Number(d.watch_hours_28d).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—'}</td>
            <td class="num">${d.est_revenue_usd_28d != null ? fmtMoney(d.est_revenue_usd_28d) : '—'}</td>
        </tr>`;
    }).join('');
}

function renderFreshness(rows) {
    const tbody = document.querySelector('#biz-freshness-table tbody');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">No collection log</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => {
        const cls = r.status === 'success' ? 'biz-status-ok'
                  : r.status === 'skipped' ? 'biz-status-skipped'
                  : 'biz-status-fail';
        const lastRun = (r.last_run || '').slice(0, 16).replace('T', ' ');
        return `<tr>
            <td>${r.source}</td>
            <td class="num" style="text-align:left;">${lastRun}</td>
            <td class="${cls}">${r.status}</td>
            <td class="num">${fmtInt(r.records)}</td>
        </tr>`;
    }).join('');
}

// Auto-load on page init + when navigating to Business section
document.addEventListener('DOMContentLoaded', () => {
    // Load early so dashboard MRR card on home page is populated
    loadBusinessMetrics();
});
