#!/usr/bin/env python3
"""
Parse Taishin online banking 「當期消費明細」 page text.

Fallback for when the monthly statement email doesn't arrive in Gmail
(May 2026: April statement was never delivered).

Usage:
  # Dry-run (parse + print, no writes):
  python3 parse_taishin_paste.py data/raw/taishin-2026-05-paste.txt --dry-run

  # Full run (merge into expense-transactions.json + regenerate data.js + Notion sync):
  python3 parse_taishin_paste.py data/raw/taishin-2026-05-paste.txt

Input format (text from Taishin online banking 「當期消費明細」):
  - Section headers per card: 「Richart卡(...) (卡號末四碼:XXXX)」
  - Per-transaction blocks (variable line count):
    * TW (6 lines): consumption_date / posting_date / desc / 新臺幣 / amount / TW
    * Foreign (8 lines): + fx_date(MM/DD) + location + 'USD/N.NN'
    * Foreign service fee (5 lines): consumption_date / posting_date / 國外交易服務費－N / 新臺幣 / amount

Reuses classify/normalize/should_skip/merge_transactions/save_transactions/
regenerate_data_js/sync_to_notion from sync_taishin_expense.py.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Reuse helpers from the main sync script
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from sync_taishin_expense import (  # noqa: E402
    classify,
    normalize,
    should_skip,
    merge_transactions,
    save_transactions,
    regenerate_data_js,
    sync_to_notion,
    load_existing_transactions,
)


DATE_RE = re.compile(r'^\d{4}/\d{2}/\d{2}$')        # 2026/04/27
FX_DATE_RE = re.compile(r'^\d{2}/\d{2}$')           # 04/29
FX_AMT_RE = re.compile(r'^[A-Z]{3}/\d+\.\d+$')      # USD/51.45
LOCATION_RE = re.compile(r'^[A-Z]{2}$')             # TW, US, SG, NZ, GB
CARD_HEADER_RE = re.compile(r'卡號末四碼[:：]\s*(\d{4})')
SUMMARY_RE = re.compile(r'消費筆數[:：]')
NO_MORE_RE = re.compile(r'沒有更多資料了')
SKIP_LITERAL = {'新臺幣', '依消費日期排序', '搜尋', '消費日期', '入帳起息日',
                '消費明細(含消費地)', '約定幣別', '消費金額', '外幣折算日',
                '消費地', '外幣幣別/金額', '當期消費明細', '幣別：', '全部'}


def parse_amount(text: str) -> float | None:
    """'1,011' -> 1011.0; '−10' -> -10.0. Return None if not a number."""
    cleaned = text.replace(',', '').replace('−', '-').strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_paste(text: str) -> list[dict]:
    """Parse the paste text into a list of transactions.

    Walking strategy: sliding cursor that recognizes a transaction block by:
      [date] [date] [desc] [新臺幣] [amount] ... (variable trailing)

    Trailing variants:
      * TW: [LOCATION_RE]
      * Foreign: [FX_DATE_RE] [LOCATION_RE] [FX_AMT_RE]
      * Service fee: <nothing — next block already starts>
    """
    raw_lines = [ln.strip() for ln in text.splitlines()]
    # Drop comment lines and empty lines
    lines = [ln for ln in raw_lines if ln and not ln.startswith('#') and ln not in SKIP_LITERAL]

    txns: list[dict] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]

        if SUMMARY_RE.search(line) or NO_MORE_RE.search(line):
            i += 1
            continue
        if CARD_HEADER_RE.search(line):
            i += 1
            continue

        # Look for a transaction block: 5+ lines starting with date, date, desc, 約定幣別, amount
        # We pre-stripped 新臺幣 above as a SKIP_LITERAL, so amount is at i+3 in that case.
        # But to be robust, accept either form.
        if DATE_RE.match(line):
            # Need at least: date, date, desc, amount (currency line removed by SKIP_LITERAL)
            if i + 3 >= n:
                i += 1
                continue
            if not DATE_RE.match(lines[i + 1]):
                i += 1
                continue
            consumption_date = line
            # posting_date = lines[i+1]  # unused in JSON schema
            desc = lines[i + 2]
            amount = parse_amount(lines[i + 3])
            if amount is None:
                i += 1
                continue

            # Check trailing form for foreign tx (FX_DATE + LOCATION + FX_AMT)
            consumed = 4
            if (i + 6 < n
                    and FX_DATE_RE.match(lines[i + 4])
                    and LOCATION_RE.match(lines[i + 5])
                    and FX_AMT_RE.match(lines[i + 6])):
                consumed = 7
            elif i + 4 < n and LOCATION_RE.match(lines[i + 4]):
                # Plain TW or foreign without FX expansion
                consumed = 5

            # Skip / classify
            if not should_skip(desc):
                # Build transaction dict matching parse_taishin_html schema
                norm_desc = normalize(desc)
                category = classify(desc)
                parts = consumption_date.split('/')
                month_key = f"{parts[0]}/{parts[1]}"
                txns.append({
                    'date': consumption_date,
                    'desc': norm_desc,
                    'amount': amount,
                    'category': category,
                    'month': month_key,
                })

            i += consumed
            continue

        i += 1

    return txns


def print_summary(txns: list[dict], title: str) -> None:
    print(f"\n=== {title}: {len(txns)} transactions ===")
    total = sum(t['amount'] for t in txns)
    print(f"  Total NTD: {total:,.0f}")

    by_cat: dict[str, tuple[int, float]] = {}
    for t in txns:
        cnt, amt = by_cat.get(t['category'], (0, 0))
        by_cat[t['category']] = (cnt + 1, amt + t['amount'])
    print("  By category:")
    for cat, (cnt, amt) in sorted(by_cat.items(), key=lambda x: -x[1][1]):
        print(f"    {cat:10s}  {cnt:3d} 筆  {amt:>10,.0f}")

    print("  Date range:")
    dates = sorted({t['date'] for t in txns})
    if dates:
        print(f"    {dates[0]} ~ {dates[-1]}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('input_file', type=Path, help='Path to pasted text file')
    parser.add_argument('--dry-run', action='store_true',
                        help='Parse and print only; do not write JSON / data.js / Notion')
    parser.add_argument('--no-notion', action='store_true',
                        help='Skip Notion sync (still write JSON and data.js)')
    args = parser.parse_args()

    if not args.input_file.exists():
        print(f"ERROR: {args.input_file} not found")
        return 1

    text = args.input_file.read_text(encoding='utf-8')
    print(f"Parsing {args.input_file} ({len(text)} chars)")

    parsed = parse_paste(text)
    print_summary(parsed, "Parsed from paste")

    if args.dry_run:
        print("\n[DRY-RUN] Stopping before merge. No files written.")
        # Show how many would be NEW vs already in JSON
        existing = load_existing_transactions()
        existing_keys = {f"{t['date']}|{t['desc']}|{t['amount']}" for t in existing}
        new_count = sum(1 for t in parsed
                        if f"{t['date']}|{t['desc']}|{t['amount']}" not in existing_keys)
        print(f"\n  Would add {new_count} new transactions to JSON ({len(parsed) - new_count} are already there)")
        return 0

    print("\n[2/4] Loading existing JSON...")
    existing = load_existing_transactions()
    print(f"  {len(existing)} existing transactions")

    print("\n[3/4] Merging...")
    merged = merge_transactions(existing, parsed)
    save_transactions(merged)

    print("\n[4/4] Regenerating data.js...")
    regenerate_data_js(merged)

    if not args.no_notion:
        print("\n[5/5] Syncing to Notion...")
        sync_to_notion(merged)

    print("\n✅ Done.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
