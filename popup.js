document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const completionsUrlInput = document.getElementById('completionsUrl');
  const modelInput = document.getElementById('model');
  const saveConfigBtn = document.getElementById('saveConfig');
  const startAnalysisBtn = document.getElementById('startAnalysis');
  const statusDiv = document.getElementById('status');
  const tweetsProcessedSpan = document.getElementById('tweetsProcessed');
  const accountsAnalyzedSpan = document.getElementById('accountsAnalyzed');
  const queryInput = document.getElementById('queryInput');
  const askQuestionBtn = document.getElementById('askQuestion');
  const queryResultsDiv = document.getElementById('queryResults');

  // Load saved configuration
  chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model'], function(result) {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.completionsUrl) completionsUrlInput.value = result.completionsUrl;
    if (result.model) modelInput.value = result.model;
    
    // Enable start analysis button only if configured
    if (result.apiKey && result.completionsUrl && result.model) {
      startAnalysisBtn.disabled = false;
      showStatus('Ready for AI analysis!', 'success');
    } else {
      startAnalysisBtn.disabled = true;
      showStatus('Please configure your API credentials first', 'error');
    }
  });

  // Save configuration
  saveConfigBtn.addEventListener('click', function() {
    const config = {
      apiKey: apiKeyInput.value,
      completionsUrl: completionsUrlInput.value,
      model: modelInput.value
    };
    
    if (!config.apiKey || !config.completionsUrl || !config.model) {
      showStatus('Please fill in all fields', 'error');
      return;
    }
    
    chrome.storage.sync.set(config, function() {
      showStatus('Configuration saved! Ready for AI analysis.', 'success');
      startAnalysisBtn.disabled = false;
    });
  });

  // Start analysis
  startAnalysisBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'startAnalysis'});
      showStatus('Analysis started! Monitoring tweets...', 'info');
    });
  });

  // Ask question
  askQuestionBtn.addEventListener('click', async function() {
    const query = queryInput.value.trim();
    if (!query) return;
    
    askQuestionBtn.disabled = true;
    askQuestionBtn.textContent = 'Thinking...';
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'askQuestion',
        query: query
      });
      
      askQuestionBtn.disabled = false;
      askQuestionBtn.textContent = 'Ask Question';
      
      if (response.success) {
        queryResultsDiv.style.display = 'block';
        queryResultsDiv.innerHTML = `<strong>Answer:</strong><br>${response.answer}`;
        if (response.sources && response.sources.length > 0) {
          queryResultsDiv.innerHTML += `<br><br><strong>Sources:</strong><br>${response.sources.join('<br>')}`;
        }
      } else {
        showStatus('Error asking question: ' + response.error, 'error');
      }
    } catch (error) {
      askQuestionBtn.disabled = false;
      askQuestionBtn.textContent = 'Ask Question';
      showStatus('Error asking question: ' + error.message, 'error');
    }
  });

  // Update stats
  function updateStats() {
    chrome.storage.local.get(['tweetsProcessed', 'accountsAnalyzed'], function(result) {
      tweetsProcessedSpan.textContent = result.tweetsProcessed || 0;
      accountsAnalyzedSpan.textContent = result.accountsAnalyzed || 0;
    });
  }

  // Show status message
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  // Listen for stats updates
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'updateStats') {
      updateStats();
    }
  });

  // Initial stats update
  updateStats();
});
