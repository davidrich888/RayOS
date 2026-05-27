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
    """Atomic write: write to .tmp then os.replace().

    A mid-write crash would otherwise corrupt history.json and silently
    disable the 24h anti-loop guard on the next run.
    """
    history_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = history_path.with_suffix(history_path.suffix + '.tmp')
    tmp.write_text(json.dumps(history, indent=2))
    os.replace(tmp, history_path)


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


def _detect_dead_markers(config: dict[str, Any]) -> list[dict[str, Any]]:
    """Return severity='config' alerts for tasks whose marker_path is dead.

    Dead marker = primary file exists with size=0 while a sibling (.err /
    .error.log) holds fresh data ≥24h newer. Caused by Python's logging
    writing to stderr while plist's StandardOutPath (.log) stays empty —
    the marker is technically there but never updates, defeating the
    staleness check.

    These do not block the main run (the _marker_mtime fallback already
    keeps detection accurate); they surface config drift to Telegram so
    the marker_path can be corrected before the next ambiguity bites.
    """
    alerts: list[dict[str, Any]] = []
    for task in config['tasks']:
        marker = task['marker_path']
        primary = Path(marker)
        try:
            psize = os.path.getsize(marker)
            pmtime = os.path.getmtime(marker)
        except FileNotFoundError:
            continue
        if psize > 0:
            continue
        for suffix in ('.err', '.error.log'):
            sibling = primary.with_suffix(suffix)
            try:
                if os.path.getsize(sibling) > 0 and os.path.getmtime(sibling) > pmtime + 24 * 3600:
                    alerts.append({
                        'label': task['label'],
                        'severity': 'config',
                        'hours_late': 0.0,
                        'detail': f"marker_path '{primary.name}' is empty; '{sibling.name}' has fresh data — update config to use the .err sibling",
                    })
                    break
            except FileNotFoundError:
                continue
    return alerts


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
                        dry_run: bool = False, verify_wait_s: int = 10,
                        reload_ceiling: int = 5) -> list[dict[str, Any]]:
    """For each task, check marker mtime, reload if stale, return alerts.

    Alert dict shape:
        {'label': str, 'severity': 'recovered'|'manual',
         'hours_late': float, 'detail': str}

    dry_run=True: 不真的呼叫 launchctl，只回 alert "would reload"（用於測試）.
    Note: dry_run alerts use severity='recovered' to mean "would recover" — callers
    counting successes must distinguish via the detail string '[dry-run]' prefix.

    reload_ceiling: circuit breaker. Once this many reloads have been attempted
    in one invocation, remaining stale tasks are returned as severity='manual'
    with 'reload ceiling reached' in detail — protects against a marker-detection
    bug from triggering a mass reload event.
    """
    now = time.time()
    history = _load_history(history_path)
    alerts: list[dict[str, Any]] = list(_detect_dead_markers(config))
    reloads_attempted = 0

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

        # Circuit breaker: don't mass-reload if many tasks went stale at once.
        if reloads_attempted >= reload_ceiling:
            alerts.append({
                'label': label,
                'severity': 'manual',
                'hours_late': hours_late,
                'detail': f'reload ceiling reached ({reload_ceiling}), skipped — likely watchdog misfire, investigate',
            })
            continue

        ok, detail = _reload_launchd(label, task['plist'])
        reloads_attempted += 1
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
