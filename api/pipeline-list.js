// GET /api/pipeline-list — return content pipeline projects for the RayOS Pipeline tab.
//
// Reads the DataOS `content_pipeline_state` table with the service_role key (server-side
// only; the key never reaches the browser). Each row mirrors a local
// outputs/projects/<slug>/state.json, pushed up by scripts/sync_pipeline_state_to_dataos.py.
// Read-only dashboard: this endpoint never writes. Ordered newest stage-move first so the
// frontend can group by pipeline_state.
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

    const cols = 'slug,title,title_chosen,pipeline_state,research_path,script_path,ppt_path,'
        + 'yt_url,transcript_path,shorts_path,skool_path,state_created_at,state_updated_at';
    const url = `${base.replace(/\/$/, '')}/rest/v1/content_pipeline_state`
        + `?select=${cols}&order=state_updated_at.desc`;

    try {
        const r = await fetch(url, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        const data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data });
        const projects = Array.isArray(data) ? data : [];
        return res.status(200).json({ ok: true, projects });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
