#!/usr/bin/env python3
"""Re-parse all credit card bills with updated classification rules."""

import csv
import json
import os
import re
import unicodedata
from collections import defaultdict

import openpyxl

# ==================== CLASSIFICATION RULES ====================

EXPENSE_CATEGORIES = {
    'Prop Firm': [
        'E8 FUNDING', 'E8FUNDING', 'TOPSTEP', 'APEX TRADER', 'APEX FUNDING',
        'APEXTRADERFUNDING', 'FTMO', 'FUNDEDNEXT', 'FXIFY', 'THE5ERS', '5%ERS',
        'PROPW', 'TRADEIFY', 'LUCID TRADING', 'TRADERSCONNECT', 'TAKEPROFITTRADER',
        'TRADESYNCER', 'KIT.COM', 'SIM2FUNDED',
    ],
    'Skool': ['SKOOL.COM', 'SKOOL'],
    'AI/SaaS': [
        'ANTHROPIC', 'CLAUDE.AI', 'TELLA', 'STREAMYARD', 'N8N', 'PADDLE',
        'APIFY', 'SUBEASY', 'ELEVENLABS', 'UPPIT', 'OPENAI', 'MIDJOURNEY',
        'VERCEL', 'CANVA', 'MANYCHAT', 'FUNNEL MASTE', 'ZAC PHUA',
        'GOOGLE*CLOUD', 'GOOGLE CLOUD', 'GOOGLE*WORKSPACE', 'GSUITE',
        'CAPCUT', 'ZOOM.COM', 'DESCRIPT', 'AMAZON PRIME', 'TRADINGVIEW',
        'SCRIBD', 'NAME-CHEAP', 'NAMECHEAP', 'METACOPIER', 'FORMFLOW', '2CO.COM',
        'METAQUOTES', 'MQL5', 'RAPIDAPI', 'PAXCLOUD', 'NOKIA',
        'GOOGLE*GOOGLE ONE', 'GOOGLE *GOOGLE ONE',
    ],
    'Apple': ['APPLE.COM/BILL', 'APPLE.COM'],
    '交通': [
        'UBER ', 'UBER*', 'GOGORO', 'MOBILE SUICA', 'SUICA', '台灣大車隊',
        'GRAB.COM', 'GRAB ',
        '加油站', '中油', '高鐵', '優步', 'CHARGESPOT', '城市車旅',
        'ALPHA FLIGHT',
    ],
    '餐飲': [
        'UBEREATS', '優食', 'FOODPANDA', '7-ELEVEN', '全家便利', '萊爾富',
        'STARBUCKS', '星巴克', 'MOS-', 'MOS ', 'CAFE', 'SUSHI', 'HANDROLL',
        '全聯', '義美', 'PUTIEN', 'MUNCHIZ', 'XIAOLONGKAN', 'HOTPOT',
        'GRILL', 'HOUSE KOREAN', 'ARABICA', 'BOOST JUICE', '拉麵',
        '燒肉', '鍋物', 'OMAKASE', '日嚐', '木門咖啡', '波奇',
        'GELATO', 'DEAN&DELUCA', 'MCD', 'BREAD STREET',
        '統一超商', 'SEVEN-ELEVEN', 'FAMILYMART', 'MINISTOP',
        '鐵板燒', '食事', '壽司', 'ICHIRAN', 'UNATOTO', '冒煙的喬',
        '丰禾', 'HUN混', 'CUPPAVV', '起家', 'DONUT',
    ],
    '旅行': [
        'AIRBNB', 'BOOKING.COM', 'AGODA', '航空', 'AIRLINES', 'HOTEL', '飯店',
        'KIWI.COM', 'STARLUX', 'FLYSCOOT', 'TOKYO', 'SHIBUYA', 'EKKAMAI', '易遊網',
        'TRIP.COM', 'BANGKO', 'BANGKOK', 'DUBAI', 'DUTY FREE', 'DUTY_FREE', 'RYANAIR',
        'SALA RATTANAKOSIN', 'ICONSIAM', 'EMQUARTIER', 'EMSPHERE', 'SIAM',
        'PARAGON', 'SUKHUMVIT', 'THONGLOR', 'ASIATIQUE', 'KING POWER',
        'SUVARNA', 'AIR ARABIA', 'NARITA', 'EDELWEISS', 'SOUTH COAST',
        'SNOWIN', '滑雪', 'PRINCE HOTEL', 'SOLAMACHI', '行旅',
        'WAYSIM', '酷遊天',
    ],
    '保險': ['國泰人壽', '保險'],
    '健身': ['WORLDGY', 'WORLD GY', '大有運動', 'DECATHLON', '迪卡儂',
             'JETTS FITNESS', 'NU TRITION DEPOT'],
    '購物': [
        'PCHOME', '蝦皮', 'LALAPORT', '秀泰', 'GLOBAL MALL', '環球',
        '富邦MOMO', 'MOMO購物', '無印良品', 'MUJI', '金典', '勤美',
        'CONVERSE', '大魯閣', '台灣菸酒', '連加', 'HOLA',
        'TSUTAYA', 'BURTON', 'J STREAM', 'K區',
        'WHSMITH', 'PIKZELS', 'CHANCHAO',
    ],
    '生活': [
        '遠傳電信', '遠傳電', '電話費', '寶雅', '屈臣氏', '佑全', '三商藥局',
        '小北百貨', '全家福', '寶島眼鏡', '昇昌', '燦坤', '年費',
    ],
    '娛樂': ['威秀影城', 'GOOGLE*YOUTUBE', 'GOOGLE *YOUTUBE', 'GOOGLE*TV', 'LINE STO'],
}

