#!/usr/bin/env python3
"""Regenerate dashboard expense data from Notion (canonical source).

Replaces reparse_expense.py as the dashboard data generator. Reads the
credit-card detail DB in Notion, then writes data/expense-transactions.json and
rewrites the PRELOAD_EXPENSE_MONTHLY array in js/data.js. Notion is the single
source of truth for categories (hand-curated), so this never re-classifies
anything: whatever 分類 is in Notion is exactly what the dashboard shows.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request
from collections import defaultdict

NOTION_API = 'https://api.notion.com/v1'
NOTION_VERSION = '2022-06-28'
DETAIL_DB = 'ca2878aa-4fa1-473a-8776-f4d8f9d16d59'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, 'data', 'expense-transactions.json')
DATAJS_PATH = os.path.join(ROOT, 'js', 'data.js')


def load_env() -> None:
    for path in [os.path.join(ROOT, '.env'), os.path.join(os.path.dirname(ROOT), '.env')]:
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, val = line.split('=', 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                os.environ[key] = os.environ.get(key) or val


def query_notion(headers: dict) -> list:
    rows = []
    cursor = None
    while True:
        body = {'page_size': 100}
        if cursor:
            body['start_cursor'] = cursor
        req = urllib.request.Request(
            f'{NOTION_API}/databases/{DETAIL_DB}/query',
            data=json.dumps(body).encode(),
            headers=headers,
            method='POST',
        )
        with urllib.request.urlopen(req) as resp:
            data = json.load(resp)
        rows.extend(data['results'])
        if not data.get('has_more'):
            break
        cursor = data['next_cursor']
    return rows


def prop_date(page: dict) -> str | None:
    date = page['properties']['日期'].get('date')
    return date['start'] if date else None


def prop_amount(page: dict) -> float:
    return page['properties']['金額'].get('number') or 0


def prop_category(page: dict) -> str:
    select = page['properties']['分類'].get('select')
    return select['name'] if select else '其他'


def prop_desc(page: dict) -> str:
    title = page['properties']['描述'].get('title')
    return title[0]['plain_text'] if title else ''


def build_transactions(rows: list) -> list:
    transactions = []
    for page in rows:
        date = prop_date(page)
        if not date:
            continue
        date_slash = date.replace('-', '/')  # 2026-04-29 -> 2026/04/29
        transactions.append({
            'date': date_slash,
            'desc': prop_desc(page),
            'amount': int(round(prop_amount(page))),
            'category': prop_category(page),
            'month': date_slash[:7],  # 2026/04
        })
    transactions.sort(key=lambda t: (t['date'], t['desc'], t['amount']))
    return transactions


def build_preload_block(transactions: list) -> str:
    monthly = defaultdict(lambda: {'total': 0, 'count': 0, 'cats': defaultdict(int)})
    for txn in transactions:
        month = monthly[txn['month']]
        month['total'] += txn['amount']
        month['count'] += 1
        month['cats'][txn['category']] += txn['amount']
    lines = ['const PRELOAD_EXPENSE_MONTHLY = [']
    for month_key in sorted(monthly):
        month = monthly[month_key]
        cats = sorted(month['cats'].items(), key=lambda x: -x[1])
        cat_str = ', '.join(f"'{name}': {amount}" for name, amount in cats)
        lines.append(
            f"    {{ month: '{month_key}', total: {month['total']}, "
            f"count: {month['count']}, categories: {{ {cat_str} }} }},"
        )
    lines.append('];')
    return '\n'.join(lines)


def main() -> None:
    load_env()
    token = os.environ.get('NOTION_TOKEN', '')
    if not token:
        raise SystemExit('NOTION_TOKEN missing from environment / .env')
    headers = {
        'Authorization': f'Bearer {token}',
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
    }

    rows = query_notion(headers)
    transactions = build_transactions(rows)
    print(f'Notion rows: {len(rows)} -> transactions: {len(transactions)}')

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(transactions, f, ensure_ascii=False, indent=2)
    print(f'Wrote {JSON_PATH}')

    block = build_preload_block(transactions)
    with open(DATAJS_PATH, encoding='utf-8') as f:
        src = f.read()
    new_src, count = re.subn(
        r'const PRELOAD_EXPENSE_MONTHLY = \[.*?\];',
        lambda _: block,
        src,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise SystemExit(f'PRELOAD_EXPENSE_MONTHLY block not found uniquely (matched {count})')
    with open(DATAJS_PATH, 'w', encoding='utf-8') as f:
        f.write(new_src)
    print(f'Updated PRELOAD_EXPENSE_MONTHLY in {DATAJS_PATH}')


if __name__ == '__main__':
    main()
