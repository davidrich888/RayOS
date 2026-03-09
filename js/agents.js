// AI Agents — N8N execution status (proxied via /api/n8n to avoid CORS)
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMzE1OWNjZC01NDcyLTQyZTUtOGUwMy0zMGUyNTVlMjE0MWQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwOTAyNDE3fQ.00291E8JEI0bcmFaKCzYVA0rmGkAkGHVrcLi5p_vxng';

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

// Load when navigating to AI Agents page
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
        const section = document.getElementById('lifecoach');
        if (section && section.classList.contains('active') && !agentDataLoaded) {
            loadAgentExecutions();
        }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
