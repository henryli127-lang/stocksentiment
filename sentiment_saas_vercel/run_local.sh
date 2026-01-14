#!/bin/bash

echo "Starting Sentiment SaaS locally..."

# Check if .env.local exists, if not warn
if [ ! -f .env.local ]; then
    echo "WARNING: .env.local not found! Please copy env_template to .env.local and fill in your keys."
    exit 1
fi

# Setup Python Virtual Environment (Best Practice)
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install Python deps
echo "Installing Python dependencies..."
pip install -r api/requirements.txt

# Start Backend in background
echo "Starting Backend (Port 8000)..."
# We run as a module to ensure we use the venv's python
python3 -m uvicorn api.index:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# Start Frontend
echo "Starting Frontend..."
npm run dev

# Cleanup on exit
# We trap the EXIT signal to ensure we kill the backend even if frontend crashes
trap "kill $BACKEND_PID" EXIT
