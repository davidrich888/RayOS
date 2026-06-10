// GET /api/carousel-list — return staged /create-carousel decks for the RayOS review tab.
//
// Reads the DataOS `carousel_publish_queue` table with the service_role key (server-side
// only; the key never reaches the browser). Pending (待審) decks sort first so Ray sees
// what still needs review at the top, then most-recently-updated.
//
// Env (set in Vercel project settings): AIOS_SUPABASE_URL, AIOS_SUPABASE_SERVICE_KEY.

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const base = process.env.AIOS_SUPABASE_URL;
    const key = process.env.AIOS_SUPABASE_SERVICE_KEY;
    if (!base || !key) {
        return res.status(500).json({ error: 'Supabase env not configured (AIOS_SUPABASE_URL / AIOS_SUPABASE_SERVICE_KEY)' });
    }

    const cols = 'deck_slug,topic,style,slide_count,slide_urls,status,source_yt_title,feedback,approved_at,updated_at';
    const url = `${base.replace(/\/$/, '')}/rest/v1/carousel_publish_queue`
        + `?select=${cols}&order=updated_at.desc`;

    try {
        const r = await fetch(url, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        const data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data });

        // pending first (still needs Ray), then the rest by updated_at desc (already ordered).
        const rank = (s) => (s === 'pending' ? 0 : 1);
        const decks = Array.isArray(data) ? data.sort((a, b) => rank(a.status) - rank(b.status)) : [];
        return res.status(200).json({ ok: true, decks });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
