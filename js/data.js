// ==================== PRELOAD DATA ====================

const PRELOAD_WEALTH_HISTORY = [
    { date: '2023-10-04', totalAssets: 193010, netWorth: -26980, monthlyGrowth: null, yearlyGrowth: null, categories: { '備用金': 0, '活期存款': 0, '股票ETF': 0, '加密貨幣': 0, '外幣存款': 0, '債務': 0 } },
    { date: '2023-11-07', totalAssets: 296437, netWorth: 81437, monthlyGrowth: 53.59, yearlyGrowth: 15.08, categories: { '備用金': 115869, '活期存款': 23352, '股票ETF': 103534, '加密貨幣': 54747, '外幣存款': 0, '債務': 215000 } },
    { date: '2024-01-06', totalAssets: 299134, netWorth: -108670, monthlyGrowth: -12.31, yearlyGrowth: -182.87, categories: { '備用金': 67292, '活期存款': 19022, '股票ETF': 177509, '加密貨幣': 35312, '外幣存款': 0, '債務': 407804 } },
    { date: '2024-08-19', totalAssets: 290704, netWorth: -20891, monthlyGrowth: 45.92, yearlyGrowth: -115.93, categories: { '備用金': 120000, '活期存款': 40476, '股票ETF': 17890, '加密貨幣': 112338, '外幣存款': 0, '債務': 311595 } },
    { date: '2024-09-30', totalAssets: 698106, netWorth: 396511, monthlyGrowth: 67.64, yearlyGrowth: 202.37, categories: { '備用金': 240279, '活期存款': 388871, '股票ETF': 18193, '加密貨幣': 50763, '外幣存款': 0, '債務': 301595 } },
    { date: '2024-12-31', totalAssets: 1485956, netWorth: 1194361, monthlyGrowth: 11.50, yearlyGrowth: 810.80, categories: { '備用金': 800500, '活期存款': 609953, '股票ETF': 16955, '加密貨幣': 58548, '外幣存款': 0, '債務': 291595 } },
    { date: '2025-03-30', totalAssets: 3263895, netWorth: 3071638, monthlyGrowth: 18.78, yearlyGrowth: 157.18, categories: { '備用金': 701282, '活期存款': 730478, '股票ETF': 939185, '加密貨幣': 892950, '外幣存款': 0, '債務': 192257 } },
    { date: '2025-06-30', totalAssets: 3753106, netWorth: 3567863, monthlyGrowth: 6.14, yearlyGrowth: 198.73, categories: { '備用金': 0, '活期存款': 1250488, '股票ETF': 1769422, '加密貨幣': 733196, '外幣存款': 0, '債務': 185243 } },
    { date: '2025-12-31', totalAssets: 3398914, netWorth: 3233505, monthlyGrowth: -3.20, yearlyGrowth: 170.73, categories: { '備用金': 0, '活期存款': 1466884, '股票ETF': 1556503, '加密貨幣': 375527, '外幣存款': 0, '債務': 165409 } },
    { date: '2026-01-31', totalAssets: 4113482, netWorth: 3950411, monthlyGrowth: 21.02, yearlyGrowth: 22.17, categories: { '備用金': 0, '活期存款': 2088372, '股票ETF': 1677624, '加密貨幣': 347486, '外幣存款': 0, '債務': 163071 } }
];

const PRELOAD_BODY_HISTORY = [
    // Verified from Notion Physic Tracker 2026-02-06 (fallback until n8n fetch_body is configured)
    { date: '2025-03-08', weight: 78.3, muscle: 35.4, fatpct: 21.0, notes: 'Starting point' },
    { date: '2025-08-11', weight: 80.3, muscle: 37.6, fatpct: 18.3, notes: '' },
    { date: '2026-01-02', weight: 79.8, muscle: 37.0, fatpct: 19.2, notes: '' }
];

// Notion DB: 58da82d6-89ed-4202-9274-234183f77bb6
// Fallback data — 頁面載入時若有設定 n8n webhook 會自動覆蓋
// Daily habits: no preload data, fetched from Notion on init

const PRELOAD_ALGO_EQUITY = [
    { date: '2026-01-27', equity: 1372157, dailyRet: 2.04, cumRet: 47.02 },
    { date: '2026-01-28', equity: 1402547, dailyRet: 2.21, cumRet: 50.28 },
    { date: '2026-01-29', equity: 1390467, dailyRet: -0.86, cumRet: 48.99 },
    { date: '2026-01-30', equity: 1345533, dailyRet: -3.23, cumRet: 44.17 },
    { date: '2026-02-02', equity: 1295151, dailyRet: -3.74, cumRet: 38.77 },
    { date: '2026-02-03', equity: 1435231, dailyRet: 3.09, cumRet: 43.07 }
];

const MONTHLY_RETURNS = {
    2025: { 1: -1.59, 2: -10.14, 3: 23.98, 4: 10.10, 5: 3.62, 6: -6.38, 7: 1.23, 8: -6.45, 9: 0.28, 10: 4.32, 11: 17.92, 12: -5.68, ytd: 31.32 },
    2026: { 1: 15.83, ytd: 15.83 }
};
