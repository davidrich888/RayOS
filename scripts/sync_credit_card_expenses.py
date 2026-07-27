#!/usr/bin/env python3
"""
Sync Cathay real-time credit card notification emails to budget tracker.

Parses two email types:
  1. Daily summary  : subject 國泰世華銀行消費彙整通知（請勿直接回覆）
                      HTML table, may contain multiple txns per email.
  2. Realtime       : subject 【國泰世華銀行】網路消費通知 (請勿直接回覆)
                      Single-line format, used for overseas / online (e.g. PayPal).

Output: Project_RayOS/data/credit-card-realtime-expenses.json
Dedup : (date, time, card_last4, amount, desc)

Usage:
  python3 sync_credit_card_expenses.py --auto                 # last 14 days
  python3 sync_credit_card_expenses.py --auto --days 35       # custom window
  python3 sync_credit_card_expenses.py --thread <gmail_id>    # one email only
  python3 sync_credit_card_expenses.py --dry-run --auto       # parse, do not write
"""

import argparse
import base64
import html
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Optional

import requests

# ==================== PATHS ====================

SCRIPT_DIR = Path(__file__).parent
RAYOS_DIR = SCRIPT_DIR.parent
DATA_DIR = RAYOS_DIR / 'data'
TRANSACTIONS_FILE = DATA_DIR / 'credit-card-realtime-expenses.json'
ENV_FILE = RAYOS_DIR / '.env'
WORKSPACE_ENV = RAYOS_DIR.parent / '.env'
FUNDWITHRAY_ENV = RAYOS_DIR.parent / 'Project_FundwithRay' / '.env'

# ==================== ENV ====================

def load_env():
    """Load .env files (RayOS → workspace → fundwithray) without overriding set vars."""
    for env_path in [ENV_FILE, WORKSPACE_ENV, FUNDWITHRAY_ENV]:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    _k = key.strip()
                    os.environ[_k] = os.environ.get(_k) or val.strip()

load_env()

# Reuse classification table & normalisation from monthly cathay statement script.
sys.path.insert(0, str(SCRIPT_DIR))
from sync_cathay_expense import classify, normalize, should_skip  # noqa: E402

# ==================== GMAIL ====================

CATHAY_SENDER = 'service@pxbillrc01.cathaybk.com.tw'
SUBJECT_DAILY = '消費彙整通知'
SUBJECT_REALTIME = '網路消費通知'


def gws(args: list, timeout: int = 30) -> dict:
    """Run a gws gmail subcommand and return parsed JSON."""
    cmd = ['gws', 'gmail', *args]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"gws failed ({' '.join(args[:3])}): {r.stderr.strip()}")
    return json.loads(r.stdout) if r.stdout else {}


def list_cathay_message_ids(days: int) -> list[str]:
    """Return Gmail message IDs for Cathay realtime+daily emails in window."""
    query = (
        f"from:{CATHAY_SENDER} "
        f"newer_than:{days}d "
        f'(subject:"{SUBJECT_DAILY}" OR subject:"{SUBJECT_REALTIME}")'
    )
    ids: list[str] = []
    page_token = None
    while True:
        params = {'userId': 'me', 'q': query, 'maxResults': 100}
        if page_token:
            params['pageToken'] = page_token
        data = gws(['users', 'messages', 'list', '--params', json.dumps(params)])
        for m in data.get('messages', []):
            ids.append(m['id'])
        page_token = data.get('nextPageToken')
        if not page_token:
            break
    return ids


def get_message(msg_id: str) -> dict:
    return gws([
        'users', 'messages', 'get',
        '--params', json.dumps({'userId': 'me', 'id': msg_id, 'format': 'full'}),
    ], timeout=45)


def extract_bodies(payload: dict) -> dict:
    """Walk MIME tree, return {'text/html': str, 'text/plain': str}."""
    found: dict[str, str] = {}

    def walk(p):
        mime = p.get('mimeType', '')
        body = p.get('body', {})
        data = body.get('data', '')
        if data and mime in ('text/html', 'text/plain'):
            decoded = base64.urlsafe_b64decode(data + '==').decode('utf-8', errors='replace')
            found.setdefault(mime, decoded)
        for sub in p.get('parts', []):
            walk(sub)

    walk(payload)
    return found


