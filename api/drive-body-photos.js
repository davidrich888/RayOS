// List body progress photos from Google Drive via OAuth refresh token.
// Reads: RayOS Moodboard / Body Progress / [YYYY-MM-DD or YYYYMMDD] / *.jpg|png|heic
// Returns: { bodyProgress: { "YYYY-MM-DD": ["lh3_url", ...] }, count }
// Env vars (shared with drive-upload.js): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function getAccessToken() {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('OAuth refresh failed: ' + JSON.stringify(data));
    return data.access_token;
}

async function driveList(token, q, fields = 'files(id,name,mimeType)') {
    const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=200`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error(`Drive list failed (${res.status}): ${await res.text()}`);
    const data = await res.json();
    return data.files || [];
}

async function findFolder(token, name, parentId) {
    const parentClause = parentId ? `and '${parentId}' in parents ` : '';
    const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' ${parentClause}and trashed=false`;
    const files = await driveList(token, q);
    return files[0] || null;
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
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
            return res.status(500).json({ error: 'Server missing Google OAuth config' });
        }

        const token = await getAccessToken();

        // Resolve "Body Progress" folder. Try parent-scoped first (more specific),
        // then fall back to global search anywhere in Drive.
        let bodyProgress = null;
        const moodboard = await findFolder(token, 'RayOS Moodboard');
        if (moodboard) {
            bodyProgress = await findFolder(token, 'Body Progress', moodboard.id);
        }
        if (!bodyProgress) {
            // Global fallback — single owner Drive, name 'Body Progress' is unique enough
            bodyProgress = await findFolder(token, 'Body Progress');
        }
        if (!bodyProgress) {
            // Diagnostic: list everything OAuth account can see (root + shared)
            const roots = await driveList(
                token,
                `'root' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
                'files(id,name)'
            );
            const allVisible = await driveList(
                token,
                `mimeType='${FOLDER_MIME}' and trashed=false`,
                'files(id,name,parents,ownedByMe,shared)'
            );
            const about = await fetch(`${DRIVE_API}/about?fields=user`, {
                headers: { Authorization: 'Bearer ' + token }
            }).then(r => r.json()).catch(() => ({}));
            const tokenInfo = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`)
                .then(r => r.json()).catch(() => ({}));
            return res.status(404).json({
                error: "No 'Body Progress' folder found in Drive",
                hint: "Expected: <any folder> / Body Progress / <YYYY-MM-DD or YYYYMMDD> / *.jpg",
                oauthAccount: about.user || null,
                tokenScope: tokenInfo.scope || tokenInfo,
                rootFoldersFound: roots.map(f => f.name),
                allVisibleFoldersCount: allVisible.length,
                allVisibleFolders: allVisible.slice(0, 50).map(f => ({ name: f.name, ownedByMe: f.ownedByMe, shared: f.shared })),
                moodboardFound: !!moodboard
            });
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

        // Light cache: 60s — fresh enough that new uploads show in 1 minute
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ bodyProgress: result, count: Object.keys(result).length });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
