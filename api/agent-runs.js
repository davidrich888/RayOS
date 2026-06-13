// GET /api/agent-runs — return the latest run per thinking-agent for the RayOS automation page.
//
// Reads the DataOS `agent_runs` table (service_role key, server-side only). Unlike the
// launchd jobs (which are time-triggered cron), these are "thinking agents" that detect +
// draft work and report in. The card shows: is it alive, when it last ran, how many it
// found / sent, and a freshness-based health flag.
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

    // Pull the most recent 50 runs (any agent), then reduce to latest-per-agent client-side.
    const cols = 'agent_name,run_at,status,found_count,sent_count,segment_counts,notes,source';
    const url = `${base.replace(/\/$/, '')}/rest/v1/agent_runs`
        + `?select=${cols}&order=run_at.desc&limit=50`;

    try {
        const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        const data = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: data });

        const rows = Array.isArray(data) ? data : [];
        const latest = {};
        const totals = {};
        for (const row of rows) {
            const name = row.agent_name;
            if (!latest[name]) latest[name] = row;        // rows are run_at desc => first seen = latest
            totals[name] = (totals[name] || 0) + 1;
        }
        const now = Date.now();
        const agents = Object.values(latest).map((row) => {
            const ageHours = (now - new Date(row.run_at).getTime()) / 3.6e6;
            // health: error => warn; else stale if it hasn't run in 8 days (daily/weekly cadence tolerant).
            const health = row.status === 'error' ? 'warn' : (ageHours > 24 * 8 ? 'stale' : 'ok');
            return { ...row, age_hours: Math.round(ageHours), run_total: totals[row.agent_name], health };
        });
        return res.status(200).json({ ok: true, agents });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
