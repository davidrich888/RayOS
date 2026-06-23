// ==================== PIPELINE BOARD ====================
// Read-only dashboard for the content production line. Lists every content project from
// DataOS (GET /api/pipeline-list, mirrored from outputs/projects/<slug>/state.json) and
// groups them by pipeline_state so Ray can see what's stuck where — capture → research →
// title → script → ppt → reels → publish — without opening each project folder.
//
// Pure read: this tab never writes. Refresh re-pulls the queue.

let _pipelineLoaded = false;

// Stage order + labels mirror scripts/pipeline_state.py VALID_STATES and
// scripts/generate_pipeline.py STAGE_LABELS.
const PIPELINE_STAGES = [
    ['stub', '🌱 靈感捕獲（待 research）'],
    ['researched', '🔍 已研究（待選 title）'],
    ['titled', '🎯 已選 title（待寫稿）'],
    ['scripted', '📝 已寫稿（待 PPT）'],
    ['ppt_ready', '🎬 PPT 完成（待拍攝）'],
    ['filming', '🎥 拍攝中（待上傳）'],
    ['uploaded', '📤 已上傳（待分發）'],
    ['distributed', '✅ 已分發'],
];

// (state.json field, dashboard label) for the per-project path-existence chips.
const PIPELINE_SLOTS = [
    ['research_path', '研究'],
    ['script_path', '腳本'],
    ['ppt_path', 'PPT'],
    ['transcript_path', '逐字稿'],
    ['shorts_path', 'Shorts'],
    ['skool_path', 'Skool'],
];

function plEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadPipelineBoard(force = false) {
    const wrap = document.getElementById('pipeline-board');
    if (!wrap) return;
    if (_pipelineLoaded && !force) return;

    const loading = document.getElementById('pipeline-loading');
    const errEl = document.getElementById('pipeline-error');
    if (loading) loading.style.display = 'block';
    if (errEl) errEl.style.display = 'none';

    try {
        const res = await fetch('/api/pipeline-list');
        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error((data.error && JSON.stringify(data.error)) || ('HTTP ' + res.status));
        }
        renderPipelineBoard(data.projects || []);
        _pipelineLoaded = true;
    } catch (e) {
        if (errEl) {
            errEl.textContent = '⚠️ 載入失敗：' + e.message
                + '（確認 Vercel 已設 AIOS_SUPABASE_URL / AIOS_SUPABASE_SERVICE_KEY，且本機已跑 sync_pipeline_state_to_dataos.py）';
            errEl.style.display = 'block';
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function pipelineProjectHTML(p) {
    const title = p.title_chosen || p.title || '(未命名)';
    const short = title.length > 70 ? title.slice(0, 70) + '…' : title;
    const chips = PIPELINE_SLOTS.map(([field, label]) => {
        const has = !!p[field];
        return `<span class="pl-chip ${has ? 'pl-chip-on' : 'pl-chip-off'}">${has ? '✅' : '·'} ${label}</span>`;
    }).join('');
    const yt = p.yt_url
        ? `<a class="pl-yt" href="${plEsc(p.yt_url)}" target="_blank" rel="noopener">▶ YT</a>`
        : '';
    const moved = p.state_updated_at ? plEsc(String(p.state_updated_at).slice(0, 10)) : '';
    return `
      <div class="pl-card">
        <div class="pl-card-head">
          <span class="pl-card-title" title="${plEsc(title)}">${plEsc(short)}</span>
          ${yt}
        </div>
        <div class="pl-card-sub"><code>${plEsc(p.slug)}</code>${moved ? ' · ' + moved : ''}</div>
        <div class="pl-chips">${chips}</div>
      </div>`;
}

function renderPipelineBoard(projects) {
    const wrap = document.getElementById('pipeline-board');
    if (!wrap) return;

    updatePipelineCount(projects);

    if (!projects.length) {
        wrap.innerHTML = '<div class="pl-empty">目前沒有專案。本機跑 '
            + '<code>python3 scripts/sync_pipeline_state_to_dataos.py</code> 把 '
            + 'outputs/projects/&lt;slug&gt;/state.json 推上 DataOS。</div>';
        return;
    }

    // bucket projects by stage; collect any unknown states into their own group so a
    // typo in pipeline_state is visible rather than silently dropped.
    const buckets = new Map(PIPELINE_STAGES.map(([key]) => [key, []]));
    const unknown = [];
    for (const p of projects) {
        const key = p.pipeline_state;
        if (buckets.has(key)) buckets.get(key).push(p);
        else unknown.push(p);
    }

    let html = '';
    for (const [key, label] of PIPELINE_STAGES) {
        const items = buckets.get(key);
        if (!items.length) continue;
        html += `<section class="pl-stage">`
            + `<h3 class="pl-stage-head">${label} <span class="pl-stage-n">${items.length}</span></h3>`
            + `<div class="pl-grid">${items.map(pipelineProjectHTML).join('')}</div></section>`;
    }
    if (unknown.length) {
        html += `<section class="pl-stage">`
            + `<h3 class="pl-stage-head">❓ 未知狀態 <span class="pl-stage-n">${unknown.length}</span></h3>`
            + `<div class="pl-grid">${unknown.map(pipelineProjectHTML).join('')}</div></section>`;
    }
    wrap.innerHTML = html;
}

function updatePipelineCount(projects) {
    const el = document.getElementById('pipeline-count');
    if (!el) return;
    const distributed = projects.filter((p) => p.pipeline_state === 'distributed').length;
    el.textContent = `${projects.length} 專案 · ${distributed} 已分發`;
}
