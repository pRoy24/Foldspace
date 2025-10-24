#!/bin/bash
# build.sh - Automated build and restart script

# Exit immediately if any command fails
set -e

echo "=== Pulling latest changes from Git ==="
git pull origin main

echo "=== Building the project ==="
sudo npm run build

echo "=== Restarting all PM2 processes ==="
pm2 restart all

echo "=== Build and restart complete! ==="

