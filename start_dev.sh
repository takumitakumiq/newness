#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Development Environment...${NC}"

# Function to check and free port
check_and_clear_port() {
    local PORT=$1
    local NAME=$2
    
    echo -n "Checking port $PORT ($NAME)... "
    
    # Find PID using lsof
    PID=$(lsof -t -i:$PORT)
    
    if [ -n "$PID" ]; then
        echo -e "${RED}In use by PID $PID${NC}"
        echo -n "Killing process $PID... "
        kill -9 $PID
        echo -e "${GREEN}Done${NC}"
    else
        echo -e "${GREEN}Free${NC}"
    fi
}

# 1. Check and clear ports
check_and_clear_port 8000 "Django Backend"
check_and_clear_port 3000 "Next.js Frontend"

# 2. Start Backend
echo -e "\n${GREEN}Starting Django Backend...${NC}"
# Use the virtual environment python directly
./.venv/bin/python backend/manage.py runserver &
BACKEND_PID=$!

# 3. Start Frontend
echo -e "${GREEN}Starting Next.js Frontend...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "\n${GREEN}Servers are running!${NC}"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo "Press Ctrl+C to stop both servers."

# 4. Handle shutdown
cleanup() {
    echo -e "\n${RED}Stopping servers...${NC}"
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

trap cleanup SIGINT SIGTERM

# Keep script running
wait
