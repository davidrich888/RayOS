#!/usr/bin/env python3
"""Clear a label's reload history so the watchdog can retry within 24h.

Usage: python3 scripts/clear_reload_history.py com.aios.skool-tft
"""
import json
import sys
from pathlib import Path

HISTORY = Path.home() / '.rayos' / 'reload_history.json'


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: clear_reload_history.py <launchd-label>', file=sys.stderr)
        return 2
    label = sys.argv[1]
    if not HISTORY.exists():
        print(f'No history file at {HISTORY} — nothing to clear.')
        return 0
    data = json.loads(HISTORY.read_text())
    if label not in data:
        print(f'{label} not in history — nothing to clear.')
        return 0
    del data[label]
    HISTORY.write_text(json.dumps(data, indent=2))
    print(f'已清除 {label} 的 reload history。下次 watchdog 跑時會重新嘗試 reload。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
