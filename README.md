# X.com AI Analyzer

A Chrome extension that analyzes X.com (Twitter) tweets in real-time using AI, stores them in a local ChromaDB vector database, and provides RAG (Retrieval-Augmented Generation) capabilities for asking questions about the tweets you've seen.

## Features

- **Real-time Tweet Monitoring**: Automatically detects and processes tweets as you browse X.com
- **AI Analysis**: Analyzes tweets for toxicity and bot likelihood using your preferred AI model
- **Vector Database Storage**: Stores tweet embeddings in local ChromaDB for semantic search
- **RAG Query System**: Ask questions about the tweets you've seen and get AI-powered answers
- **Account Analysis**: Tracks and analyzes user accounts for patterns
- **Local Processing**: All data stays on your machine - no external services required

## Setup

### Prerequisites

- Node.js 18+
- Python 3.9+ (for ChromaDB CLI)
- Chrome browser
- OpenAI-compatible API key

### Quick Start (Windows — recommended)

1. Start everything:
   
   This installs deps, starts ChromaDB (http://localhost:8000), and runs the server (http://localhost:3001).
2. Load the extension in Chrome:
   - Open 
   - Enable Developer mode
   - Click “Load unpacked” and select this folder
3. In the popup, save your API key, base URL (e.g. ), and model.

### Manual (macOS/Linux/WSL)

1. Install deps and start services:
   

## Usage

1. **Start Capture**: Click the extension icon and click "Start Capture"
2. **Browse X.com**: The extension will automatically detect and analyze tweets
3. **Ask Questions**: Use the query box in the popup to ask questions about the tweets you've seen
4. **View Stats**: Monitor how many tweets and accounts have been analyzed

## Configuration

The extension requires:
- **API Key**: Your OpenAI API key (or compatible service)
- **Completions URL**: The API base (e.g., `https://api.openai.com/v1`)
- **Model**: The model to use (e.g., `gpt-4.1-mini`)

## Features Explained

### Tweet Analysis
- **Toxicity Scoring**: 0-10 scale based on harmful content
- **Bot Likelihood**: 0-10 scale based on account patterns
- **Red Flags**: Identified suspicious patterns
- **Account Metrics**: Follower/following ratios, account age, etc.

### RAG System
- **Semantic Search**: Find relevant tweets using vector similarity
- **Context-Aware Answers**: AI responses based on your tweet history
- **Source Attribution**: See which tweets informed the answer

### Data Storage
- **Local ChromaDB**: All data stored locally on your machine
- **Vector Embeddings**: Tweets converted to embeddings for semantic search
- **Metadata**: Rich metadata including analysis results and user info

## Privacy & Security

- All data is stored locally on your machine
- No data is sent to external services except for AI analysis
- You control your API keys and data
- ChromaDB runs locally on your machine

## Troubleshooting

### Server Connection Issues
- Make sure ChromaDB is running on port 8000
- Check that the local server is running on port 3001
- Verify your API configuration is correct

### Extension Not Working
- Check the browser console for errors
- Ensure the extension has proper permissions
- Try reloading the extension

### Performance Issues
- The extension processes tweets as you scroll
- Large numbers of tweets may slow down analysis
- Consider pausing analysis if needed

## Development

### File Structure
```
├── manifest.json          # Chrome extension manifest
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
├── content.js            # Content script for X.com
├── background.js         # Service worker
├── server/               # Local server
│   ├── server.js         # Express server with ChromaDB
│   └── package.json      # Server dependencies
└── start.bat           # Windows bootstrap (Chroma + server)
setup.sh            # Cross-platform helper
```

### Adding New Features
- Modify `content.js` to extract additional tweet data
- Update `server.js` to add new analysis functions
- Extend the popup UI in `popup.html` and `popup.js`

## Support

If the tool is helpful, consider supporting it on [Ko-fi](https://ko-fi.com/gille).

## License

MIT License - feel free to modify and distribute as needed.