# Skip patterns - these are NOT expenses
SKIP_PATTERNS = ['CUBEAPP', 'RICHART', '上期帳單']

# Foreign transaction fee patterns
FOREIGN_FEE_PATTERNS = ['國外交易手續費', '國外交易服務費']


def normalize(text: str) -> str:
    """Full-width to half-width + uppercase."""
    result = unicodedata.normalize('NFKC', text)
    return result.upper().strip()


def classify(desc: str) -> str:
    """Classify a transaction description into a category."""
    norm = normalize(desc)

    # Check foreign fee first
    for pat in FOREIGN_FEE_PATTERNS:
        if pat in norm:
            return '國外手續費'

    # Check each category
    for cat, keywords in EXPENSE_CATEGORIES.items():
        for kw in keywords:
            if kw in norm:
                return cat

    return '其他'


def should_skip(desc: str, amount: float) -> bool:
    """Check if this row should be skipped."""
    norm = normalize(desc)
    if amount <= 0:
        return True
    for pat in SKIP_PATTERNS:
        if pat in norm:
            return True
    return False


def parse_amount(val: str) -> float:
    """Parse a TWD amount string like '29,770' or '-29,770'."""
    clean = val.replace(',', '').replace('"', '').replace('−', '-').strip()
    if not clean or clean == '−':
        return 0
    try:
        return abs(float(clean))
    except ValueError:
        return 0


def parse_cathay_csv(filepath: str, bill_year: int, bill_month: int) -> list:
    """Parse a Cathay CUBE card CSV bill."""
    transactions = []

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        content = f.read()

    lines = content.split('\n')

    # Find the data header row
    in_data = False
    header_idx = -1
    for i, line in enumerate(lines):
        if '帳單明細' in line:
            in_data = True
            continue
        if in_data and '消費日' in line and '交易說明' in line:
            header_idx = i
            break

    if header_idx < 0:
        print(f"  WARNING: Could not find data header in {filepath}")
        return []

    # Parse rows after header
    for line in lines[header_idx + 1:]:
        line = line.strip()
        if not line:
            continue

        # Parse CSV fields
        parts = []
        reader = csv.reader([line])
        for row in reader:
            parts = row
            break

        if len(parts) < 3:
            continue

        date_str = normalize(parts[0]).strip()
        desc = parts[1].strip()
        amount_str = parts[2].strip()

        # Skip non-date rows
        if not re.match(r'\d{2}/\d{2}', date_str):
            continue

        amount = parse_amount(amount_str)
        if amount <= 0:
            continue

        norm_desc = normalize(desc)
        if should_skip(norm_desc, amount):
            continue

        # Determine month from date
        mm = int(date_str.split('/')[0])
        # Handle year boundary: if bill is Jan but date is Dec
        year = bill_year
        if bill_month <= 2 and mm >= 11:
            year = bill_year - 1

        month_key = f"{year}/{mm:02d}"
        category = classify(desc)

        transactions.append({
            'date': f"{year}/{date_str}",
            'desc': normalize(desc),
            'amount': amount,
            'category': category,
            'month': month_key,
        })

    return transactions


def parse_taishin_xlsx(filepath: str) -> list:
    """Parse a Taishin credit card XLSX bill."""
    transactions = []

    wb = openpyxl.load_workbook(filepath, read_only=True)
    ws = wb.active

    in_detail = False
    for row in ws.iter_rows(values_only=True):
        # Look for detail header
        if len(row) == 0:
            continue
        if row[0] and str(row[0]).strip() in ('消費日期',):
            in_detail = True
            continue

        if not in_detail:
            continue

        # Card section headers (not data)
        if row[0] and '卡' in str(row[0]) and ('末四碼' in str(row[0]) or '卡號' in str(row[0])):
            continue

        date_val = row[0] if len(row) > 0 else None
        desc_val = row[2] if len(row) > 2 else None
        amount_val = row[4] if len(row) > 4 else None

        if not date_val or not desc_val or amount_val is None:
            continue

        # Parse date
        date_str = str(date_val).strip()
        if not re.match(r'20\d{2}/\d{2}/\d{2}', date_str):
            continue

        # Parse amount
        try:
            amount = float(amount_val)
        except (ValueError, TypeError):
            continue

        if amount <= 0:
            continue

        desc = str(desc_val).strip()
        norm_desc = normalize(desc)

        if should_skip(norm_desc, amount):
            continue

        # Month key
        parts = date_str.split('/')
        month_key = f"{parts[0]}/{parts[1]}"
        category = classify(desc)

        transactions.append({
            'date': date_str,
            'desc': norm_desc,
            'amount': amount,
            'category': category,
            'month': month_key,
        })

    wb.close()
    return transactions


