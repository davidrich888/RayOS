// Delete a Drive file via OAuth2 refresh token (Ray's quota).
// Used by ppt-render Canva auto-import to remove the .pptx after Canva ingests it.
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ error: 'Missing fileId' });

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
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            return res.status(500).json({ error: 'Failed to get access token', detail: tokenData });
        }

        const delRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
            {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + tokenData.access_token }
            }
        );

        if (delRes.status === 204) {
            return res.status(200).json({ success: true, fileId });
        }
        const detail = await delRes.text();
        return res.status(delRes.status).json({ error: 'Delete failed', status: delRes.status, detail: detail.substring(0, 300) });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
