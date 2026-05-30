// Mint a short-lived Drive access token from Ray's OAuth refresh token.
// Used by client-side scripts (e.g. ppt-render Canva auto-import) that need
// to do large/streaming Drive operations directly against Google APIs,
// avoiding Vercel's 4.5MB body size limit on serverless functions.
//
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//
// Security note: this endpoint is unauth'd, matching the pattern of
// existing drive-upload.js. Tokens are scoped to Ray's Drive and short-lived
// (~1 hour). Treat the URL like a low-sensitivity capability.

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
        return res.status(500).json({ error: 'Server missing Google OAuth config' });
    }

    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });
        const data = await tokenRes.json();
        if (!data.access_token) {
            return res.status(500).json({ error: 'Failed to refresh token', detail: data });
        }
        return res.status(200).json({
            access_token: data.access_token,
            expires_in: data.expires_in,
            token_type: data.token_type
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
