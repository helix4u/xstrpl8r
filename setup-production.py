#!/usr/bin/env python3
"""
Production setup script for X.com AI Analyzer
This script sets up the full production environment with ChromaDB and AI capabilities
"""

import subprocess
import sys
import os
import time
import webbrowser
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"Error: {e.stderr}")
        return False

def check_requirements():
    """Check if required software is installed"""
    print("🔍 Checking requirements...")
    
    # Check Node.js
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js: {result.stdout.strip()}")
        else:
            print("❌ Node.js not found")
            return False
    except FileNotFoundError:
        print("❌ Node.js not found")
        return False
    
    # Check Python
    try:
        result = subprocess.run(["python", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Python: {result.stdout.strip()}")
        else:
            print("❌ Python not found")
            return False
    except FileNotFoundError:
        print("❌ Python not found")
        return False
    
    return True

def install_dependencies():
    """Install all required dependencies"""
    print("\n📦 Installing dependencies...")
    
    # Install Node.js dependencies
    if not run_command("cd server && npm install", "Installing Node.js dependencies"):
        return False
    
    # Install Python dependencies
    if not run_command("pip install chromadb openai", "Installing Python dependencies"):
        return False
    
    return True

def start_services():
    """Start ChromaDB and the AI server"""
    print("\n🚀 Starting services...")
    
    # Start ChromaDB
    print("Starting ChromaDB server...")
    chromadb_process = subprocess.Popen(
        ["chroma", "run", "--host", "localhost", "--port", "8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for ChromaDB to start
    print("Waiting for ChromaDB to start...")
    time.sleep(8)
    
    # Start AI server
    print("Starting AI server...")
    server_process = subprocess.Popen(
        ["cd", "server", "&&", "npm", "start"],
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    return chromadb_process, server_process

def main():
    """Main setup function"""
    print("=" * 60)
    print("    X.com AI Analyzer - Production Setup")
    print("=" * 60)
    print()
    
    # Check requirements
    if not check_requirements():
        print("\n❌ Requirements check failed. Please install Node.js and Python.")
        print("Download from:")
        print("- Node.js: https://nodejs.org/")
        print("- Python: https://python.org/")
        return False
    
    # Install dependencies
    if not install_dependencies():
        print("\n❌ Dependency installation failed.")
        return False
    
    # Start services
    try:
        chromadb_process, server_process = start_services()
        
        print("\n" + "=" * 60)
        print("           SETUP COMPLETE!")
        print("=" * 60)
        print()
        print("🌐 Services running:")
        print("   ChromaDB: http://localhost:8000")
        print("   AI Server: http://localhost:3001")
        print()
        print("📋 Next steps:")
        print("1. Get your OpenAI API key from https://platform.openai.com/api-keys")
        print("2. Load the Chrome extension:")
        print("   - Open chrome://extensions/")
        print("   - Enable Developer mode")
        print("   - Click 'Load unpacked' and select this directory")
        print("3. Configure the extension with your API key")
        print("4. Start analyzing tweets!")
        print()
        print("Press Enter to open Chrome extensions page...")
        input()
        webbrowser.open("chrome://extensions/")
        
        # Keep services running
        print("\n🔄 Services are running. Press Ctrl+C to stop...")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n🛑 Stopping services...")
            chromadb_process.terminate()
            server_process.terminate()
            print("✅ Services stopped.")
            
    except Exception as e:
        print(f"\n❌ Error starting services: {e}")
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    if not success:
        sys.exit(1)
