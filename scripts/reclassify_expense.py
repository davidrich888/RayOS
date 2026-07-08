#!/usr/bin/env python3
"""Reclassify every row in expense-transactions.json with the current
EXPENSE_CATEGORIES rules, then regenerate PRELOAD_EXPENSE_MONTHLY in js/data.js.

Why this exists (2026-07-06): reparse_expense.py only re-parses the Sep2025-Mar2026
local bill files AND its merge step *preserves* prior categories, so it cannot push
updated keyword rules onto every month. The dashboard reads js/data.js (regenerated
from data/expense-transactions.json), so recomputing over the complete json is what
actually applies the new rules to all months. Amounts/rows are never touched -> only
category labels shift, monthly totals are invariant.

Safety guard: only reclassify a row when it is currently in a rule *source* bucket
(keyword-derived, not hand-curated) AND the new label is an intended *target* bucket.
This protects hand-curated categories (約會, P.SKOOL->投資自己, ...) from being
clobbered, and never demotes a shopping row into 其他.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_cathay_expense import classify  # noqa: E402 (authoritative classifier)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, 'data', 'expense-transactions.json')
DATAJS_PATH = os.path.join(ROOT, 'js', 'data.js')

# Buckets Ray's rule fixes move OUT of (keyword-derived, safe to recompute)
SOURCE_CATEGORIES = {'交通', '購物', '其他', 'AI/SaaS'}
# Buckets Ray's rule fixes move INTO
TARGET_CATEGORIES = {'餐飲', '交易', 'Prop Firm', '交通', '約會', '健身'}


def reclassify(transactions: list) -> list:
    changed = []
    for txn in transactions:
        old = txn['category']
        new = classify(txn['desc'])
        if new != old and old in SOURCE_CATEGORIES and new in TARGET_CATEGORIES:
            txn['category'] = new
            changed.append((old, new, txn))
    return changed


def sync_categories_to_notion(changed: list) -> None:
    """Push each changed row's new 分類 to the Notion per-transaction detail DB
    (drives the drilldown modal). Without this, JSON-side reclassifications never
    reach Notion — sync_transactions_to_notion only inserts, never updates
    categories on existing rows (learned 2026-07-08)."""
    if not changed:
        return
    from sync_cathay_expense import (  # noqa: E402
        notion_request, NOTION_DETAIL_DB, NOTION_TOKEN,
    )
    if not NOTION_TOKEN:
        print('  NOTION_TOKEN missing — skipped Notion detail sync')
        return

    # One scan of the detail DB -> (date, desc, amount_int) => page_id
    page_by_key = {}
    cursor = None
    while True:
        body = {'page_size': 100}
        if cursor:
            body['start_cursor'] = cursor
        r = notion_request('POST', f'databases/{NOTION_DETAIL_DB}/query', body)
        for page in r.get('results', []):
            props = page['properties']
            darr = props.get('描述', {}).get('title', [])
            desc = darr[0]['plain_text'] if darr else ''
            amt = props.get('金額', {}).get('number', 0) or 0
            dprop = props.get('日期', {}).get('date') or {}
            date = dprop.get('start') or ''  # YYYY-MM-DD
            page_by_key[(date, desc, int(round(amt)))] = page['id']
        if not r.get('has_more'):
            break
        cursor = r.get('next_cursor')

    patched, missing = 0, 0
    for _old, new, txn in changed:
        key = (txn['date'].replace('/', '-'), txn['desc'], int(round(txn['amount'])))
        pid = page_by_key.get(key)
        if not pid:
            missing += 1
            print(f"  Notion: no match for {txn['month']} {txn['desc']} {txn['amount']:g}")
            continue
        notion_request('PATCH', f'pages/{pid}',
                       {'properties': {'分類': {'select': {'name': new}}}})
        patched += 1
    print(f'  Notion detail: {patched}/{len(changed)} categories synced'
          + (f' ({missing} unmatched)' if missing else ''))


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
        cats = sorted(month['cats'].items(), key=lambda kv: -kv[1])
        cat_str = ', '.join(f"'{name}': {int(round(amount))}" for name, amount in cats)
        lines.append(
            f"    {{ month: '{month_key}', total: {int(round(month['total']))}, "
            f"count: {month['count']}, categories: {{ {cat_str} }} }},"
        )
    lines.append('];')
    return '\n'.join(lines)


def main() -> None:
    with open(JSON_PATH, encoding='utf-8') as f:
        transactions = json.load(f)

    before_total = sum(t['amount'] for t in transactions)
    changed = reclassify(transactions)
    after_total = sum(t['amount'] for t in transactions)

    print(f'Reclassified {len(changed)} of {len(transactions)} rows')
    for (old, new), count in Counter((o, n) for o, n, _ in changed).most_common():
        print(f'  {old:8s} -> {new:8s} x{count}')
    assert abs(before_total - after_total) < 0.01, 'TOTAL CHANGED — abort'
    print(f'Grand total unchanged: {int(round(after_total)):,}')

    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(transactions, f, ensure_ascii=False, indent=2)
    print(f'Wrote {JSON_PATH}')

    block = build_preload_block(transactions)
    with open(DATAJS_PATH, encoding='utf-8') as f:
        src = f.read()
    new_src, hits = re.subn(
        r'const PRELOAD_EXPENSE_MONTHLY = \[.*?\];',
        lambda _: block, src, count=1, flags=re.DOTALL,
    )
    if hits != 1:
        raise SystemExit(f'PRELOAD_EXPENSE_MONTHLY block not found uniquely (matched {hits})')
    with open(DATAJS_PATH, 'w', encoding='utf-8') as f:
        f.write(new_src)
    print(f'Updated PRELOAD_EXPENSE_MONTHLY in {DATAJS_PATH}')

    sync_categories_to_notion(changed)


if __name__ == '__main__':
    main()
