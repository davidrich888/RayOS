// ==================== NOTION SYNC SYSTEM ====================

const NOTION_DB_ID = '58da82d689ed42029274234183f77bb6';
const BODY_DB_ID = 'f481a3da00de4d9391d293a88cf1c9c1';
const WEALTH_DB_ID = '127c65e93b7c4008b34c86c285295387';
const ACCOUNTS_DB_ID = '21e464db5e3e456ea7f324d951a11244';
const IDEAS_DB_ID = 'ed035c908cc04b7b999ef0c023557add';
const VIDEOS_DB_ID = '76fb8600ae9649bcb6c475f75f0ec818';
const BODY_DS_ID = '6b8fea6a-9249-4a7b-a36e-5cd7f6ceb61f';
const H2N = {trading:'Trading', advertise:'Advertise', deliver:'Deliver', gym:'Gym', fatloss:'FatLoss', ai:'AI', nofap:'NoFap'};
const NOTION_API = 'https://api.notion.com/v1';
let notionPageIndex = JSON.parse(localStorage.getItem('notion_page_index') || '{}');
let syncInProgress = false;

function getN8nUrl() { return localStorage.getItem('n8n_webhook') || ''; }
function getNotionToken() { return localStorage.getItem('notion_token') || ''; }
function hasNotionDirect() { return !!getNotionToken(); }
function updateSyncDot() {
    const d = document.getElementById('sync-dot');
    if (d) d.className = 'sync-dot ' + ((hasNotionDirect() || getN8nUrl()) ? 'on' : 'off');
}

// === Notion API helper (via Vercel serverless proxy to avoid CORS) ===
async function notionFetch(path, method, body) {
    const token = getNotionToken();
    if (!token) throw new Error('No Notion token');
    const proxyUrl = location.origin + '/api/notion';
    console.log('[RayOS Proxy]', (method || 'POST'), path);
    try {
        const res = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, method: method || 'POST', body, token })
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error('[RayOS Proxy] Error:', res.status, errText.substring(0, 200));
            throw new Error('Notion ' + res.status + ': ' + errText.substring(0, 200));
        }
        return res.json();
    } catch (e) {
        if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError') || e.message.includes('Load failed')) {
            console.error('[RayOS Proxy] Proxy unreachable — check Vercel deployment');
            throw new Error('Proxy \u4e0d\u53ef\u7528 \u2014 \u78ba\u8a8d Vercel \u90e8\u7f72\u6210\u529f');
        }
        throw e;
    }
}

// ============ DIRECT NOTION API (推薦) ============

// === 直接從 Notion 拉取全部 Habits ===
async function syncDailyFromNotionDirect(silent = false) {
    if (!hasNotionDirect()) {
        // Fallback to n8n
        return syncDailyFromNotion(silent);
    }
    if (syncInProgress) return false;
    syncInProgress = true;
    if (!silent) showToast('正在從 Notion 同步...');
    try {
        const data = await notionFetch('/databases/' + NOTION_DB_ID + '/query', 'POST', {
            page_size: 100,
            sorts: [{ property: 'Date', direction: 'descending' }]
        });
        const newPageIndex = {};
        let count = 0;
        for (const page of data.results) {
            const props = page.properties;
            const titleArr = props['Date']?.title;
            if (!titleArr || !titleArr[0]) continue;
            const dateStr = titleArr[0].plain_text;
            if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
            newPageIndex[dateStr] = page.id;
            dailyHabitsData[dateStr] = {
                trading: props['Trading']?.checkbox === true ? true : null,
                advertise: props['Advertise']?.checkbox === true ? true : null,
                deliver: (props['Deliver']?.checkbox || props['Deliever']?.checkbox) === true ? true : null,
                gym: props['Gym']?.checkbox === true ? true : null,
                fatloss: (props['FatLoss']?.checkbox || props['Fat Loss']?.checkbox) === true ? true : null,
                ai: props['AI']?.checkbox === true ? true : null,
                nofap: props['NoFap']?.checkbox === true ? true : null
            };
            count++;
        }
        notionPageIndex = newPageIndex;
        localStorage.setItem('notion_page_index', JSON.stringify(notionPageIndex));
        localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
        console.log('[RayOS Direct] Synced', count, 'days, pageIndex:', Object.keys(notionPageIndex).length);
        loadDailyHabits();
        updateSyncDot();
        if (!silent) showToast('✓ 已同步 ' + count + ' 天');
        syncInProgress = false;
        // 不自動建立今天的 Notion 項目，等使用者勾選時再建立
        return true;
    } catch (e) {
        console.error('[RayOS Direct] Sync error:', e);
        if (!silent) showToast('Notion 同步失敗: ' + e.message, true);
        syncInProgress = false;
        return false;
    }
}

