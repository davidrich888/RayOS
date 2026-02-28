// ==================== GOOGLE SHEETS WEALTH SYNC ====================

const GSHEETS_ID = '1CLhLI2H0ciP6F5yh7sXK4Cnp07XAGDTUOph3DX-9KBk';
const GSHEETS_BASE = 'https://docs.google.com/spreadsheets/d/' + GSHEETS_ID + '/gviz/tq?tqx=out:json&sheet=';

// Parse Google Visualization API response (JSONP-like wrapper)
function parseGvizResponse(text) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+)\);?$/);
    if (!match) throw new Error('Invalid gviz response');
    return JSON.parse(match[1]);
}

// Parse gviz date value: "Date(2026,1,28)" → "2026-02-28" (month is 0-indexed)
function parseGvizDate(val) {
    if (!val) return '';
    if (typeof val === 'string') {
        const m = val.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (m) {
            const y = m[1];
            const mo = String(parseInt(m[2]) + 1).padStart(2, '0');
            const d = m[3].padStart(2, '0');
            return y + '-' + mo + '-' + d;
        }
        return val;
    }
    return '';
}

// Get cell value by index from a gviz row, returns null if missing
function getCellVal(row, idx) {
    if (!row.c || !row.c[idx]) return null;
    return row.c[idx].v;
}

// Fetch raw gviz table (cols + rows with cell arrays)
async function fetchGoogleSheetRaw(sheetName) {
    const url = GSHEETS_BASE + encodeURIComponent(sheetName);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Google Sheets fetch failed: ' + res.status);
    const text = await res.text();
    const data = parseGvizResponse(text);
    if (!data.table) throw new Error('No table in response');
    return data.table;
}

// Sync wealth history from Google Sheets (replaces syncWealthFromNotion)
// 月週期紀錄 columns: A=日期, B=資產總額(不含負債), C=資產總額(含負債), D=MDD, E=月增率%, F=年增率%
// 細項紀錄 columns: A=日期, B=緊急備用金, C=活期存款, D=股票/ETF, E=加密貨幣, F=外幣存款, G=債務
async function syncWealthFromGoogleSheets(silent = false) {
    if (!silent) showToast('Syncing wealth from Google Sheets...');
    try {
        const [monthlyTable, detailTable] = await Promise.all([
            fetchGoogleSheetRaw('資產 月週期紀錄'),
            fetchGoogleSheetRaw('資產 細項紀錄')
        ]);

        // Build detail lookup by date
        const detailByDate = {};
        const catMap = ['', '備用金', '活期存款', '股票ETF', '加密貨幣', '外幣存款', '債務'];
        (detailTable.rows || []).forEach(row => {
            const dateStr = parseGvizDate(getCellVal(row, 0));
            if (!dateStr) return;
            const cats = {};
            for (let i = 1; i <= 6; i++) {
                const v = getCellVal(row, i);
                if (v !== null && catMap[i]) cats[catMap[i]] = v;
            }
            detailByDate[dateStr] = cats;
        });

        // Build wealthHistory from monthly data
        const records = [];
        (monthlyTable.rows || []).forEach(row => {
            const dateStr = parseGvizDate(getCellVal(row, 0));
            if (!dateStr) return;

            const totalAssets = getCellVal(row, 1) || 0;  // B: 資產總額(不含負債)
            const netWorth = getCellVal(row, 2) || 0;     // C: 資產總額(含負債)
            const mdd = getCellVal(row, 3);                // D: MDD
            const monthlyRaw = getCellVal(row, 4);         // E: 月增率%
            const yearlyRaw = getCellVal(row, 5);          // F: 年增率%

            records.push({
                date: dateStr,
                totalAssets: totalAssets,
                netWorth: netWorth || totalAssets,
                mdd: mdd,
                // Sheet stores as decimal (0.05 = 5%), convert to percentage
                monthlyGrowth: typeof monthlyRaw === 'number' ? monthlyRaw * 100 : null,
                yearlyGrowth: typeof yearlyRaw === 'number' ? yearlyRaw * 100 : null,
                categories: detailByDate[dateStr] || {}
            });
        });

        // Sort by date ascending
        records.sort((a, b) => a.date.localeCompare(b.date));

        if (records.length > 0) {
            wealthHistory = records;
            localStorage.setItem('wealth_history', JSON.stringify(wealthHistory));
            updateWealthDisplay();
            if (!silent) showToast('Synced ' + records.length + ' wealth records');
            console.log('[RayOS GSheets] Wealth synced:', records.length, 'records');
        } else {
            if (!silent) showToast('No wealth records found', true);
        }
    } catch (e) {
        console.error('[RayOS GSheets] Wealth sync error:', e);
        if (!silent) showToast('Wealth sync failed: ' + e.message, true);
    }
}

// Sync accounts from Google Sheets (replaces syncAccountsFromNotion)
// 資產盤點 sheet has no proper header labels — use column index
// Layout: A=名稱, B=平台, C=幣別, D=分類, ... (structure TBD, parse what we can)
async function syncAccountsFromGoogleSheets(silent = false) {
    if (!silent) showToast('Syncing accounts from Google Sheets...');
    try {
        const table = await fetchGoogleSheetRaw('資產盤點');

        // The sheet has no standard header row (all labels empty).
        // Try to detect account rows: rows with a non-empty string in first column
        // that look like account names (not summary/header rows).
        const parsed = [];
        (table.rows || []).forEach(row => {
            const name = getCellVal(row, 0);
            if (!name || typeof name !== 'string') return;
            // Skip rows that look like headers/totals (contain keywords)
            if (name.includes('目標') || name.includes('總額') || name.includes('合計')) return;

            const platform = getCellVal(row, 1) || '';
            const currency = getCellVal(row, 2) || 'TWD';
            const category = getCellVal(row, 3) || '';
            const amount = getCellVal(row, 4) || 0;
            const twdValue = getCellVal(row, 5) || 0;

            // Only include rows that have a meaningful name
            if (name.trim()) {
                parsed.push({
                    name: name.trim(),
                    platform: typeof platform === 'string' ? platform : '',
                    category: typeof category === 'string' ? category : '',
                    currency: typeof currency === 'string' ? currency : 'TWD',
                    amount: typeof amount === 'number' ? amount : 0,
                    twdValue: typeof twdValue === 'number' ? twdValue : 0
                });
            }
        });

        if (parsed.length > 0) {
            accounts = parsed;
            localStorage.setItem('accounts', JSON.stringify(accounts));
            renderAccountManager();
            if (!silent) showToast('Synced ' + accounts.length + ' accounts');
            console.log('[RayOS GSheets] Accounts synced:', accounts.length);
        } else {
            console.log('[RayOS GSheets] No accounts parsed — sheet structure may need adjustment');
        }
    } catch (e) {
        console.error('[RayOS GSheets] Accounts sync error:', e);
        if (!silent) showToast('Accounts sync failed: ' + e.message, true);
    }
}
