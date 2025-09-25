#!/usr/bin/env python3
import chromadb
from chromadb.config import Settings

# Start ChromaDB server
client = chromadb.Client(Settings(
    chroma_api_impl="chromadb.api.fastapi.FastAPI",
    chroma_server_host="localhost",
    chroma_server_http_port=8000
))

print("ChromaDB server started on http://localhost:8000")
print("Press Ctrl+C to stop")

try:
    import time
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nShutting down ChromaDB server...")