// === 直接寫入 Notion checkbox ===
// NOTE: This function THROWS on error (not catch) so writeHabitToNotion can fallback to N8N
async function writeHabitToNotionDirect(dateStr, habit, value) {
    const field = H2N[habit];
    if (!field) throw new Error('Unknown habit: ' + habit);
    let pageId = notionPageIndex[dateStr];
    if (!pageId) {
        console.log('[RayOS Direct] No pageId for', dateStr, '— creating day first');
        await createDayInNotionDirect(dateStr);
        pageId = notionPageIndex[dateStr];
        if (!pageId) throw new Error('Failed to create day ' + dateStr);
    }
    await notionFetch('/pages/' + pageId, 'PATCH', {
        properties: { [field]: { checkbox: !!value } }
    });
    console.log('[RayOS Direct] Updated', dateStr, field, '=', !!value);
}

// === 直接在 Notion 建立新的一天 ===
async function createDayInNotionDirect(dateStr) {
    const habits = dailyHabitsData[dateStr] || {};
    try {
        const props = {
            'Date': { title: [{ text: { content: dateStr } }] },
            'Trading': { checkbox: !!habits.trading },
            'Advertise': { checkbox: !!habits.advertise },
            'Deliver': { checkbox: !!habits.deliver },
            'Gym': { checkbox: !!habits.gym },
            'FatLoss': { checkbox: !!habits.fatloss },
            'AI': { checkbox: !!habits.ai },
            'NoFap': { checkbox: !!habits.nofap }
        };
        // Add date property
        props['\u65e5\u671f'] = { date: { start: dateStr } };
        const page = await notionFetch('/pages', 'POST', {
            parent: { database_id: NOTION_DB_ID },
            properties: props
        });
        notionPageIndex[dateStr] = page.id;
        localStorage.setItem('notion_page_index', JSON.stringify(notionPageIndex));
        console.log('[RayOS Direct] Created day:', dateStr, '→', page.id);
    } catch (e) {
        console.error('[RayOS Direct] Create error:', e);
        showToast('Notion 建立失敗: ' + e.message, true);
    }
}

// === 測試 Notion 直接連線 ===
async function testNotionDirect() {
    const token = document.getElementById('notion-token').value;
    const statusEl = document.getElementById('notion-direct-status');
    if (!token) { statusEl.innerHTML = '❌ 請填入 Notion API Token'; return; }
    statusEl.textContent = '⏳ 測試中...';
    try {
        // Temporarily save token so notionFetch can use it
        const oldToken = localStorage.getItem('notion_token');
        localStorage.setItem('notion_token', token);
        const data = await notionFetch('/databases/' + NOTION_DB_ID + '/query', 'POST', { page_size: 1 });
        if (!oldToken) localStorage.removeItem('notion_token'); else localStorage.setItem('notion_token', oldToken);
        statusEl.innerHTML = '✅ <span style="color:var(--success);">Notion 連線成功！Daily Habits DB 可存取</span>';
    } catch (e) {
        statusEl.innerHTML = '❌ 連線失敗: ' + e.message + '<br><small>確認 Token 正確，且 Integration 已連接到資料庫</small>';
    }
}

// ============ N8N FALLBACK (進階) ============