def main():
    dl = '/Users/jarvis/Downloads'

    # Cathay CSV files
    cathay_files = [
        (f'{dl}/信用卡對帳單 (6).csv', 2025, 9),
        (f'{dl}/信用卡對帳單 (5).csv', 2025, 10),
        (f'{dl}/信用卡對帳單 (4).csv', 2025, 11),
        (f'{dl}/信用卡對帳單 (3).csv', 2025, 12),
        (f'{dl}/信用卡對帳單 (2).csv', 2026, 1),
        (f'{dl}/信用卡對帳單 (1) (1).csv', 2026, 2),
        (f'{dl}/信用卡對帳單.csv', 2026, 3),
    ]

    # Taishin XLSX files
    taishin_files = [
        f'{dl}/台新銀行 -  202510 信用卡明細.xlsx',
        f'{dl}/台新銀行 -  202511 信用卡明細.xlsx',
        f'{dl}/台新銀行 -  202512 信用卡明細.xlsx',
        f'{dl}/台新銀行 -  202601 信用卡明細.xlsx',
        f'{dl}/台新銀行 -  202602 信用卡明細.xlsx',
        f'{dl}/台新銀行 -  202603 信用卡明細.xlsx',
    ]

    all_transactions = []

    # Parse Cathay
    for filepath, year, month in cathay_files:
        if not os.path.exists(filepath):
            print(f"  MISSING: {filepath}")
            continue
        txns = parse_cathay_csv(filepath, year, month)
        print(f"  Cathay {year}/{month:02d}: {len(txns)} transactions")
        all_transactions.extend(txns)

    # Parse Taishin
    for filepath in taishin_files:
        if not os.path.exists(filepath):
            print(f"  MISSING: {filepath}")
            continue
        txns = parse_taishin_xlsx(filepath)
        fname = os.path.basename(filepath)
        print(f"  Taishin {fname}: {len(txns)} transactions")
        all_transactions.extend(txns)

    print(f"\nTotal transactions: {len(all_transactions)}")

    # Aggregate by month
    monthly = defaultdict(lambda: {'total': 0, 'count': 0, 'categories': defaultdict(int)})

    for txn in all_transactions:
        m = monthly[txn['month']]
        m['total'] += txn['amount']
        m['count'] += 1
        m['categories'][txn['category']] += txn['amount']

    # Print summary
    print("\n" + "=" * 80)
    print("MONTHLY SUMMARY")
    print("=" * 80)

    sorted_months = sorted(monthly.keys())
    for month in sorted_months:
        m = monthly[month]
        print(f"\n📅 {month} — NT${m['total']:,.0f} ({m['count']} 筆)")
        cats = sorted(m['categories'].items(), key=lambda x: -x[1])
        total = m['total']
        for cat, amount in cats:
            pct = amount / total * 100 if total > 0 else 0
            print(f"   {cat:12s}: NT${amount:>10,.0f}  ({pct:5.1f}%)")

    # Generate data.js format
    print("\n\n" + "=" * 80)
    print("PRELOAD_EXPENSE_MONTHLY for data.js")
    print("=" * 80)
    print("const PRELOAD_EXPENSE_MONTHLY = [")
    for month in sorted_months:
        m = monthly[month]
        cats = sorted(m['categories'].items(), key=lambda x: -x[1])
        cat_str = ', '.join(f"'{c}': {int(round(a))}" for c, a in cats)
        print(f"    {{ month: '{month}', total: {int(round(m['total']))}, count: {m['count']}, categories: {{ {cat_str} }} }},")
    print("];")

    # Print "其他" details for debugging
    print("\n\n" + "=" * 80)
    print("「其他」TRANSACTIONS (for debugging)")
    print("=" * 80)
    other_txns = [t for t in all_transactions if t['category'] == '其他']
    # Group by description pattern
    other_summary = defaultdict(lambda: {'count': 0, 'total': 0})
    for t in other_txns:
        # Truncate to 40 chars for grouping
        key = t['desc'][:40]
        other_summary[key]['count'] += 1
        other_summary[key]['total'] += t['amount']
    for key, val in sorted(other_summary.items(), key=lambda x: -x[1]['total']):
        print(f"  {key:45s} x{val['count']:3d}  NT${val['total']:>10,.0f}")

    # Export all transactions as JSON
    json_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'expense-transactions.json')
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(all_transactions, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Exported {len(all_transactions)} transactions to {json_path}")


if __name__ == '__main__':
    main()
