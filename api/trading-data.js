module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const SHEET_ID = '1ozBB17QMML4CmbtNfLEhm4Hu-ffpN3qTRawCa_tPHG4';
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

    try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) throw new Error(`Sheet fetch failed: ${resp.status}`);
        const csv = await resp.text();

        // Parse CSV
        const lines = csv.split('\n');
        const data = [];

        for (let i = 2; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.length < 11) continue;

            const date = row[0].trim();
            const equity = parseNum(row[6]);
            if (!date || !equity) continue;

            data.push({
                date,
                idxCumRet: parsePct(row[4]),
                equity,
                dailyRet: parsePct(row[7]),
                cumRet: parsePct(row[9]),
                dd: parsePct(row[10])
            });
        }

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
        return res.status(200).json({ success: true, count: data.length, data });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += ch; }
    }
    result.push(current);
    return result;
}

function parseNum(s) {
    if (!s || !s.trim()) return 0;
    return parseFloat(s.replace(/,/g, '').trim()) || 0;
}

function parsePct(s) {
    if (!s || !s.trim()) return 0;
    return parseFloat(s.replace('%', '').trim()) || 0;
}
