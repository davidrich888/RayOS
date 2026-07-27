// List moodboard images from Google Drive via Service Account.
// Reads: 'RayOS Moodboard' / <category subfolders> / *.jpg|png|heic  (+ root images)
// Skips the 'Body Progress' subfolder (owned by api/drive-body-photos.js).
// Returns: { images: [{ url, category, name }], count }
//
// Why this endpoint exists:
//   The legacy per-device Apps Script URL (drive_script_url) meant every device
//   had to be configured separately. This built-in endpoint uses the same shared
//   Service Account as drive-body-photos, so EVERY device renders the identical
//   moodboard with zero per-device config.
//
// Setup once (one Drive share, no Google Cloud deploy):
//   1. Right-click the 'RayOS Moodboard' folder in Drive → Share →
//      add the SA client_email (from GOOGLE_SA_KEY) as Viewer.
//   2. GOOGLE_SA_KEY is already set in Vercel (reused from drive-body-photos).

const crypto = require('crypto');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function getServiceAccountToken() {
    const raw = process.env.GOOGLE_SA_KEY;
    if (!raw) throw new Error('GOOGLE_SA_KEY env var not set');
    let sa;
    try { sa = JSON.parse(raw); }
    catch (_) { throw new Error('GOOGLE_SA_KEY is not valid JSON'); }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    })).toString('base64url');
    const unsigned = `${header}.${claim}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = signer.sign(sa.private_key, 'base64url');
    const jwt = `${unsigned}.${signature}`;

    const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    const j = await r.json();
    if (!j.access_token) throw new Error('SA token exchange failed: ' + JSON.stringify(j));
    return { token: j.access_token, email: sa.client_email };
}

async function driveList(token, q, fields = 'files(id,name,mimeType)') {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error(`Drive list failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.files || [];
}

async function listImages(token, folderId, category, out) {
    const files = await driveList(
        token,
        `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
        'files(id,name,mimeType)'
    );
    for (const f of files) {
        out.push({
            url: `https://lh3.googleusercontent.com/d/${f.id}=s1200`,
            category,
            name: f.name
        });
    }
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { token, email } = await getServiceAccountToken();

        const folders = await driveList(
            token,
            `name='RayOS Moodboard' and mimeType='${FOLDER_MIME}' and trashed=false`,
            'files(id,name)'
        );
        if (folders.length === 0) {
            const visible = await driveList(
                token,
                `mimeType='${FOLDER_MIME}' and trashed=false`,
                'files(id,name)'
            );
            return res.status(404).json({
                error: "No 'RayOS Moodboard' folder shared with service account",
                hint: `Right-click the 'RayOS Moodboard' folder in Drive → Share → add ${email} as Viewer`,
                serviceAccountEmail: email,
                visibleFoldersCount: visible.length,
                visibleFolders: visible.slice(0, 30).map(f => f.name)
            });
        }

        const rootId = folders[0].id;
        const images = [];

        // Root-level images (category 'Other')
        await listImages(token, rootId, 'Other', images);

        // Category subfolders (skip 'Body Progress' — owned by drive-body-photos.js)
        const subs = await driveList(
            token,
            `'${rootId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
            'files(id,name)'
        );
        await Promise.all(subs
            .filter(s => s.name !== 'Body Progress')
            .map(s => listImages(token, s.id, s.name, images)));

        res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
        return res.status(200).json({
            images,
            count: images.length,
            folderId: rootId
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
