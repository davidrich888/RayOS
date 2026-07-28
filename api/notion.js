module.exports = async function handler(req, res) {
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

    const { path, method, body } = req.body;
    // Prefer the built-in NOTION_TOKEN env var (verified valid) over any client
    // token, so a stale/truncated token in a device's localStorage can never
    // cause 401s. Every device syncs Notion with zero per-device config.
    // Falls back to the client token only when no env var is set (local dev).
    const token = process.env.NOTION_TOKEN || req.body.token;

    if (!path || !token) {
        return res.status(400).json({ error: 'Missing path or token' });
    }

    try {
        const fetchMethod = method || 'POST';
        const fetchOpts = {
            method: fetchMethod,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            }
        };
        if (fetchMethod !== 'GET' && body) {
            fetchOpts.body = JSON.stringify(body);
        }
        const notionRes = await fetch('https://api.notion.com/v1' + path, fetchOpts);

        const data = await notionRes.json();

        if (!notionRes.ok) {
            return res.status(notionRes.status).json(data);
        }

        return res.status(200).json(data);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
