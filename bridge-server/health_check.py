#!/usr/bin/env python3
"""RayOS Daily Health Check — checks all endpoints and reports via Telegram.
Run: python3 health_check.py
Reports issues via Telegram. If all OK, sends a single line summary.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import urllib.error
import ssl


def _load_workspace_env() -> None:
    """Inject workspace-root .env vars so launchd (no shell profile) gets the
    Telegram token. Only fills keys that are unset or empty (a present-but-empty
    env var would otherwise silently disable Telegram)."""
    env_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    )
    try:
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip('"').strip("'")
                if val and not os.environ.get(key):
                    os.environ[key] = val
    except FileNotFoundError:
        pass


_load_workspace_env()

import yaml
from pathlib import Path

from watchdog_n8n import check_n8n_critical
from watchdog_launchd import check_launchd_tasks

CONFIG_DIR = Path(__file__).resolve().parent.parent / 'config'
N8N_API_KEY = os.environ.get('N8N_API_KEY', '')

RAYOS_DIR = Path.home() / '.rayos'
RELOAD_HISTORY_PATH = RAYOS_DIR / 'reload_history.json'

# ── Config ──────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '925855884')
NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')  # from Vercel env, optional for local check

VERCEL_URL = 'https://ray-os.vercel.app'
BRIDGE_URL = 'http://localhost:3001'

# Notion DBs to verify
NOTION_DBS = {
    'Daily Habits': '58da82d6-89ed-4202-9274-234183f77bb6',
    'YouTube 研究庫': '76fb8600-ae96-49bc-b6c4-75f75f0ec818',
    'Resource Library': '397a6457-079c-419e-ba44-df992b6ba1d4',
    'Ideas': 'e04c6b41e1ae490baf3396dc7fe80fc5',
    'Content Log': '60354141f1fe4f858b065f0101a72e89',
}


def http_get(url: str, headers: dict | None = None, timeout: int = 10) -> tuple[int, str]:
    """Simple HTTP GET, returns (status_code, body). Returns (-1, error) on failure."""
    try:
        req = urllib.request.Request(url, headers=headers or {})
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, resp.read().decode('utf-8', errors='replace')[:2000]
    except urllib.error.HTTPError as e:
        return e.code, str(e)
    except Exception as e:
        return -1, str(e)[:200]


def http_post(url: str, data: dict, headers: dict | None = None, timeout: int = 10) -> tuple[int, str]:
    """Simple HTTP POST with JSON body."""
    try:
        body = json.dumps(data).encode('utf-8')
        hdrs = {'Content-Type': 'application/json'}
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(url, data=body, headers=hdrs, method='POST')
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.status, resp.read().decode('utf-8', errors='replace')[:2000]
    except urllib.error.HTTPError as e:
        return e.code, str(e)
    except Exception as e:
        return -1, str(e)[:200]


def check_vercel() -> list[dict]:
    """Check Vercel deployment."""
    results = []

    # Main page
    code, body = http_get(VERCEL_URL)
    results.append({
        'name': 'Vercel 主頁',
        'ok': code == 200 and 'RayOS' in body,
        'detail': f'HTTP {code}' if code != 200 else 'OK',
    })

    # YouTube Lab
    code, body = http_get(f'{VERCEL_URL}/Youtube_Lab/')
    results.append({
        'name': 'YouTube Lab 頁面',
        'ok': code == 200,
        'detail': f'HTTP {code}' if code != 200 else 'OK',
    })

    # Notion API proxy (POST without token = should return error, but endpoint alive)
    code, body = http_post(f'{VERCEL_URL}/api/notion', {'path': '/v1/users/me', 'method': 'GET'})
    # 401 or 400 = endpoint alive; -1 = down
    results.append({
        'name': 'Notion API Proxy',
        'ok': code != -1,
        'detail': f'HTTP {code} (endpoint alive)' if code != -1 else 'DOWN',
    })

    return results


def check_bridge() -> list[dict]:
    """Check bridge server health."""
    results = []

    code, body = http_get(f'{BRIDGE_URL}/health')
    bridge_ok = code == 200
    results.append({
        'name': 'Bridge Server',
        'ok': bridge_ok,
        'detail': 'OK' if bridge_ok else f'HTTP {code} — {body[:100]}',
    })

    # Cloudflare tunnel check removed 2026-05-22: the bridge tunnel was retired
    # (YT subtitles migrated to Apify, no remaining consumers). The launchd job
    # com.rayos.cloudflare-tunnel was unloaded and its plist archived to
    # ~/.rayos/disabled-plists/. See memory reference_launchd_health_and_gws_token.

    return results


def check_notion_dbs() -> list[dict]:
    """Check Notion DBs are accessible (requires NOTION_TOKEN)."""
    if not NOTION_TOKEN:
        return [{'name': 'Notion DBs', 'ok': True, 'detail': 'Skipped (no local token, uses Vercel env)'}]

    results = []
    headers = {
        'Authorization': f'Bearer {NOTION_TOKEN}',
        'Notion-Version': '2022-06-28',
    }

    for name, db_id in NOTION_DBS.items():
        code, body = http_post(
            f'https://api.notion.com/v1/databases/{db_id}/query',
            {'page_size': 1},
            headers=headers,
            timeout=15,
        )
        results.append({
            'name': f'Notion: {name}',
            'ok': code == 200,
            'detail': 'OK' if code == 200 else f'HTTP {code}',
        })
        time.sleep(0.3)  # Notion rate limit

    return results


def check_yt_subtitle() -> list[dict]:
    """Check YT subtitle endpoint with a known video."""
    # Use a well-known video ID that definitely has subtitles
    test_video = 'dQw4w9WgXcQ'  # Rick Astley, always has EN subs
    code, body = http_get(f'{BRIDGE_URL}/yt-subtitle?id={test_video}', timeout=30)
    if code == 200:
        try:
            data = json.loads(body)
            has_subs = data.get('hasSubtitles', False)
            return [{'name': 'YT Subtitle API', 'ok': has_subs, 'detail': f'OK (lang={data.get("language", "?")})' if has_subs else 'No subs returned'}]
        except json.JSONDecodeError:
            return [{'name': 'YT Subtitle API', 'ok': False, 'detail': 'Invalid JSON response'}]
    elif code == 401:
        # Auth required = endpoint alive, just no token in test
        return [{'name': 'YT Subtitle API', 'ok': True, 'detail': 'OK (auth required, endpoint alive)'}]
    else:
        return [{'name': 'YT Subtitle API', 'ok': False, 'detail': f'HTTP {code}'}]


def format_n8n_alerts(alerts: list[dict]) -> str:
    """Format N8N critical alerts for Telegram message."""
    if not alerts:
        return ''
    lines = [f'\n*🚨 N8N Critical Failures ({len(alerts)})*']
    for a in alerts:
        when = (a.get('last_two_failed_at') or ['?'])[0] or '?'
        lines.append(f"• {a['workflow_name']} — 連續 2 次 fail")
        lines.append(f"  最後失敗：{when}")
        lines.append(f"  {a['url']}")
    return '\n'.join(lines)


def format_launchd_alerts(alerts: list[dict]) -> str:
    """Split alerts by severity into recovered / manual sections."""
    if not alerts:
        return ''
    recovered = [a for a in alerts if a['severity'] == 'recovered']
    manual = [a for a in alerts if a['severity'] == 'manual']
    sections = []
    if recovered:
        sections.append(f'\n*⚠️ launchd Tasks Recovered ({len(recovered)})*')
        for a in recovered:
            sections.append(f"• {a['label']} 漏跑 {a['hours_late']:.1f}h")
            sections.append(f"  → {a['detail']} ✅")
    if manual:
        sections.append(f'\n*🆘 launchd Manual Required ({len(manual)})*')
        for a in manual:
            sections.append(f"• {a['label']} 漏跑 {a['hours_late']:.1f}h")
            sections.append(f"  {a['detail']}")
    return '\n'.join(sections)


def send_telegram(message: str) -> bool:
    """Send Telegram notification."""
    if not TELEGRAM_BOT_TOKEN:
        print(f'[TG] No token, printing instead:\n{message}')
        return False

    code, body = http_post(
        f'https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage',
        {
            'chat_id': TELEGRAM_CHAT_ID,
            'text': message,
            'parse_mode': 'Markdown',
        },
        timeout=10,
    )
    return code == 200


def main():
    print('[Health Check] Starting RayOS health check...')

    all_results = []
    all_results.extend(check_vercel())
    all_results.extend(check_bridge())
    all_results.extend(check_yt_subtitle())
    all_results.extend(check_notion_dbs())

    # Block A — N8N critical workflow check
    n8n_alerts: list[dict] = []
    n8n_config_path = CONFIG_DIR / 'n8n_critical_workflows.yaml'
    if N8N_API_KEY and n8n_config_path.exists():
        try:
            with open(n8n_config_path) as f:
                n8n_config = yaml.safe_load(f)
            n8n_alerts = check_n8n_critical(n8n_config, N8N_API_KEY)
            print(f'[Health Check] N8N critical: {len(n8n_alerts)} alerts')
        except Exception as e:
            print(f'[Health Check] N8N check failed: {e}')
            all_results.append({'name': 'N8N watchdog', 'ok': False, 'detail': f'self-check failed: {e}'})
    else:
        print('[Health Check] N8N check skipped (no API key or config)')

    # Block B — launchd auto task mtime check + auto-reload
    launchd_alerts: list[dict] = []
    launchd_config_path = CONFIG_DIR / 'launchd_tasks.yaml'
    if launchd_config_path.exists():
        try:
            with open(launchd_config_path) as f:
                launchd_config = yaml.safe_load(f)
            launchd_alerts = check_launchd_tasks(launchd_config, RELOAD_HISTORY_PATH)
            print(f'[Health Check] launchd: {len(launchd_alerts)} alerts')
        except Exception as e:
            print(f'[Health Check] launchd check failed: {e}')
            all_results.append({'name': 'launchd watchdog', 'ok': False, 'detail': f'self-check failed: {e}'})
    else:
        print('[Health Check] launchd check skipped (no config yaml)')

    # Build report
    ok_count = sum(1 for r in all_results if r['ok'])
    fail_count = len(all_results) - ok_count
    failures = [r for r in all_results if not r['ok']]

    n8n_section = format_n8n_alerts(n8n_alerts)
    launchd_section = format_launchd_alerts(launchd_alerts)
    has_alerts = bool(n8n_alerts) or any(a['severity'] == 'manual' for a in launchd_alerts)
    # recovered 不算 alert（自己救起來了），但仍要 TG 通報

    if fail_count == 0 and not n8n_alerts and not launchd_alerts:
        msg = f"*RayOS Health Check*\n\n{ok_count}/{len(all_results)} checks passed"
        print(f'[Health Check] All {ok_count} checks passed, no alerts')
    else:
        lines = [f"*RayOS Health Check*\n"]
        lines.append(f"{ok_count}/{len(all_results)} passed, *{fail_count} FAILED*\n")
        if failures:
            lines.append("*Failed:*")
            for r in failures:
                lines.append(f"  {r['name']}: {r['detail']}")
        lines.append("\n*Passed:*")
        for r in all_results:
            if r['ok']:
                lines.append(f"  {r['name']}")
        if n8n_section:
            lines.append(n8n_section)
        if launchd_section:
            lines.append(launchd_section)
        msg = '\n'.join(lines)
        print(f'[Health Check] {fail_count} fail + {len(n8n_alerts)} N8N + {len(launchd_alerts)} launchd alerts')

    # Print full report to stdout
    for r in all_results:
        status = 'OK' if r['ok'] else 'FAIL'
        print(f'  [{status}] {r["name"]}: {r["detail"]}')

    # Send Telegram
    send_telegram(msg)

    # Exit code for scripting
    sys.exit(0 if (fail_count == 0 and not has_alerts) else 1)


if __name__ == '__main__':
    main()
