#!/bin/bash

# Kill any existing processes on ports 3006 and 8005
echo "Cleaning up ports 3006 and 8005..."
lsof -ti:3006,8005 | xargs kill -9 2>/dev/null

# Start Backend
echo "Starting Backend on port 8005..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8005 &
BACKEND_PID=$!
cd ..

# Start Frontend
echo "Starting Frontend on port 3006..."
cd frontend-app
npm install
npm run dev -- -p 3006 &
FRONTEND_PID=$!
cd ..

echo "Backend running on PID $BACKEND_PID (Port 8005)"
echo "Frontend running on PID $FRONTEND_PID (Port 3006)"

# Trap to kill processes on exit
trap "kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

wait
