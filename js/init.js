// ==================== INIT ====================

// Seed any built-in setting this device is missing (js/defaults.js). Without
// this, a fresh browser / new Chrome profile / PWA / cleared site data opens
// with a blank Settings panel and Ray has to retype everything.
// Never overwrites a value the device already has — local edits win.
function bootstrapBuiltinConfig() {
    const seeded = [];
    Object.entries(RAYOS_DEFAULTS).forEach(([key, val]) => {
        if (!val || localStorage.getItem(key)) return; // device already configured
        localStorage.setItem(key, val);
        seeded.push(key);
    });
    if (seeded.length) console.log('[RayOS] Seeded built-in settings:', seeded.join(', '));
}

// Mirror localStorage into the Settings inputs. Called on init and again after
// the bootstrap fetch lands, so seeded values show up without a reload.
function refreshSettingsFields() {
    const map = {
        'notion-token': 'notion_token',
        'n8n-webhook': 'n8n_webhook',
        'anthropic-key': 'anthropic_key',
        'ai-model': 'ai_model',
        'ai-profile': 'ai_profile',
        'bridge-url': 'bridge_url',
        'bridge-token': 'bridge_token'
    };
    Object.entries(map).forEach(([elId, key]) => {
        const el = document.getElementById(elId);
        const val = localStorage.getItem(key);
        if (el && val) el.value = val;
    });
}

// Replace the hardcoded "未設定" placeholders with what is actually true.
// They previously never updated, which made a zero-config deployment look broken.
function updateBuiltinStatusLabels() {
    const b = RAYOS_BUILTIN;
    const notionEl = document.getElementById('notion-direct-status');
    if (notionEl) {
        notionEl.innerHTML = b.notion
            ? '<span style="color:var(--accent);">✅ 已內建（伺服器 NOTION_TOKEN）— 此欄免填</span>'
            : (localStorage.getItem('notion_token')
                ? '🔑 使用此裝置的 Token'
                : '<span style="color:#e57373;">⚠️ 伺服器未設 NOTION_TOKEN</span>');
    }
    const aiEl = document.getElementById('anthropic-status');
    if (aiEl) {
        aiEl.innerHTML = b.anthropic
            ? '<span style="color:var(--accent);">✅ 已內建（伺服器 ANTHROPIC_API_KEY）— 此欄免填</span>'
            : (localStorage.getItem('anthropic_key')
                ? '🔑 使用此裝置的 Key'
                : '<span style="color:#e57373;">⚠️ 伺服器未設 ANTHROPIC_API_KEY</span>');
    }
    const n8nEl = document.getElementById('worker-status');
    if (n8nEl && !n8nEl.dataset.tested) {
        n8nEl.textContent = localStorage.getItem('n8n_webhook') ? '✅ 已設定（可測試連線）' : '未設定（可選）';
    }
}