def strip_html_to_pipes(h: str) -> str:
    """Convert HTML to pipe-delimited text matching how Cathay structures its table."""
    h = re.sub(r'<script.*?</script>', '', h, flags=re.S | re.I)
    h = re.sub(r'<style.*?</style>', '', h, flags=re.S | re.I)
    h = re.sub(r'<br\s*/?>', '\n', h, flags=re.I)
    h = re.sub(r'</tr>', '\n', h, flags=re.I)
    h = re.sub(r'</td>', ' | ', h, flags=re.I)
    h = re.sub(r'<[^>]+>', ' ', h)
    h = html.unescape(h)
    h = re.sub(r'[ \t]+', ' ', h)
    h = re.sub(r'\n\s*\n+', '\n', h)
    return h.strip()


def header_value(headers: list, name: str) -> str:
    for h in headers:
        if h['name'].lower() == name.lower():
            return h['value']
    return ''


def email_year_from_date(date_str: str) -> int:
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.year
    except Exception:
        return datetime.now().year


# ==================== PARSERS ====================

# Daily summary: one full transaction block, pipe-delimited after strip_html_to_pipes()
# Anchor: [正卡|附卡] | <last4> | YYYY/MM/DD | HH:MM | <region> | ... | NT$<amt> | <merchant> | <category> |
DAILY_TXN_RE = re.compile(
    r'(正卡|附卡)\s*\|\s*(\d{4})\s*\|\s*(\d{4}/\d{2}/\d{2})\s*\|\s*(\d{2}:\d{2})\s*\|\s*([A-Z]{2,4})\s*\|'
    r'.*?'
    r'NT\$\s*([\d,]+)\s*\|\s*([^|]*?)\s*\|\s*([^|]+?)\s*\|',
    re.DOTALL,
)

# Realtime single-line: 【國泰世華刷卡通知】 MM月DD日HH:MM   (正卡|附卡)卡號末四碼 NNNN 於MERCHANT交易約 NT$NNNN
REALTIME_RE = re.compile(
    r'【國泰世華刷卡通知】\s*(\d{2})月(\d{2})日(\d{2}):(\d{2})\s+'
    r'(正卡|附卡)卡號末四碼\s*(\d{4})\s*於(.+?)交易約\s*NT\$\s*([\d,]+)',
    re.DOTALL,
)


def _to_float(amt: str) -> float:
    return float(amt.replace(',', '').strip())


def parse_daily(text: str, msg_id: str) -> list[dict]:
    """Parse daily summary email into transaction dicts."""
    out: list[dict] = []
    for m in DAILY_TXN_RE.finditer(text):
        card_type, last4, date, time, region, amt, merchant, category = m.groups()
        merchant = merchant.strip() or '(未顯示商店)'
        category = category.strip()
        desc = normalize(merchant)
        amount = _to_float(amt)
        if should_skip(desc, amount):
            continue
        # Prefer keyword classifier when merchant is meaningful; fall back to bank category.
        cat = classify(merchant) if merchant != '(未顯示商店)' else (category or '其他')
        if cat == '其他' and category:
            cat = category
        out.append({
            'date': date,
            'time': time,
            'card_type': card_type,
            'card_last4': last4,
            'region': region,
            'desc': desc,
            'amount': amount,
            'category': cat,
            'bank_category': category,
            'month': date[:7],  # YYYY/MM
            'source': 'cathay-daily',
            'email_id': msg_id,
        })
    return out


def parse_realtime(text: str, msg_id: str, email_year: int) -> list[dict]:
    """Parse realtime single-line notification."""
    out: list[dict] = []
    for m in REALTIME_RE.finditer(text):
        mm, dd, hh, mi, card_type, last4, merchant, amt = m.groups()
        merchant = merchant.strip()
        date = f"{email_year}/{mm}/{dd}"
        amount = _to_float(amt)
        desc = normalize(merchant)
        if should_skip(desc, amount):
            continue
        out.append({
            'date': date,
            'time': f"{hh}:{mi}",
            'card_type': card_type,
            'card_last4': last4,
            'region': 'ONLINE',
            'desc': desc,
            'amount': amount,
            'category': classify(merchant),
            'bank_category': '網路消費',
            'month': date[:7],
            'source': 'cathay-realtime',
            'email_id': msg_id,
        })
    return out


def parse_message(msg: dict) -> list[dict]:
    payload = msg.get('payload', {})
    headers = payload.get('headers', [])
    subject = header_value(headers, 'Subject')
    date_hdr = header_value(headers, 'Date')
    msg_id = msg.get('id', '')

    bodies = extract_bodies(payload)
    html_body = bodies.get('text/html', '')
    text = strip_html_to_pipes(html_body) if html_body else bodies.get('text/plain', '')

    if SUBJECT_REALTIME in subject:
        return parse_realtime(text, msg_id, email_year_from_date(date_hdr))
    if SUBJECT_DAILY in subject:
        return parse_daily(text, msg_id)
    return []


