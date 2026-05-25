"""Block B — launchd daily task mtime check + auto launchctl reload."""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any


def _load_history(history_path: Path) -> dict[str, float]:
    """Read reload history. Returns {} on missing/corrupt file."""
    try:
        return json.loads(history_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_history(history_path: Path, history: dict[str, float]) -> None:
    history_path.parent.mkdir(parents=True, exist_ok=True)
    history_path.write_text(json.dumps(history, indent=2))


def _marker_mtime(marker_path: str) -> float | None:
    """Return mtime in epoch seconds, or None if no evidence found.

    Falls back to .err / .error.log siblings when primary marker is empty.
    Reason: Python's logging module writes to stderr by default, so launchd-
    spawned scripts often leave StandardOutPath (`.log`, size=0, mtime frozen
    at first redirect) untouched while all activity lands in StandardErrorPath.
    """
    candidates: list[float] = []
    try:
        if os.path.getsize(marker_path) > 0:
            candidates.append(os.path.getmtime(marker_path))
    except FileNotFoundError:
        pass

    primary = Path(marker_path)
    for sibling in (primary.with_suffix('.err'), primary.with_suffix('.error.log')):
        try:
            if os.path.getsize(sibling) > 0:
                candidates.append(os.path.getmtime(sibling))
        except FileNotFoundError:
            pass

    return max(candidates) if candidates else None


def _reload_launchd(label: str, plist: str) -> tuple[bool, str]:
    """bootout + bootstrap + kickstart. Returns (success, detail)."""
    uid = os.getuid()
    domain = f'gui/{uid}'
    try:
        subprocess.run(['launchctl', 'bootout', f'{domain}/{label}'],
                       capture_output=True, timeout=5)
        # bootout exit code 可以非 0（task 沒 load 時），不算錯
        boot = subprocess.run(['launchctl', 'bootstrap', domain, plist],
                              capture_output=True, timeout=5)
        if boot.returncode != 0:
            return False, f'bootstrap failed: rc={boot.returncode} {boot.stderr.decode()[:200]}'
        subprocess.run(['launchctl', 'kickstart', '-k', f'{domain}/{label}'],
                       capture_output=True, timeout=5)
        return True, 'bootstrap+kickstart OK'
    except subprocess.TimeoutExpired:
        return False, 'launchctl command timeout'


def check_launchd_tasks(config: dict[str, Any], history_path: Path,
                        dry_run: bool = False, verify_wait_s: int = 10) -> list[dict[str, Any]]:
    """For each task, check marker mtime, reload if stale, return alerts.

    Alert dict shape:
        {'label': str, 'severity': 'recovered'|'manual',
         'hours_late': float, 'detail': str}

    dry_run=True: 不真的呼叫 launchctl，只回 alert "would reload"（用於測試）.
    Note: dry_run alerts use severity='recovered' to mean "would recover" — callers
    counting successes must distinguish via the detail string '[dry-run]' prefix.
    """
    now = time.time()
    history = _load_history(history_path)
    alerts: list[dict[str, Any]] = []

    for task in config['tasks']:
        label = task['label']
        marker = task['marker_path']
        interval_h = task['expected_interval_hours']
        threshold_s = interval_h * 2 * 3600

        mtime = _marker_mtime(marker)
        age_s = (now - mtime) if mtime is not None else float('inf')

        if mtime is not None and age_s < threshold_s:
            continue  # healthy

        hours_late = age_s / 3600 if mtime else float('inf')

        # 反死循環：24h 內已 reload 過？
        last_reload = history.get(label, 0)
        if last_reload and (now - last_reload) < 24 * 3600:
            alerts.append({
                'label': label,
                'severity': 'manual',
                'hours_late': hours_late,
                'detail': '24h 內已 reload 過，仍未恢復。可能：TCC / plist 損壞 / 腳本錯誤',
            })
            continue

        if dry_run:
            alerts.append({'label': label, 'severity': 'recovered',
                           'hours_late': hours_late, 'detail': '[dry-run] would reload'})
            continue

        ok, detail = _reload_launchd(label, task['plist'])
        history[label] = now
        if ok:
            time.sleep(verify_wait_s)
            new_mtime = _marker_mtime(marker)
            if new_mtime and new_mtime > (mtime or 0):
                alerts.append({'label': label, 'severity': 'recovered',
                               'hours_late': hours_late, 'detail': 'reload + marker updated'})
            else:
                alerts.append({'label': label, 'severity': 'manual',
                               'hours_late': hours_late,
                               'detail': f'reload sent but marker not updated within {verify_wait_s}s'})
        else:
            alerts.append({'label': label, 'severity': 'manual',
                           'hours_late': hours_late, 'detail': detail})

    _save_history(history_path, history)
    return alerts