// === 從 Notion 拉取全部 Habits（經 n8n）===
async function syncDailyFromNotion(silent = false) {
    const url = getN8nUrl();
    if (!url) { if (!silent) showToast('請先在 Settings 設定 Notion Token 或 n8n URL', true); return false; }
    if (syncInProgress) return false;
    syncInProgress = true;
    if (!silent) showToast('正在從 Notion 同步...');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'fetch_habits' })
        });
        if (!res.ok) throw new Error('n8n returned ' + res.status);
        const data = await res.json();
        if (data.habits) {
            notionPageIndex = data.pageIndex || {};
            localStorage.setItem('notion_page_index', JSON.stringify(notionPageIndex));
            console.log('[RayOS n8n] Synced pageIndex:', Object.keys(notionPageIndex).length, 'entries');
            if (!data.pageIndex) console.warn('[RayOS n8n] Response missing pageIndex — update_habit will fail');
            Object.keys(data.habits).forEach(dateStr => {
                const nd = data.habits[dateStr];
                dailyHabitsData[dateStr] = {
                    trading: (nd.Trading || nd.trading) === true ? true : null,
                    advertise: (nd.Advertise || nd.advertise) === true ? true : null,
                    deliver: (nd.Deliver || nd.Deliever || nd.deliver) === true ? true : null,
                    gym: (nd.Gym || nd.gym) === true ? true : null,
                    fatloss: (nd.FatLoss || nd['Fat Loss'] || nd.fatloss) === true ? true : null,
                    ai: (nd.AI || nd.ai) === true ? true : null,
                    nofap: (nd.NoFap || nd.nofap) === true ? true : null
                };
            });
            localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
            loadDailyHabits();
            updateSyncDot();
            if (!silent) showToast('✓ 已同步 ' + data.count + ' 天');
            syncInProgress = false;
            return true;
        }
        throw new Error('無效回應');
    } catch (e) {
        console.error('[RayOS n8n] Sync error:', e);
        if (!silent) showToast('n8n 同步失敗: ' + e.message, true);
        syncInProgress = false;
        return false;
    }
}

// === 勾選後即時寫回 Notion（Direct 優先，失敗 fallback N8N）===
async function writeHabitToNotion(dateStr, habit, value) {
    const field = H2N[habit];
    if (!field) return;

    // 1. 優先嘗試 Notion Direct API
    if (hasNotionDirect()) {
        try {
            console.log('[RayOS] Trying Notion Direct for', habit, '=', value);
            await writeHabitToNotionDirect(dateStr, habit, value);
            return; // 成功就結束
        } catch (e) {
            console.warn('[RayOS] Notion Direct failed, trying N8N fallback:', e.message);
        }
    }

    // 2. Fallback: N8N
    const url = getN8nUrl();
    if (!url) {
        showToast('Notion 同步失敗：無可用連線', true);
        return;
    }
    console.log('[RayOS] Using N8N for', habit, '=', value);
    let pageId = notionPageIndex[dateStr];
    if (!pageId) {
        console.log('[RayOS n8n] No pageId for', dateStr, '— creating day first');
        await createDayInNotionN8N(dateStr);
        pageId = notionPageIndex[dateStr];
        if (!pageId) {
            showToast('Notion 同步失敗：無法取得 pageId', true);
            return;
        }
    }
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'update_habit', pageId, field, value: !!value })
        });
        if (!res.ok) {
            console.warn('[RayOS n8n] update_habit failed:', res.status);
            showToast('Notion 更新失敗: ' + res.status, true);
        } else {
            console.log('[RayOS n8n] Updated', dateStr, field, '=', !!value);
        }
    } catch (e) {
        console.error('[RayOS n8n] Write error:', e);
        showToast('Notion 寫入錯誤', true);
    }
}

// === 在 Notion 建立新的一天（Direct 優先，失敗 fallback N8N）===
async function createDayInNotion(dateStr) {
    // 1. 優先嘗試 Notion Direct
    if (hasNotionDirect()) {
        try {
            await createDayInNotionDirect(dateStr);
            return;
        } catch (e) {
            console.warn('[RayOS] Direct create failed, trying N8N:', e.message);
        }
    }
    // 2. Fallback: N8N
    await createDayInNotionN8N(dateStr);
}

