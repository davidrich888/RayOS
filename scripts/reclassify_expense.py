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
            changed.append((old, new, txn['desc'], txn['amount']))
    return changed


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
    for (old, new), count in Counter((o, n) for o, n, _, _ in changed).most_common():
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


if __name__ == '__main__':
    main()
