export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { path, method, body, token } = req.body;

    if (!path || !token) {
        return res.status(400).json({ error: 'Missing path or token' });
    }

    try {
        const notionRes = await fetch('https://api.notion.com/v1' + path, {
            method: method || 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: body ? JSON.stringify(body) : undefined
        });

        const data = await notionRes.json();

        if (!notionRes.ok) {
            return res.status(notionRes.status).json(data);
        }

        return res.status(200).json(data);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
