#!/usr/bin/env python3
"""Fix: clean Notion detail DB and re-sync from clean JSON.

Uses ThreadPoolExecutor for ~3x speedup while respecting Notion rate limits.

Steps:
1. Query ALL existing entries from Notion detail DB (with pagination)
2. Archive all existing entries (parallel)
3. Re-create all entries from cleaned expense-transactions.json (parallel)
"""

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

RAYOS_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = RAYOS_DIR / 'data'
TRANSACTIONS_FILE = DATA_DIR / 'expense-transactions.json'

# Load env
for env_path in [RAYOS_DIR / '.env', RAYOS_DIR.parent / '.env', RAYOS_DIR.parent / 'Project_FundwithRay' / '.env']:
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ.setdefault(key.strip(), val.strip())

NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')
NOTION_DETAIL_DB = 'ca2878aa-4fa1-473a-8776-f4d8f9d16d59'

CATEGORY_TO_NOTION = {
    'Prop Firm': 'Prop Firm', '事業': '事業', 'AI/SaaS': 'AI/SaaS',
    'Apple': 'Apple', '交通': '交通', '餐飲': '餐飲', '旅行': '旅行',
    '保險': '保險', '健身': '健身', '購物': '購物', '生活': '生活',
    '娛樂': '娛樂', '約會': '約會', '國外手續費': '國外手續費', '其他': '其他',
}

HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
}

# Notion rate limit: 3 req/sec per integration
MAX_WORKERS = 3
API_DELAY = 0.12  # per-thread delay


def notion_request(method: str, endpoint: str, data: dict = None) -> dict:
    """Make a Notion API request with retry on 429."""
    url = f"https://api.notion.com/v1/{endpoint}"
    for attempt in range(5):
        resp = requests.request(method, url, headers=HEADERS, json=data, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get('Retry-After', 2))
            time.sleep(wait)
            continue
        if resp.status_code >= 400:
            print(f"  ERR {resp.status_code}: {resp.text[:150]}")
        return resp.json() if resp.text else {}
    return {}


def query_all_pages() -> list[str]:
    """Query ALL page IDs from Notion detail DB."""
    all_ids = []
    start_cursor = None
    page_num = 0

    while True:
        page_num += 1
        body = {'page_size': 100}
        if start_cursor:
            body['start_cursor'] = start_cursor

        result = notion_request('POST', f'databases/{NOTION_DETAIL_DB}/query', body)
        pages = result.get('results', [])
        all_ids.extend(p['id'] for p in pages)
        print(f"  Query page {page_num}: +{len(pages)} (total: {len(all_ids)})")

        if not result.get('has_more'):
            break
        start_cursor = result.get('next_cursor')
        time.sleep(API_DELAY)

    return all_ids


def archive_page(page_id: str) -> bool:
    """Archive a single page. Returns True on success."""
    time.sleep(API_DELAY)
    result = notion_request('PATCH', f'pages/{page_id}', {'archived': True})
    return bool(result.get('id'))


def create_page(txn: dict) -> bool:
    """Create a detail entry. Returns True on success."""
    time.sleep(API_DELAY)
    notion_date = txn['date'].replace('/', '-')
    notion_cat = CATEGORY_TO_NOTION.get(txn['category'], txn['category'])

    result = notion_request('POST', 'pages', {
        'parent': {'database_id': NOTION_DETAIL_DB},
        'properties': {
            '描述': {'title': [{'text': {'content': txn['desc']}}]},
            '分類': {'select': {'name': notion_cat}},
            '日期': {'date': {'start': notion_date}},
            '月份': {'rich_text': [{'text': {'content': txn['month']}}]},
            '金額': {'number': round(txn['amount'])},
        },
    })
    return bool(result.get('id'))


def main():
    print("=== Notion Detail DB Rebuild (Threaded) ===\n")

    # 1. Load clean JSON
    txns = json.loads(TRANSACTIONS_FILE.read_text())
    print(f"JSON: {len(txns)} clean transactions")

    # 2. Query all existing pages
    print("\n[1/3] Querying existing entries...")
    page_ids = query_all_pages()
    print(f"Found {len(page_ids)} existing entries to archive")

    # 3. Archive all existing entries (parallel)
    if page_ids:
        print(f"\n[2/3] Archiving {len(page_ids)} entries...")
        archived = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(archive_page, pid): pid for pid in page_ids}
            for f in as_completed(futures):
                archived += 1
                if archived % 100 == 0 or archived == len(page_ids):
                    print(f"  Archived {archived}/{len(page_ids)}")
        print(f"  Done archiving")
    else:
        print("\n[2/3] Nothing to archive")

    # 4. Re-create all from clean JSON (parallel)
    print(f"\n[3/3] Creating {len(txns)} entries...")
    created = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(create_page, txn): i for i, txn in enumerate(txns)}
        for f in as_completed(futures):
            if f.result():
                created += 1
            else:
                failed += 1
            done = created + failed
            if done % 100 == 0 or done == len(txns):
                print(f"  Created {created}/{len(txns)} (failed: {failed})")

    print(f"\n=== Done: {created} created, {failed} failed ===")


if __name__ == '__main__':
    main()
