#!/usr/bin/env python3
"""One-time fix: clean Notion detail DB and re-sync from clean JSON.

Steps:
1. Query ALL existing entries from Notion detail DB (with pagination)
2. Archive all existing entries (to avoid duplicates)
3. Re-create all entries from cleaned expense-transactions.json
4. Also add '約會' select option if missing
"""

import json
import os
import time
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

API_DELAY = 0.35  # ~3 req/sec to stay under Notion rate limit


def notion_request(method: str, endpoint: str, data: dict = None) -> dict:
    """Make a Notion API request with retry on 429."""
    url = f"https://api.notion.com/v1/{endpoint}"
    for attempt in range(3):
        resp = requests.request(method, url, headers=HEADERS, json=data, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get('Retry-After', 2))
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        if resp.status_code >= 400:
            print(f"  Notion API error {resp.status_code}: {resp.text[:200]}")
        return resp.json() if resp.text else {}
    return {}


def query_all_pages() -> list[dict]:
    """Query ALL pages from Notion detail DB with pagination."""
    all_pages = []
    start_cursor = None
    page_num = 0

    while True:
        page_num += 1
        body = {'page_size': 100}
        if start_cursor:
            body['start_cursor'] = start_cursor

        result = notion_request('POST', f'databases/{NOTION_DETAIL_DB}/query', body)
        pages = result.get('results', [])
        all_pages.extend(pages)
        print(f"  Page {page_num}: {len(pages)} results (total: {len(all_pages)})")

        if not result.get('has_more'):
            break
        start_cursor = result.get('next_cursor')
        time.sleep(API_DELAY)

    return all_pages


def archive_page(page_id: str):
    """Archive (soft-delete) a Notion page."""
    notion_request('PATCH', f'pages/{page_id}', {'archived': True})
    time.sleep(API_DELAY)


def create_detail_page(txn: dict):
    """Create a detail entry in Notion."""
    notion_date = txn['date'].replace('/', '-')
    notion_cat = CATEGORY_TO_NOTION.get(txn['category'], txn['category'])

    notion_request('POST', 'pages', {
        'parent': {'database_id': NOTION_DETAIL_DB},
        'properties': {
            '描述': {'title': [{'text': {'content': txn['desc']}}]},
            '分類': {'select': {'name': notion_cat}},
            '日期': {'date': {'start': notion_date}},
            '月份': {'rich_text': [{'text': {'content': txn['month']}}]},
            '金額': {'number': round(txn['amount'])},
        },
    })
    time.sleep(API_DELAY)


def main():
    print("=== Notion Detail DB Cleanup ===")
    print()

    # 1. Load clean JSON
    txns = json.loads(TRANSACTIONS_FILE.read_text())
    print(f"JSON: {len(txns)} clean transactions")

    # 2. Query all existing Notion entries
    print("\nQuerying all Notion entries...")
    existing_pages = query_all_pages()
    print(f"Notion: {len(existing_pages)} existing entries")

    # 3. Archive ALL existing entries
    print(f"\nArchiving {len(existing_pages)} existing entries...")
    for i, page in enumerate(existing_pages):
        archive_page(page['id'])
        if (i + 1) % 50 == 0:
            print(f"  Archived {i + 1}/{len(existing_pages)}")
    print(f"  Archived all {len(existing_pages)} entries")

    # 4. Re-create all entries from clean JSON
    print(f"\nCreating {len(txns)} entries from clean JSON...")
    for i, txn in enumerate(txns):
        create_detail_page(txn)
        if (i + 1) % 50 == 0:
            print(f"  Created {i + 1}/{len(txns)}")
    print(f"  Created all {len(txns)} entries")

    print("\n=== Done ===")


if __name__ == '__main__':
    main()
