// ==================== INIT ====================

(function init() {
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
    // 🔄 Migration v4: update body data to verified Notion values (2025-03-08 start)
    if (localStorage.getItem('body_data_version') !== '4') {
        localStorage.removeItem('body_history');
        localStorage.removeItem('body_notion_index');
        bodyHistory = JSON.parse(JSON.stringify(PRELOAD_BODY_HISTORY));
        bodyNotionIndex = {};
        localStorage.setItem('body_data_version', '4');
        console.log('[RayOS] Reset body data to verified Notion values v4');
    }
    
    document.getElementById('wealth-quote-text').textContent = '"' + quote.text + '"';
    document.getElementById('wealth-quote-author').textContent = '— ' + quote.author;
    document.getElementById('goal-target').textContent = formatNumber(wealthGoal);
    
    if(localStorage.getItem('notion_token')) document.getElementById('notion-token').value = localStorage.getItem('notion_token');
    if(localStorage.getItem('n8n_webhook')) document.getElementById('n8n-webhook').value = localStorage.getItem('n8n_webhook');
    if(localStorage.getItem('anthropic_key')) document.getElementById('anthropic-key').value = localStorage.getItem('anthropic_key');
    if(localStorage.getItem('ai_model')) document.getElementById('ai-model').value = localStorage.getItem('ai_model');
    if(localStorage.getItem('ai_profile')) document.getElementById('ai-profile').value = localStorage.getItem('ai_profile');
    // Migrate bridge port 3000 → 3001 (3000 conflicts with 100xMONEY dev server)
    if(localStorage.getItem('bridge_url') && localStorage.getItem('bridge_url').includes(':3000')) {
        localStorage.setItem('bridge_url', localStorage.getItem('bridge_url').replace(':3000', ':3001'));
    }
    if(localStorage.getItem('bridge_url')) document.getElementById('bridge-url').value = localStorage.getItem('bridge_url');
    if(localStorage.getItem('bridge_token')) document.getElementById('bridge-token').value = localStorage.getItem('bridge_token');
    
    document.getElementById('body-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('biz-date').value = new Date().toISOString().split('T')[0];
    
    updateWealthDisplay();
    updateBizDisplay();
    updateTradingDisplay();
    loadBodyProgressFromDrive(); // Load cached body progress photos before physic display
    updatePhysicDisplay();
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
        if (hasNotionDirect()) {
            setTimeout(() => syncVideosFromNotion(true), 2500);
            setTimeout(() => syncContentFromNotion(true), 3000);
        }
        // Body auto-sync: 只在有 N8N URL 且「沒有」Notion Token 時觸發
        if (getN8nUrl() && !hasNotionDirect()) {
            if (bodyHistory.length <= 3) {
                setTimeout(() => syncBodyFromNotion(), 1200);
            }
        }
    }
    
    document.getElementById('life-ai-input').addEventListener('keypress', e => { if (e.key === 'Enter') askLifeAI(); });
})();
