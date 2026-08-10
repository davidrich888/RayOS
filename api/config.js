// Server-side bootstrap config.
// Ships the non-secret, same-on-every-device settings so a fresh browser (new
// Chrome profile, PWA, cleared site data) opens RayOS already configured
// instead of showing an empty Settings panel. Values come from Vercel env vars
// so nothing lands in this PUBLIC repo.
//
// `builtin` flags tell the UI which Settings fields no longer need manual input.
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    // Config is per-deployment, not per-user — safe to cache briefly at the edge.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // SECURITY: this endpoint is public and unauthenticated, so it may only carry
    // values that are safe to read by anyone. Real secrets (Notion / Anthropic /
    // Google SA keys) stay server-side inside their own proxy routes and are only
    // reported here as boolean `builtin` flags — never as values.
    // bridge_token is deliberately NOT shipped: it authorizes shell command
    // execution on Ray's machine. That one stays per-device.
    const defaults = {};
    if (process.env.RAYOS_N8N_WEBHOOK) defaults.n8n_webhook = process.env.RAYOS_N8N_WEBHOOK;
    if (process.env.RAYOS_BRIDGE_URL) defaults.bridge_url = process.env.RAYOS_BRIDGE_URL;
    if (process.env.RAYOS_AI_MODEL) defaults.ai_model = process.env.RAYOS_AI_MODEL;
    if (process.env.RAYOS_AI_PROFILE) defaults.ai_profile = process.env.RAYOS_AI_PROFILE;

    return res.status(200).json({
        defaults,
        builtin: {
            // api/notion.js already prefers process.env.NOTION_TOKEN
            notion: !!process.env.NOTION_TOKEN,
            // api/claude.js already prefers process.env.ANTHROPIC_API_KEY
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            // api/drive-moodboard.js + api/drive-body-photos.js share GOOGLE_SA_KEY
            drive: !!process.env.GOOGLE_SA_KEY
        }
    });
};
