// Vercel serverless: query expense transactions from Notion DB
// GET /api/expense-detail?month=2026/01&category=Prop%20Firm

const NOTION_DB_ID = 'ca2878aa4fa1473a8776f4d8f9d16d59';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { month, category } = req.query;
    if (!month || !category) {
        return res.status(400).json({ error: 'Missing month or category param' });
    }

    const token = process.env.NOTION_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'NOTION_TOKEN not configured' });
    }

    try {
        const filter = {
            and: [
                { property: '月份', rich_text: { equals: month } },
                { property: '分類', select: { equals: category } }
            ]
        };

        const notionRes = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({ filter, page_size: 100 })
        });

        if (!notionRes.ok) {
            const err = await notionRes.json();
            return res.status(notionRes.status).json({ success: false, error: err.message || 'Notion API error' });
        }

        const data = await notionRes.json();
        const results = data.results.map(page => {
            const props = page.properties;
            return {
                desc: props['描述']?.title?.[0]?.plain_text || '',
                date: props['日期']?.date?.start || '',
                amount: props['金額']?.number || 0,
                category: props['分類']?.select?.name || '',
                month: props['月份']?.rich_text?.[0]?.plain_text || ''
            };
        });

        // Handle pagination if more than 100 results
        let nextCursor = data.next_cursor;
        while (nextCursor) {
            const nextRes = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({ filter, page_size: 100, start_cursor: nextCursor })
            });
            const nextData = await nextRes.json();
            nextData.results.forEach(page => {
                const props = page.properties;
                results.push({
                    desc: props['描述']?.title?.[0]?.plain_text || '',
                    date: props['日期']?.date?.start || '',
                    amount: props['金額']?.number || 0,
                    category: props['分類']?.select?.name || '',
                    month: props['月份']?.rich_text?.[0]?.plain_text || ''
                });
            });
            nextCursor = nextData.next_cursor;
        }

        return res.status(200).json({ success: true, data: results });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
