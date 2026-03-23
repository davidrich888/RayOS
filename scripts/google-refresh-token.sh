#!/bin/bash
# Google OAuth2 Refresh Token Generator
# Usage: bash scripts/google-refresh-token.sh
#
# Prerequisites:
# 1. Go to https://console.cloud.google.com/apis/credentials
# 2. Find your OAuth 2.0 Client ID (same one used for Drive upload)
# 3. Copy the Client ID and Client Secret
#
# IMPORTANT: If your Google Cloud project is in "Testing" mode,
# refresh tokens expire every 7 days. To fix permanently:
# → Google Cloud Console → APIs & Services → OAuth consent screen
# → Click "PUBLISH APP" to move to Production
# (Internal apps don't need Google review)

echo "=== Google OAuth2 Refresh Token Generator ==="
echo ""

# Read credentials
read -p "Client ID: " CLIENT_ID
read -p "Client Secret: " CLIENT_SECRET

# Scope for Google Drive
SCOPE="https://www.googleapis.com/auth/drive.file"
REDIRECT_URI="urn:ietf:wg:oauth:2.0:oob"

# Step 1: Generate auth URL
AUTH_URL="https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPE}&access_type=offline&prompt=consent"

echo ""
echo "1. Open this URL in your browser:"
echo ""
echo "$AUTH_URL"
echo ""
echo "2. Sign in and authorize the app"
echo "3. Copy the authorization code"
echo ""
read -p "Paste the authorization code here: " AUTH_CODE

# Step 2: Exchange code for tokens
echo ""
echo "Exchanging code for tokens..."

RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "code=${AUTH_CODE}" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=${REDIRECT_URI}")

# Extract refresh token
REFRESH_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)

if [ -z "$REFRESH_TOKEN" ]; then
  echo "❌ Failed to get refresh token. Response:"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "✅ Success! Your new refresh token:"
echo ""
echo "$REFRESH_TOKEN"
echo ""
echo "Next steps:"
echo "1. Go to Vercel Dashboard → Project RayOS → Settings → Environment Variables"
echo "2. Update GOOGLE_REFRESH_TOKEN with the value above"
echo "3. Redeploy (or wait for next push)"
echo ""
echo "⚠️  Also check: Google Cloud Console → OAuth consent screen"
echo "   If status is 'Testing', click 'PUBLISH APP' to prevent token expiry"
