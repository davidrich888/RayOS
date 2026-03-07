#!/bin/bash
# RayOS Bridge Server - One-click start script
# Run: bash ~/Downloads/Projects/Project_RayOS/bridge-server/start.sh

cd ~/Downloads/Projects/Project_RayOS

# Kill any existing bridge server
echo "[1/4] Killing old processes..."
pkill -f "node.*server.js" 2>/dev/null
sleep 1

# Pull latest code
echo "[2/4] Pulling latest code..."
git pull

# Setup .env if missing
cd bridge-server
if [ ! -f .env ]; then
    echo "[3/4] Creating .env..."
    echo "AUTH_TOKEN=rayos2026bridge" > .env
    echo "PORT=3000" >> .env
    echo "CLAUDE_CWD=/Users/jarvis/Downloads/Projects" >> .env
else
    echo "[3/4] .env exists, skipping..."
fi

# Install deps if needed
if [ ! -d node_modules ]; then
    echo "[3.5/4] Installing dependencies..."
    npm install
fi

# Start server
echo "[4/4] Starting bridge server..."
echo ""
unset CLAUDECODE
node server.js
