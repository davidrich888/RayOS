// Anthropic proxy — mirrors api/notion.js.
// The API key lives ONLY in the Vercel env var ANTHROPIC_API_KEY, never in the
// public repo and never in the browser. Every device gets a working AI Coach
// with zero per-device config. Falls back to a client-supplied key only when
// the env var is absent (local dev).
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || req.body.apiKey;
    if (!apiKey) {
        return res.status(400).json({
            error: { message: 'No Anthropic API key configured on the server (ANTHROPIC_API_KEY).' }
        });
    }

    const { model, max_tokens, system, messages } = req.body;
    if (!model || !messages) {
        return res.status(400).json({ error: { message: 'Missing model or messages' } });
    }

    try {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: max_tokens || 1500,
                system,
                messages
            })
        });

        const data = await upstream.json();
        if (!upstream.ok) {
            return res.status(upstream.status).json(data);
        }
        return res.status(200).json(data);
    } catch (e) {
        return res.status(500).json({ error: { message: e.message } });
    }
};
