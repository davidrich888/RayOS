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

# ── Config ──────────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '925855884')
NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')  # from Vercel env, optional for local check

VERCEL_URL = 'https://ray-os.vercel.app'
BRIDGE_URL = 'http://localhost:3001'
TUNNEL_URL_FILE = '/tmp/bridge-tunnel-url.txt'

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

    # Check Cloudflare tunnel
    tunnel_url = ''
    try:
        with open(TUNNEL_URL_FILE, 'r') as f:
            tunnel_url = f.read().strip()
    except FileNotFoundError:
        pass

    if tunnel_url:
        code, body = http_get(f'{tunnel_url}/health', timeout=15)
        results.append({
            'name': 'Cloudflare Tunnel',
            'ok': code == 200,
            'detail': f'OK ({tunnel_url[:40]}...)' if code == 200 else f'HTTP {code}',
        })
    else:
        results.append({
            'name': 'Cloudflare Tunnel',
            'ok': False,
            'detail': 'No tunnel URL file found',
        })

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

    # Build report
    ok_count = sum(1 for r in all_results if r['ok'])
    fail_count = len(all_results) - ok_count
    failures = [r for r in all_results if not r['ok']]

    if fail_count == 0:
        msg = f"*RayOS Health Check*\n\n{ok_count}/{len(all_results)} checks passed"
        print(f'[Health Check] All {ok_count} checks passed')
    else:
        lines = [f"*RayOS Health Check*\n"]
        lines.append(f"{ok_count}/{len(all_results)} passed, *{fail_count} FAILED*\n")
        lines.append("*Failed:*")
        for r in failures:
            lines.append(f"  {r['name']}: {r['detail']}")
        lines.append("\n*Passed:*")
        for r in all_results:
            if r['ok']:
                lines.append(f"  {r['name']}")
        msg = '\n'.join(lines)
        print(f'[Health Check] {fail_count} failures detected')

    # Print full report to stdout
    for r in all_results:
        status = 'OK' if r['ok'] else 'FAIL'
        print(f'  [{status}] {r["name"]}: {r["detail"]}')

    # Send Telegram
    send_telegram(msg)

    # Exit code for scripting
    sys.exit(0 if fail_count == 0 else 1)


if __name__ == '__main__':
    main()
