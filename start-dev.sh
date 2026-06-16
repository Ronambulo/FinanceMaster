#!/usr/bin/env bash
# FinanceMaster — Dev launcher
# Uso: ./start-dev.sh
# Logs: /tmp/fm_backend.log  /tmp/fm_frontend.log

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Matar procesos anteriores si los hay
pkill -f "uvicorn backend.main:app" 2>/dev/null
pkill -f "vite.*FinanceMaster" 2>/dev/null
sleep 1

# Backend
cd "$ROOT"
nohup uvicorn backend.main:app --host 0.0.0.0 --port 8000 > /tmp/fm_backend.log 2>&1 &
BACK_PID=$!
echo "Backend PID $BACK_PID → http://localhost:8000"

# Frontend
cd "$ROOT/frontend"
nohup npm run dev -- --host > /tmp/fm_frontend.log 2>&1 &
FRONT_PID=$!
echo "Frontend PID $FRONT_PID → http://localhost:5173"

echo ""
echo "Logs: tail -f /tmp/fm_backend.log"
echo "      tail -f /tmp/fm_frontend.log"
