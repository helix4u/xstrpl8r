document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const completionsUrlInput = document.getElementById('completionsUrl');
  const modelInput = document.getElementById('model');
  const saveConfigBtn = document.getElementById('saveConfig');
  const toggleUIButton = document.getElementById('toggleUI');
  const statusDiv = document.getElementById('status');

  let isUIVisible = true;
  let isUIInFlight = false;

  function refreshUIVisibilityButton() {
    if (!toggleUIButton) {
      return;
    }

    const label = isUIVisible ? 'Hide Overlay' : 'Show Overlay';
    toggleUIButton.textContent = label;
    toggleUIButton.classList.toggle('is-active', isUIVisible);
    toggleUIButton.disabled = isUIInFlight;
  }

  function setUIBusy(state) {
    isUIInFlight = state;
    refreshUIVisibilityButton();
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }

  refreshUIVisibilityButton();

  // Load saved configuration
  chrome.storage.sync.get(['apiKey', 'completionsUrl', 'model'], function(result) {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.completionsUrl) completionsUrlInput.value = result.completionsUrl;
    if (result.model) modelInput.value = result.model;
  });

  // Load UI visibility state
  chrome.storage.local.get(['uiEnabled'], function(state) {
    if (typeof state.uiEnabled === 'boolean') {
      isUIVisible = state.uiEnabled;
    }
    refreshUIVisibilityButton();
  });

  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName !== 'local') {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(changes, 'uiEnabled')) {
      const newValue = changes.uiEnabled.newValue;
      if (typeof newValue === 'boolean') {
        isUIVisible = newValue;
        refreshUIVisibilityButton();
      }
    }
  });

  // Save configuration
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
      showStatus('Configuration saved! Ready to capture tweets.', 'success');
    });
  });

  // Toggle UI visibility
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
});