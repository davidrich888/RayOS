// ==================== PHYSIC + BODY PROGRESS PHOTOS ====================

async function saveBodyData() {
    const date = document.getElementById('body-date').value;
    const weight = parseFloat(document.getElementById('body-weight').value);
    const muscle = parseFloat(document.getElementById('body-muscle').value);
    const fatpct = parseFloat(document.getElementById('body-fatpct').value);
    const notes = document.getElementById('body-notes') ? document.getElementById('body-notes').value : '';
    if (!date || isNaN(weight) || isNaN(fatpct)) return showToast('Fill date, weight & fat%', true);
    const data = { date, weight, muscle: muscle || 0, fatpct, notes };
    const existIdx = bodyHistory.findIndex(h => h.date === date);
    if (existIdx >= 0) bodyHistory[existIdx] = data;
    else bodyHistory.push(data);
    bodyHistory.sort((a,b) => a.date.localeCompare(b.date));
    try { localStorage.setItem('body_history', JSON.stringify(bodyHistory)); } catch(e) {}
    updatePhysicDisplay();
    await writeBodyToNotion(data);
    document.getElementById('body-weight').value = '';
    document.getElementById('body-muscle').value = '';
    document.getElementById('body-fatpct').value = '';
    if (document.getElementById('body-notes')) document.getElementById('body-notes').value = '';
    showToast('Saved & synced');
}

async function writeBodyToNotion(data) {
    const url = getN8nUrl();
    if (!url) return;
    const pageId = bodyNotionIndex[data.date];
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: pageId ? 'update_body' : 'create_body',
                pageId: pageId || null,
                database_id: BODY_DS_ID,
                data: { 
                    'Record ID': data.date,
                    Date: data.date, 
                    Weight: data.weight, 
                    Muscle: data.muscle, 
                    'Fat %': data.fatpct / 100, // Notion stores as decimal
                    Notes: data.notes || '' 
                }
            })
        });
    } catch(e) { console.error('Body sync error:', e); }
}

async function syncBodyFromNotion() {
    const url = getN8nUrl();
    if (!url) return showToast('Set n8n Webhook URL in Settings first', true);
    showToast('Syncing body data...');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'fetch_body', database_id: BODY_DS_ID })
        });
        if (!res.ok) throw new Error('n8n returned ' + res.status);
        const data = await res.json();
        if (data.records && data.records.length > 0) {
            bodyNotionIndex = data.pageIndex || {};
            localStorage.setItem('body_notion_index', JSON.stringify(bodyNotionIndex));
            bodyHistory = data.records.map(r => {
                // Physic Tracker schema: Record ID(title), Date(date), Weight, Muscle, Fat %(decimal), Notes
                var dateVal = r['date:Date:start'] || r.Date || r.date || r['Record ID'] || '';
                var fatRaw = r['Fat %'] || r.BodyFat || r.fatpct || 0;
                // Notion stores Fat % as decimal (0.192 = 19.2%), convert if < 1
                var fatPct = fatRaw < 1 ? fatRaw * 100 : fatRaw;
                return {
                    date: dateVal,
                    weight: r.Weight || r.weight || 0,
                    muscle: r.Muscle || r.MuscleMass || r.muscle || 0,
                    fatpct: parseFloat(fatPct.toFixed(1)),
                    notes: r.Notes || r.notes || ''
                };
            }).filter(r => r.date).sort((a,b) => a.date.localeCompare(b.date));
            localStorage.setItem('body_history', JSON.stringify(bodyHistory));
            updatePhysicDisplay();
            showToast('✔ Synced ' + bodyHistory.length + ' records from Physic Tracker');
        } else { showToast('No records found', true); }
    } catch(e) {
        console.error('Body sync error:', e);
        showToast('Sync failed: ' + e.message, true);
    }
}

function updateBodySyncDot() {
    const d = document.getElementById('body-sync-dot');
    if (d) d.className = 'sync-dot ' + (getN8nUrl() ? 'on' : 'off');
}

