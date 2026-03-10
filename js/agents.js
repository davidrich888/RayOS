// AI Agents — N8N execution status (proxied via /api/n8n to avoid CORS)
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMzE1OWNjZC01NDcyLTQyZTUtOGUwMy0zMGUyNTVlMjE0MWQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwOTAyNDE3fQ.00291E8JEI0bcmFaKCzYVA0rmGkAkGHVrcLi5p_vxng';

// Agent metadata — detail info for each agent
const AGENT_META = {
    'xMk2f3DEyNFRRSkh': {
        name: 'Analyst（週報）',
        icon: '📊',
        schedule: '每週日 09:00（UTC+8）',
        purpose: '自動回顧上週 YT/IG/內容表現，產出結構化週報，讓你不用手動翻數據就能掌握趨勢。',
        sources: ['YouTube Data API v3', 'IG Apify Scraper', 'Notion Content Log DB'],
        outputs: ['TG 推送（✅/❌ 審核）', 'Notion Content Review DB'],
        nodes: 'Schedule → Fetch YT → Fetch IG → Claude Haiku 分析 → Format → TG Notify + Notion Write',
        value: '每週省 30 分鐘的數據整理時間，且 AI 能發現你忽略的模式'
    },
    '4w8F5PJQSgBbgwt3': {
        name: 'Strategist（選題推薦）',
        icon: '🧠',
        schedule: '每週一 09:00（UTC+8）',
        purpose: '根據競品空白點、支柱缺口、Hook 效果排行，推薦 3 個本週最佳選題。',
        sources: ['Notion Content Log DB', 'competitors.md', 'performance-tracker.md', 'content-pillars.md'],
        outputs: ['TG 推送（✅/❌ 審核）', 'Notion Ideas DB'],
        nodes: 'Schedule → Fetch 競品+Log → Claude Haiku 分析缺口 → 推薦 3 選題 → TG Notify + Notion Write',
        value: '週一醒來就有選題建議，不用從空白開始想'
    },
    'kyub9m4XA5YUMymB': {
        name: 'TG Handler（審核處理）',
        icon: '🔔',
        schedule: '即時觸發（Webhook）',
        purpose: '處理你在 TG 上按的 ✅/❌ 按鈕，自動更新 Notion 狀態，形成閉環。',
        sources: ['Telegram Callback Query'],
        outputs: ['Notion Content Review DB（狀態更新）', 'TG 確認通知'],
        nodes: 'Webhook → Parse Callback → Update Notion → Reply TG',
        value: '一鍵審核，Analyst 和 Strategist 推送的決策你只需按一個按鈕'
    },
    'IJaIpFsUJ0bgudS2': {
        name: '每日競品報告',
        icon: '🕵️',
        schedule: '每天 09:00（UTC+8）',
        purpose: '監控 23 個華語交易 YouTuber 的新長片，分析標題模式、切入角度、機會與威脅。',
        sources: ['YouTube Data API v3（23 個競品頻道）'],
        outputs: ['Notion 競品影片追蹤 DB', 'TG 每日報告'],
        nodes: 'Schedule → Fetch 23 Channels → Filter 新片 → Claude Haiku 分析 → Notion Write + TG Notify',
        value: '每天早上知道競品在幹嘛，抓趨勢和空白點'
    },
    'FYfe4h2SFVhcwK28': {
        name: '週度競品洞察',
        icon: '📈',
        schedule: '每週日 10:00（UTC+8）',
        purpose: '把一整週的競品資料做深度分析：市場熱點、爆量驗證、空白地帶、趨勢變化。',
        sources: ['Notion 競品影片追蹤 DB（本週累積數據）'],
        outputs: ['TG 策略報告'],
        nodes: 'Schedule → Fetch 本週競品數據 → Claude Haiku 深度分析 → Format → TG Notify',
        value: '把日報的碎片情報濃縮成可執行的策略洞察'
    },
    'DVSLSNGAO6GoVh0Q': {
        name: 'Performance Feedback',
        icon: '📊',
        schedule: '每週日 10:00（UTC+8）',
        purpose: '自動找出表現最差的 2 支 YT 影片和 2 封 Email，分析失敗原因，寫入 what-flopped。',
        sources: ['YouTube Data API v3', 'ConvertKit API（broadcast stats）'],
        outputs: ['Notion Content Log [FLOP]', 'TG 失敗分析報告', 'what-flopped.md'],
        nodes: 'Schedule → Fetch YT Stats → Fetch CK Stats → Claude Haiku 分析 → Notion [FLOP] + TG Notify',
        value: '自動餵養 what-flopped 資料庫，讓失敗變成系統性學習'
    }
};

