// Upload screenshot to Google Drive via OAuth2 refresh token
// Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_FOLDER_ID

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { image, filename, mimeType } = req.body || {};
    if (!image) return res.status(400).json({ error: 'Missing image (base64)' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    const folderId = process.env.DRIVE_FOLDER_ID || '1TSx5ZXXhMVU7maBQPoGO-IAuFngc33Zx';

    if (!clientId || !clientSecret || !refreshToken) {
        return res.status(500).json({ error: 'Server missing Google OAuth config' });
    }

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
        const tokenData = await tokenRes.json();
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

        // Build multipart body
        const bodyParts = [
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            metadata + '\r\n',
            `--${boundary}\r\n`,
            `Content-Type: ${mime}\r\n`,
            'Content-Transfer-Encoding: base64\r\n\r\n',
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

        return res.status(200).json({
            success: true,
            url: publicUrl,
            fileId: fileData.id
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
