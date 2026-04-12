#!/usr/bin/env python3
"""
Sync Taishin credit card statement to RayOS expense tracker.

Flow:
  1. Gmail MCP or manual URL → get statement link
  2. Playwright opens link → screenshot captcha → Claude Vision reads it
  3. Enter password + captcha → login → scrape transaction table
  4. Classify transactions using EXPENSE_CATEGORIES
  5. Merge with existing expense-transactions.json
  6. Regenerate PRELOAD_EXPENSE_MONTHLY in data.js
  7. TG notification with summary

Usage:
  # From saved HTML file (skip scraping)
  python3 sync_taishin_expense.py --html /path/to/statement.html

  # From URL (Playwright auto-login)
  python3 sync_taishin_expense.py --url "https://..."

  # Full auto: search Gmail for latest statement
  python3 sync_taishin_expense.py --auto
"""

import argparse
import base64
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# ==================== PATHS ====================

SCRIPT_DIR = Path(__file__).parent
RAYOS_DIR = SCRIPT_DIR.parent
DATA_DIR = RAYOS_DIR / 'data'
TRANSACTIONS_FILE = DATA_DIR / 'expense-transactions.json'
DATA_JS_FILE = RAYOS_DIR / 'js' / 'data.js'
ARCHIVE_DIR = RAYOS_DIR / 'archive' / 'expense-bills'
ENV_FILE = RAYOS_DIR / '.env'

# ==================== ENV ====================

