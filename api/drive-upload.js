// Upload screenshot to Google Drive via OAuth2 refresh token.
// Also serves the former /api/drive-token route (action=token) — the two shared
// the same OAuth env vars, and Vercel Hobby caps a deployment at 12 Serverless
// Functions. vercel.json rewrites /api/drive-token here, so existing callers
// (shame-wall.html, scripts/canva/upload_pptx_for_canva.py) keep working.
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_FOLDER_ID

module.exports = async function handler(req, res) {
    // CORS
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

    // === /api/drive-token: mint a short-lived Drive access token ===
    // Used by clients doing large/streaming Drive ops directly against Google,
    // bypassing Vercel's 4.5MB body limit. Tokens are Ray-scoped and ~1h.
    const action = (req.query && req.query.action) || (req.body && req.body.action);
    if (action === 'token') {
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
    }

    const { image, filename, mimeType, folderId: bodyFolderId } = req.body || {};
    if (!image) return res.status(400).json({ error: 'Missing image (base64)' });

    const folderId = bodyFolderId || process.env.DRIVE_FOLDER_ID || '1TSx5ZXXhMVU7maBQPoGO-IAuFngc33Zx';

    try {
        // Step 1: Get access token from refresh token
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
        const tokenText = await tokenRes.text();
        let tokenData;
        try { tokenData = JSON.parse(tokenText); }
        catch (_) { return res.status(500).json({ error: 'Google OAuth returned non-JSON', detail: tokenText.substring(0, 300) }); }
        if (!tokenData.access_token) {
            return res.status(500).json({ error: 'Failed to get access token', detail: tokenData });
        }

        // Step 2: Upload file to Drive using multipart upload
        const boundary = '---shame-wall-boundary---';
        const mime = mimeType || 'image/png';
        const fname = filename || ('shame-' + Date.now() + '.png');
        const imageBuffer = Buffer.from(image, 'base64');

        const metadata = JSON.stringify({
            name: fname,
            parents: [folderId]
        });

        // Build multipart body (binary, no Content-Transfer-Encoding)
        const bodyParts = [
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            metadata + '\r\n',
            `--${boundary}\r\n`,
            `Content-Type: ${mime}\r\n\r\n`,
        ];
        const prefix = Buffer.from(bodyParts.join(''));
        const suffix = Buffer.from(`\r\n--${boundary}--`);
        const multipartBody = Buffer.concat([prefix, imageBuffer, suffix]);

        const uploadRes = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
            {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + tokenData.access_token,
                    'Content-Type': `multipart/related; boundary=${boundary}`
                },
                body: multipartBody
            }
        );
        const fileData = await uploadRes.json();
        if (!fileData.id) {
            return res.status(500).json({ error: 'Upload failed', detail: fileData });
        }

        // Step 3: Make file publicly viewable
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + tokenData.access_token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });

        // Step 4: Return public URL
        const publicUrl = `https://lh3.googleusercontent.com/d/${fileData.id}=s1200`;
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileData.id}`;

        return res.status(200).json({
            success: true,
            url: publicUrl,
            downloadUrl,
            viewUrl: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
            fileId: fileData.id,
            name: fileData.name
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
