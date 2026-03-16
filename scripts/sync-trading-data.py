#!/usr/bin/env python3
"""Fetch trading data from Google Sheet CSV and update js/data.js preload constants."""

import csv
import io
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

SHEET_ID = '1ozBB17QMML4CmbtNfLEhm4Hu-ffpN3qTRawCa_tPHG4'
CSV_URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0'
DATA_JS = Path(__file__).resolve().parent.parent / 'js' / 'data.js'


def fetch_csv() -> str:
    req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')


def parse_num(s: str) -> float:
    s = s.strip().replace(',', '')
    if not s:
        return 0.0
    return float(s) if s else 0.0


def parse_pct(s: str) -> float:
    s = s.strip().replace('%', '').replace(',', '')
    if not s:
        return 0.0
    return float(s) if s else 0.0


def parse_sheet(csv_text: str) -> list[dict]:
    lines = csv_text.strip().split('\n')
    data = []
    for i, line in enumerate(lines):
        if i < 3:  # Skip 3 header rows
            continue
        reader = csv.reader(io.StringIO(line))
        row = next(reader, None)
        if not row or len(row) < 11:
            continue
        date = row[0].strip()
        equity = parse_num(row[6])
        if not date or not equity:
            continue
        data.append({
            'date': date,
            'idxCumRet': round(parse_pct(row[4]), 2),
            'equity': round(equity),
            'dailyRet': round(parse_pct(row[7]), 4),
            'cumRet': round(parse_pct(row[9]), 2),
            'dd': round(parse_pct(row[10]), 2),
        })
    return data


def compute_monthly_returns(data: list[dict]) -> dict:
    monthly: dict[int, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
    for d in data:
        parts = d['date'].split('/')
        if len(parts) < 3:
            continue
        year, month = int(parts[0]), int(parts[1])
        monthly[year][month].append(d['dailyRet'])

    result = {}
    for year in sorted(monthly.keys()):
        result[year] = {}
        ytd_product = 1.0
        for m in range(1, 13):
            if m in monthly[year] and monthly[year][m]:
                product = 1.0
                for r in monthly[year][m]:
                    product *= (1 + r / 100)
                result[year][m] = round((product - 1) * 100, 2)
                ytd_product *= product
        result[year]['ytd'] = round((ytd_product - 1) * 100, 2)
    return result


def format_algo_equity_js(data: list[dict]) -> str:
    lines = ['const PRELOAD_ALGO_EQUITY = [']
    for d in data:
        lines.append(
            f"    {{ date: '{d['date']}', idxCumRet: {d['idxCumRet']}, "
            f"equity: {d['equity']}, dailyRet: {d['dailyRet']}, "
            f"cumRet: {d['cumRet']}, dd: {d['dd']} }},"
        )
    lines.append('];')
    return '\n'.join(lines)


def format_monthly_returns_js(returns: dict) -> str:
    lines = ['const MONTHLY_RETURNS = {']
    for year in sorted(returns.keys()):
        months = returns[year]
        parts = []
        for m in range(1, 13):
            if m in months:
                parts.append(f'{m}: {months[m]}')
        parts.append(f"ytd: {months['ytd']}")
        lines.append(f"    {year}: {{ {', '.join(parts)} }},")
    lines.append('};')
    return '\n'.join(lines)


def update_data_js(algo_js: str, monthly_js: str) -> bool:
    content = DATA_JS.read_text(encoding='utf-8')

    # Replace PRELOAD_ALGO_EQUITY block
    new_content = re.sub(
        r'const PRELOAD_ALGO_EQUITY = \[.*?\];',
        algo_js,
        content,
        flags=re.DOTALL,
    )

    # Replace MONTHLY_RETURNS block
    new_content = re.sub(
        r'const MONTHLY_RETURNS = \{.*?\};',
        monthly_js,
        new_content,
        flags=re.DOTALL,
    )

    if new_content == content:
        return False

    DATA_JS.write_text(new_content, encoding='utf-8')
    return True


def main():
    print('[sync-trading-data] Fetching Google Sheet CSV...')
    csv_text = fetch_csv()

    print('[sync-trading-data] Parsing data...')
    data = parse_sheet(csv_text)
    print(f'[sync-trading-data] Got {len(data)} rows')

    if len(data) < 10:
        print('[sync-trading-data] ERROR: Too few rows, aborting')
        sys.exit(1)

    monthly = compute_monthly_returns(data)
    algo_js = format_algo_equity_js(data)
    monthly_js = format_monthly_returns_js(monthly)

    changed = update_data_js(algo_js, monthly_js)
    if changed:
        print(f'[sync-trading-data] Updated js/data.js with {len(data)} rows')
    else:
        print('[sync-trading-data] No changes needed')

    # Print summary for TG notification
    latest = data[-1]
    print(f'[sync-trading-data] Latest: {latest["date"]} | CumRet: {latest["cumRet"]}% | DD: {latest["dd"]}%')


if __name__ == '__main__':
    main()