// === N8N: 建立新的一天 ===
async function createDayInNotionN8N(dateStr) {
    const url = getN8nUrl();
    if (!url) return;
    const habits = {};
    Object.entries(dailyHabitsData[dateStr] || {}).forEach(([k, v]) => { habits[H2N[k] || k] = v; });
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'create_day', date: dateStr, habits, dateProperty: dateStr })
        });
        const data = await res.json();
        if (data.pageId) {
            notionPageIndex[dateStr] = data.pageId;
            localStorage.setItem('notion_page_index', JSON.stringify(notionPageIndex));
            console.log('[RayOS n8n] Created day:', dateStr, '→', data.pageId);
        } else {
            console.warn('[RayOS n8n] create_day response missing pageId:', data);
        }
    } catch (e) { console.error('[RayOS n8n] Create error:', e); }
}

// === 測試 n8n 連線 ===
async function testN8nConnection() {
    const url = document.getElementById('n8n-webhook').value.replace(/\/+$/, '');
    const statusEl = document.getElementById('worker-status');
    if (!url) { statusEl.innerHTML = '❌ 請填入 n8n Webhook URL'; return; }
    statusEl.textContent = '⏳ 測試中...';
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'fetch_habits' })
        });
        const data = await res.json();
        if (data.habits) {
            const hasPageIndex = data.pageIndex && Object.keys(data.pageIndex).length > 0;
            statusEl.innerHTML = '✅ <span style="color:var(--success);">連線成功！取得 ' + data.count + ' 筆資料</span>' +
                (hasPageIndex ? ' (pageIndex ✓)' : ' <span style="color:var(--warning);">⚠️ 缺少 pageIndex — 勾選更新可能無法運作</span>');
        } else if (data.status === 'ok') {
            statusEl.innerHTML = '✅ <span style="color:var(--success);">連線成功！</span>';
        } else {
            statusEl.innerHTML = '⚠️ 收到回應但格式不符預期 — 請確認 n8n workflow 使用正確模板';
        }
    } catch (e) {
        statusEl.innerHTML = '❌ 連線失敗: ' + e.message + '<br><small>確認 workflow 已 Activate 且 URL 是 Production Webhook URL</small>';
    }
}

// ============ VIDEO KNOWLEDGE SYNC (Notion-first) ============
let videoKnowledge = [];

async function syncVideosFromNotion(silent = false) {
    if (!hasNotionDirect()) {
        if (!silent) showToast('請先在 Settings 設定 Notion Token', true);
        return;
    }
    if (!silent) showToast('正在載入影片知識...');
    try {
        const data = await notionFetch('/databases/' + VIDEOS_DB_ID + '/query', 'POST', {
            page_size: 100,
            sorts: [{ property: '加入日期', direction: 'descending' }]
        });
        if (data.results) {
            videoKnowledge = data.results.map(page => {
                const p = page.properties;
                // 分類支援 multi_select
                let category = '';
                if (p['分類']?.multi_select) {
                    category = p['分類'].multi_select.map(c => c.name).join(', ');
                } else if (p['分類']?.select?.name) {
                    category = p['分類'].select.name;
                }
                return {
                    id: page.id,
                    title: p['影片標題']?.title?.[0]?.plain_text || '',
                    category: category,
                    status: p['狀態']?.select?.name || '待看',
                    summary: p['AI 摘要']?.rich_text?.[0]?.plain_text || '',
                    keyTakeaway: p['一句話學到']?.rich_text?.[0]?.plain_text || '',
                    notes: p['我的筆記']?.rich_text?.[0]?.plain_text || '',
                    channel: p['頻道']?.rich_text?.[0]?.plain_text || '',
                    rating: p['我的評分']?.number || 0,
                    priority: p['優先度']?.select?.name || ''
                };
            }).filter(v => v.title);
            // 更新 dashboard stat
            const statEl = document.getElementById('stat-learning');
            if (statEl) statEl.textContent = videoKnowledge.length;
            // 更新 Life Coach 影片摘要
            renderVideoKnowledgeSummary();
            console.log('[RayOS Direct] Videos loaded:', videoKnowledge.length);
            if (!silent) showToast('✓ 已載入 ' + videoKnowledge.length + ' 部影片');
        }
    } catch (e) {
        console.error('[RayOS Direct] Videos load error:', e);
        if (!silent) showToast('影片載入失敗: ' + e.message, true);
    }
}