def load_env():
    """Load .env file into os.environ."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ.setdefault(key.strip(), val.strip())

load_env()

# ==================== CLASSIFICATION (reuse from reparse_expense.py) ====================

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
    ],
    '保險': ['國泰人壽', '保險'],
    '健身': ['WORLDGY', 'WORLD GY', 'JETTS FITNESS', 'NU TRITION DEPOT'],
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
        'SALON',
    ],
    '娛樂': [
        '威秀影城', 'GOOGLE*YOUTUBE', 'GOOGLE *YOUTUBE', 'GOOGLE*TV', 'LINE STO',
        'DECATHLON', '迪卡儂', '大有運動',
    ],
}

SKIP_PATTERNS = ['CUBEAPP', 'RICHART', '上期帳單']
FOREIGN_FEE_PATTERNS = ['國外交易手續費', '國外交易服務費']


def normalize(text: str) -> str:
    """Full-width to half-width + uppercase."""
    return unicodedata.normalize('NFKC', text).upper().strip()


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


def should_skip(desc: str) -> bool:
    """Check if this row should be skipped."""
    norm = normalize(desc)
    return any(pat in norm for pat in SKIP_PATTERNS)


def roc_to_ad(roc_date: str) -> str:
    """Convert ROC date (115/03/17) to AD date (2026/03/17)."""
    parts = roc_date.strip().split('/')
    if len(parts) == 3:
        year = int(parts[0]) + 1911
        return f"{year}/{parts[1]}/{parts[2]}"
    return roc_date


# ==================== HTML PARSING ====================

def parse_taishin_html(html_content: str) -> list[dict]:
    """Parse Taishin credit card statement HTML (responsive div layout).

    Page structure:
      div.table → div.rows (header)
      div.table → div.rows (card section header, e.g. "Richart卡...")
      div.table → div.rows → span.cell × 8 (transaction data)

    Cell order in data rows:
      [0] desc  [1] date(ROC)  [2] amount(NTD)  [3] posting_date
      [4] fx_date  [5] location  [6] currency  [7] fx_amount
    """
    soup = BeautifulSoup(html_content, 'lxml')
    transactions = []

    # Find all div.table containers
    table_divs = soup.find_all('div', class_='table')

    for td in table_divs:
        rows = td.find_all('div', class_='rows')

        for row in rows:
            cells = row.find_all('span', class_='cell')

            # Skip non-data rows (headers, card section names, etc.)
            if len(cells) < 3:
                continue

            desc_text = cells[0].get_text(strip=True)
            date_text = cells[1].get_text(strip=True)
            amount_text = cells[2].get_text(strip=True)

            # Validate ROC date format (11x/MM/DD)
            if not re.match(r'\d{2,3}/\d{2}/\d{2}', date_text):
                continue

            # Parse amount (NTD)
            amount_clean = amount_text.replace(',', '').replace(' ', '').replace('−', '-').strip()
            try:
                amount = float(amount_clean)
            except ValueError:
                continue

            if amount == 0:
                continue

            # Normalize and classify
            norm_desc = normalize(desc_text)

            if should_skip(norm_desc):
                continue

            # Convert ROC → AD date
            ad_date = roc_to_ad(date_text)
            parts = ad_date.split('/')
            month_key = f"{parts[0]}/{parts[1]}"

            category = classify(desc_text)

            transactions.append({
                'date': ad_date,
                'desc': norm_desc,
                'amount': amount,
                'category': category,
                'month': month_key,
            })

    print(f"  Parsed {len(transactions)} transactions from HTML")
    return transactions


# ==================== PLAYWRIGHT SCRAPING ====================

def scrape_taishin_statement(url: str) -> str:
    """Use Playwright (real Chrome) to login and scrape the statement.

    Key: must use channel='chrome' — Taishin blocks Playwright's bundled Chromium.
    Captcha: screenshot the captcha image → Claude Vision API reads the 5 digits.
    Retry up to MAX_ATTEMPTS times if captcha OCR fails.
    """
    from playwright.sync_api import sync_playwright

    password = os.environ.get('TAISHIN_BILL_PASSWORD', '')
    if not password:
        print("ERROR: TAISHIN_BILL_PASSWORD not set in .env")
        sys.exit(1)

    anthropic_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not anthropic_key:
        print("ERROR: ANTHROPIC_API_KEY not set in .env")
        sys.exit(1)

    MAX_ATTEMPTS = 5
    import time

    with sync_playwright() as p:
        # Must use real Chrome — Taishin blocks Chromium
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 900},
            user_agent=(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/131.0.0.0 Safari/537.36'
            ),
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        page = context.new_page()

        for attempt in range(1, MAX_ATTEMPTS + 1):
            print(f"  Login attempt {attempt}/{MAX_ATTEMPTS}...")

            if attempt == 1:
                page.goto(url, wait_until='networkidle', timeout=30000)
            else:
                page.reload(wait_until='networkidle')
            time.sleep(2)

            # Screenshot captcha image element
            captcha_el = page.query_selector('img[src*="CaptchaImage"]')
            if not captcha_el:
                print("  ERROR: Captcha image not found")
                continue

            cap_path = f'/tmp/taishin_cap_{attempt}.png'
            captcha_el.screenshot(path=cap_path)
            captcha = read_captcha_vision(cap_path, anthropic_key)
            print(f"  Captcha: {captcha}")

            if len(captcha) != 5:
                print(f"  Bad captcha length ({len(captcha)}), retrying...")
                continue

            # Fill form and submit
            page.fill('#pdf_auto_no', password)
            page.fill('#txtVcode', captcha)
            time.sleep(0.3)
            page.click('#btnView')
            time.sleep(4)

            # Check result
            body_text = page.inner_text('body')
            if '認證失敗' in body_text:
                print("  認證失敗, retrying...")
                continue

            # Success
            print("  Login successful!")
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            time.sleep(1)

            page_html = page.content()

            # Archive the HTML
            save_path = ARCHIVE_DIR / f'taishin_web_{get_current_bill_month()}.html'
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_text(page_html, encoding='utf-8')
            print(f"  Archived HTML to {save_path}")

            browser.close()
            return page_html

        # All attempts failed
        print(f"  ERROR: Failed after {MAX_ATTEMPTS} attempts")
        browser.close()
        sys.exit(1)


def read_captcha_vision(screenshot_path: str, api_key: str) -> str:
    """Use Claude Vision API to read captcha from cropped image."""
    import anthropic

    with open(screenshot_path, 'rb') as f:
        img_data = base64.b64encode(f.read()).decode('utf-8')

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model='claude-haiku-4-5-20251001',
        max_tokens=50,
        messages=[{
            'role': 'user',
            'content': [
                {
                    'type': 'image',
                    'source': {
                        'type': 'base64',
                        'media_type': 'image/png',
                        'data': img_data,
                    },
                },
                {
                    'type': 'text',
                    'text': (
                        'Read the CAPTCHA digits in this image. '
                        'There are EXACTLY 5 digits. Return ONLY the 5 digits.'
                    ),
                },
            ],
        }],
    )

    digits = re.findall(r'\d', response.content[0].text.strip())
    return ''.join(digits[:5])


# ==================== DATA MERGE ====================

def load_existing_transactions() -> list[dict]:
    """Load existing transactions from JSON."""
    if TRANSACTIONS_FILE.exists():
        return json.loads(TRANSACTIONS_FILE.read_text(encoding='utf-8'))
    return []


def merge_transactions(existing: list[dict], new_txns: list[dict]) -> list[dict]:
    """Merge new transactions into existing, avoiding duplicates."""
    # Build a set of existing transaction keys for dedup
    existing_keys = set()
    for t in existing:
        key = f"{t['date']}|{t['desc']}|{t['amount']}"
        existing_keys.add(key)

    added = 0
    for t in new_txns:
        key = f"{t['date']}|{t['desc']}|{t['amount']}"
        if key not in existing_keys:
            existing.append(t)
            existing_keys.add(key)
            added += 1

    print(f"  Merged: {added} new transactions added ({len(new_txns)} total in batch)")

    # Sort by date
    existing.sort(key=lambda x: x['date'])
    return existing


def save_transactions(transactions: list[dict]):
    """Save transactions to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    TRANSACTIONS_FILE.write_text(
        json.dumps(transactions, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    print(f"  Saved {len(transactions)} transactions to {TRANSACTIONS_FILE}")


def regenerate_data_js(transactions: list[dict]):
    """Regenerate PRELOAD_EXPENSE_MONTHLY in data.js."""
    # Aggregate by month
    monthly = defaultdict(lambda: {'total': 0, 'count': 0, 'categories': defaultdict(int)})

    for txn in transactions:
        if txn['amount'] <= 0:
            continue
        m = monthly[txn['month']]
        m['total'] += txn['amount']
        m['count'] += 1
        m['categories'][txn['category']] += txn['amount']

    # Build JS string
    sorted_months = sorted(monthly.keys())
    lines = ['const PRELOAD_EXPENSE_MONTHLY = [']
    for month in sorted_months:
        m = monthly[month]
        cats = sorted(m['categories'].items(), key=lambda x: -x[1])
        cat_str = ', '.join(f"'{c}': {int(round(a))}" for c, a in cats)
        lines.append(
            f"    {{ month: '{month}', total: {int(round(m['total']))}, "
            f"count: {m['count']}, categories: {{ {cat_str} }} }},"
        )
    lines.append('];')
    new_block = '\n'.join(lines)

    # Replace in data.js
    content = DATA_JS_FILE.read_text(encoding='utf-8')

    # Find and replace the PRELOAD_EXPENSE_MONTHLY block
    pattern = r'const PRELOAD_EXPENSE_MONTHLY = \[.*?\];'
    if re.search(pattern, content, re.DOTALL):
        content = re.sub(pattern, new_block, content, flags=re.DOTALL)
    else:
        # Append if not found
        content += '\n\n' + new_block + '\n'

    DATA_JS_FILE.write_text(content, encoding='utf-8')
    print(f"  Updated PRELOAD_EXPENSE_MONTHLY in {DATA_JS_FILE}")

    # Print summary
    print("\n  Monthly Summary:")
    for month in sorted_months:
        m = monthly[month]
        print(f"    {month}: NT${m['total']:,.0f} ({m['count']} txns)")


# ==================== TELEGRAM ====================

def send_telegram(message: str):
    """Send Telegram notification."""
    bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = os.environ.get('TELEGRAM_CHAT_ID', '')

    if not bot_token or not chat_id:
        print("  TG notification skipped (no token/chat_id)")
        return

    url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
    resp = requests.post(url, data={
        'chat_id': chat_id,
        'parse_mode': 'Markdown',
        'text': message,
    })

    if resp.ok:
        print("  TG notification sent")
    else:
        print(f"  TG notification failed: {resp.text}")


# ==================== HELPERS ====================

def get_current_bill_month() -> str:
    """Get current bill month string (e.g., '202604')."""
    from datetime import datetime
    now = datetime.now()
    return now.strftime('%Y%m')


def build_summary(new_txns: list[dict]) -> str:
    """Build a summary message for TG notification."""
    if not new_txns:
        return "台新帳單同步完成，但沒有新交易。"

    total = sum(t['amount'] for t in new_txns if t['amount'] > 0)
    count = len([t for t in new_txns if t['amount'] > 0])
    months = set(t['month'] for t in new_txns)

    # Top categories
    cat_totals = defaultdict(float)
    for t in new_txns:
        if t['amount'] > 0:
            cat_totals[t['category']] += t['amount']
    top_cats = sorted(cat_totals.items(), key=lambda x: -x[1])[:5]
    cat_lines = '\n'.join(f"  {c}: NT${int(a):,}" for c, a in top_cats)

    return (
        f"💳 *台新帳單同步完成*\n\n"
        f"月份: {', '.join(sorted(months))}\n"
        f"筆數: {count} 筆\n"
        f"總額: NT${int(total):,}\n\n"
        f"*Top 5 分類:*\n{cat_lines}"
    )


# ==================== MAIN ====================

def main():
    parser = argparse.ArgumentParser(description='Sync Taishin credit card statement')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--html', type=str, help='Path to saved statement HTML file')
    group.add_argument('--url', type=str, help='Statement URL (will use Playwright)')
    group.add_argument('--auto', action='store_true', help='Auto-detect from Gmail')
    args = parser.parse_args()

    print("=" * 60)
    print("Taishin Credit Card Statement Sync")
    print("=" * 60)

    # Step 1: Get HTML content
    if args.html:
        print(f"\n[1/4] Reading HTML from file: {args.html}")
        html_content = Path(args.html).read_text(encoding='utf-8')

    elif args.url:
        print(f"\n[1/4] Scraping statement from URL...")
        html_content = scrape_taishin_statement(args.url)

    elif args.auto:
        print("\n[1/4] Auto mode: searching Gmail for latest statement...")
        print("  ERROR: Auto Gmail search requires running within Claude Code.")
        print("  Use --url with the statement link instead.")
        sys.exit(1)

    # Step 2: Parse transactions
    print("\n[2/4] Parsing transaction table...")
    new_txns = parse_taishin_html(html_content)

    if not new_txns:
        print("  No transactions found in HTML!")
        print("  This might mean the HTML structure has changed.")
        print("  Check the HTML file manually.")
        sys.exit(1)

    # Filter positive amounts only for reporting
    positive_txns = [t for t in new_txns if t['amount'] > 0]
    negative_txns = [t for t in new_txns if t['amount'] < 0]
    print(f"  Positive: {len(positive_txns)}, Negative/refund: {len(negative_txns)}")

    # Step 3: Merge with existing data
    print("\n[3/4] Merging with existing transactions...")
    existing = load_existing_transactions()
    print(f"  Existing: {len(existing)} transactions")

    merged = merge_transactions(existing, new_txns)
    save_transactions(merged)

    # Regenerate data.js
    # Only use positive amounts for the monthly aggregate
    positive_merged = [t for t in merged if t['amount'] > 0]
    regenerate_data_js(positive_merged)

    # Step 4: Notify
    print("\n[4/4] Sending notification...")
    summary = build_summary(new_txns)
    print(f"\n{summary}")
    send_telegram(summary)

    print("\n" + "=" * 60)
    print("Done! Remember to: cd Project_RayOS && git add -A && git commit && git push")
    print("=" * 60)


if __name__ == '__main__':
    main()
