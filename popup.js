document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const completionsUrlInput = document.getElementById('completionsUrl');
  const modelInput = document.getElementById('model');
  const saveConfigBtn = document.getElementById('saveConfig');
  const toggleScrapingBtn = document.getElementById('toggleScraping');
  const startAnalysisBtn = document.getElementById('startAnalysis');
  const toggleUIButton = document.getElementById('toggleUI');
  const statusDiv = document.getElementById('status');
  const tweetsProcessedSpan = document.getElementById('tweetsProcessed');
  const accountsAnalyzedSpan = document.getElementById('accountsAnalyzed');
  const queryInput = document.getElementById('queryInput');
  const askQuestionBtn = document.getElementById('askQuestion');
  const queryResultsDiv = document.getElementById('queryResults');

  let isConfigured = false;
  let isAnalysisActive = false;
  let isScrapingActive = false;
  let isToggleInFlight = false;
  let isScrapingInFlight = false;
  let isUIVisible = true;
  let isUIInFlight = false;

  function refreshScrapingButton() {
    if (!toggleScrapingBtn) {
      return;
    }

    const label = isScrapingActive ? 'Stop Scraping' : 'Start Scraping';
    toggleScrapingBtn.textContent = label;
    toggleScrapingBtn.classList.toggle('is-active', isScrapingActive);

    const shouldDisable = isScrapingInFlight || (!isScrapingActive && !isConfigured);
    toggleScrapingBtn.disabled = shouldDisable;
  }

  function refreshAnalysisButton() {
    const label = isAnalysisActive ? 'Stop Analysis' : 'Start Analysis';
    startAnalysisBtn.textContent = label;
    startAnalysisBtn.classList.toggle('is-active', isAnalysisActive);
    const shouldDisable = isToggleInFlight || (!isAnalysisActive && !isConfigured);
    startAnalysisBtn.disabled = shouldDisable;
  }

  function refreshUIVisibilityButton() {
    if (!toggleUIButton) {
      return;
    }

    const label = isUIVisible ? 'Hide Overlay' : 'Show Overlay';
    toggleUIButton.textContent = label;
    toggleUIButton.classList.toggle('is-active', isUIVisible);
    toggleUIButton.disabled = isUIInFlight;
  }

  function setScrapingBusy(state) {
    isScrapingInFlight = state;
    refreshScrapingButton();
  }

  function setAnalysisBusy(state) {
    isToggleInFlight = state;
    refreshAnalysisButton();
  }

  function setUIBusy(state) {
    isUIInFlight = state;
    refreshUIVisibilityButton();
  }

  function updateConfigurationState(config) {
    const hasApiKey = Boolean((config.apiKey || '').trim());
    const hasBaseUrl = Boolean((config.completionsUrl || '').trim());
    const hasModel = Boolean((config.model || '').trim());
    isConfigured = hasApiKey && hasBaseUrl && hasModel;
    refreshScrapingButton();
    refreshAnalysisButton();
  }

  refreshScrapingButton();
  refreshAnalysisButton();
  refreshUIVisibilityButton();

  chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model'], function(result) {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.completionsUrl) completionsUrlInput.value = result.completionsUrl;
    if (result.model) modelInput.value = result.model;

    updateConfigurationState(result);

    if (isConfigured) {
      showStatus('Ready for AI analysis!', 'success');
    } else {
      showStatus('Please configure your API credentials first', 'error');
    }
  });

  chrome.storage.local.get(['scrapingActive', 'analysisActive', 'uiEnabled'], function(state) {
    isScrapingActive = Boolean(state.scrapingActive);
    isAnalysisActive = Boolean(state.analysisActive);
    if (typeof state.uiEnabled === 'boolean') {
      isUIVisible = state.uiEnabled;
    }

    refreshScrapingButton();
    refreshAnalysisButton();
    refreshUIVisibilityButton();
  });

  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'local') {
      if (changes.scrapingActive) {
        isScrapingActive = Boolean(changes.scrapingActive.newValue);
        refreshScrapingButton();
      }

      if (changes.analysisActive) {
        isAnalysisActive = Boolean(changes.analysisActive.newValue);
        refreshAnalysisButton();
      }

      if (changes.uiEnabled) {
        isUIVisible = Boolean(changes.uiEnabled.newValue);
        refreshUIVisibilityButton();
      }
    }

    if (areaName === 'sync' && (changes.apiKey || changes.completionsUrl || changes.model)) {
      chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model'], function(currentConfig) {
        updateConfigurationState(currentConfig);
      });
    }
  });

  saveConfigBtn.addEventListener('click', function() {
    const config = {
      apiKey: apiKeyInput.value.trim(),
      completionsUrl: completionsUrlInput.value.trim(),
      model: modelInput.value.trim()
    };

    if (!config.apiKey || !config.completionsUrl || !config.model) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    chrome.storage.sync.set(config, function() {
      updateConfigurationState(config);
      showStatus('Configuration saved! Ready for AI analysis.', 'success');
    });
  });

  toggleScrapingBtn.addEventListener('click', function() {
    if (toggleScrapingBtn.disabled) {
      return;
    }

    setScrapingBusy(true);

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs.length) {
        setScrapingBusy(false);
        showStatus('Open an X.com tab to control scraping.', 'error');
        return;
      }

      const targetTabId = tabs[0].id;
      const action = isScrapingActive ? 'stopScraping' : 'startScraping';

      chrome.tabs.sendMessage(targetTabId, { action }, function() {
        setScrapingBusy(false);

        if (chrome.runtime.lastError) {
          showStatus('Unable to reach the content script. Navigate to X.com and try again.', 'error');
          return;
        }

        isScrapingActive = action === 'startScraping';
        chrome.storage.local.set({
          scrapingActive: isScrapingActive,
          scrapingLastUpdatedAt: new Date().toISOString()
        });

        refreshScrapingButton();
        const message = isScrapingActive
          ? 'Scraping enabled. Tweets will be stored in ChromaDB when available.'
          : 'Scraping paused. Tweets will no longer be stored.';
        showStatus(message, 'info');
      });
    });
  });

  startAnalysisBtn.addEventListener('click', function() {
    if (startAnalysisBtn.disabled) {
      return;
    }

    setAnalysisBusy(true);

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs.length) {
        setAnalysisBusy(false);
        showStatus('Open an X.com tab to control analysis.', 'error');
        return;
      }

      const targetTabId = tabs[0].id;
      const action = isAnalysisActive ? 'stopAnalysis' : 'startAnalysis';

      chrome.tabs.sendMessage(targetTabId, { action }, function() {
        setAnalysisBusy(false);

        if (chrome.runtime.lastError) {
          showStatus('Unable to reach the content script. Navigate to X.com and try again.', 'error');
          return;
        }

        isAnalysisActive = action === 'startAnalysis';
        chrome.storage.local.set({
          analysisActive: isAnalysisActive,
          analysisLastUpdatedAt: new Date().toISOString()
        });

        refreshAnalysisButton();
        showStatus(isAnalysisActive ? 'Analysis started! Monitoring tweets...' : 'Analysis stopped.', 'info');
      });
    });
  });

  toggleUIButton.addEventListener('click', function() {
    if (toggleUIButton.disabled) {
      return;
    }

    setUIBusy(true);

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs.length) {
        setUIBusy(false);
        showStatus('Open an X.com tab to control the overlay.', 'error');
        return;
      }

      const targetTabId = tabs[0].id;
      const nextState = !isUIVisible;

      chrome.tabs.sendMessage(targetTabId, { action: 'setUIVisibility', enabled: nextState, source: 'popup' }, function() {
        setUIBusy(false);

        if (chrome.runtime.lastError) {
          showStatus('Unable to reach the content script. Navigate to X.com and try again.', 'error');
          return;
        }

        isUIVisible = nextState;
        chrome.storage.local.set({
          uiEnabled: isUIVisible,
          uiLastUpdatedAt: new Date().toISOString()
        });

        refreshUIVisibilityButton();
        showStatus(isUIVisible ? 'Overlay shown.' : 'Overlay hidden.', 'info');
      });
    });
  });

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

  function updateStats() {
    chrome.storage.local.get(['tweetsProcessed', 'accountsAnalyzed'], function(result) {
      tweetsProcessedSpan.textContent = result.tweetsProcessed || 0;
      accountsAnalyzedSpan.textContent = result.accountsAnalyzed || 0;
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  chrome.runtime.onMessage.addListener(function(request) {
    if (request.action === 'updateStats') {
      updateStats();
    }
  });

  updateStats();
});