(function init() {
    bootstrapBuiltinConfig();

    // 📲 Check for settings import from QR code URL
    if (importSettingsFromURL()) return;

    // 🔄 Migration v2: clear old preloaded daily habits cache
    if (localStorage.getItem('daily_data_version') !== '2') {
        localStorage.removeItem('daily_habits');
        localStorage.removeItem('notion_page_index');
        dailyHabitsData = {};
        notionPageIndex = {};
        localStorage.setItem('daily_data_version', '2');
        console.log('[RayOS] Cleared old preload cache — will sync from Notion');
    }
    // 🔄 Migration: plan IDs changed from 8-char to full UUID (v1)
    if (localStorage.getItem('plan_id_version') !== '1') {
        localStorage.removeItem('plan_items');
        localStorage.removeItem('plan_page_index');
        planItems = [];
        planPageIndex = {};
        localStorage.setItem('plan_id_version', '1');
        console.log('[RayOS] Cleared plan cache — IDs changed to full UUID');
    }
    // 🔄 Migration: drop legacy drive_script_url (built-in /api/drive-body-photos handles it)
    if (localStorage.getItem('drive_body_photos_endpoint_v') !== '1') {
        localStorage.removeItem('drive_script_url');
        localStorage.setItem('drive_body_photos_endpoint_v', '1');
    }
    // 🔄 Migration v4: update body data to verified Notion values (2025-03-08 start)
    if (localStorage.getItem('body_data_version') !== '4') {
        localStorage.removeItem('body_history');
        localStorage.removeItem('body_notion_index');
        bodyHistory = JSON.parse(JSON.stringify(PRELOAD_BODY_HISTORY));
        bodyNotionIndex = {};
        localStorage.setItem('body_data_version', '4');
        console.log('[RayOS] Reset body data to verified Notion values v4');
    }
    
    document.getElementById('wealth-quote-text').innerHTML = '"' + quote.text.replace(/\n/g, '<br>') + '"';
    document.getElementById('wealth-quote-author').textContent = '— ' + quote.author;
    document.getElementById('goal-target').textContent = formatNumber(wealthGoal);
    
    // Migrate bridge port 3000 → 3001 (3000 conflicts with 100xMONEY dev server)
    if(localStorage.getItem('bridge_url') && localStorage.getItem('bridge_url').includes(':3000')) {
        localStorage.setItem('bridge_url', localStorage.getItem('bridge_url').replace(':3000', ':3001'));
    }
    refreshSettingsFields();
    updateBuiltinStatusLabels();
    
    document.getElementById('body-date').value = new Date().toISOString().split('T')[0];
    // biz-date input removed in DataOS refactor (commit 62c7033); ref deleted to stop init() from crashing here
    
    updateWealthDisplay();
    // updateBizDisplay() was deleted in the DataOS refactor (commit 62c7033) but the
    // call was left here, so init() threw "updateBizDisplay is not defined" on every
    // load and everything below never ran — no daily/trading/body/Notion sync, which
    // is why the dashboard sat at 0 / -- / $0 (verified in console 2026-08-10).
    // Business now self-loads: business.js:267 + navigation.js:87.
    updateTradingDisplay();
    loadBodyProgressFromDrive(); // Load cached body progress photos before physic display
    updatePhysicDisplay();
    // 📷 Body photos: silent auto-sync from Drive (built-in OAuth endpoint, no config needed)
    setTimeout(() => syncBodyPhotosFromDrive(true), 1800);
    loadDailyHabits();
    renderAccountManager();
    updateSyncDot();
    updateBodySyncDot();
    updateContentSyncDot();
    // YT Studio sync dot (now inside Content tab)
    const ytSyncDot = document.getElementById('ytstudio-sync-dot');
    if (ytSyncDot) ytSyncDot.className = 'sync-dot ' + (hasNotionDirect() ? 'on' : 'off');
    updateModelBadges();
    // 🖼️ Moodboard: render immediately from cache/defaults, then sync from Drive
    renderMoodboard();
    // Built-in SA-backed Drive sync — identical board on every device, zero config.
    // Runs once/day; silently keeps defaults if the folder isn't shared yet.
    setTimeout(() => syncMoodboardBuiltin(), 800);
    // Legacy per-device Apps Script URL (kept for backward compatibility)
    if (localStorage.getItem('drive_script_url')) {
        document.getElementById('drive-script-url').value = localStorage.getItem('drive_script_url');
        const syncDate = localStorage.getItem('moodboard_sync_date');
        const todayStr = new Date().toISOString().split('T')[0];
        if (syncDate !== todayStr) {
            setTimeout(() => syncMoodboardFromDrive(), 800);
        } else {
            const driveData = localStorage.getItem('moodboard_drive_data');
            if (driveData) {
                const imgs = JSON.parse(driveData);
                const statusEl = document.getElementById('drive-status');
                if (statusEl) statusEl.textContent = '✅ ' + imgs.length + ' 張圖片';
            }
        }
    }
    
    // 🔄 Trading: sync from Google Sheets
    setTimeout(() => fetchAlgoFromSheet(), 1000);

    // 🎯 Trading Goals: render from localStorage + sync from Notion
    renderGoals();
    if (hasNotionDirect()) setTimeout(() => syncGoalsFromNotion(true), 1200);

    // 🔄 Wealth + Accounts: sync from Google Sheets (no auth required)
    setTimeout(() => syncWealthFromGoogleSheets(true), 1500);
    setTimeout(() => syncAccountsFromGoogleSheets(true), 2000);

    // 🔄 其他 Notion-dependent syncs
    if (hasNotionDirect() || getN8nUrl()) {
        // Daily Habits: 優先用 Notion Direct，失敗才 fallback n8n
        setTimeout(async () => {
            const ok = await syncDailyFromNotionDirect(true);
            if (!ok) {
                loadDailyHabits();
            }
        }, 500);
        // Auto-sync: Notion Direct (Ideas + Videos + Content)
        // Plan syncs on first visit to Plan tab (not on init, to preserve local order)
        if (hasNotionDirect()) {
            setTimeout(() => syncVideosFromNotion(true), 2500);
            setTimeout(() => syncContentFromNotion(true), 3000);
        }
        // Body auto-sync on every dashboard load (like Videos/Content) so the Body Fat
        // card stays fresh without first visiting the Physic tab. syncBodyFromNotion uses
        // the n8n fetch_body webhook, so it only needs an n8n URL (Notion token irrelevant).
        if (getN8nUrl()) {
            setTimeout(() => syncBodyFromNotion(true), 1200);
        }
    }
    
    document.getElementById('life-ai-input').addEventListener('keypress', e => { if (e.key === 'Enter') askLifeAI(); });
})();
