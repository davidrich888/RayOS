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
