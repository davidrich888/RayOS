#!/usr/bin/env python3
"""
Sync Cathay credit card statement to RayOS expense tracker.

Flow:
  1. gws CLI searches Gmail for latest Cathay statement email
  2. gws downloads the encrypted PDF attachment
  3. Decrypt PDF with ID number password (pikepdf)
  4. Parse transaction tables from PDF (pdfplumber)
  5. Classify transactions using EXPENSE_CATEGORIES
  6. Merge with existing expense-transactions.json
  7. Regenerate PRELOAD_EXPENSE_MONTHLY in data.js
  8. Sync to Notion (monthly aggregates + transaction detail)
  9. TG notification with summary

Usage:
  # From PDF file (skip Gmail download)
  python3 sync_cathay_expense.py --pdf /path/to/statement.pdf

  # Full auto: search Gmail for latest statement
  python3 sync_cathay_expense.py --auto
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import pikepdf
import pdfplumber
import requests

# ==================== PATHS ====================

SCRIPT_DIR = Path(__file__).parent
RAYOS_DIR = SCRIPT_DIR.parent
DATA_DIR = RAYOS_DIR / 'data'
TRANSACTIONS_FILE = DATA_DIR / 'expense-transactions.json'
DATA_JS_FILE = RAYOS_DIR / 'js' / 'data.js'
ARCHIVE_DIR = RAYOS_DIR / 'archive' / 'expense-bills'
ENV_FILE = RAYOS_DIR / '.env'
WORKSPACE_ENV = RAYOS_DIR.parent / '.env'
FUNDWITHRAY_ENV = RAYOS_DIR.parent / 'Project_FundwithRay' / '.env'

# ==================== ENV ====================

def load_env():
    """Load .env files into os.environ (RayOS first, then FundwithRay as fallback)."""
    for env_path in [ENV_FILE, WORKSPACE_ENV, FUNDWITHRAY_ENV]:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ.setdefault(key.strip(), val.strip())

load_env()

# ==================== CLASSIFICATION ====================

EXPENSE_CATEGORIES = {
    'Prop Firm': [
        'E8 FUNDING', 'E8FUNDING', 'TOPSTEP', 'APEX TRADER', 'APEX FUNDING',
        'APEXTRADERFUNDING', 'FTMO', 'FUNDEDNEXT', 'FXIFY', 'THE5ERS', '5%ERS',
        'PROPW', 'TRADEIFY', 'LUCID TRADING', 'TRADERSCONNECT', 'TAKEPROFITTRADER',
        'TRADESYNCER', 'KIT.COM', 'SIM2FUNDED',
    ],
    '事業': [
        'SKOOL.COM', 'SKOOL', 'TELLA', 'STREAMYARD', 'CAPCUT', 'CAPCUTO',
        'SUBEASY', 'MANYCHAT', 'CANVA', 'FUNNEL MASTE', 'ZAC PHUA',
    ],
    'AI/SaaS': [
        'ANTHROPIC', 'CLAUDE.AI', 'N8N', 'PADDLE',
        'APIFY', 'ELEVENLABS', 'UPPIT', 'OPENAI', 'MIDJOURNEY',
        'VERCEL',
        'GOOGLE*CLOUD', 'GOOGLE CLOUD', 'GOOGLE*WORKSPACE', 'GSUITE',
        'ZOOM.COM', 'DESCRIPT', 'AMAZON PRIME', 'TRADINGVIEW',
        'SCRIBD', 'NAME-CHEAP', 'NAMECHEAP', 'METACOPIER', 'FORMFLOW', '2CO.COM',
        'METAQUOTES', 'MQL5', 'RAPIDAPI', 'PAXCLOUD', 'NOKIA',
        'GOOGLE*GOOGLE ONE', 'GOOGLE *GOOGLE ONE',
        'GOOGLE WORKSPACE', 'GOOGLE CHROME',
    ],
    '約會': [
        'TINDER', 'BUMBLE', 'COFFEE MEETS BAGEL', 'CMB ',
        '浪琴文創', '薆悅', 'MOTEL', '汽車旅館',
    ],
    'Apple': ['APPLE.COM/BILL', 'APPLE.COM'],
    '交通': [
        'UBER ', 'UBER*', 'GOGORO', 'MOBILE SUICA', 'SUICA', '台灣大車隊',
        'GRAB.COM', 'GRAB ',
        '加油站', '中油', '高鐵', '優步', 'CHARGESPOT', '城市車旅',
        'ALPHA FLIGHT', 'JR EAST',
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
        'YAKINIKU', 'IMAHAN', 'KAITENZUSHI', 'JAPAN MEAT',
        'SUTANDOJISEDAI',
        'FOODCOOP', 'HANGETSU', 'GINGER FARM', 'KUA SA WAT',
        'GOOD BY SICILY', 'YUZU HOUSE', 'MUUM MUUM',
        'MILES STUTZERLENB', 'TANBAYA', 'UMEIYA',
        '可不可',
        'SHAKE SHACK', '海底撈', '牛肉麵', 'SOGO(餐廳)', 'ASAKUSAGYUKATSU',
        'KOPABORU', 'MAISON CREPERIE', 'C.STAND',
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
        'FUSOU', 'SNOWBOARD', 'MURASAKISPORTS',
        'ISHIUCHI', 'RESORTCENTER', 'DONQUIJOTE', 'DON QUIJOTE',
        'KASIKORN', 'HUAIKHWANG', 'PINK DOT NAEBA', 'RESTHAUSE',
        'EDOGAWABASHI', 'AIS BY OUTLET',
    ],
    '保險': ['國泰人壽', '保險', 'TOKIO MARINE'],
    '健身': ['WORLDGY', 'WORLD GY', 'JETTS FITNESS', 'NU TRITION DEPOT'],
    '購物': [
        'PCHOME', '蝦皮', 'LALAPORT', '秀泰', 'GLOBAL MALL', '環球',
        '富邦MOMO', 'MOMO購物', '無印良品', 'MUJI', '金典', '勤美',
        'CONVERSE', '大魯閣', '台灣菸酒', '連加', 'HOLA',
        'TSUTAYA', 'BURTON', 'J STREAM', 'K區',
        'WHSMITH', 'PIKZELS', 'CHANCHAO', '昇昌',
        'DOPE & DIRTY', 'THE COACH', 'SABINA',
        'DUFRY', '采盟', 'JAPANESE SOUVENIR',
        'BIRKENSTOCK', 'DAIKOKU', 'DAISO', 'WASHINOSHINJUKU',
    ],
    '生活': [
        '遠傳電信', '遠傳電', '電話費', '寶雅', '屈臣氏', '佑全', '三商藥局',
        '小北百貨', '全家福', '寶島眼鏡', '燦坤', '年費',
        'SALON', 'WORLDVAPESHOP',
        '歐萊德',
    ],
    '娛樂': [
        '威秀影城', 'GOOGLE*YOUTUBE', 'GOOGLE *YOUTUBE', 'GOOGLE*TV', 'LINE STO',
        'DECATHLON', '迪卡儂', '大有運動',
        'YASMIN NIGHT', 'CLOUD NINE',
    ],
}

SKIP_PATTERNS = ['CUBEAPP', 'RICHART', '上期帳單']
FOREIGN_FEE_PATTERNS = ['國外交易手續費', '國外交易服務費']


def normalize(text: str) -> str:
    """Full-width to half-width + uppercase, strip PUA chars."""
    result = unicodedata.normalize('NFKC', text)
    result = ''.join(c for c in result if not ('\uE000' <= c <= '\uF8FF'))
    return result.upper().strip()


def classify(desc: str) -> str:
    """Classify a transaction description into a category."""
    norm = normalize(desc)
    for pat in FOREIGN_FEE_PATTERNS:
        if pat in norm:
            return '國外手續費'
    for cat, keywords in EXPENSE_CATEGORIES.items():
        for kw in keywords:
            if kw in norm:
                return cat
    return '其他'


def should_skip(desc: str, amount: float) -> bool:
    """Check if this row should be skipped."""
    norm = normalize(desc)
    for pat in SKIP_PATTERNS:
        if pat in norm:
            return True
    return False


def parse_amount(val: str, keep_sign: bool = False) -> float:
    """Parse a TWD amount string like '29,770' or '-29,770'."""
    clean = val.replace(',', '').replace('"', '').replace('−', '-').strip()
    if not clean or clean == '−':
        return 0
    try:
        return float(clean) if keep_sign else abs(float(clean))
    except ValueError:
        return 0


# ==================== GMAIL DOWNLOAD ====================

def download_cathay_pdf_from_gmail():
    """Use gws CLI to find and download the latest Cathay PDF statement."""
    print("[1/6] Searching Gmail for Cathay statement...")

    # Search for latest Cathay statement email
    result = subprocess.run(
        ['gws', 'gmail', 'users', 'messages', 'list', '--params', json.dumps({
            'userId': 'me',
            'q': 'from:service@pxbillrc01.cathaybk.com.tw subject:電子帳單 has:attachment',
            'maxResults': 1,
        })],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise RuntimeError(f"gws search failed: {result.stderr}")

    data = json.loads(result.stdout)
    messages = data.get('messages', [])
    if not messages:
        raise RuntimeError("No Cathay statement email found in Gmail")

    msg_id = messages[0]['id']
    print(f"  Found message: {msg_id}")

    # Get full message to find attachment
    result = subprocess.run(
        ['gws', 'gmail', 'users', 'messages', 'get', '--params', json.dumps({
            'userId': 'me', 'id': msg_id, 'format': 'full',
        })],
        capture_output=True, text=True, timeout=30
    )
    msg = json.loads(result.stdout)

    # Extract subject for logging
    headers = msg.get('payload', {}).get('headers', [])
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'unknown')
    print(f"  Subject: {subject}")

    # Find PDF attachment (recursive search through MIME parts)
    def find_pdf(part):
        fn = part.get('filename', '')
        if fn.endswith('.pdf'):
            return part['body']['attachmentId'], fn
        for sub in part.get('parts', []):
            result = find_pdf(sub)
            if result:
                return result
        return None

    att_info = find_pdf(msg['payload'])
    if not att_info:
        raise RuntimeError("No PDF attachment found in email")

    att_id, filename = att_info
    print(f"  Attachment: {filename}")

    # Download attachment data
    result = subprocess.run(
        ['gws', 'gmail', 'users', 'messages', 'attachments', 'get', '--params', json.dumps({
            'userId': 'me', 'messageId': msg_id, 'id': att_id,
        })],
        capture_output=True, text=True, timeout=60
    )
    att_data = json.loads(result.stdout)
    raw = att_data.get('data', '')
    decoded = base64.urlsafe_b64decode(raw + '==')

    # Save to archive
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = ARCHIVE_DIR / filename
    pdf_path.write_bytes(decoded)
    print(f"  Saved: {pdf_path} ({len(decoded):,} bytes)")

    return str(pdf_path)


# ==================== PDF PARSING ====================

def parse_cathay_pdf(pdf_path: str) -> list[dict]:
    """Decrypt and parse Cathay credit card PDF statement."""
    password = os.environ.get('CATHAY_BILL_PASSWORD', '')
    if not password:
        raise RuntimeError("CATHAY_BILL_PASSWORD not set in .env")

    print("[2/6] Parsing PDF...")

    # Decrypt PDF
    decrypted_path = '/tmp/cathay_decrypted.pdf'
    pdf = pikepdf.open(pdf_path, password=password)
    pdf.save(decrypted_path)
    pdf.close()
    print("  PDF decrypted")

    # Extract statement period from filename (e.g., _11503.pdf → ROC 115, month 03)
    filename = os.path.basename(pdf_path)
    match = re.search(r'_(\d{3})(\d{2})\.pdf', filename)
    if match:
        roc_year = int(match.group(1))
        bill_month = int(match.group(2))
        bill_year = roc_year + 1911
    else:
        # Fallback: try to extract from PDF text
        with pdfplumber.open(decrypted_path) as plumber:
            first_text = plumber.pages[0].extract_text() or ''
            m = re.search(r'(\d{3})年(\d{1,2})月', first_text)
            if m:
                bill_year = int(m.group(1)) + 1911
                bill_month = int(m.group(2))
            else:
                raise RuntimeError("Cannot determine statement period")

    print(f"  Statement: {bill_year}/{bill_month:02d}")

    # Transaction line pattern:
    # MM/DD MM/DD description amount 4-digit-card-number ...
    tx_pattern = re.compile(
        r'^(\d{2}/\d{2})\s+\d{2}/\d{2}\s+(.+?)\s+(-?[\d,]+)\s+\d{4}\b'
    )

    transactions = []
    skip_summaries = ['上期帳單總額', '繳款小計', '正卡本期消費', '本期應繳總額',
                      '附卡本期消費', '本期新增消費']

    with pdfplumber.open(decrypted_path) as plumber:
        for page in plumber.pages:
            text = page.extract_text()
            if not text:
                continue

            for line in text.split('\n'):
                # Skip non-transaction lines
                if any(s in line for s in skip_summaries):
                    continue
                if '-----' in line or '您本月' in line:
                    continue

                m = tx_pattern.match(line)
                if not m:
                    continue

                date_str = m.group(1)  # MM/DD
                desc = m.group(2).strip()
                amount_str = m.group(3)

                amount = parse_amount(amount_str, keep_sign=True)
                if amount == 0:
                    continue

                norm_desc = normalize(desc)
                if should_skip(norm_desc, abs(amount)):
                    continue

                # Determine year from month
                mm = int(date_str.split('/')[0])
                year = bill_year
                # Handle year boundary (e.g., Jan bill with Dec transactions)
                if bill_month <= 2 and mm >= 11:
                    year = bill_year - 1

                month_key = f"{year}/{mm:02d}"
                full_date = f"{year}/{date_str}"
                category = classify(desc)

                transactions.append({
                    'date': full_date,
                    'desc': norm_desc,
                    'amount': amount,
                    'category': category,
                    'month': month_key,
                })

    # Separate positive (charges) and negative (refunds/payments)
    charges = [t for t in transactions if t['amount'] > 0]
    refunds = [t for t in transactions if t['amount'] < 0]

    # Match refunds with charges
    matched_refund_ids = set()
    matched_charge_ids = set()
    for ri, refund in enumerate(refunds):
        refund_amt = abs(refund['amount'])
        for ci, charge in enumerate(charges):
            if ci in matched_charge_ids:
                continue
            if charge['desc'] == refund['desc'] and abs(charge['amount'] - refund_amt) < 0.01:
                matched_refund_ids.add(ri)
                matched_charge_ids.add(ci)
                print(f"  Refund matched: {refund['desc']} NT${refund_amt:,.0f}")
                break

    final = [c for i, c in enumerate(charges) if i not in matched_charge_ids]
    print(f"  Parsed: {len(final)} transactions ({len(charges)} charges, {len(refunds)} refunds, {len(matched_refund_ids)} matched)")

    return final


# ==================== MERGE & UPDATE ====================

def merge_transactions(new_txns: list[dict]) -> tuple[list[dict], int]:
    """Merge new transactions into existing JSON, dedup by date+desc+amount."""
    existing = []
    if TRANSACTIONS_FILE.exists():
        existing = json.loads(TRANSACTIONS_FILE.read_text())

    # Build dedup set
    existing_keys = set()
    for t in existing:
        key = (t['date'], t['desc'], round(t['amount'], 2))
        existing_keys.add(key)

    added = 0
    for t in new_txns:
        key = (t['date'], t['desc'], round(t['amount'], 2))
        if key not in existing_keys:
            existing.append(t)
            existing_keys.add(key)
            added += 1

    # Sort by date
    existing.sort(key=lambda x: x['date'])

    # Save
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TRANSACTIONS_FILE.write_text(json.dumps(existing, ensure_ascii=False, indent=2))

    return existing, added


def update_data_js(all_transactions: list[dict]):
    """Regenerate PRELOAD_EXPENSE_MONTHLY in data.js."""
    # Aggregate by month
    monthly = defaultdict(lambda: {'total': 0, 'count': 0, 'categories': defaultdict(int)})
    for txn in all_transactions:
        m = monthly[txn['month']]
        m['total'] += txn['amount']
        m['count'] += 1
        m['categories'][txn['category']] += txn['amount']

    # Generate JS
    sorted_months = sorted(monthly.keys())
    lines = ['const PRELOAD_EXPENSE_MONTHLY = [']
    for month in sorted_months:
        m = monthly[month]
        cats = sorted(m['categories'].items(), key=lambda x: -x[1])
        cat_str = ', '.join(f"'{c}': {int(round(a))}" for c, a in cats)
        lines.append(f"    {{ month: '{month}', total: {int(round(m['total']))}, count: {m['count']}, categories: {{ {cat_str} }} }},")
    lines.append('];')
    new_block = '\n'.join(lines)

    # Replace in data.js
    content = DATA_JS_FILE.read_text()
    pattern = r'const PRELOAD_EXPENSE_MONTHLY = \[.*?\];'
    content = re.sub(pattern, new_block, content, flags=re.DOTALL)
    DATA_JS_FILE.write_text(content)


# ==================== NOTION SYNC ====================

NOTION_TOKEN = os.environ.get('NOTION_TOKEN', '')
NOTION_EXPENSE_DB = '69291a3a-230f-4483-811f-8072dae1b31c'   # Monthly aggregates
NOTION_DETAIL_DB = 'ca2878aa-4fa1-473a-8776-f4d8f9d16d59'    # Per-transaction

CATEGORY_TO_NOTION = {
    'Prop Firm': 'Prop Firm', '事業': 'Skool', 'AI/SaaS': 'AI/SaaS',
    'Apple': 'Apple', '交通': '交通', '餐飲': '餐飲', '旅行': '旅行',
    '保險': '保險', '健身': '健身', '購物': '購物', '生活': '生活',
    '娛樂': '娛樂', '約會': '約會', '國外手續費': '國外手續費', '其他': '其他',
}


def notion_request(method, endpoint, data=None):
    """Make a Notion API request."""
    url = f"https://api.notion.com/v1/{endpoint}"
    headers = {
        'Authorization': f'Bearer {NOTION_TOKEN}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
    }
    resp = requests.request(method, url, headers=headers, json=data, timeout=30)
    if resp.status_code >= 400:
        print(f"  Notion API error {resp.status_code}: {resp.text[:200]}")
    return resp.json() if resp.text else {}


def sync_monthly_to_notion(all_transactions: list[dict]):
    """Sync monthly aggregates to Notion expense DB."""
    monthly = defaultdict(lambda: {'total': 0, 'categories': defaultdict(int)})
    for txn in all_transactions:
        m = monthly[txn['month']]
        m['total'] += txn['amount']
        m['categories'][txn['category']] += txn['amount']

    # Get existing rows
    existing = notion_request('POST', f'databases/{NOTION_EXPENSE_DB}/query', {
        'page_size': 100,
    })
    existing_months = {}
    for page in existing.get('results', []):
        title_arr = page.get('properties', {}).get('月份', {}).get('title', [])
        if title_arr:
            existing_months[title_arr[0]['plain_text']] = page['id']

    print(f"  Notion: {len(existing_months)} existing month rows")
    created = 0

    for month_key in sorted(monthly.keys()):
        m = monthly[month_key]
        properties = {
            '月份': {'title': [{'text': {'content': month_key}}]},
            '總支出': {'number': int(round(m['total']))},
        }
        for cat, amount in m['categories'].items():
            notion_col = CATEGORY_TO_NOTION.get(cat, cat)
            properties[notion_col] = {'number': int(round(amount))}

        if month_key in existing_months:
            notion_request('PATCH', f'pages/{existing_months[month_key]}', {
                'properties': properties,
            })
        else:
            notion_request('POST', 'pages', {
                'parent': {'database_id': NOTION_EXPENSE_DB},
                'properties': properties,
            })
            created += 1

    print(f"  Notion: {created} monthly rows created/updated")


def sync_transactions_to_notion(new_transactions: list[dict]):
    """Sync individual transactions to Notion detail DB."""
    if not new_transactions:
        return

    # Get affected months
    months = set(t['month'] for t in new_transactions)

    # Query existing entries for those months to dedup
    existing_keys = set()
    for month in months:
        result = notion_request('POST', f'databases/{NOTION_DETAIL_DB}/query', {
            'filter': {
                'property': '月份',
                'rich_text': {'equals': month},
            },
            'page_size': 100,
        })
        for page in result.get('results', []):
            props = page.get('properties', {})
            desc_arr = props.get('描述', {}).get('title', [])
            amount = props.get('金額', {}).get('number', 0)
            date_prop = props.get('日期', {}).get('date', {})
            desc = desc_arr[0]['plain_text'] if desc_arr else ''
            date = date_prop.get('start', '') if date_prop else ''
            existing_keys.add((date, desc, amount))

    print(f"  Notion detail: {len(existing_keys)} existing transactions")

    created = 0
    for txn in new_transactions:
        # Format date for Notion (YYYY/MM/DD → YYYY-MM-DD)
        notion_date = txn['date'].replace('/', '-')
        key = (notion_date, txn['desc'], round(txn['amount']))
        if key in existing_keys:
            continue

        notion_request('POST', 'pages', {
            'parent': {'database_id': NOTION_DETAIL_DB},
            'properties': {
                '描述': {'title': [{'text': {'content': txn['desc']}}]},
                '分類': {'select': {'name': CATEGORY_TO_NOTION.get(txn['category'], txn['category'])}},
                '日期': {'date': {'start': notion_date}},
                '月份': {'rich_text': [{'text': {'content': txn['month']}}]},
                '金額': {'number': round(txn['amount'])},
            },
        })
        created += 1

    print(f"  Notion detail: {created} new transactions created")


# ==================== TG NOTIFICATION ====================

def send_tg_notification(new_count: int, months_affected: set, total_by_month: dict):
    """Send Telegram notification with sync summary."""
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '')
    if not token or not chat_id:
        print("  TG: skipped (no token/chat_id)")
        return

    month_lines = []
    for m in sorted(months_affected):
        t = total_by_month.get(m, 0)
        month_lines.append(f"  {m}: NT${t:,.0f}")

    text = (
        f"💳 *國泰帳單同步完成*\n\n"
        f"新增: {new_count} 筆\n"
        + '\n'.join(month_lines)
    )

    requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data={'chat_id': chat_id, 'parse_mode': 'Markdown', 'text': text},
        timeout=10,
    )
    print(f"  TG: notification sent")


# ==================== MAIN ====================

def main():
    parser = argparse.ArgumentParser(description='Sync Cathay credit card statement')
    parser.add_argument('--pdf', help='Path to PDF file (skip Gmail download)')
    parser.add_argument('--auto', action='store_true', help='Auto-download from Gmail')
    args = parser.parse_args()

    if args.pdf:
        pdf_path = args.pdf
    elif args.auto:
        pdf_path = download_cathay_pdf_from_gmail()
    else:
        parser.print_help()
        sys.exit(1)

    # [2/6] Parse PDF
    transactions = parse_cathay_pdf(pdf_path)
    if not transactions:
        print("No transactions found!")
        sys.exit(1)

    # Print category summary
    cats = defaultdict(int)
    for t in transactions:
        cats[t['category']] += t['amount']
    print("\n  Category breakdown:")
    for cat, total in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"    {cat:15s}: NT${total:>10,.0f}")

    # [3/6] Merge with local JSON
    print(f"\n[3/6] Merging transactions...")
    all_transactions, new_count = merge_transactions(transactions)
    print(f"  {new_count} new transactions added (total: {len(all_transactions)})")

    if new_count == 0:
        print("  No new transactions — skipping remaining steps")
        return

    # [4/6] Update data.js
    print(f"\n[4/6] Updating data.js...")
    update_data_js(all_transactions)
    print("  data.js updated")

    # [5/6] Sync to Notion
    print(f"\n[5/6] Syncing to Notion...")
    if NOTION_TOKEN:
        sync_monthly_to_notion(all_transactions)
        sync_transactions_to_notion(transactions)
    else:
        print("  Skipped (no NOTION_TOKEN)")

    # [6/6] TG notification
    print(f"\n[6/6] Sending notification...")
    months_affected = set(t['month'] for t in transactions)
    total_by_month = defaultdict(int)
    for t in transactions:
        total_by_month[t['month']] += t['amount']
    send_tg_notification(new_count, months_affected, total_by_month)

    print(f"\n✅ Cathay sync complete: {new_count} new transactions")


if __name__ == '__main__':
    main()