function updatePhysicDisplay() {
    const sorted = bodyHistory.slice().sort((a,b) => a.date.localeCompare(b.date));
    if (sorted.length > 0) {
        const latest = sorted[sorted.length - 1];
        const first = sorted[0];
        const el = function(id) { return document.getElementById(id); };
        // Stats row
        if (el('body-stat-weight')) el('body-stat-weight').textContent = latest.weight ? latest.weight.toFixed(1) : '--';
        if (el('body-stat-fat')) el('body-stat-fat').textContent = latest.fatpct ? latest.fatpct.toFixed(1) + '%' : '--';
        if (el('body-stat-muscle')) el('body-stat-muscle').textContent = latest.muscle ? latest.muscle.toFixed(1) : '--';
        // BMI
        var h = physicGoal.height / 100;
        if (h > 0 && latest.weight && el('body-stat-bmi')) {
            el('body-stat-bmi').textContent = (latest.weight / (h * h)).toFixed(1);
        }
        // Fat change
        if (sorted.length >= 2 && el('body-stat-change')) {
            var diff = (latest.fatpct - first.fatpct).toFixed(1);
            el('body-stat-change').textContent = (diff > 0 ? '+' : '') + diff + '%';
            el('body-stat-change').style.color = diff <= 0 ? 'var(--success)' : 'var(--danger)';
        }
        // Goal card
        if (el('physic-current')) el('physic-current').textContent = latest.fatpct ? latest.fatpct.toFixed(1) : '--';
        if (el('physic-target')) el('physic-target').textContent = physicGoal.target;
        if (el('stat-bodyfat')) el('stat-bodyfat').textContent = latest.fatpct ? latest.fatpct.toFixed(1) + '%' : '--';
        var start = physicGoal.start, target = physicGoal.target;
        var progress = Math.max(0, Math.min(100, ((start - latest.fatpct) / (start - target)) * 100));
        if (el('physic-bar')) el('physic-bar').style.width = progress + '%';
        if (el('physic-pct')) el('physic-pct').textContent = progress.toFixed(0) + '%';
        var remain = (latest.fatpct - target).toFixed(1);
        if (el('physic-remain')) el('physic-remain').textContent = remain > 0 ? remain + '% to go' : 'Target reached!';
        // Summary sidebar
        if (el('body-total-records')) el('body-total-records').textContent = sorted.length;
        if (el('body-first-date')) el('body-first-date').textContent = first.date;
        if (el('body-latest-date')) el('body-latest-date').textContent = latest.date;
        if (sorted.length >= 2) {
            var wD = (latest.weight - first.weight).toFixed(1);
            if (el('body-weight-change')) { el('body-weight-change').textContent = (wD > 0?'+':'') + wD + ' kg'; el('body-weight-change').style.color = wD <= 0 ? 'var(--success)' : 'var(--danger)'; }
            var fD = (latest.fatpct - first.fatpct).toFixed(1);
            if (el('body-fat-change')) { el('body-fat-change').textContent = (fD > 0?'+':'') + fD + '%'; el('body-fat-change').style.color = fD <= 0 ? 'var(--success)' : 'var(--danger)'; }
            if (latest.muscle && first.muscle && el('body-muscle-change')) {
                var mD = (latest.muscle - first.muscle).toFixed(1);
                el('body-muscle-change').textContent = (mD > 0?'+':'') + mD + ' kg';
                el('body-muscle-change').style.color = mD >= 0 ? 'var(--success)' : 'var(--danger)';
            }
        }
                // Vs previous record
                if (sorted.length >= 2) {
                                var prev = sorted[sorted.length - 2];
                                var vW = (latest.weight - prev.weight).toFixed(1);
                                if (el('body-vs-weight')) { el('body-vs-weight').textContent = (vW > 0?'+':'') + vW + ' kg'; el('body-vs-weight').style.color = vW <= 0 ? 'var(--success)' : 'var(--danger)'; }
                                var vF = (latest.fatpct - prev.fatpct).toFixed(1);
                                if (el('body-vs-fat')) { el('body-vs-fat').textContent = (vF > 0?'+':'') + vF + '%'; el('body-vs-fat').style.color = vF <= 0 ? 'var(--success)' : 'var(--danger)'; }
                                if (latest.muscle && prev.muscle && el('body-vs-muscle')) {
                                                    var vM = (latest.muscle - prev.muscle).toFixed(1);
                                                    el('body-vs-muscle').textContent = (vM > 0?'+':'') + vM + ' kg';
                                                    el('body-vs-muscle').style.color = vM >= 0 ? 'var(--success)' : 'var(--danger)';
                                }
                                if (el('body-vs-date')) el('body-vs-date').textContent = prev.date;
                }
    }
    updateBodyChart();
    renderBodyHistoryTable();
    renderPhotoSelects();
    updateBodySyncDot();
}

