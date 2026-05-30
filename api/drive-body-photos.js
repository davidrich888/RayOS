// List body progress photos from Google Drive via Service Account.
// Reads: <any folder shared with SA> / Body Progress / [YYYY-MM-DD or YYYYMMDD] / *.jpg|png|heic
// Returns: { bodyProgress: { "YYYY-MM-DD": ["lh3_url", ...] }, count }
//
// Setup once:
//   1. Share the 'Body Progress' folder (or its parent) with the SA email
//      from GOOGLE_SA_KEY's client_email. Viewer permission is enough.
//   2. Set Vercel env var GOOGLE_SA_KEY to the full JSON content of the SA key.

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

// "20260206" -> "2026-02-06"; "2026-2-6" -> "2026-02-06"; passthrough otherwise
function normalizeDate(s) {
    if (!s) return s;
    const trimmed = s.trim();
    if (/^\d{8}$/.test(trimmed)) return `${trimmed.slice(0,4)}-${trimmed.slice(4,6)}-${trimmed.slice(6,8)}`;
    const m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    return trimmed;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { token, email } = await getServiceAccountToken();

        // Find body-photo folder by either Chinese or English name.
        const candidates = await driveList(
            token,
            `(name='體態照' or name='Body Progress') and mimeType='${FOLDER_MIME}' and trashed=false`,
            'files(id,name,parents)'
        );
        if (candidates.length === 0) {
            // Diagnostic: show what folders the SA can see at all
            const visible = await driveList(
                token,
                `mimeType='${FOLDER_MIME}' and trashed=false`,
                'files(id,name)'
            );
            return res.status(404).json({
                error: "No '體態照' or 'Body Progress' folder shared with service account",
                hint: `Right-click the '體態照' (or 'RayOS Moodboard') folder in Drive → Share → add ${email} as Viewer`,
                serviceAccountEmail: email,
                visibleFoldersCount: visible.length,
                visibleFolders: visible.slice(0, 30).map(f => f.name)
            });
        }

        // If multiple matches, prefer one whose parent is 'RayOS Moodboard'; else first.
        let bodyProgress = candidates[0];
        if (candidates.length > 1) {
            for (const c of candidates) {
                const parents = c.parents || [];
                for (const pid of parents) {
                    const parentRes = await fetch(`${DRIVE_API}/files/${pid}?fields=name`, {
                        headers: { Authorization: 'Bearer ' + token }
                    });
                    if (parentRes.ok) {
                        const p = await parentRes.json();
                        if (p.name === 'RayOS Moodboard') { bodyProgress = c; break; }
                    }
                }
            }
        }

        const dateFolders = await driveList(
            token,
            `'${bodyProgress.id}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
        );

        // Parallel: list images in each date folder
        const entries = await Promise.all(dateFolders.map(async (df) => {
            const files = await driveList(
                token,
                `'${df.id}' in parents and mimeType contains 'image/' and trashed=false`,
                'files(id,name,mimeType)'
            );
            const urls = files.map(f => `https://lh3.googleusercontent.com/d/${f.id}=s1200`);
            return [normalizeDate(df.name), urls];
        }));

        const result = {};
        for (const [date, urls] of entries) {
            if (urls.length > 0) result[date] = urls;
        }

        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({
            bodyProgress: result,
            count: Object.keys(result).length,
            folderId: bodyProgress.id
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
