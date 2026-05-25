import json
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import patch, MagicMock

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


def test_real_reload_success_updates_marker(tmp_path):
    """模擬 launchctl reload 後 marker mtime 更新 → severity=recovered"""
    marker = tmp_path / 'recover.log'
    _touch(marker, age_hours=72)
    plist = tmp_path / 'fake.plist'
    plist.write_text('')

    config = _make_yaml_config([{
        'label': 'com.test.recover',
        'plist': str(plist),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'

    def fake_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stderr = b''
        # 在 bootstrap 那一步「真的」把 marker mtime 更新成現在
        if cmd[1] == 'bootstrap':
            marker.touch()
        return result

    with patch('bridge_server.watchdog_launchd.subprocess.run', side_effect=fake_run), \
         patch('bridge_server.watchdog_launchd.time.sleep'):  # 跳過 10s 等待
        alerts = check_launchd_tasks(config, history_path, dry_run=False, verify_wait_s=0)

    assert len(alerts) == 1
    assert alerts[0]['severity'] == 'recovered'
    assert 'marker updated' in alerts[0]['detail']


def test_real_reload_marker_not_updated(tmp_path):
    """launchctl 跑了但 marker 沒更新 → severity=manual"""
    marker = tmp_path / 'fail.log'
    _touch(marker, age_hours=72)
    original_mtime = marker.stat().st_mtime
    plist = tmp_path / 'fake.plist'
    plist.write_text('')

    config = _make_yaml_config([{
        'label': 'com.test.fail',
        'plist': str(plist),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'

    def fake_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stderr = b''
        return result  # 不碰 marker

    with patch('bridge_server.watchdog_launchd.subprocess.run', side_effect=fake_run), \
         patch('bridge_server.watchdog_launchd.time.sleep'):
        alerts = check_launchd_tasks(config, history_path, dry_run=False, verify_wait_s=0)

    assert len(alerts) == 1
    assert alerts[0]['severity'] == 'manual'
    assert 'not updated' in alerts[0]['detail']


def test_bootstrap_failure(tmp_path):
    """launchctl bootstrap exit 非 0 → severity=manual"""
    marker = tmp_path / 'fail.log'
    _touch(marker, age_hours=72)
    plist = tmp_path / 'fake.plist'
    plist.write_text('')

    config = _make_yaml_config([{
        'label': 'com.test.crash',
        'plist': str(plist),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'

    def fake_run(cmd, **kwargs):
        result = MagicMock()
        if cmd[1] == 'bootstrap':
            result.returncode = 5
            result.stderr = b'permission denied'
        else:
            result.returncode = 0
            result.stderr = b''
        return result

    with patch('bridge_server.watchdog_launchd.subprocess.run', side_effect=fake_run), \
         patch('bridge_server.watchdog_launchd.time.sleep'):
        alerts = check_launchd_tasks(config, history_path, dry_run=False, verify_wait_s=0)

    assert len(alerts) == 1
    assert alerts[0]['severity'] == 'manual'
    assert 'bootstrap failed' in alerts[0]['detail']