function updateBodyChart(type) {
    if (!bodyChart) return;
    var hist = bodyHistory.slice().sort(function(a,b){ return a.date.localeCompare(b.date); });
    if (!hist.length) {
        bodyChart.data.labels = [];
        bodyChart.data.datasets[0].data = [];
        bodyChart.update();
        return;
    }
    // Full date label: YYYY/MM/DD
    bodyChart.data.labels = hist.map(function(h){ 
        return h.date ? h.date.replace(/-/g, '/') : ''; 
    });
    var t = type || currentBodyChartType || 'fat';
    var data;
    switch (t) {
        case 'weight': data = hist.map(function(h){ return h.weight; }); break;
        case 'muscle': data = hist.map(function(h){ return h.muscle; }); break;
        default: data = hist.map(function(h){ return h.fatpct; }); break;
    }
    bodyChart.data.datasets[0].data = data;
    bodyChart.update();
}
var currentBodyChartType = 'fat';

function renderBodyHistoryTable() {
    var tbody = document.getElementById('body-history-body');
    if (!tbody) return;
    var sorted = bodyHistory.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
    var h = physicGoal.height / 100;
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">No data — click "Sync Notion" to load</td></tr>';
        return;
    }
    var rows = '';
    for (var i = 0; i < sorted.length; i++) {
        var r = sorted[i];
        var bmi = (h > 0 && r.weight) ? (r.weight / (h * h)).toFixed(1) : '--';
        var dateDisplay = r.date ? r.date.replace(/-/g, '/') : '--';
        rows += '<tr><td style="text-align:left;">' + dateDisplay + '</td>' +
            '<td>' + (r.weight || '--') + '</td>' +
            '<td>' + (r.fatpct || '--') + '</td>' +
            '<td>' + (r.muscle || '--') + '</td>' +
            '<td>' + bmi + '</td>' +
            '<td style="font-size:10px;color:var(--text-dim);">' + (r.notes || '') + '</td>' +
            '<td><button onclick="deleteBodyRecord(' + i + ')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;">&#10005;</button></td></tr>';
    }
    tbody.innerHTML = rows;
}

function deleteBodyRecord(sortedIdx) {
    var sorted = bodyHistory.slice().sort(function(a,b){ return b.date.localeCompare(a.date); });
    var record = sorted[sortedIdx];
    if (!record || !confirm('Delete record ' + record.date + '?')) return;
    var realIdx = bodyHistory.findIndex(function(h){ return h.date === record.date; });
    if (realIdx >= 0) bodyHistory.splice(realIdx, 1);
    try { localStorage.setItem('body_history', JSON.stringify(bodyHistory)); } catch(e) {}
    updatePhysicDisplay();
    showToast('Deleted');
}

// Physic Goal
function editPhysicGoal() {
    document.getElementById('physic-start-input').value = physicGoal.start;
    document.getElementById('physic-target-input').value = physicGoal.target;
    document.getElementById('physic-height-input').value = physicGoal.height;
    showModal('physic-goal-modal');
}
function savePhysicGoal() {
    physicGoal.start = parseFloat(document.getElementById('physic-start-input').value) || 21;
    physicGoal.target = parseFloat(document.getElementById('physic-target-input').value) || 15;
    physicGoal.height = parseFloat(document.getElementById('physic-height-input').value) || 175;
    localStorage.setItem('physic_goal', JSON.stringify(physicGoal));
    updatePhysicDisplay();
    hideModal('physic-goal-modal');
    showToast('Goal saved');
}

// Photo Comparison
// ==================== BODY PROGRESS PHOTOS (Google Drive) ====================
let bodyProgressDates = {}; // { "2026-02-06": ["url1", "url2"], ... }

// Normalize date: "20260206" → "2026-02-06", "2026-02-06" stays same
function normDate(d) {
    if (!d) return d;
    d = d.trim();
    if (/^\d{8}$/.test(d)) return d.slice(0,4) + '-' + d.slice(4,6) + '-' + d.slice(6,8);
    return d;
}

