// ==================== SETTINGS ====================

function saveSettings() {
    const notionToken = document.getElementById('notion-token').value;
    const webhook = document.getElementById('n8n-webhook').value.replace(/\/+$/, '');
    const apiKey = document.getElementById('anthropic-key').value;
    const aiModel = document.getElementById('ai-model').value;
    const aiProfile = document.getElementById('ai-profile').value;
    const driveUrl = document.getElementById('drive-script-url').value.replace(/\/+$/, '');
    if (notionToken) localStorage.setItem('notion_token', notionToken);
    if (webhook) localStorage.setItem('n8n_webhook', webhook);
    if (apiKey) localStorage.setItem('anthropic_key', apiKey);
    if (driveUrl) localStorage.setItem('drive_script_url', driveUrl);
    localStorage.setItem('ai_model', aiModel);
    localStorage.setItem('ai_profile', aiProfile);
    updateSyncDot();
    updateModelBadges();
    showToast('Settings saved');
    hideModal('settings-modal');
    // Prefer direct Notion sync, fallback to n8n
    if (notionToken) {
        syncDailyFromNotionDirect(true);
    } else if (webhook) {
        syncDailyFromNotion(true);
    }
    if (driveUrl) syncMoodboardFromDrive();
}

function resetData() {
    if (confirm('Reset all data? Daily habits will re-sync from Notion.')) {
        localStorage.setItem('wealth_history', JSON.stringify(PRELOAD_WEALTH_HISTORY));
        localStorage.removeItem('daily_habits');
        localStorage.removeItem('notion_page_index');
        wealthHistory = JSON.parse(JSON.stringify(PRELOAD_WEALTH_HISTORY));
        dailyHabitsData = {};
        notionPageIndex = {};
        updateSyncDot();
        updateWealthDisplay();
        loadDailyHabits();
        hideModal('settings-modal');
        showToast('Data reset — syncing from Notion...');
        syncDailyFromNotionDirect(true);
    }
}

