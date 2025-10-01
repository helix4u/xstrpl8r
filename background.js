// Background service worker for X.com AI Analyzer
const SERVER_URL = 'http://localhost:3001';

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processTweet') {
    const options = Object.assign(
      { analyze: false, store: true },
      request && request.options ? request.options : {}
    );

    handleTweetProcessing(request.tweetData, options).then(response => {
      sendResponse(response);
    }).catch(error => {
      console.error('Error in handleTweetProcessing:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  } else if (request.action === 'askQuestion') {
    askQuestion(request).then(response => {
      sendResponse(response);
    });
    return true; // Keep message channel open for async response
  } else if (request.action === 'updateStats') {
    // Forward to popup
    chrome.runtime.sendMessage({ action: 'updateStats' });
  }
});

// Process tweet by sending to local server
async function handleTweetProcessing(tweetData, options = {}) {
  try {
    if (!tweetData || !tweetData.text) {
      throw new Error('Invalid tweet payload received.');
    }

    const { analyze = false, store = true } = options;

    if (!analyze && !store) {
      return { success: true, analysis: null, stored: false, message: 'No processing requested.' };
    }

    console.log(
      'Processing tweet:',
      tweetData.text.substring(0, 50) + '...',
      `store=${store}`
    );
    
    // Check if server is running
    try {
      const healthResponse = await fetch(`${SERVER_URL}/api/health`);
      if (!healthResponse.ok) {
        throw new Error('Server not responding');
      }
    } catch (error) {
      console.error('Cannot connect to server:', error);
      return { success: false, error: 'Cannot connect to local server. Make sure it\'s running on port 3001.' };
    }
    
    // Get configuration (required for production mode)
    const config = await chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model']);
    
    if (!config.apiKey || !config.completionsUrl || !config.model) {
      console.error('API configuration not found. Please configure the extension first.');
      return { success: false, error: 'API configuration required. Please configure your OpenAI API key, URL, and model in the extension popup.' };
    }
    
    // Send to local server
    const response = await fetch(`${SERVER_URL}/api/store-tweet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tweet: tweetData,
        userInfo: tweetData.user,
        apiKey: config.apiKey,
        baseURL: config.completionsUrl,
        model: config.model,
        options: {
          analyze,
          store
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      const stored = store ? Boolean(result.stored) : false;

      return {
        success: true,
        analysis: null,
        stored,
        metadata: result.metadata || null,
        message: result.message || ''
      };
    } else {
      console.error('Error capturing tweet:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error sending tweet for processing:', error);
    return { success: false, error: error.message };
  }
}

// Ask question using RAG
async function askQuestion({ query, includeKeywords = [], excludeKeywords = [], maxResults } = {}) {
  try {
    // Get configuration (required for production mode)
    const config = await chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model']);
    
    if (!config.apiKey || !config.completionsUrl || !config.model) {
      return { success: false, error: 'API configuration required. Please configure your OpenAI API key, URL, and model in the extension popup.' };
    }
    
    // Send to local server
    const normalizedInclude = Array.isArray(includeKeywords) ? includeKeywords.filter(Boolean) : [];
    const normalizedExclude = Array.isArray(excludeKeywords) ? excludeKeywords.filter(Boolean) : [];

    const response = await fetch(`${SERVER_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        apiKey: config.apiKey,
        baseURL: config.completionsUrl,
        model: config.model,
        includeKeywords: normalizedInclude,
        excludeKeywords: normalizedExclude,
        maxResults: maxResults
      })
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error asking question:', error);
    return { success: false, error: error.message };
  }
}

// Show notification for noteworthy narratives
function showNotification(tweetData, analysis) {
  const storySignals = analysis.story_signals || {};
  const significanceScore = Number(storySignals.significance_score);
  const momentum = storySignals.momentum || 'steady';
  const callout = Array.isArray(analysis.callouts) && analysis.callouts.length
    ? analysis.callouts[0]
    : analysis.summary || analysis.intent || 'New story signal spotted.';

  const title = 'Narrative highlight';
  const suffix = Number.isFinite(significanceScore)
    ? `significance ${significanceScore.toFixed(1)}/10`
    : 'story signal';
  const message = `@${tweetData.user.username}: ${callout}\nMomentum ${momentum}, ${suffix}`;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title,
    message
  });
}

// Check server health on startup
async function checkServerHealth() {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`);
    const result = await response.json();
    
    if (result.success) {
      console.log('Server is healthy');
    } else {
      console.error('Server health check failed');
    }
  } catch (error) {
    console.error('Cannot connect to server:', error);
    console.log('Make sure the local server is running on port 3001');
  }
}

// Check server health when extension starts
checkServerHealth();
