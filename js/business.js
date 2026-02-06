// ==================== BUSINESS ====================

function selectBusiness(bizId, el) {
    document.querySelectorAll('.business-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    currentBusiness = bizId;
    updateBizDisplay();
}

function updateBizDisplay() {
    const data = JSON.parse(localStorage.getItem(`biz_${currentBusiness}`) || '[]');
    if (data.length > 0) {
        const lat = data[data.length - 1];
        document.getElementById('biz-members').textContent = formatNumber(lat.members || 0);
        document.getElementById('biz-mrr').textContent = '$' + formatNumber(lat.revenue || 0);
        document.getElementById('stat-mrr').textContent = '$' + formatNumber(lat.revenue || 0);
    } else {
        document.getElementById('biz-members').textContent = '0';
        document.getElementById('biz-mrr').textContent = '$0';
    }
    updateBizChart('members');
    autoAnalyze('business');
}

function setBizChart(type, btn) {
    document.querySelectorAll('#business .chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    updateBizChart(type);
}

function updateBizChart(type = 'members') {
    const data = JSON.parse(localStorage.getItem(`biz_${currentBusiness}`) || '[]').slice(-12);
    if (!data.length) { bizChart.data.labels = []; bizChart.data.datasets[0].data = []; bizChart.update(); return; }
    const labels = data.map(d => d.date?.slice(5) || '');
    const values = type === 'members' ? data.map(d => d.members || 0) : data.map(d => d.revenue || 0);
    bizChart.data.labels = labels;
    bizChart.data.datasets[0].data = values;
    bizChart.update();
}

async function saveBizMetrics() {
    const date = document.getElementById('biz-date').value;
    const members = parseInt(document.getElementById('biz-members-input').value) || 0;
    const revenue = parseFloat(document.getElementById('biz-revenue-input').value) || 0;
    const data = { date, members, revenue };
    let hist = JSON.parse(localStorage.getItem(`biz_${currentBusiness}`) || '[]');
    hist.push(data);
    localStorage.setItem(`biz_${currentBusiness}`, JSON.stringify(hist));
    updateBizDisplay();
    document.getElementById('biz-members-input').value = '';
    document.getElementById('biz-revenue-input').value = '';
    showToast('Saved');
}

function addBusiness() {
    const name = document.getElementById('new-biz-name').value;
    const icon = document.getElementById('new-biz-icon').value || '🏢';
    if (!name) return showToast('Enter name', true);
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const selector = document.getElementById('business-selector');
    selector.innerHTML += `<div class="business-chip" data-biz="${id}" onclick="selectBusiness('${id}',this)">${icon} ${name}</div>`;
    hideModal('business-modal');
    document.getElementById('new-biz-name').value = '';
    showToast('Business added');
}
