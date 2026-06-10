// POST /api/carousel-feedback — save Ray's review notes for a deck from the RayOS Carousel tab.
//
// Body: { deck_slug: string, feedback: { top?: string, slideNN?: string, ... } }
//   feedback is a JSONB object keyed by scope: "top" (whole-deck note) + per-slide "slideNN".
//   Empty notes are stripped client-side; an all-clear deck sends {} (= 驗收通過, no changes).
//
// This is the cloud port of the local review.html feedback box (which only kept notes in
// browser localStorage). Persisting to DataOS means the notes survive across devices AND
// Claude Code can read them straight from carousel_publish_queue to regenerate the flagged
// slides — closing the revision loop without copy-paste.
//
// SECURITY: writing feedback NEVER changes status or sends to IG; it only updates the
// feedback column. service_role key is server-side only.
//
// Env (Vercel project settings): AIOS_SUPABASE_URL, AIOS_SUPABASE_SERVICE_KEY.

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const base = process.env.AIOS_SUPABASE_URL;
    const key = process.env.AIOS_SUPABASE_SERVICE_KEY;
    if (!base || !key) {
        return res.status(500).json({ error: 'Supabase env not configured (AIOS_SUPABASE_URL / AIOS_SUPABASE_SERVICE_KEY)' });
    }

    const { deck_slug, feedback } = req.body || {};
    if (!deck_slug || typeof feedback !== 'object' || feedback === null || Array.isArray(feedback)) {
        return res.status(400).json({ error: 'Missing deck_slug or feedback (object)' });
    }

    const now = new Date().toISOString();
    const patch = { feedback, updated_at: now };

    const url = `${base.replace(/\/$/, '')}/rest/v1/carousel_publish_queue`
        + `?deck_slug=eq.${encodeURIComponent(deck_slug)}`;

    try {
        const r = await fetch(url, {
            method: 'PATCH',
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
            },
            body: JSON.stringify(patch),
        });
        if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            return res.status(r.status).json({ ok: false, error: data });
        }
        return res.status(200).json({ ok: true });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
};
