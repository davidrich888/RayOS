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

// ==================== QR EXPORT / IMPORT ====================

const EXPORT_KEYS = [
    'notion_token', 'n8n_webhook', 'anthropic_key',
    'ai_model', 'ai_profile', 'drive_script_url',
    'wealth_goal', 'physic_goal', 'wealth_quote'
];

const EXPORT_KEY_LABELS = {
    'notion_token': 'Notion Token',
    'n8n_webhook': 'n8n Webhook',
    'anthropic_key': 'Anthropic Key',
    'ai_model': 'AI Model',
    'ai_profile': 'AI Profile',
    'drive_script_url': 'Drive Script URL',
    'wealth_goal': 'Wealth Goal',
    'physic_goal': 'Physic Goal',
    'wealth_quote': 'Wealth Quote'
};

function exportSettingsQR() {
    // 1. Collect all settings
    const settings = {};
    EXPORT_KEYS.forEach(key => {
        const val = localStorage.getItem(key);
        if (val) settings[key] = val;
    });

    if (Object.keys(settings).length === 0) {
        showToast('目前沒有任何設定可匯出', true);
        return;
    }

    // 2. Base64 encode (handle UTF-8)
    const json = JSON.stringify(settings);
    const b64 = btoa(unescape(encodeURIComponent(json)));

    // 3. Build URL
    const importUrl = location.origin + '/?import=' + b64;

    // 4. Check size (QR code practical limit)
    if (importUrl.length > 3500) {
        showToast('設定資料過大，無法產生 QR Code', true);
        return;
    }

    // 5. Generate QR code
    const container = document.getElementById('qr-code-container');
    container.innerHTML = '';
    new QRCode(container, {
        text: importUrl,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });

    // 6. Show payload info
    const info = document.getElementById('qr-payload-info');
    const keyCount = Object.keys(settings).length;
    info.textContent = '包含 ' + keyCount + ' 項設定 (' + json.length + ' bytes)';

    // 7. Store for copy button
    window._exportedSettingsB64 = b64;

    hideModal('settings-modal');
    showModal('qr-export-modal');
}

function copySettingsCode() {
    if (!window._exportedSettingsB64) {
        showToast('請先匯出設定', true);
        return;
    }
    navigator.clipboard.writeText(window._exportedSettingsB64)
        .then(() => showToast('設定碼已複製到剪貼簿'))
        .catch(() => {
            // Fallback: prompt user to copy manually
            prompt('請手動複製以下設定碼：', window._exportedSettingsB64);
        });
}

// Shared import logic: decode Base64, validate, save to localStorage, show success
function _importSettingsFromB64(b64) {
    const json = decodeURIComponent(escape(atob(b64)));
    const settings = JSON.parse(json);

    if (typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('Invalid format');
    }

    const imported = [];
    EXPORT_KEYS.forEach(key => {
        if (settings[key] !== undefined && settings[key] !== null) {
            localStorage.setItem(key, settings[key]);
            const label = EXPORT_KEY_LABELS[key] || key;
            const isSensitive = ['notion_token', 'anthropic_key', 'n8n_webhook', 'drive_script_url'].includes(key);
            const display = isSensitive
                ? settings[key].substring(0, 10) + '...'
                : (settings[key].length > 30 ? settings[key].substring(0, 30) + '...' : settings[key]);
            imported.push({ label, display });
        }
    });

    if (imported.length === 0) return false;

    const list = document.getElementById('import-result-list');
    list.innerHTML = imported.map(item =>
        '<div style="padding:4px 0;border-bottom:1px solid var(--border);">' +
            '<span style="color:var(--accent);">' + item.label + '</span>' +
            '<span style="float:right;color:var(--text-muted);font-size:11px;">' + item.display + '</span>' +
        '</div>'
    ).join('');

    return true;
}

function importSettingsFromURL() {
    const params = new URLSearchParams(window.location.search);
    const importData = params.get('import');
    if (!importData) return false;

    try {
        if (!_importSettingsFromB64(importData)) {
            showToast('匯入資料中沒有有效設定', true);
            return false;
        }

        // Clean URL (remove ?import= parameter)
        window.history.replaceState({}, '', window.location.origin + window.location.pathname);

        showModal('import-success-modal');
        return true;
    } catch (e) {
        console.error('[RayOS] Import failed:', e);
        showToast('匯入失敗: 無效的資料格式', true);
        window.history.replaceState({}, '', window.location.origin + window.location.pathname);
        return false;
    }
}

function importSettingsFromPaste() {
    const input = document.getElementById('import-code-input');
    const b64 = input.value.trim();
    if (!b64) {
        showToast('請貼上設定碼', true);
        return;
    }

    try {
        if (!_importSettingsFromB64(b64)) {
            showToast('匯入資料中沒有有效設定', true);
            return;
        }

        input.value = '';
        hideModal('settings-modal');
        showModal('import-success-modal');
    } catch (e) {
        console.error('[RayOS] Paste import failed:', e);
        showToast('設定碼無效，請確認是否正確複製', true);
    }
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

