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

- Node.js (v16 or higher)
- Python 3.8+
- Chrome browser
- OpenAI API key

### Quick Start (Windows)

1. **Run the production setup**:
   ```cmd
   start.bat
   ```

2. **Get your OpenAI API key**:
   - Visit https://platform.openai.com/api-keys
   - Create a new API key

3. **Load the extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory

4. **Configure the extension**:
   - Click the extension icon in your browser toolbar
   - Enter your API key, completions URL, and model name
   - Click "Save Configuration"
   - Click "Start Analysis"

### Manual Setup

1. **Install dependencies**:
   ```bash
   # Install Node.js dependencies
   cd server
   npm install
   
   # Install Python dependencies
   pip install chromadb openai
   ```

2. **Start ChromaDB**:
   ```bash
   chroma run --host localhost --port 8000
   ```

3. **Start the AI server**:
   ```bash
   cd server
   npm start
   ```

4. **Load the Chrome extension** (same as above)

### Manual Setup (Alternative)

If the setup script doesn't work, you can set up manually:

1. **Install ChromaDB**:
   ```bash
   pip install chromadb
   chroma run --host localhost --port 8000
   ```

2. **Install server dependencies**:
   ```bash
   cd server
   npm install
   npm start
   ```

3. **Load the Chrome extension** (same as above)

## Usage

1. **Start Analysis**: Click the extension icon and click "Start Analysis"
2. **Browse X.com**: The extension will automatically detect and analyze tweets
3. **Ask Questions**: Use the query box in the popup to ask questions about the tweets you've seen
4. **View Stats**: Monitor how many tweets and accounts have been analyzed

## Configuration

The extension requires:
- **API Key**: Your OpenAI API key (or compatible service)
- **Completions URL**: The API endpoint (e.g., `https://api.openai.com/v1/chat/completions`)
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
└── setup.sh             # Setup script
```

### Adding New Features
- Modify `content.js` to extract additional tweet data
- Update `server.js` to add new analysis functions
- Extend the popup UI in `popup.html` and `popup.js`

## License

MIT License - feel free to modify and distribute as needed.
