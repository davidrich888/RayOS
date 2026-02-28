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
    if (val.v && typeof val.v === 'string') return parseGvizDate(val.v);
    return '';
}

// Fetch a single sheet and return parsed rows
async function fetchGoogleSheet(sheetName) {
    const url = GSHEETS_BASE + encodeURIComponent(sheetName);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Google Sheets fetch failed: ' + res.status);
    const text = await res.text();
    const data = parseGvizResponse(text);
    if (!data.table) throw new Error('No table in response');
    const cols = data.table.cols.map(c => c.label || '');
    const rows = (data.table.rows || []).map(row => {
        const obj = {};
        row.c.forEach((cell, i) => {
            if (cell) {
                // Date cells have .v as "Date(y,m,d)"
                if (cell.v !== null && cell.v !== undefined) {
                    obj[cols[i]] = cell.v;
                    obj['_raw_' + i] = cell;
                }
            }
        });
        return obj;
    });
    return { cols, rows };
}

// Sync wealth history from Google Sheets (replaces syncWealthFromNotion)
async function syncWealthFromGoogleSheets(silent = false) {
    if (!silent) showToast('Syncing wealth from Google Sheets...');
    try {
        // Fetch both sheets in parallel
        const [monthlyData, detailData] = await Promise.all([
            fetchGoogleSheet('資產 月週期紀錄'),
            fetchGoogleSheet('資產 細項紀錄')
        ]);

        // Build detail lookup by date
        const detailByDate = {};
        detailData.rows.forEach(row => {
            // First column is date
            const dateRaw = row['_raw_0'];
            const date = dateRaw ? parseGvizDate(dateRaw.v) : '';
            if (!date) return;
            // Category columns: map sheet names to internal names
            const cats = {};
            detailData.cols.forEach((col, i) => {
                if (i === 0) return; // skip date column
                const name = col.trim();
                if (!name) return;
                // Map sheet category names to internal names
                let key = name;
                if (name === '緊急備用金') key = '備用金';
                if (name === '股票/ETF') key = '股票ETF';
                const val = row[name];
                if (val !== undefined && val !== null) cats[key] = val;
            });
            detailByDate[date] = cats;
        });

        // Build wealthHistory from monthly data
        const records = [];
        monthlyData.rows.forEach(row => {
            const dateRaw = row['_raw_0'];
            const date = dateRaw ? parseGvizDate(dateRaw.v) : '';
            if (!date) return;

            // Map columns by index (header names may vary)
            const cols = monthlyData.cols;
            const record = {
                date: date,
                totalAssets: 0,
                netWorth: 0,
                monthlyGrowth: null,
                yearlyGrowth: null,
                categories: detailByDate[date] || {}
            };

            // Parse columns by label matching
            cols.forEach((col, i) => {
                const label = col.trim();
                const val = row[label];
                if (val === undefined || val === null) return;
                if (label === '總資產' || label === 'TotalAssets') record.totalAssets = val;
                else if (label === '淨值' || label === 'NetWorth') record.netWorth = val;
                else if (label === 'MDD') record.mdd = val;
                else if (label === '月增長' || label === '月增長%' || label === 'MonthlyGrowth') {
                    // Sheet stores as decimal (0.05 = 5%), convert to percentage
                    record.monthlyGrowth = typeof val === 'number' ? val * 100 : null;
                }
                else if (label === '年增長' || label === '年增長%' || label === 'YearlyGrowth') {
                    record.yearlyGrowth = typeof val === 'number' ? val * 100 : null;
                }
            });

            // Fallback: if netWorth is 0 but totalAssets exists
            if (!record.netWorth && record.totalAssets) record.netWorth = record.totalAssets;

            records.push(record);
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
async function syncAccountsFromGoogleSheets(silent = false) {
    if (!silent) showToast('Syncing accounts from Google Sheets...');
    try {
        const data = await fetchGoogleSheet('資產盤點');

        const parsed = [];
        data.rows.forEach(row => {
            // Map columns by label
            const name = row['名稱'] || row['Name'] || '';
            if (!name) return;
            const platform = row['平台'] || row['Platform'] || '';
            const category = row['分類'] || row['Category'] || '';
            const currency = row['幣別'] || row['Currency'] || 'TWD';
            const amount = row['金額'] || row['Amount'] || 0;
            const twdValue = row['台幣值'] || row['台幣現值'] || row['TWD Value'] || 0;
            const rate = row['匯率'] || row['Rate'] || 0;
            const interestRate = row['利率'] || row['Interest Rate'] || 0;
            const description = row['說明'] || row['Description'] || '';
            const sortOrder = row['排序'] || row['Sort'] || 0;

            parsed.push({
                name, platform, category, currency,
                amount, twdValue, rate, interestRate,
                description, sortOrder
            });
        });

        if (parsed.length > 0) {
            accounts = parsed;
            localStorage.setItem('accounts', JSON.stringify(accounts));
            renderAccountManager();
            if (!silent) showToast('Synced ' + accounts.length + ' accounts');
            console.log('[RayOS GSheets] Accounts synced:', accounts.length);
        }
    } catch (e) {
        console.error('[RayOS GSheets] Accounts sync error:', e);
        if (!silent) showToast('Accounts sync failed: ' + e.message, true);
    }
}
