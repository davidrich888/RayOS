// GTD section — reads data/gtd-snapshot.json (synced from gtd/*.md by scripts/gtd_to_rayos_json.py)

const _gtdState = { loaded: false, data: null };

async function loadGTDSnapshot(force = false) {
    if (_gtdState.loaded && !force) {
        renderGTDSection();
        return;
    }

    const loadingEl = document.getElementById('gtd-loading');
    const dashEl = document.getElementById('gtd-dashboard');
    const errEl = document.getElementById('gtd-error');
    if (loadingEl) loadingEl.style.display = 'block';
    if (dashEl) dashEl.style.display = 'none';
    if (errEl) errEl.style.display = 'none';

    try {
        const res = await fetch(`/data/gtd-snapshot.json?ts=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _gtdState.data = await res.json();
        _gtdState.loaded = true;
        renderGTDSection();
    } catch (err) {
        console.error('[GTD] Failed to load snapshot:', err);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errEl) errEl.style.display = 'block';
    }
}

function renderGTDSection() {
    const d = _gtdState.data;
    if (!d) return;

    document.getElementById('gtd-loading').style.display = 'none';
    document.getElementById('gtd-dashboard').style.display = 'block';

    // Generated timestamp
    const ts = new Date(d.generated_at);
    const tsEl = document.getElementById('gtd-data-ts');
    if (tsEl) tsEl.textContent = `Synced ${ts.toLocaleString('zh-TW', { hour12: false })}`;

    // KPIs
    renderGTDKpis(d.summary);

    // Projects grouped by area
    renderGTDProjects(d.projects);

    // Actions grouped by context
    renderGTDActions(d.actions);
}

function renderGTDKpis(s) {
    const el = document.getElementById('gtd-kpis');
    if (!el) return;

    const pct = s.automation_pct ?? 0;
    const target = s.automation_target ?? 0;
    const progressPct = target > 0 ? Math.min(100, Math.round((pct / target) * 100)) : 0;

    el.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Active Projects</div>
            <div class="stat-value">${s.active_projects}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Next Actions</div>
            <div class="stat-value">${s.next_actions}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Waiting For</div>
            <div class="stat-value">${s.waiting_for}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Task Automation</div>
            <div class="stat-value">${pct}%<span style="font-size:12px;color:var(--text-dim);font-weight:400;"> → ${target}%</span></div>
            <div style="margin-top:8px;height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden;">
                <div style="width:${progressPct}%;height:100%;background:var(--accent);"></div>
            </div>
        </div>
    `;
}

function renderGTDProjects(projects) {
    const el = document.getElementById('gtd-projects');
    if (!el) return;

    // Dashboard view: only show Task Audit Quick Wins (QW1-QW12).
    // The other active projects still live in gtd/projects.md but aren't
    // surfaced here — Task Audit is the canonical scoreboard.
    const filtered = (projects || []).filter(p => /^QW\d+/.test(p.name));

    if (filtered.length === 0) {
        el.innerHTML = '<div style="color:var(--text-dim);padding:12px;">No Task Audit Quick Wins active</div>';
        return;
    }

    const byArea = {};
    for (const p of filtered) {
        const area = p.area || 'Other';
        (byArea[area] = byArea[area] || []).push(p);
    }

    const html = Object.entries(byArea).map(([area, items]) => `
        <div style="margin-bottom:20px;">
            <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${escapeHTML(area)} · ${items.length}</div>
            ${items.map(p => `
                <div class="card" style="padding:12px 14px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px;">
                        <div style="font-weight:600;font-size:14px;">${escapeHTML(p.name)}</div>
                        <div style="font-size:11px;color:var(--text-dim);white-space:nowrap;">${escapeHTML(p.status.split('—')[0]?.trim() || '')}</div>
                    </div>
                    ${p.next_action ? `<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">→ ${escapeHTML(p.next_action)}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');

    el.innerHTML = html;
}

function renderGTDActions(actions) {
    const el = document.getElementById('gtd-actions');
    if (!el) return;

    if (!actions || Object.keys(actions).length === 0) {
        el.innerHTML = '<div style="color:var(--text-dim);padding:12px;">No next actions defined</div>';
        return;
    }

    const order = ['@me', '@claude', '@think', '@calls', '@team', '@errands', '@record'];
    const sorted = Object.keys(actions).sort((a, b) => {
        const ai = order.indexOf(a); const bi = order.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const html = sorted.map(ctx => `
        <div style="margin-bottom:20px;">
            <div style="font-size:12px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${escapeHTML(ctx)} · ${actions[ctx].length}</div>
            ${actions[ctx].map(a => `
                <div style="padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);margin-bottom:6px;font-size:13px;line-height:1.5;">
                    ${renderInlineMarkdown(a)}
                </div>
            `).join('')}
        </div>
    `).join('');

    el.innerHTML = html;
}

function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(s) {
    return escapeHTML(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:3px;font-size:11px;">$1</code>');
}
