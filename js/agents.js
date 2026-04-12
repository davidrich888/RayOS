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
    },
    'r7327CJ8dXoO6TW5': {
        name: 'Skool Sync（TFT）',
        icon: '🏫',
        schedule: '每天 09:00（N8N Schedule 自動觸發）',
        purpose: 'TFT 付費社群成員同步：Skool Export → Google Sheet TFT tab + ConvertKit 標籤。偵測新加入/退出的成員。炒股黑客同步由本地腳本處理（launchd 每 2 天 08:00）。',
        sources: ['Skool Export API（TFT）'],
        outputs: ['Google Sheet TFT tab（113 筆）', 'ConvertKit（TFT付費/TFT退出標籤）', 'TG 通知（退出者）'],
        nodes: 'Schedule → Skool Export → Diff 比對 → Sheet 更新 → ConvertKit Tag → TG Notify',
        value: 'TFT 成員自動同步 + 退出偵測，炒股黑客由本地 Python 腳本每天 08:00 獨立處理避免 N8N OOM'
    }
};

// Info metadata — Data Sync + Tools detail info
const INFO_META = {
    'yt-main-sync': {
        name: 'YT 主頻道同步',
        icon: '📺',
        schedule: '每週日 02:00（UTC+8）',
        purpose: '用 YouTube Data API v3 抓取主頻道（FUNDwithRay）的訂閱數、總觀看、影片數等關鍵指標，寫入 performance-tracker.md 和 MEMORY.md。',
        sources: ['YouTube Data API v3'],
        outputs: ['performance-tracker.md', 'MEMORY.md', 'TG 通知'],
        flow: 'Auto Task 觸發 → YT API 拉數據 → 更新 Markdown → TG 通知變化',
        taskId: 'yt-channel-snapshot'
    },
    'tft-story-sync': {
        name: 'TFT Story 同步',
        icon: '🎬',
        schedule: '每週日 02:00（UTC+8）',
        purpose: '同步第二頻道 TFT Story（@tftmembers）的訂閱數、影片數、總觀看，追蹤學員故事頻道的成長。',
        sources: ['YouTube Data API v3'],
        outputs: ['performance-tracker.md', 'MEMORY.md', 'TG 通知'],
        flow: 'Auto Task 觸發 → YT API 拉 TFT Story 數據 → 更新 Markdown → TG 通知',
        taskId: 'yt-channel-snapshot'
    },
    'ig-profile-monthly': {
        name: 'IG Profile 月報',
        icon: '📸',
        schedule: '每月 1 號',
        purpose: '用 Apify Instagram Profile Scraper 抓取 @fundwithray 的 follower 數、貼文數等指標，每月追蹤 IG 成長趨勢。',
        sources: ['Apify instagram-profile-scraper'],
        outputs: ['performance-tracker.md', 'MEMORY.md', 'TG 通知'],
        flow: 'Auto Task 觸發 → Apify 爬取 IG Profile → 更新 Markdown → TG 通知',
        taskId: 'ig-data-update'
    },
    'ig-reels-weekly': {
        name: 'IG Reels 週報',
        icon: '🎞️',
        schedule: '每週日 02:30（UTC+8）',
        purpose: '抓取近期 IG Reels 的播放、按讚、留言數據，分析哪些 Reels 表現好/差，追蹤日更策略的成效。',
        sources: ['Apify instagram-profile-scraper'],
        outputs: ['performance-tracker.md（IG 區塊）', 'TG 通知'],
        flow: 'Auto Task 觸發 → Apify 爬取 IG Reels → 分析表現 → 更新 Tracker → TG 通知',
        taskId: 'ig-data-update'
    },
    'skool-sync-sh': {
        name: 'Skool Sync（炒股黑客）',
        icon: '🏫',
        schedule: '每天 08:00（本地 launchd）',
        purpose: '炒股黑客 Skool 成員同步：本地 Python 腳本匯出 CSV → 比對 Google Sheet → 新成員寫入 Sheet + ConvertKit 標籤 → TG 通知。獨立於 N8N 執行，避免 OOM。',
        sources: ['Skool Export API（炒股黑客）'],
        outputs: ['Google Sheet 炒股黑客 tab（5,400+）', 'ConvertKit（炒股黑客標籤）', 'TG 通知（新成員）'],
        flow: 'launchd 觸發 → Python 腳本 → Skool CSV Export → Diff 比對 → Sheet 更新 → ConvertKit Tag → TG 通知',
        local: true
    },
    'agent-memory-read': {
        name: 'Agent Memory Read',
        icon: '🧠',
        schedule: '即時觸發（Webhook）',
        purpose: '讓 Claude Code 的 /ideas、/waterfall 等指令能讀取 Agent Memory（N8N 存的高影響力記憶），輔助選題和內容決策。',
        sources: ['Claude Code 指令呼叫'],
        outputs: ['JSON 回傳：過往高影響力記憶列表'],
        flow: 'Claude curl POST → N8N Webhook → 讀取 Memory Store → 回傳 JSON',
        webhook: true
    },
    'agent-memory-write': {
        name: 'Agent Memory Write',
        icon: '💾',
        schedule: '即時觸發（Webhook）',
        purpose: '讓 Claude Code 指令執行完畢後能寫回記憶（選題推薦、內容表現等），形成跨 session 的學習迴路。',
        sources: ['Claude Code 指令呼叫'],
        outputs: ['N8N Memory Store（新增一筆記憶）'],
        flow: 'Claude curl POST（title/type/summary/score/tags）→ N8N Webhook → 寫入 Memory → 回傳確認',
        webhook: true
    },
    'tft-wall-sync': {
        name: 'TFT 見證牆自動新增',
        icon: '🏆',
        schedule: '每 7 天（Auto Task）',
        purpose: '自動掃描 Skool 最新 2 面成果牆，比對現有 storyData，新卡片自動截圖、抓取貼文內容/頭像/附圖，生成 WebP，插入 index.html 並 git push 部署。',
        sources: ['Skool 成果牆（Playwright 登入）', 'index.html storyData'],
        outputs: ['story.png + avatar + images', 'index.html（新 entry）', 'Vercel 自動部署', 'TG 通知'],
        flow: 'Auto Task 觸發 → Playwright 登入 Skool → 掃描牆 1+2 → 比對現有 → 截圖+抓資料 → WebP → 插入 storyData → git push → TG 通知',
        taskId: 'tft-wall-sync'
    },
    'taishin-expense-sync': {
        name: '台新帳單同步',
        icon: '💳',
        schedule: '每月 8 號（Auto Task）',
        purpose: '自動從 Gmail 找到台新信用卡帳單 Email，用 Playwright（真 Chrome）登入帳單頁面，Claude Vision OCR 讀驗證碼，爬取交易明細，分類後更新 RayOS 支出追蹤數據。',
        sources: ['Gmail（台新帳單信）', 'Playwright + Chrome（帳單頁面）', 'Claude Vision（驗證碼 OCR）'],
        outputs: ['expense-transactions.json', 'data.js PRELOAD_EXPENSE_MONTHLY', 'Vercel 自動部署', 'TG 通知'],
        flow: 'Auto Task 觸發 → Gmail 搜信 → 提取連結 → Playwright 登入（Chrome + Vision OCR）→ 爬取明細 → 分類 → 合併 JSON → 更新 data.js → git push → TG 通知',
        taskId: 'taishin-expense-sync'
    },
    'cathay-expense-sync': {
        name: '國泰帳單同步',
        icon: '💳',
        schedule: '每月 18 號（Auto Task）',
        purpose: '自動從 Gmail 下載國泰世華信用卡加密 PDF 帳單，用身分證字號解密，解析交易明細，分類後更新 RayOS 支出追蹤數據。',
        sources: ['Gmail（國泰帳單 PDF）', 'gws CLI（附件下載）', 'pikepdf（PDF 解密）', 'pdfplumber（表格解析）'],
        outputs: ['expense-transactions.json', 'data.js PRELOAD_EXPENSE_MONTHLY', 'Notion 月支出+刷卡明細', 'Vercel 自動部署', 'TG 通知'],
        flow: 'Auto Task 觸發 → gws 搜 Gmail → 下載 PDF 附件 → 解密 → 解析明細 → 分類 → 合併 JSON → 更新 data.js → Notion 同步 → git push → TG 通知',
        taskId: 'cathay-expense-sync'
    },
    'weekly-review-data': {
        name: 'Weekly Review Data',
        icon: '📊',
        schedule: '即時觸發（Webhook）',
        purpose: '被 /weekly-review 指令呼叫，從 N8N 拉取 YT Analytics、IG 數據、Email 表現等原始數據，供 Claude 分析後產出週報。',
        sources: ['YouTube Analytics', 'IG Apify', 'ConvertKit API'],
        outputs: ['JSON 回傳：本週各平台數據'],
        flow: 'Claude curl POST → N8N Webhook → 並行拉取 YT/IG/CK 數據 → 聚合 → 回傳 JSON',
        webhook: true
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
let agentDailyChart = null;
let agentDataLoaded = false;

// Store all executions for daily bar chart
let allExecsByDate = {};

async function loadAgentExecutions() {
    const rows = document.querySelectorAll('.agent-row[data-wf]');
    if (!rows.length) return;

    let totalSuccess = 0;
    let totalError = 0;
    let lastRunTime = null;
    const agentNames = [];
    const agentSuccessCounts = [];
    const agentErrorCounts = [];
    allExecsByDate = {};

    for (const row of rows) {
        const wfId = row.dataset.wf;
        const statusEl = row.querySelector('.agent-exec-status');
        const dotEl = row.querySelector('.agent-status-dot');
        const nameEl = row.querySelector('div[style*="font-weight:600"]');
        const agentName = nameEl ? nameEl.textContent.split('（')[0].split(/\s/)[0].trim() : wfId;
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

                // Group by date for daily bar chart
                const dateKey = new Date(ex.startedAt || ex.createdAt).toISOString().slice(0, 10);
                if (!allExecsByDate[dateKey]) allExecsByDate[dateKey] = { success: 0, error: 0 };
                if (ex.status === 'success') allExecsByDate[dateKey].success++;
                else allExecsByDate[dateKey].error++;
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
    const totalsEl = document.getElementById('agent-exec-totals');
    const healthEl = document.getElementById('agent-health-pct');
    const lastActivityEl = document.getElementById('agent-last-activity');
    if (!canvas || !summaryEl) return;

    const total = totalSuccess + totalError;
    const successRate = total > 0 ? Math.round((totalSuccess / total) * 100) : 0;

    // Update hero health indicator
    if (healthEl) {
        const healthColor = successRate >= 80 ? '#4CAF50' : successRate >= 50 ? '#FF9800' : '#f44336';
        healthEl.textContent = total > 0 ? `${successRate}%` : '—';
        healthEl.style.color = total > 0 ? healthColor : 'var(--text-dim)';
    }

    // Update last activity timestamp
    if (lastActivityEl) {
        const lastRunStr = lastRunTime ? formatRelative(lastRunTime) : '';
        lastActivityEl.textContent = lastRunStr ? `Last activity: ${lastRunStr}` : '';
    }

    // Doughnut chart: success vs error (smaller 150x150)
    const ctx = canvas.getContext('2d');
    if (agentExecChart) agentExecChart.destroy();

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
            cutout: '68%',
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
                ctx.font = 'bold 24px Inter';
                ctx.fillStyle = successRate >= 80 ? '#4CAF50' : successRate >= 50 ? '#FF9800' : '#f44336';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${successRate}%`, width / 2, height / 2 - 6);
                ctx.font = '9px Inter';
                ctx.fillStyle = '#6b6b6b';
                ctx.fillText('success', width / 2, height / 2 + 14);
                ctx.restore();
            }
        }]
    });

    // Totals below donut
    if (totalsEl) {
        totalsEl.innerHTML = `<span style="color:#4CAF50;">${totalSuccess}✓</span> · <span style="color:#f44336;">${totalError}✗</span> · <strong style="color:var(--text);">${total}</strong> total`;
    }

    // Daily bar chart — last 7 days stacked bars
    buildDailyBarChart();

    // Per-agent summary as compact horizontal badges
    summaryEl.innerHTML = names.map((n, i) => {
        const s = successCounts[i];
        const e = errorCounts[i];
        const color = e > 0 ? '#f44336' : '#4CAF50';
        const bgColor = e > 0 ? 'rgba(244,67,54,0.12)' : 'rgba(76,175,80,0.12)';
        return `<span style="color:${color};background:${bgColor};padding:2px 8px;border-radius:4px;font-size:10px;white-space:nowrap;">● ${n} ${s}✓${e > 0 ? ` ${e}✗` : ''}</span>`;
    }).join('');
}

function buildDailyBarChart() {
    const canvas = document.getElementById('agent-daily-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (agentDailyChart) agentDailyChart.destroy();

    // Generate last 7 days labels
    const labels = [];
    const successData = [];
    const errorData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const dayLabel = d.toLocaleDateString('zh-TW', { weekday: 'short' });
        labels.push(dayLabel);
        const dayData = allExecsByDate[key] || { success: 0, error: 0 };
        successData.push(dayData.success);
        errorData.push(dayData.error);
    }

    agentDailyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Success',
                    data: successData,
                    backgroundColor: 'rgba(76,175,80,0.7)',
                    borderRadius: 3,
                    barPercentage: 0.6
                },
                {
                    label: 'Error',
                    data: errorData,
                    backgroundColor: 'rgba(244,67,54,0.7)',
                    borderRadius: 3,
                    barPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: '#6b6b6b', font: { size: 10 } },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(212,197,169,0.08)' },
                    ticks: {
                        color: '#6b6b6b',
                        font: { size: 10 },
                        stepSize: 1,
                        precision: 0
                    },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: {
                    backgroundColor: '#1a1a1a',
                    titleColor: '#e8e8e8',
                    bodyColor: '#e8e8e8',
                    borderColor: 'rgba(212,197,169,0.2)',
                    borderWidth: 1,
                    padding: 8,
                    displayColors: true
                }
            }
        }
    });
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

// Info detail panel — click to expand/collapse (Data Sync + Tools)
function toggleInfoDetail(row) {
    const infoId = row.dataset.info;
    const meta = INFO_META[infoId];
    if (!meta) return;

    // If already expanded, collapse
    const existing = row.nextElementSibling;
    if (existing && existing.classList.contains('info-detail-panel')) {
        existing.style.maxHeight = '0';
        existing.style.opacity = '0';
        existing.style.padding = '0 10px';
        setTimeout(() => existing.remove(), 200);
        row.style.borderRadius = '6px';
        return;
    }

    // Collapse any other open info panels
    document.querySelectorAll('.info-detail-panel').forEach(p => {
        const parentRow = p.previousElementSibling;
        if (parentRow) parentRow.style.borderRadius = '6px';
        p.remove();
    });

    const panel = document.createElement('div');
    panel.className = 'info-detail-panel';
    panel.style.cssText = 'max-height:0;opacity:0;overflow:hidden;transition:all 0.25s ease;background:rgba(212,197,169,0.04);border:1px solid rgba(212,197,169,0.12);border-top:none;border-radius:0 0 6px 6px;padding:0 10px;font-size:11px;color:var(--text-dim);line-height:1.7;';

    // Build link section
    let linkHtml = '';
    if (meta.n8nId) {
        linkHtml = `<a href="https://david86726.app.n8n.cloud/workflow/${meta.n8nId}" target="_blank" style="font-size:10px;color:var(--accent);text-decoration:none;">Open in N8N ↗</a>`;
    } else if (meta.taskId) {
        linkHtml = `<span style="font-size:10px;color:var(--text-dim);">Auto Task ID: ${meta.taskId}</span>`;
    } else if (meta.webhook) {
        linkHtml = `<span style="font-size:10px;color:var(--text-dim);">Type: Webhook Endpoint</span>`;
    }

    panel.innerHTML = `
        <div style="padding:10px 0;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;">
                <div>
                    <div style="font-weight:600;color:var(--accent);font-size:10px;text-transform:uppercase;margin-bottom:2px;">觸發時間</div>
                    <div>${meta.schedule}</div>
                </div>
                <div>
                    <div style="font-weight:600;color:var(--accent);font-size:10px;text-transform:uppercase;margin-bottom:2px;">資料來源</div>
                    <div>${meta.sources.map(s => `<span style="display:inline-block;background:rgba(76,175,80,0.15);color:#4CAF50;padding:1px 5px;border-radius:3px;margin:1px 2px 1px 0;font-size:9px;">${s}</span>`).join('')}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="font-weight:600;color:var(--accent);font-size:10px;text-transform:uppercase;margin-bottom:2px;">用途</div>
                    <div>${meta.purpose}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="font-weight:600;color:var(--accent);font-size:10px;text-transform:uppercase;margin-bottom:2px;">輸出目的地</div>
                    <div>${meta.outputs.map(o => `<span style="display:inline-block;background:rgba(33,150,243,0.15);color:#2196F3;padding:1px 5px;border-radius:3px;margin:1px 2px 1px 0;font-size:9px;">${o}</span>`).join('')}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="font-weight:600;color:var(--accent);font-size:10px;text-transform:uppercase;margin-bottom:2px;">流程</div>
                    <div style="font-family:monospace;font-size:10px;color:var(--text);background:rgba(0,0,0,0.2);padding:4px 8px;border-radius:4px;">${meta.flow}</div>
                </div>
            </div>
            <div style="margin-top:8px;text-align:right;">${linkHtml}</div>
        </div>
    `;

    row.style.borderRadius = '6px 6px 0 0';
    row.after(panel);

    requestAnimationFrame(() => {
        panel.style.maxHeight = '400px';
        panel.style.opacity = '1';
        panel.style.padding = '0 10px';
    });
}

// Load when navigating to AI Agents page
document.addEventListener('DOMContentLoaded', () => {
    // Attach click handlers to agent rows (Decision Agents)
    document.querySelectorAll('.agent-row[data-wf]').forEach(row => {
        row.style.cursor = 'pointer';
        row.style.transition = 'background 0.15s ease';
        const originalBg = row.style.background;
        row.addEventListener('click', () => toggleAgentDetail(row));
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(212,197,169,0.14)'; });
        row.addEventListener('mouseleave', () => { row.style.background = originalBg; });
    });

    // Attach click handlers to info rows (Data Sync + Tools)
    document.querySelectorAll('.info-row[data-info]').forEach(row => {
        row.style.cursor = 'pointer';
        row.style.transition = 'background 0.15s ease';
        row.addEventListener('click', () => toggleInfoDetail(row));
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(212,197,169,0.10)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.03)'; });
    });

    const observer = new MutationObserver(() => {
        const section = document.getElementById('lifecoach');
        if (section && section.classList.contains('active') && !agentDataLoaded) {
            loadAgentExecutions();
        }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
