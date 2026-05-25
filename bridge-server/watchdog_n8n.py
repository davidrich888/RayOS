"""Block A — N8N critical workflow execution check.

回傳 alerts list（不直接送 TG，由 health_check.py main() 統一發訊）。
"""
from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error
import ssl
from typing import Any


def _fetch_executions(workflow_id: str, api_key: str, base_url: str, limit: int = 3) -> list[dict[str, Any]]:
    """GET {base_url}/api/v1/executions?workflowId=X&limit=N. Returns [] on error."""
    url = f"{base_url}/api/v1/executions?workflowId={workflow_id}&limit={limit}"
    req = urllib.request.Request(url, headers={'X-N8N-API-KEY': api_key})
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('data', [])
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as e:
        print(f'[watchdog_n8n] _fetch_executions failed for {workflow_id}: {e}', file=sys.stderr)
        return []


def check_n8n_critical(config: dict[str, Any], api_key: str) -> list[dict[str, Any]]:
    """For each critical workflow, fetch recent executions and decide alert.

    Returns list of alerts: [{'workflow_name': ..., 'last_two_failed_at': [...], 'url': ...}]
    Empty list = all healthy / no data.
    """
    alerts: list[dict[str, Any]] = []
    base_url = config['n8n_base_url']
    for wf in config['critical_workflows']:
        executions = _fetch_executions(wf['id'], api_key, base_url, limit=3)
        if len(executions) == 0:
            continue  # idle workflow — don't false-positive
        if len(executions) == 1:
            continue  # single failure may be blip — wait for next round
        # executions 倒序：[0]=最新, [1]=次新
        if executions[0].get('status') == 'error' and executions[1].get('status') == 'error':
            alerts.append({
                'workflow_name': wf['name'],
                'last_two_failed_at': [executions[0].get('startedAt'), executions[1].get('startedAt')],
                'url': f"{base_url}/workflow/{wf['id']}/executions/{executions[0].get('id')}",
            })
    return alerts
