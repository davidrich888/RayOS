// POST /api/carousel-approve — mutate a deck's review row from the RayOS Carousel tab.
//
// Two modes (one endpoint to stay under Vercel Hobby's 12-function limit — adding a
// separate carousel-feedback.js made it 13 and every deploy errored):
//
// Mode A — approve toggle. Body: { deck_slug: string, approved: boolean }
//   approved=true  -> status='approved', stamp approved_at/approved_by='ray'
//   approved=false -> status='pending'  (un-tick returns the deck to the 待審 list)
//
// Mode B — feedback save. Body: { deck_slug: string, feedback: { top?, slideNN?, ... } }
//   PATCHes the feedback JSONB column only; NEVER touches status. Empty notes are
//   stripped client-side, so an all-clear deck sends {} (= 驗收通過，無需重生). Persisting
//   to DataOS lets Claude read change-requests straight from the table for the regen loop.
//
// SECURITY (do not change without Ray): approve = ENQUEUE ONLY. This NEVER calls the IG /
// Graph API. Real IG publishing stays whitelist-gated (Metricool confirm-gate, #53); a
// future scheduler reads status='approved' rows. service_role key is server-side only.
//
// This is the cloud port of scripts/content/review_server.py POST /approve. The deck row
// (cards_json snapshot + slide_urls) is already staged by upload_deck_slides.py at ingest
// time, so here we only PATCH the status — no disk access needed.
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

    const { deck_slug, approved, feedback } = req.body || {};
    if (!deck_slug) {
        return res.status(400).json({ error: 'Missing deck_slug' });
    }

    const now = new Date().toISOString();
    let patch;
    if (feedback !== undefined) {
        // Mode B — feedback save. Must be a plain object (never an array); status untouched.
        if (typeof feedback !== 'object' || feedback === null || Array.isArray(feedback)) {
            return res.status(400).json({ error: 'feedback must be an object { top?, slideNN? }' });
        }
        patch = { feedback, updated_at: now };
    } else if (typeof approved === 'boolean') {
        // Mode A — approve toggle.
        patch = approved
            ? { status: 'approved', approved_at: now, approved_by: 'ray', updated_at: now }
            : { status: 'pending', approved_at: null, updated_at: now };
    } else {
        return res.status(400).json({ error: 'Provide approved (boolean) or feedback (object)' });
    }

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
        return res.status(200).json({ ok: true, status: patch.status });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
};
