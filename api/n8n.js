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

    const { path, apiKey } = req.body;

    if (!path || !apiKey) {
        return res.status(400).json({ error: 'Missing path or apiKey' });
    }

    try {
        const n8nRes = await fetch('https://david86726.app.n8n.cloud/api/v1' + path, {
            method: 'GET',
            headers: {
                'X-N8N-API-KEY': apiKey,
                'Accept': 'application/json'
            }
        });

        const data = await n8nRes.json();

        if (!n8nRes.ok) {
            return res.status(n8nRes.status).json(data);
        }

        return res.status(200).json(data);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