function loadBodyProgressFromDrive() {
    try {
        const stored = localStorage.getItem('body_progress_drive');
        if (stored) {
            const raw = JSON.parse(stored);
            bodyProgressDates = {};
            Object.keys(raw).forEach(k => { bodyProgressDates[normDate(k)] = raw[k]; });
        }
    } catch(e) { console.log('body progress load error:', e); }
    renderPhotoSelects();
}

async function syncBodyPhotosFromDrive() {
    const scriptUrl = localStorage.getItem('drive_script_url');
    if (!scriptUrl) {
        showToast('請先在 Settings 設定 Google Drive Script URL', true);
        return;
    }
    showToast('📷 同步 Body Progress...');
    try {
        const response = await fetch(scriptUrl);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data && data.bodyProgress) {
            // Normalize date keys (20260206 → 2026-02-06)
            const normalized = {};
            Object.keys(data.bodyProgress).forEach(k => {
                normalized[normDate(k)] = data.bodyProgress[k];
            });
            const dates = Object.keys(normalized).filter(d => normalized[d].length > 0);
            if (dates.length > 0) {
                bodyProgressDates = normalized;
                localStorage.setItem('body_progress_drive', JSON.stringify(data.bodyProgress));
                renderPhotoSelects();
                showToast('✅ Body Progress: ' + dates.length + ' 個日期已同步');
            } else {
                showToast('⚠️ Body Progress 資料夾沒有找到照片', true);
            }
        } else {
            showToast('⚠️ 回傳資料中沒有 bodyProgress', true);
        }
        // Also update moodboard if we got images
        if (data && data.images && data.images.length > 0) {
            const urls = data.images.map(img => img.url);
            localStorage.setItem('moodboard_images', JSON.stringify(urls));
            localStorage.setItem('moodboard_drive_data', JSON.stringify(data.images));
        }
    } catch(e) {
        console.error('Body photo sync error:', e);
        showToast('同步失敗: ' + e.message, true);
    }
}

function renderPhotoSelects() {
    var beforeSel = document.getElementById('photo-before-select');
    var afterSel = document.getElementById('photo-after-select');
    if (!beforeSel || !afterSel) return;

    // Combine Drive photos and legacy localStorage photos
    var allDates = Object.keys(bodyProgressDates).filter(d => bodyProgressDates[d].length > 0);
    // Also include legacy bodyPhotos if any
    bodyPhotos.forEach(function(p) {
        if (allDates.indexOf(p.date) === -1) allDates.push(p.date);
    });
    allDates.sort();

    var countEl = document.getElementById('body-photo-count');
    if (countEl) countEl.textContent = allDates.length > 0 ? '📷 ' + allDates.length + ' dates' : '--';

    var opts = '';
    for (var i = 0; i < allDates.length; i++) {
        var d = allDates[i];
        var photoCount = (bodyProgressDates[d] || []).length;
        var label = d + (photoCount > 1 ? ' (' + photoCount + ')' : '');
        opts += '<option value="' + d + '">' + label + '</option>';
    }
    var empty = '<option value="">-- Select Date --</option>';
    beforeSel.innerHTML = empty + opts;
    afterSel.innerHTML = empty + opts;
    if (allDates.length >= 2) {
        beforeSel.value = allDates[0];
        afterSel.value = allDates[allDates.length - 1];
        updatePhotoComparison();
    } else if (allDates.length === 1) {
        beforeSel.value = allDates[0];
        updatePhotoComparison();
    }
}

// Photo index state
var photoIdx = { before: 0, after: 0 };

function getPhotosForDate(dateStr) {
    var photos = [];
    if (bodyProgressDates[dateStr] && bodyProgressDates[dateStr].length > 0) {
        photos = bodyProgressDates[dateStr];
    }
    // Fallback to legacy
    if (photos.length === 0) {
        var legacy = bodyPhotos.find(function(p) { return p.date === dateStr; });
        if (legacy) photos = [legacy.src];
    }
    return photos;
}

