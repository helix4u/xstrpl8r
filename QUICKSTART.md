# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Start the Services

**Option A: Automated (Recommended)**
```bash
# Linux/Mac
chmod +x setup.sh
./setup.sh

# Windows
start.bat
```

**Option B: Manual**
```bash
# Terminal 1: Start ChromaDB
chroma run --host localhost --port 8000

# Terminal 2: Start the server
cd server
npm install
npm start
```

### 2. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this directory (`xstrpl8r`)

### 3. Configure the Extension

1. Click the extension icon in your browser toolbar
2. Enter your configuration:
   - **API Key**: Your OpenAI API key (or compatible service)
   - **Completions URL**: `https://api.openai.com/v1/chat/completions`
   - **Model**: `gpt-4.1-mini` (or your preferred model)
3. Click "Save Configuration"
4. Visit X.com and use the floating "Start Analysis" toggle in the bottom-right panel to begin capturing tweets.

## ✅ Verify Everything is Working

1. **Check the console** (F12 → Console) - you should see:
   - "X.com AI Analyzer content script loaded"
   - "Found X tweets on page"
   - "Processing tweet: ..."

2. **Test the server** (optional):
   ```bash
   node test-server.js
   ```

3. **Browse X.com** - tweets should be automatically analyzed

4. **Ask questions** - use the floating panel input on X.com to query the analyzed tweets

## 🔧 Troubleshooting

### Extension Not Working?
- Check browser console for errors
- Make sure the extension is enabled
- Try reloading the extension

### Server Connection Issues?
- Verify ChromaDB is running on port 8000
- Verify the server is running on port 3001
- Check your API configuration

### No Tweets Being Processed?
- Make sure you're on x.com or twitter.com
- Check the browser console for errors
- Verify the extension has proper permissions

## 📊 What You'll See

- **Real-time Analysis**: Tweets analyzed as you scroll
- **Toxicity Scores**: 0-10 scale for harmful content
- **Bot Detection**: 0-10 scale for bot likelihood
- **RAG Queries**: Ask questions about your tweet history
- **Statistics**: Track processed tweets and accounts

## 🎯 Example Questions to Ask

- "What are the most toxic tweets I've seen today?"
- "Show me tweets about AI from verified accounts"
- "Which accounts seem most likely to be bots?"
- "What topics are trending in my timeline?"
- "Find tweets with high engagement but low bot scores"

Happy analyzing! 🐦✨
