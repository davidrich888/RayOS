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


def test_save_history_uses_atomic_replace(tmp_path):
    """Atomic write: should go through os.replace() so a mid-write crash
    cannot corrupt history.json and silently disable the anti-loop guard."""
    marker = tmp_path / 'stale.log'
    _touch(marker, age_hours=72)
    config = _make_yaml_config([{
        'label': 'com.test.atomic',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'

    with patch('bridge_server.watchdog_launchd.os.replace') as mock_replace:
        check_launchd_tasks(config, history_path, dry_run=True)
        assert mock_replace.called, '_save_history should atomically replace via os.replace'


def test_reload_ceiling_blocks_excess_reloads(tmp_path):
    """Circuit breaker: with ceiling=2, first 2 stale tasks attempt reload,
    rest are returned as severity=manual with 'reload ceiling' in detail.
    Protects against mass-reload events when a marker-detection bug misfires."""
    plist = tmp_path / 'fake.plist'
    plist.write_text('')
    tasks = []
    for i in range(5):
        marker = tmp_path / f'stale_{i}.log'
        _touch(marker, age_hours=72)
        tasks.append({
            'label': f'com.test.ceil_{i}',
            'plist': str(plist),
            'expected_interval_hours': 24,
            'marker_path': str(marker),
            'priority': 'A',
        })
    config = _make_yaml_config(tasks)
    history_path = tmp_path / 'history.json'

    def fake_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stderr = b''
        return result  # don't touch markers → reloads marked 'manual', not 'recovered'

    with patch('bridge_server.watchdog_launchd.subprocess.run', side_effect=fake_run), \
         patch('bridge_server.watchdog_launchd.time.sleep'):
        alerts = check_launchd_tasks(config, history_path, dry_run=False,
                                     verify_wait_s=0, reload_ceiling=2)

    assert len(alerts) == 5
    ceiling_blocked = [a for a in alerts if 'ceiling' in a['detail']]
    assert len(ceiling_blocked) == 3
    for a in ceiling_blocked:
        assert a['severity'] == 'manual'


def test_empty_primary_falls_back_to_err(tmp_path):
    """Python logging writes to stderr by default — .log stays empty while
    .err has real activity. Watchdog should treat .err mtime as evidence."""
    marker = tmp_path / 'task.log'
    marker.write_text('')  # empty, like real launchd StandardOutPath when script logs via stderr
    old = time.time() - 100 * 3600
    os.utime(marker, (old, old))

    err = tmp_path / 'task.err'
    err.write_text('INFO real log lines')
    fresh = time.time() - 2 * 3600
    os.utime(err, (fresh, fresh))

    config = _make_yaml_config([{
        'label': 'com.test.stderr-only',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    alerts = check_launchd_tasks(config, history_path, dry_run=True)
    # .err is fresh → task is not stale. A 'config' alert is expected separately
    # (the marker_path points at the dead .log) but does not gate health.
    assert [a for a in alerts if a['severity'] in ('recovered', 'manual')] == []


def test_empty_primary_falls_back_to_error_log_suffix(tmp_path):
    """Some plists use .error.log (not .err) for StandardErrorPath."""
    marker = tmp_path / 'task.log'
    marker.write_text('')
    old = time.time() - 100 * 3600
    os.utime(marker, (old, old))

    err = tmp_path / 'task.error.log'
    err.write_text('INFO real log lines')
    fresh = time.time() - 2 * 3600
    os.utime(err, (fresh, fresh))

    config = _make_yaml_config([{
        'label': 'com.test.error-log-suffix',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    alerts = check_launchd_tasks(config, history_path, dry_run=True)
    assert [a for a in alerts if a['severity'] in ('recovered', 'manual')] == []


def test_dead_marker_detection_emits_config_alert(tmp_path):
    """Primary .log is empty + .err has fresh data → severity='config' alert
    surfaces the marker_path typo without blocking the healthy run."""
    marker = tmp_path / 'task.log'
    marker.write_text('')  # size=0 like real launchd StandardOutPath with stderr-only script
    old = time.time() - 100 * 3600
    os.utime(marker, (old, old))

    err = tmp_path / 'task.err'
    err.write_text('INFO real activity')
    fresh = time.time() - 2 * 3600
    os.utime(err, (fresh, fresh))

    config = _make_yaml_config([{
        'label': 'com.test.dead-marker',
        'plist': str(tmp_path / 'fake.plist'),
        'expected_interval_hours': 24,
        'marker_path': str(marker),
        'priority': 'A',
    }])
    history_path = tmp_path / 'history.json'
    alerts = check_launchd_tasks(config, history_path, dry_run=True)

    config_alerts = [a for a in alerts if a['severity'] == 'config']
    assert len(config_alerts) == 1
    assert config_alerts[0]['label'] == 'com.test.dead-marker'
    assert '.err' in config_alerts[0]['detail']
    # No stale/recovered alerts — fallback kept the task healthy
    assert [a for a in alerts if a['severity'] in ('recovered', 'manual')] == []


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