function renderPhotoThumbs(side, photos, activeIdx) {
    var container = document.getElementById('photo-' + side + '-thumbs');
    if (!container) return;
    if (photos.length <= 1) { container.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < photos.length; i++) {
        var isActive = i === activeIdx;
        var style = 'width:36px;height:36px;border-radius:4px;border:2px solid ' + 
            (isActive ? 'var(--accent)' : 'var(--border)') + 
            ';cursor:pointer;overflow:hidden;opacity:' + (isActive ? '1' : '0.5') + 
            ';transition:all 0.2s;';
        html += '<div style="' + style + '" onclick="selectPhotoIdx(\'' + side + '\',' + i + ')" onmouseover="this.style.opacity=\'1\'" onmouseout="this.style.opacity=\'' + (isActive ? '1' : '0.5') + '\'">' +
            '<img src="' + photos[i] + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">' +
            '</div>';
    }
    container.innerHTML = html;
}

function selectPhotoIdx(side, idx) {
    photoIdx[side] = idx;
    updatePhotoComparison();
}

function cyclePhoto(side, dir) {
    var dateStr = document.getElementById('photo-' + side + '-select').value;
    if (!dateStr) return;
    var photos = getPhotosForDate(dateStr);
    if (photos.length <= 1) return;
    photoIdx[side] = (photoIdx[side] + dir + photos.length) % photos.length;
    updatePhotoComparison();
}

function updatePhotoComparison() {
    var bDate = document.getElementById('photo-before-select').value;
    var aDate = document.getElementById('photo-after-select').value;
    var bFrame = document.getElementById('photo-before-frame');
    var aFrame = document.getElementById('photo-after-frame');
    var delta = document.getElementById('photo-delta');

    // Before
    if (bDate) {
        var bPhotos = getPhotosForDate(bDate);
        if (bPhotos.length > 0) {
            var bIdx = Math.min(photoIdx.before, bPhotos.length - 1);
            photoIdx.before = bIdx;
            bFrame.innerHTML = '<img src="' + bPhotos[bIdx] + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">';
            renderPhotoThumbs('before', bPhotos, bIdx);
        } else {
            bFrame.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">No photo</span>';
            renderPhotoThumbs('before', [], 0);
        }
        var bData = findBodyDataForDate(bDate);
        document.getElementById('photo-before-stats').textContent = bData ? bData.weight + 'kg / ' + bData.fatpct + '%' : bDate;
    } else {
        bFrame.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">No photo</span>';
        document.getElementById('photo-before-stats').textContent = '';
        renderPhotoThumbs('before', [], 0);
    }

    // After
    if (aDate) {
        var aPhotos = getPhotosForDate(aDate);
        if (aPhotos.length > 0) {
            var aIdx = Math.min(photoIdx.after, aPhotos.length - 1);
            photoIdx.after = aIdx;
            aFrame.innerHTML = '<img src="' + aPhotos[aIdx] + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">';
            renderPhotoThumbs('after', aPhotos, aIdx);
        } else {
            aFrame.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">No photo</span>';
            renderPhotoThumbs('after', [], 0);
        }
        var aData = findBodyDataForDate(aDate);
        document.getElementById('photo-after-stats').textContent = aData ? aData.weight + 'kg / ' + aData.fatpct + '%' : aDate;
    } else {
        aFrame.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">No photo</span>';
        document.getElementById('photo-after-stats').textContent = '';
        renderPhotoThumbs('after', [], 0);
    }

    // Delta
    if (bDate && aDate) {
        var bD = findBodyDataForDate(bDate);
        var aD = findBodyDataForDate(aDate);
        if (bD && aD) {
            var wDiff = (aD.weight - bD.weight).toFixed(1);
            var fDiff = (aD.fatpct - bD.fatpct).toFixed(1);
            delta.style.display = 'block';
            document.getElementById('photo-delta-text').innerHTML =
                'Weight: <span style="color:' + (wDiff <= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (wDiff > 0 ? '+' : '') + wDiff + ' kg</span>' +
                ' &nbsp;|&nbsp; Fat: <span style="color:' + (fDiff <= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (fDiff > 0 ? '+' : '') + fDiff + '%</span>';
        } else { delta.style.display = 'none'; }
    } else { delta.style.display = 'none'; }
}

function findBodyDataForDate(dateStr) {
    var closest = null, minDiff = Infinity;
    for (var i = 0; i < bodyHistory.length; i++) {
        var diff = Math.abs(new Date(bodyHistory[i].date) - new Date(dateStr));
        if (diff < minDiff) { minDiff = diff; closest = bodyHistory[i]; }
    }
    return (minDiff < 15 * 86400000) ? closest : null;
}

// AI Body Coach removed — unified to Life Coach page

