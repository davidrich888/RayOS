#!/bin/bash
# Start Cloudflare Quick Tunnel for bridge server
# Captures the random URL and updates N8N workflow automatically

LOG="/tmp/cloudflare-tunnel.log"
N8N_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMzE1OWNjZC01NDcyLTQyZTUtOGUwMy0zMGUyNTVlMjE0MWQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzcwOTAyNDE3fQ.00291E8JEI0bcmFaKCzYVA0rmGkAkGHVrcLi5p_vxng"
N8N_BASE="https://david86726.app.n8n.cloud/api/v1"
WORKFLOW_ID="JIQEHaoB7XSz2EKuMEexy"
BRIDGE_TOKEN="rayos2026bridge"

# Kill any existing tunnel
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

# Start tunnel in background
/opt/homebrew/bin/cloudflared tunnel --url http://localhost:3001 > "$LOG" 2>&1 &
TUNNEL_PID=$!
echo "[tunnel] Started cloudflared (PID: $TUNNEL_PID)"

# Wait for URL to appear in log
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[tunnel] ERROR: Could not get tunnel URL after 30s"
  exit 1
fi

echo "[tunnel] URL: $TUNNEL_URL"

# Test the tunnel
HEALTH=$(curl -s --max-time 5 "$TUNNEL_URL/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "[tunnel] Health check passed"
else
  echo "[tunnel] WARNING: Health check failed, continuing anyway..."
fi

# Update N8N workflow
echo "[tunnel] Updating N8N workflow..."

# Download current workflow
curl -s "$N8N_BASE/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > /tmp/n8n_wf_current.json

# Update URL in the subtitle node
python3 << PYEOF
import json, re

with open('/tmp/n8n_wf_current.json', 'r') as f:
    wf = json.load(f)

updated = False
for node in wf['nodes']:
    if node['name'] == '抓字幕':
        old_url = node['parameters']['url']
        # Replace any previous tunnel URL or Tailscale IP
        new_url = re.sub(
            r'https?://[a-z0-9.-]+\.trycloudflare\.com|http://100\.86\.95\.10:3000',
            '${TUNNEL_URL}',
            old_url
        )
        node['parameters']['url'] = new_url
        updated = True
        print(f'[tunnel] Node URL updated to: {new_url[:80]}...')
        break

if not updated:
    print('[tunnel] WARNING: Could not find 抓字幕 node')
    exit(1)

payload = {
    'name': wf['name'],
    'nodes': wf['nodes'],
    'connections': wf['connections'],
    'settings': wf.get('settings', {})
}

with open('/tmp/n8n_wf_payload.json', 'w') as f:
    json.dump(payload, f)
PYEOF

if [ $? -ne 0 ]; then
  echo "[tunnel] ERROR: Failed to update workflow JSON"
  exit 1
fi

# Push to N8N
RESULT=$(curl -s -X PUT "$N8N_BASE/workflows/$WORKFLOW_ID" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/n8n_wf_payload.json)

if echo "$RESULT" | grep -q '"抓字幕"'; then
  echo "[tunnel] ✅ N8N workflow updated successfully"
else
  echo "[tunnel] ERROR: N8N update failed"
  echo "$RESULT" | head -5
fi

# Save current URL for reference
echo "$TUNNEL_URL" > /tmp/bridge-tunnel-url.txt
echo "[tunnel] Done. Tunnel PID: $TUNNEL_PID, URL saved to /tmp/bridge-tunnel-url.txt"
