from unittest.mock import patch
from bridge_server.watchdog_n8n import check_n8n_critical


def _mock_api(executions_by_workflow):
    """Return a fake _fetch_executions that looks up by workflow_id."""
    def fake(workflow_id, api_key, base_url, limit=3):
        return executions_by_workflow.get(workflow_id, [])
    return fake


CONFIG = {
    'n8n_base_url': 'https://example.com',
    'critical_workflows': [
        {'id': 'wf1', 'name': 'Voice Review A'},
    ],
}


def test_zero_executions_returns_no_alerts():
    with patch('bridge_server.watchdog_n8n._fetch_executions', _mock_api({'wf1': []})):
        alerts = check_n8n_critical(CONFIG, api_key='fake')
    assert alerts == []


def test_single_error_does_not_alert():
    """單筆 error 視為 blip，不報"""
    execs = [{'id': 'e1', 'status': 'error', 'startedAt': '2026-05-25T01:00:00Z'}]
    with patch('bridge_server.watchdog_n8n._fetch_executions', _mock_api({'wf1': execs})):
        alerts = check_n8n_critical(CONFIG, api_key='fake')
    assert alerts == []


def test_two_consecutive_errors_alert():
    """最近 2 筆都 error → alert"""
    execs = [
        {'id': 'e2', 'status': 'error', 'startedAt': '2026-05-25T02:00:00Z'},
        {'id': 'e1', 'status': 'error', 'startedAt': '2026-05-25T01:00:00Z'},
    ]
    with patch('bridge_server.watchdog_n8n._fetch_executions', _mock_api({'wf1': execs})):
        alerts = check_n8n_critical(CONFIG, api_key='fake')
    assert len(alerts) == 1
    assert alerts[0]['workflow_name'] == 'Voice Review A'
    assert 'e2' in alerts[0]['url']


def test_recent_success_clears_alert():
    """最新一筆 success，即使前一筆 error → 不報"""
    execs = [
        {'id': 'e2', 'status': 'success', 'startedAt': '2026-05-25T02:00:00Z'},
        {'id': 'e1', 'status': 'error', 'startedAt': '2026-05-25T01:00:00Z'},
    ]
    with patch('bridge_server.watchdog_n8n._fetch_executions', _mock_api({'wf1': execs})):
        alerts = check_n8n_critical(CONFIG, api_key='fake')
    assert alerts == []


def test_api_error_returns_empty():
    """API 自己掛 → _fetch_executions 回 [] → 視為 0 筆，不報"""
    with patch('bridge_server.watchdog_n8n._fetch_executions', _mock_api({})):
        alerts = check_n8n_critical(CONFIG, api_key='fake')
    assert alerts == []