async function n8nFetch(apiPath) {
    const res = await fetch('/api/n8n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: apiPath, apiKey: N8N_API_KEY })
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
}

let agentExecChart = null;
let agentDataLoaded = false;

async function loadAgentExecutions() {
    const rows = document.querySelectorAll('.agent-row[data-wf]');
    if (!rows.length) return;

    let totalSuccess = 0;
    let totalError = 0;
    let lastRunTime = null;
    const agentNames = [];
    const agentSuccessCounts = [];
    const agentErrorCounts = [];

    for (const row of rows) {
        const wfId = row.dataset.wf;
        const statusEl = row.querySelector('.agent-exec-status');
        const dotEl = row.querySelector('.agent-status-dot');
        const nameEl = row.querySelector('div[style*="font-weight:600"]');
        const agentName = nameEl ? nameEl.textContent.split('（')[0].trim() : wfId;
        if (!statusEl) continue;

        try {
            const data = await n8nFetch(`/executions?workflowId=${wfId}&limit=10`);
            const execs = data.data || [];

            if (!execs.length) {
                statusEl.innerHTML = '<span style="color:var(--text-dim);">No executions yet</span>';
                agentNames.push(agentName);
                agentSuccessCounts.push(0);
                agentErrorCounts.push(0);
                continue;
            }

            // Count success/error for this agent (last 7 days)
            const sevenDaysAgo = Date.now() - 7 * 86400000;
            let s = 0, e = 0;
            for (const ex of execs) {
                const t = new Date(ex.startedAt || ex.createdAt).getTime();
                if (t < sevenDaysAgo) continue;
                if (ex.status === 'success') { s++; totalSuccess++; }
                else { e++; totalError++; }
            }
            agentNames.push(agentName);
            agentSuccessCounts.push(s);
            agentErrorCounts.push(e);

            // Build mini timeline: last 5 runs as dots
            const dots = execs.slice(0, 5).map(ex => {
                const ok = ex.status === 'success';
                const color = ok ? '#4CAF50' : '#f44336';
                const time = new Date(ex.startedAt || ex.createdAt);
                const label = formatRelative(time) + (ok ? ' ✓' : ' ✗');
                return `<span title="${label}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:3px;cursor:default;"></span>`;
            }).join('');

            // Last run info
            const last = execs[0];
            const lastTime = new Date(last.startedAt || last.createdAt);
            const lastOk = last.status === 'success';
            if (!lastRunTime || lastTime > lastRunTime) lastRunTime = lastTime;

            statusEl.innerHTML = `${dots} <span style="margin-left:4px;">Last: ${formatRelative(lastTime)}</span>`;

            // Update border color based on last execution
            if (!lastOk) {
                row.style.borderLeftColor = '#f44336';
                dotEl.style.color = '#f44336';
                dotEl.textContent = '● Error';
            } else {
                row.style.borderLeftColor = '#4CAF50';
                dotEl.style.color = '#4CAF50';
                dotEl.textContent = '● Active';
            }
        } catch (err) {
            statusEl.textContent = 'Fetch failed';
        }
    }

    // Build overview chart
    buildOverviewChart(agentNames, agentSuccessCounts, agentErrorCounts, totalSuccess, totalError, lastRunTime);
    agentDataLoaded = true;
}

function buildOverviewChart(names, successCounts, errorCounts, totalSuccess, totalError, lastRunTime) {
    const canvas = document.getElementById('agent-exec-chart');
    const summaryEl = document.getElementById('agent-exec-summary');
    if (!canvas || !summaryEl) return;

    // Doughnut chart: success vs error
    const ctx = canvas.getContext('2d');
    if (agentExecChart) agentExecChart.destroy();

    const total = totalSuccess + totalError;
    const successRate = total > 0 ? Math.round((totalSuccess / total) * 100) : 0;

    agentExecChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Success', 'Error'],
            datasets: [{
                data: [totalSuccess || 0, totalError || 0],
                backgroundColor: ['#4CAF50', '#f44336'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                datalabels: { display: false }
            }
        },
        plugins: [{
            id: 'centerText',
            beforeDraw(chart) {
                const { ctx, width, height } = chart;
                ctx.save();
                ctx.font = 'bold 28px Inter';
                ctx.fillStyle = successRate >= 80 ? '#4CAF50' : successRate >= 50 ? '#FF9800' : '#f44336';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${successRate}%`, width / 2, height / 2 - 8);
                ctx.font = '10px Inter';
                ctx.fillStyle = '#6b6b6b';
                ctx.fillText('success rate', width / 2, height / 2 + 16);
                ctx.restore();
            }
        }]
    });

    // Summary text
    const lastRunStr = lastRunTime ? formatRelative(lastRunTime) : 'N/A';
    summaryEl.innerHTML = `
        <div><strong style="color:var(--text);">${total}</strong> executions (7d)</div>
        <div><span style="color:#4CAF50;">● ${totalSuccess} success</span> · <span style="color:#f44336;">● ${totalError} error</span></div>
        <div>Last activity: <strong style="color:var(--text);">${lastRunStr}</strong></div>
        <div style="margin-top:8px;">
            ${names.map((n, i) => {
                const s = successCounts[i];
                const e = errorCounts[i];
                const color = e > 0 ? '#f44336' : '#4CAF50';
                return `<span style="color:${color};margin-right:8px;">● ${n}: ${s}✓${e > 0 ? ` ${e}✗` : ''}</span>`;
            }).join('<br>')}
        </div>
    `;
}

function formatRelative(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}

// Agent detail panel — click to expand/collapse
function toggleAgentDetail(row) {
    const wfId = row.dataset.wf;
    const meta = AGENT_META[wfId];
    if (!meta) return;

    // If already expanded, collapse
    const existing = row.nextElementSibling;
    if (existing && existing.classList.contains('agent-detail-panel')) {
        existing.style.maxHeight = '0';
        existing.style.opacity = '0';
        existing.style.padding = '0 16px';
        setTimeout(() => existing.remove(), 200);
        row.style.borderRadius = '8px';
        return;
    }

    // Collapse any other open panels
    document.querySelectorAll('.agent-detail-panel').forEach(p => {
        const parentRow = p.previousElementSibling;
        if (parentRow) parentRow.style.borderRadius = '8px';
        p.remove();
    });

    // Build detail panel
    const panel = document.createElement('div');
    panel.className = 'agent-detail-panel';
    panel.style.cssText = 'max-height:0;opacity:0;overflow:hidden;transition:all 0.25s ease;background:rgba(212,197,169,0.04);border:1px solid rgba(212,197,169,0.12);border-top:none;border-radius:0 0 8px 8px;padding:0 16px;font-size:12px;color:var(--text-dim);line-height:1.7;';

    const n8nUrl = `https://david86726.app.n8n.cloud/workflow/${wfId}`;

    panel.innerHTML = `
        <div style="padding:14px 0;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;">
                <div>
                    <div style="font-weight:600;color:var(--accent);font-size:11px;text-transform:uppercase;margin-bottom:4px;">觸發時間</div>
                    <div>${meta.schedule}</div>
                </div>
                <div>
                    <div style="font-weight:600;color:var(--accent);font-size:11px;text-transform:uppercase;margin-bottom:4px;">價值</div>
                    <div>${meta.value}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="font-weight:600;color:var(--accent);font-size:11px;text-transform:uppercase;margin-bottom:4px;">用途</div>
                    <div>${meta.purpose}</div>
                </div>
                <div>
                    <div style="font-weight:600;color:var(--accent);font-size:11px;text-transform:uppercase;margin-bottom:4px;">資料來源</div>
                    <div>${meta.sources.map(s => `<span style="display:inline-block;background:rgba(76,175,80,0.15);color:#4CAF50;padding:1px 6px;border-radius:4px;margin:2px 2px 2px 0;font-size:10px;">${s}</span>`).join('')}</div>
                </div>
                <div>
                    <div style="font-weight:600;color:var(--accent);font-size:11px;text-transform:uppercase;margin-bottom:4px;">輸出目的地</div>
                    <div>${meta.outputs.map(o => `<span style="display:inline-block;background:rgba(33,150,243,0.15);color:#2196F3;padding:1px 6px;border-radius:4px;margin:2px 2px 2px 0;font-size:10px;">${o}</span>`).join('')}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="font-weight:600;color:var(--accent);font-size:11px;text-transform:uppercase;margin-bottom:4px;">節點流程</div>
                    <div style="font-family:monospace;font-size:11px;color:var(--text);background:rgba(0,0,0,0.2);padding:6px 10px;border-radius:4px;">${meta.nodes}</div>
                </div>
            </div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:10px;color:var(--text-dim);">Workflow ID: ${wfId}</span>
                <a href="${n8nUrl}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;">Open in N8N ↗</a>
            </div>
        </div>
    `;

    // Round bottom corners of row, insert panel after row
    row.style.borderRadius = '8px 8px 0 0';
    row.after(panel);

    // Animate open
    requestAnimationFrame(() => {
        panel.style.maxHeight = '500px';
        panel.style.opacity = '1';
        panel.style.padding = '0 16px';
    });
}

// Load when navigating to AI Agents page
document.addEventListener('DOMContentLoaded', () => {
    // Attach click handlers to agent rows
    document.querySelectorAll('.agent-row[data-wf]').forEach(row => {
        row.style.cursor = 'pointer';
        row.style.transition = 'background 0.15s ease';
        row.addEventListener('click', () => toggleAgentDetail(row));
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(212,197,169,0.14)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'rgba(212,197,169,0.08)'; });
    });

    const observer = new MutationObserver(() => {
        const section = document.getElementById('lifecoach');
        if (section && section.classList.contains('active') && !agentDataLoaded) {
            loadAgentExecutions();
        }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
