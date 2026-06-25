// POST /api/carousel-approve — mutate a deck's review row from the RayOS Carousel tab.
//
// Two modes (one endpoint to stay under Vercel Hobby's 12-function limit — adding a
// separate carousel-feedback.js made it 13 and every deploy errored):
//
// Mode A — approve toggle. Body: { deck_slug: string, approved: boolean }
//   approved=true  -> status='approved', stamp approved_at/approved_by='ray'
//   approved=false -> status='pending'  (un-tick returns the deck to the 待審 list)
//
// Mode B — feedback save. Body: { deck_slug: string, feedback: { top?, slideNN?, ... }, archive?: boolean }
//   PATCHes the feedback JSONB column only; NEVER touches status. Empty notes are
//   stripped client-side, so an all-clear deck sends {} (= 驗收通過，無需重生). Persisting
//   to DataOS lets Claude read change-requests straight from the table for the regen loop.
//   archive=true (sent by the UI 🧹 清除反饋 button): before overwriting, read the row's
//   CURRENT feedback and, if non-empty, append it to feedback_log so a manual clear keeps an
//   audit trail (the regen path already archives via upload_deck_slides.py; this closes the
//   manual-clear gap, 2026-06-26 Ray). Read-modify-write — fine for this low-freq action.
//
// Mode C — published toggle. Body: { deck_slug: string, published: boolean }
//   Ray ticks 已發布 AFTER he manually posts to IG. published=true -> status='published'
//   (strikethrough in the UI); published=false -> status='approved'. ENQUEUE-STATE ONLY,
//   never calls IG / Graph. Just records what Ray already published by hand.
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

    const { deck_slug, approved, published, feedback, archive } = req.body || {};
    if (!deck_slug) {
        return res.status(400).json({ error: 'Missing deck_slug' });
    }

    const restUrl = `${base.replace(/\/$/, '')}/rest/v1/carousel_publish_queue`
        + `?deck_slug=eq.${encodeURIComponent(deck_slug)}`;
    const restHeaders = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
    };

    const now = new Date().toISOString();
    let patch;
    if (feedback !== undefined) {
        // Mode B — feedback save. Must be a plain object (never an array); status untouched.
        if (typeof feedback !== 'object' || feedback === null || Array.isArray(feedback)) {
            return res.status(400).json({ error: 'feedback must be an object { top?, slideNN? }' });
        }
        patch = { feedback, updated_at: now };
        if (archive === true) {
            // Manual-clear archive: pull the row's current feedback/feedback_log and, if there
            // are notes to lose, append them to the log before this PATCH wipes feedback.
            try {
                const sel = await fetch(`${restUrl}&select=feedback,feedback_log`, { headers: restHeaders });
                const rows = sel.ok ? await sel.json().catch(() => []) : [];
                const cur = rows[0] || {};
                const curFb = (cur.feedback && typeof cur.feedback === 'object') ? cur.feedback : {};
                if (Object.keys(curFb).length) {
                    const log = Array.isArray(cur.feedback_log) ? cur.feedback_log : [];
                    patch.feedback_log = [...log, { at: now, feedback: curFb, via: 'manual-clear' }];
                }
            } catch (e) {
                // Archiving is best-effort; never block the clear itself on a read failure.
            }
        }
    } else if (typeof published === 'boolean') {
        // Mode C — published toggle. Ray ticks this AFTER he manually posts to IG; it only
        // marks the queue row 'published' (→ strikethrough in the UI), NEVER sends anything.
        // Un-marking falls back to 'approved' (still queued, just not posted yet).
        patch = published
            ? { status: 'published', updated_at: now }
            : { status: 'approved', updated_at: now };
    } else if (typeof approved === 'boolean') {
        // Mode A — approve toggle.
        patch = approved
            ? { status: 'approved', approved_at: now, approved_by: 'ray', updated_at: now }
            : { status: 'pending', approved_at: null, updated_at: now };
    } else {
        return res.status(400).json({ error: 'Provide approved/published (boolean) or feedback (object)' });
    }

    try {
        const r = await fetch(restUrl, {
            method: 'PATCH',
            headers: { ...restHeaders, Prefer: 'return=minimal' },
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
