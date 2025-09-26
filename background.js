// Background service worker for X.com AI Analyzer
const SERVER_URL = 'http://localhost:3001';

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processTweet' || request.action === 'analyzeTweet') {
    const options = Object.assign(
      { analyze: true, store: true },
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
    askQuestion(request.query).then(response => {
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

    const { analyze = true, store = true } = options;

    if (!analyze && !store) {
      return { success: true, analysis: null, stored: false, message: 'No processing requested.' };
    }

    console.log(
      'Processing tweet:',
      tweetData.text.substring(0, 50) + '...',
      `analyze=${analyze}`,
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
      const analysisData = analyze ? result.analysis || null : null;
      const stored = store ? Boolean(result.stored) : false;

      if (analysisData) {
        console.log('Tweet analysis completed:', analysisData);

        if (analysisData.toxicity_score > 7 || analysisData.bot_likelihood > 7) {
          showNotification(tweetData, analysisData);
        }
      }
      
      return {
        success: true,
        analysis: analysisData,
        stored,
        metadata: result.metadata || null,
        message: result.message || null
      };
    } else {
      console.error('Error analyzing tweet:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Error sending tweet for processing:', error);
    return { success: false, error: error.message };
  }
}

// Ask question using RAG
async function askQuestion(query) {
  try {
    // Get configuration (required for production mode)
    const config = await chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model']);
    
    if (!config.apiKey || !config.completionsUrl || !config.model) {
      return { success: false, error: 'API configuration required. Please configure your OpenAI API key, URL, and model in the extension popup.' };
    }
    
    // Send to local server
    const response = await fetch(`${SERVER_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: query,
        apiKey: config.apiKey,
        baseURL: config.completionsUrl,
        model: config.model
      })
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error asking question:', error);
    return { success: false, error: error.message };
  }
}

// Show notification for concerning tweets
function showNotification(tweetData, analysis) {
  const isHighToxicity = analysis.toxicity_score > 7;
  const isHighBotLikelihood = analysis.bot_likelihood > 7;
  
  let title = 'X.com AI Analyzer';
  let message = '';
  
  if (isHighToxicity && isHighBotLikelihood) {
    title = '⚠️ High Risk Tweet Detected';
    message = `@${tweetData.user.username}: High toxicity (${analysis.toxicity_score}/10) and bot likelihood (${analysis.bot_likelihood}/10)`;
  } else if (isHighToxicity) {
    title = '🚨 High Toxicity Detected';
    message = `@${tweetData.user.username}: Toxicity score ${analysis.toxicity_score}/10`;
  } else if (isHighBotLikelihood) {
    title = '🤖 High Bot Likelihood';
    message = `@${tweetData.user.username}: Bot likelihood ${analysis.bot_likelihood}/10`;
  }
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: title,
    message: message
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
