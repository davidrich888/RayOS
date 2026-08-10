// ==================== BUILT-IN DEFAULTS ====================
// Ships the same-on-every-device settings with the app itself, so a fresh
// browser / new Chrome profile / PWA / cleared site data opens RayOS already
// configured instead of an empty Settings panel.
//
// This file is served statically (no Serverless Function — Vercel Hobby caps a
// deployment at 12), so it may ONLY contain values that are safe to be public.
// Real secrets live in Vercel env vars and never leave the server:
//   NOTION_TOKEN        → api/notion.js
//   ANTHROPIC_API_KEY   → api/claude.js
//   GOOGLE_SA_KEY       → api/drive-moodboard.js, api/drive-body-photos.js
//
// Deliberately NOT here: bridge_token. It authorizes shell command execution on
// Ray's machine, and the Cloudflare quick tunnel URL changes every restart, so
// Bridge stays per-device by design.

const RAYOS_DEFAULTS = {
    // n8n cloud host is already public in api/n8n.js and the webhook path is in
    // workflows/*.json — publishing it here leaks nothing new. Needed so body
    // metrics sync (fetch_body) works on a device that never opened Settings.
    n8n_webhook: 'https://david86726.app.n8n.cloud/webhook/rayos-sync',
    ai_model: 'claude-haiku-4-5-20251001'
};

// Which credentials the deployment supplies server-side. Kept in sync by hand
// with the Vercel env vars; drives the Settings panel's status labels so a
// zero-config deployment stops reporting "未設定".
const RAYOS_BUILTIN = {
    notion: true,      // NOTION_TOKEN set 2026-07-28
    anthropic: true,   // ANTHROPIC_API_KEY set 2026-08-10
    drive: true        // GOOGLE_SA_KEY set 2026-05-06
};
