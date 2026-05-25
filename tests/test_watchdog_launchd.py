import json
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from bridge_server.watchdog_launchd import check_launchd_tasks


def _make_yaml_config(tasks):
    """Build a dict matching launchd_tasks.yaml schema."""
    return {'tasks': tasks}


def _touch(path: Path, age_hours: float):
    """Create file with mtime = now - age_hours."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('test')
    target = time.time() - age_hours * 3600
    os.utime(path, (target, target))


def test_fresh_mtime_no_alert(tmp_path):
    marker = tmp_path / 'fresh.log'
    _touch(marker, age_hours=2)  # 2 hours old, well within 24h*2=48h threshold
    config = _make_yaml_config([{
        'label': 'com.test.fresh',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    results = check_launchd_tasks(config, history_path, dry_run=True)
    assert results == []  # 沒事不回 alert


def test_stale_mtime_dry_run_returns_recovered(tmp_path):
    marker = tmp_path / 'stale.log'
    _touch(marker, age_hours=72)  # 3 days old, exceeds 48h threshold
    config = _make_yaml_config([{
        'label': 'com.test.stale',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    alerts = check_launchd_tasks(config, history_path, dry_run=True)
    assert len(alerts) == 1
    assert alerts[0]['label'] == 'com.test.stale'
    assert alerts[0]['severity'] == 'recovered'
    assert alerts[0]['hours_late'] >= 48


def test_missing_marker_treated_as_stale(tmp_path):
    config = _make_yaml_config([{
        'label': 'com.test.missing',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(tmp_path / 'no_such_file.log'),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    alerts = check_launchd_tasks(config, history_path, dry_run=True)
    assert len(alerts) == 1
    assert alerts[0]['severity'] == 'recovered'


def test_recent_reload_blocks_second_attempt(tmp_path):
    """反死循環：history 內 < 24h 的 entry → manual severity"""
    marker = tmp_path / 'stale.log'
    _touch(marker, age_hours=72)
    config = _make_yaml_config([{
        'label': 'com.test.dead',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    # Pre-fill history with reload 2h ago
    history_path.write_text(json.dumps({'com.test.dead': time.time() - 2 * 3600}))

    alerts = check_launchd_tasks(config, history_path, dry_run=True)
    assert len(alerts) == 1
    assert alerts[0]['severity'] == 'manual'
    assert '24h' in alerts[0]['detail']
