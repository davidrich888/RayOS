// ==================== CHARTS ====================

Chart.register(ChartDataLabels);
const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        datalabels: { color: '#6b6b6b', font: { size: 9 }, anchor: 'end', align: 'top', formatter: (v) => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? Math.round(v/1000)+'K' : v }
    },
    scales: {
        x: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 10 } } },
        y: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 10 }, callback: v => formatMoney(v) } }
    }
};

const wealthCtx = document.getElementById('wealthChart').getContext('2d');
let wealthChart = new Chart(wealthCtx, { type: 'bar', data: { labels: [], datasets: [{ data: [], backgroundColor: 'rgba(100,149,237,0.7)' }] }, options: chartOptions });

const bodyCtx = document.getElementById('bodyChart').getContext('2d');
const bodyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        datalabels: { 
            color: '#d4c5a9', 
            font: { size: 10, weight: 'bold' }, 
            anchor: 'end', 
            align: 'top', 
            formatter: (v) => v != null ? v.toFixed(1) : '' 
        }
    },
    scales: {
        x: { grid: { color: '#1f1f1f' }, ticks: { color: '#6b6b6b', font: { size: 9 }, maxRotation: 45, minRotation: 30 } },
        y: { 
            grid: { color: '#1f1f1f' }, 
            ticks: { color: '#6b6b6b', font: { size: 10 } },
            beginAtZero: false,
            grace: '10%'
        }
    }
};
const bodyChart = new Chart(bodyCtx, { type: 'line', data: { labels: [], datasets: [{ data: [], borderColor: '#d4c5a9', tension: 0.4, fill: true, backgroundColor: 'rgba(212,197,169,0.1)', pointRadius: 5, pointBackgroundColor: '#d4c5a9', pointBorderColor: '#d4c5a9', borderWidth: 2 }] }, options: bodyChartOptions });

const bizCtx = document.getElementById('bizChart').getContext('2d');
const bizChart = new Chart(bizCtx, { type: 'line', data: { labels: [], datasets: [{ data: [], borderColor: '#d4c5a9', tension: 0.4, fill: true, backgroundColor: 'rgba(212,197,169,0.1)' }] }, options: chartOptions });

const algoCtx = document.getElementById('algoChart').getContext('2d');
const algoChart = new Chart(algoCtx, { type: 'line', data: { labels: [], datasets: [{ data: [], borderColor: '#d4c5a9', tension: 0.4, fill: true, backgroundColor: 'rgba(212,197,169,0.1)' }] }, options: { ...chartOptions, plugins: { ...chartOptions.plugins, datalabels: { display: false } } } });

function setWealthMode(mode, btn) {
    btn.parentElement.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wealthChartMode = mode;
    updateWealthChart();
}

function setWealthChartStyle(style, btn) {
    btn.parentElement.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wealthChartStyle = style;
    updateWealthChart();
}

function setWealthChart(type, btn) {
    document.querySelectorAll('#wealth .chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    wealthChartType = type;
    updateWealthChart();
}

function updateWealthChart() {
    const hist = wealthHistory.slice(-24);
    if (!hist.length) return;
    const labels = hist.map(h => h.date ? h.date.slice(2,7).replace('-','/') : '');
    let data;
    switch (wealthChartType) {
        case 'total': data = hist.map(h => h.totalAssets || 0); break;
        case 'reserve': data = hist.map(h => h.categories?.['備用金'] || 0); break;
        case 'savings': data = hist.map(h => h.categories?.['活期存款'] || 0); break;
        case 'stocks': data = hist.map(h => h.categories?.['股票ETF'] || 0); break;
        case 'crypto': data = hist.map(h => h.categories?.['加密貨幣'] || 0); break;
        case 'forex': data = hist.map(h => h.categories?.['外幣存款'] || 0); break;
        case 'debt': data = hist.map(h => h.categories?.['債務'] || 0); break;
        default: data = hist.map(h => h.totalAssets || 0);
    }
    if (wealthChartMode === 'growth') {
        data = wealthChartType === 'total' ? hist.map(h => h.monthlyGrowth || 0) : data.map((v, i) => i === 0 ? 0 : parseFloat(((v - data[i-1]) / (data[i-1] || 1) * 100).toFixed(1)));
    }
    wealthChart.data.labels = labels;
    wealthChart.data.datasets[0].data = data;
    wealthChart.data.datasets[0].type = wealthChartStyle === 'line' ? 'line' : 'bar';
    wealthChart.update();
}

function setBodyChart(type, btn) {
    document.querySelectorAll('#physic .chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentBodyChartType = type;
    updateBodyChart(type);
}