# ==================== MERGE ====================

def dedup_key(t: dict) -> tuple:
    return (t['date'], t.get('time', ''), t.get('card_last4', ''), round(t['amount'], 2), t['desc'])


def merge_transactions(new_txns: list[dict]) -> tuple[list[dict], int]:
    existing: list[dict] = []
    if TRANSACTIONS_FILE.exists():
        existing = json.loads(TRANSACTIONS_FILE.read_text())

    seen = {dedup_key(t) for t in existing}
    added = 0
    for t in new_txns:
        k = dedup_key(t)
        if k in seen:
            continue
        existing.append(t)
        seen.add(k)
        added += 1

    existing.sort(key=lambda x: (x['date'], x.get('time', '')))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TRANSACTIONS_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    return existing, added


# ==================== TELEGRAM ====================

def send_tg_summary(new_count: int, added_txns: list[dict], month_totals: dict) -> None:
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '')
    if not token or not chat_id:
        print('  TG: skipped (no token/chat_id)')
        return
    if new_count == 0:
        return

    lines = [f"💳 *信用卡即時消費同步* — 新增 {new_count} 筆"]
    for t in added_txns[-8:]:  # last 8 (likely most recent)
        lines.append(
            f"  • {t['date']} {t.get('time','')} {t['desc']} NT${t['amount']:,.0f} "
            f"({t['category']})"
        )
    for m, total in sorted(month_totals.items()):
        lines.append(f"  📅 {m}: NT${total:,.0f}")

    try:
        requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data={'chat_id': chat_id, 'parse_mode': 'Markdown', 'text': '\n'.join(lines)},
            timeout=10,
        )
        print('  TG: notification sent')
    except Exception as exc:
        print(f'  TG: send failed — {exc}')


# ==================== MAIN ====================

def run(days: int, thread_id: Optional[str], dry_run: bool, verbose: bool) -> int:
    if thread_id:
        msg_ids = [thread_id]
        print(f"[1/3] Fetching single message: {thread_id}")
    else:
        print(f"[1/3] Searching Gmail for Cathay notices in last {days} days...")
        msg_ids = list_cathay_message_ids(days)
        print(f"  Found {len(msg_ids)} messages")

    print(f"[2/3] Parsing {len(msg_ids)} messages...")
    all_txns: list[dict] = []
    for mid in msg_ids:
        try:
            msg = get_message(mid)
            txns = parse_message(msg)
            if verbose:
                subj = header_value(msg.get('payload', {}).get('headers', []), 'Subject')
                print(f"  {mid} [{subj[:24]}] → {len(txns)} txns")
            all_txns.extend(txns)
        except Exception as exc:
            print(f"  ⚠️ {mid} failed: {exc}")

    print(f"  Total parsed: {len(all_txns)} transactions")

    if dry_run:
        print("[3/3] DRY-RUN — skipping merge & TG")
        for t in all_txns[:20]:
            print(f"  {t['date']} {t['time']} {t['desc']:<22} NT${t['amount']:>8,.0f} {t['card_last4']} {t['region']:<7} → {t['category']} (src={t['source']})")
        return 0

    print("[3/3] Merging transactions...")
    all_kept, added = merge_transactions(all_txns)
    print(f"  Added {added} new (total in file: {len(all_kept)})")

    # Monthly totals for the months touched by new txns
    months_touched = {t['month'] for t in all_txns}
    month_totals: dict[str, float] = defaultdict(float)
    for t in all_kept:
        if t['month'] in months_touched:
            month_totals[t['month']] += t['amount']

    if added > 0:
        added_txns = [t for t in all_txns if dedup_key(t) in {dedup_key(x) for x in all_kept[-added:]}]
        # fallback: take tail of all_txns if dedup matching is weird
        if not added_txns:
            added_txns = all_txns[-added:]
        send_tg_summary(added, added_txns, dict(month_totals))

    return 0


def main():
    p = argparse.ArgumentParser(description='Sync Cathay real-time credit card notifications')
    p.add_argument('--auto', action='store_true', help='Auto-fetch from Gmail')
    p.add_argument('--days', type=int, default=14, help='Search window (days, default 14)')
    p.add_argument('--thread', help='Parse one Gmail message ID only (testing)')
    p.add_argument('--dry-run', action='store_true', help='Parse but do not write JSON / TG')
    p.add_argument('-v', '--verbose', action='store_true', help='Per-message log')
    args = p.parse_args()

    if not (args.auto or args.thread):
        p.print_help()
        sys.exit(1)

    sys.exit(run(args.days, args.thread, args.dry_run, args.verbose))


if __name__ == '__main__':
    main()