function renderVideoKnowledgeSummary() {
    const el = document.getElementById('video-knowledge-summary');
    if (!el) return;
    if (videoKnowledge.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">尚未載入影片知識</div>';
        return;
    }
    const pending = videoKnowledge.filter(v => v.status === '待看').length;
    const inProgress = videoKnowledge.filter(v => v.status === '進行中').length;
    const completed = videoKnowledge.filter(v => v.status === '已完成').length;
    const withSummary = videoKnowledge.filter(v => v.summary).length;
    // 分類統計
    const catMap = {};
    videoKnowledge.forEach(v => {
        (v.category || '未分類').split(', ').forEach(c => { catMap[c] = (catMap[c] || 0) + 1; });
    });
    const catStr = Object.entries(catMap).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}: ${v}`).join(' · ');
    el.innerHTML = `
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">
            <span>📚 共 <strong>${videoKnowledge.length}</strong> 部</span>
            <span>🔴 待看 <strong>${pending}</strong></span>
            <span>🟡 進行中 <strong>${inProgress}</strong></span>
            <span>🟢 已完成 <strong>${completed}</strong></span>
            <span>🤖 有摘要 <strong>${withSummary}</strong></span>
        </div>
        <div style="font-size:11px;color:var(--text-dim);">${catStr}</div>
    `;
}

// === 自動跨日 ===
let curDay = new Date().toISOString().split('T')[0];
function checkNewDay() {
    const now = new Date().toISOString().split('T')[0];
    if (now !== curDay) {
        curDay = now;
        if (!dailyHabitsData[now]) {
            dailyHabitsData[now] = {trading:null,advertise:null,deliver:null,gym:null,fatloss:null,ai:null,nofap:null};
            localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
        }
        // 不自動建立 Notion 項目，等使用者勾選時再建立
        loadDailyHabits();
        showToast('🌅 新的一天 ' + now);
    }
}
setInterval(checkNewDay, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });

// === 批次建立未來 7 天 ===
async function createNext7Days() {
    const statusEl = document.getElementById('create-week-status');
    if (!statusEl) return;
    statusEl.textContent = '⏳ 正在建立...';

    const today = new Date();
    let created = 0, skipped = 0;

    // Notion Direct API 路徑
    if (hasNotionDirect()) {
        try {
            for (let i = 0; i < 7; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() + i);
                const dateStr = d.toISOString().split('T')[0];
                if (notionPageIndex[dateStr]) {
                    skipped++;
                    continue;
                }
                if (!dailyHabitsData[dateStr]) {
                    dailyHabitsData[dateStr] = {trading:null,advertise:null,deliver:null,gym:null,fatloss:null,ai:null,nofap:null};
                }
                await createDayInNotionDirect(dateStr);
                created++;
            }
            localStorage.setItem('daily_habits', JSON.stringify(dailyHabitsData));
            statusEl.textContent = '✅ 完成！建立 ' + created + ' 天，跳過 ' + skipped + ' 天（已存在）';
            // 重新同步以更新畫面
            await syncDailyFromNotionDirect(true);
        } catch (e) {
            statusEl.textContent = '❌ 建立失敗: ' + e.message;
        }
        return;
    }

    // N8N 路徑
    const url = getN8nUrl();
    if (url) {
        try {
            const startDate = today.toISOString().split('T')[0];
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'create_weekly_entries', start_date: startDate })
            });
            const data = await res.json();
            if (data.success) {
                statusEl.textContent = '✅ 完成！建立 ' + (data.created || 0) + ' 天，跳過 ' + (data.skipped || 0) + ' 天';
                await syncDailyFromNotion(true);
            } else {
                statusEl.textContent = '❌ 建立失敗: ' + (data.error || '未知錯誤');
            }
        } catch (e) {
            statusEl.textContent = '❌ N8N 請求失敗: ' + e.message;
        }
        return;
    }

    statusEl.textContent = '❌ 請先設定 Notion Token 或 n8n URL';
}

