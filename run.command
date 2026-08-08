#!/bin/bash
cd "$(dirname "$0")"
echo "=== Startup Script ==="
echo ""
echo "Checking dependencies..."
npm install
echo ""
echo "Starting server in development mode..."
npm run dev
