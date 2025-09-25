#!/bin/bash

echo "Setting up X.com AI Analyzer..."

# Create server directory if it doesn't exist
mkdir -p server

# Install server dependencies
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Install ChromaDB
echo "Installing ChromaDB..."
pip install chromadb

# Start ChromaDB server in background
echo "Starting ChromaDB server..."
chroma run --host localhost --port 8000 &
CHROMA_PID=$!

# Wait for ChromaDB to start
sleep 5

# Start the local server
echo "Starting local server..."
cd server
npm start &
SERVER_PID=$!

echo "Setup complete!"
echo "ChromaDB PID: $CHROMA_PID"
echo "Server PID: $SERVER_PID"
echo ""
echo "To stop the services:"
echo "kill $CHROMA_PID $SERVER_PID"
echo ""
echo "Load the extension in Chrome:"
echo "1. Open chrome://extensions/"
echo "2. Enable Developer mode"
echo "3. Click 'Load unpacked' and select this directory"
