// Content script for X.com tweet monitoring

const PANEL_ID = 'xai-analyzer-panel';

const SCAN_INTERVAL_MS = 4000;
const PROCESSED_TWEET_LIMIT = 10000;

let isCapturing = false;

const processedTweets = new Set();
const processedTweetOrder = [];
const processingTweets = new Set();

const stats = {

  tweetsProcessed: 0,

  accountsAnalyzed: new Set()

};



let tweetObserver = null;
let scanIntervalId = null;

let isUIEnabled = true;

function persistCaptureState(active) {

  if (!chrome || !chrome.storage || !chrome.storage.local) {

    return;

  }



  try {

    chrome.storage.local.set({

      captureActive: active,

      captureLastUpdatedAt: new Date().toISOString()

    });

  } catch (error) {

    console.warn('Failed to persist capture state', error);

  }

}

function persistUIState(enabled) {

  if (!chrome || !chrome.storage || !chrome.storage.local) {

    return;

  }



  try {

    chrome.storage.local.set({

      uiEnabled: enabled,

      uiLastUpdatedAt: new Date().toISOString()

    });

  } catch (error) {

    console.warn('Failed to persist overlay state', error);

  }

}

function applyUIVisibility(shouldShow, options = {}) {

  const { suppressStatus = false, force = false } = options;

  const nextState = Boolean(shouldShow);

  if (!force && nextState === isUIEnabled) {

    return;

  }

  isUIEnabled = nextState;

  if (panelState.root) {

    panelState.root.style.display = nextState ? 'flex' : 'none';

    panelState.root.setAttribute('aria-hidden', String(!nextState));

  }

  if (!suppressStatus) {

    if (nextState) {

      showPanelStatus('Overlay re-enabled.', 'info');

    } else {

      showPanelStatus('Overlay hidden.', 'info');

    }

  }

  updateToggleButton();

}

function setUIVisibility(shouldShow, source = 'ui') {

  const suppressStatus = source === 'sync';

  applyUIVisibility(shouldShow, { force: true, suppressStatus });

  persistUIState(shouldShow);

  if (source !== 'sync') {

    console.log(`Overlay visibility updated via ${source}: ${shouldShow ? 'shown' : 'hidden'}`);

  }

}


const panelState = {

  root: null,

  toggleButton: null,

  status: null,

  tweetCount: null,

  accountCount: null,

  results: null,

  questionInput: null,

  includeInput: null,

  excludeInput: null,

  maxResultsInput: null,

  askButton: null,

  answer: null

};


function parsePanelKeywords(value) {

  const source = Array.isArray(value) ? value : String(value || '').split(',');

  return source

    .map((item) => String(item || '').trim().toLowerCase())

    .filter(Boolean);

}


function getPanelQueryOptions() {

  const includeRaw = panelState.includeInput ? panelState.includeInput.value : '';

  const excludeRaw = panelState.excludeInput ? panelState.excludeInput.value : '';

  const maxRaw = panelState.maxResultsInput ? panelState.maxResultsInput.value : '';

  const includeKeywords = parsePanelKeywords(includeRaw);

  const excludeKeywords = parsePanelKeywords(excludeRaw);

  const parsedMax = parseInt(maxRaw, 10);

  const maxResults = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : undefined;

  return { includeRaw, excludeRaw, maxRaw, includeKeywords, excludeKeywords, maxResults };

}


function persistPanelQueryOptions() {

  const { includeRaw, excludeRaw, maxRaw } = getPanelQueryOptions();

  if (chrome && chrome.storage && chrome.storage.local) {

    chrome.storage.local.set({

      queryOptions: {

        include: includeRaw,

        exclude: excludeRaw,

        maxResults: maxRaw || '10'

      }

    });

  }

}


function hydratePanelQueryOptions() {

  if (!chrome || !chrome.storage || !chrome.storage.local) {

    return;

  }


  chrome.storage.local.get(['queryOptions'], (data) => {

    const options = Object.assign({ include: '', exclude: '', maxResults: '10' }, data && data.queryOptions ? data.queryOptions : {});

    if (panelState.includeInput) {

      panelState.includeInput.value = options.include || '';

    }

    if (panelState.excludeInput) {

      panelState.excludeInput.value = options.exclude || '';

    }

    if (panelState.maxResultsInput) {

      panelState.maxResultsInput.value = options.maxResults || '10';

    }

  });

}


function isProcessingActive() {

  return isCapturing;

}

function ensureTweetProcessingActive({ initialScan = true } = {}) {

  if (!isProcessingActive()) {

    return;

  }



  if (initialScan) {

    processVisibleTweets();

  }



  setupTweetObserver();
  ensureScanInterval();

}

function teardownTweetProcessing() {

  if (isProcessingActive()) {

    return;

  }



  if (tweetObserver) {

    tweetObserver.disconnect();

    tweetObserver = null;

  }

  clearScanInterval();

  processingTweets.clear();

}



function init() {

  console.log('X.com AI Analyzer content script loaded');

  injectPanelStyles();

  createFloatingPanel();

  registerRuntimeListeners();

  registerStorageListeners();

  startTweetMonitoring();

  updateStatsDisplay();

  syncInitialState();

}



function injectPanelStyles() {

  if (document.getElementById(`${PANEL_ID}-styles`)) {

    return;

  }



  const style = document.createElement('style');

  style.id = `${PANEL_ID}-styles`;

  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      max-height: 80vh;
      background: white;
      border: 1px solid #e1e8ed;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    #${PANEL_ID}.is-paused {
      opacity: 0.7;
    }

    .xca-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e1e8ed;
    }

    .xca-title {
      font-weight: 600;
      color: #1da1f2;
      font-size: 16px;
    }

    .xca-toggle {
      background: #1da1f2;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .xca-toggle:hover {
      background: #0d8bd9;
    }

    .xca-toggle.is-active {
      background: #e0245e;
    }

    .xca-status {
      padding: 8px 16px;
      font-size: 12px;
      border-bottom: 1px solid #e1e8ed;
    }

    .xca-status[data-state="info"] {
      background: #d1ecf1;
      color: #0c5460;
    }

    .xca-status[data-state="success"] {
      background: #d4edda;
      color: #155724;
    }

    .xca-status[data-state="error"] {
      background: #f8d7da;
      color: #721c24;
    }

    .xca-metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: #e1e8ed;
      margin: 0;
    }

    .xca-metric {
      background: white;
      padding: 12px;
      text-align: center;
    }

    .xca-metric-value {
      display: block;
      font-size: 18px;
      font-weight: bold;
      color: #1da1f2;
    }

    .xca-metric-label {
      display: block;
      font-size: 11px;
      color: #657786;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .xca-query {
      padding: 16px;
      border-bottom: 1px solid #e1e8ed;
    }

    .xca-query textarea {
      width: 100%;
      min-height: 60px;
      padding: 8px;
      border: 1px solid #e1e8ed;
      border-radius: 6px;
      font-size: 14px;
      resize: vertical;
      font-family: inherit;
    }

    .xca-query-options {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 8px 0;
    }

    .xca-option {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .xca-option label {
      font-size: 11px;
      font-weight: 600;
      color: #657786;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .xca-option input {
      padding: 6px 8px;
      border: 1px solid #e1e8ed;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
    }

    .xca-ask {
      width: 100%;
      background: #1da1f2;
      color: white;
      border: none;
      padding: 10px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      transition: background-color 0.2s;
    }

    .xca-ask:hover:not(:disabled) {
      background: #0d8bd9;
    }

    .xca-ask:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .xca-answer {
      padding: 16px;
      border-bottom: 1px solid #e1e8ed;
      max-height: 200px;
      overflow-y: auto;
    }

    .xca-answer-text {
      font-size: 14px;
      line-height: 1.5;
      color: #14171a;
    }

    .xca-answer-sources {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e1e8ed;
      font-size: 12px;
      color: #657786;
    }

    .xca-answer-error {
      color: #e0245e;
    }

    .xca-results {
      padding: 16px;
      max-height: 200px;
      overflow-y: auto;
    }

    .xca-empty {
      text-align: center;
      color: #657786;
      font-style: italic;
      font-size: 12px;
    }

    @media (prefers-color-scheme: dark) {
      #${PANEL_ID} {
        background: #15202b;
        border-color: #38444d;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        color: #e7ecf0;
      }
      #${PANEL_ID}.is-paused {
        opacity: 0.85;
      }
      .xca-header {
        background: #192734;
        border-bottom-color: #38444d;
      }
      .xca-title {
        color: #1d9bf0;
      }
      .xca-toggle {
        background: #1d9bf0;
        color: #0f1419;
      }
      .xca-toggle:hover:not(:disabled) {
        background: #1a8cd8;
      }
      .xca-toggle.is-active {
        background: #f4212e;
        color: #f5f8fa;
      }
      .xca-status {
        border-bottom-color: #38444d;
      }
      .xca-status[data-state="info"] {
        background: rgba(29, 155, 240, 0.12);
        color: #8ecdf7;
      }
      .xca-status[data-state="success"] {
        background: rgba(25, 207, 105, 0.12);
        color: #7dd1a3;
      }
      .xca-status[data-state="error"] {
        background: rgba(244, 33, 46, 0.18);
        color: #ff8595;
      }
      .xca-metrics {
        background: #38444d;
      }
      .xca-metric {
        background: #0f1419;
      }
      .xca-metric-value {
        color: #1d9bf0;
      }
      .xca-metric-label {
        color: #8899a6;
      }
      .xca-query {
        border-bottom-color: #38444d;
      }
      .xca-query textarea,
      .xca-option input {
        background: #15202b;
        border-color: #38444d;
        color: #e7ecf0;
      }
      .xca-query textarea::placeholder,
      .xca-option input::placeholder {
        color: #536471;
      }
      .xca-option label {
        color: #8899a6;
      }
      .xca-ask {
        background: #1d9bf0;
        color: #0f1419;
      }
      .xca-ask:disabled {
        background: #273340;
        color: #536471;
      }
      .xca-answer {
        border-bottom-color: #38444d;
        background: #0f1419;
      }
      .xca-answer-text {
        color: #e7ecf0;
      }
      .xca-answer-sources {
        border-top-color: #38444d;
        color: #8899a6;
      }
      .xca-results {
        background: #0f1419;
      }
      .xca-empty {
        color: #536471;
      }
    }
    @media (max-width: 480px) {
      #${PANEL_ID} {
        width: calc(100vw - 40px);
        right: 20px;
        left: 20px;
      }
      
      .xca-query-options {
        grid-template-columns: 1fr;
      }
    }
  `;



  document.head.appendChild(style);

}



function createFloatingPanel() {

  if (document.getElementById(PANEL_ID)) {

    return;

  }



  const panel = document.createElement('div');

  panel.id = PANEL_ID;

  panel.className = 'is-paused';

  panel.innerHTML = `

    <div class="xca-header">

      <span class="xca-title">Story Explorer</span>

      <button class="xca-toggle" type="button">Start Capture</button>

    </div>

    <div class="xca-status" data-state="info">Capture paused. Toggle to start collecting tweets.</div>

    <div class="xca-metrics">

      <div class="xca-metric">

        <span class="xca-metric-value" data-role="tweets">0</span>

        <span class="xca-metric-label">Tweets</span>

      </div>

      <div class="xca-metric">

        <span class="xca-metric-value" data-role="accounts">0</span>

        <span class="xca-metric-label">Accounts</span>

      </div>

    </div>

    <div class="xca-query">

      <textarea data-role="question" placeholder="Ask about the captured tweets..."></textarea>

      <div class="xca-query-options">

        <div class="xca-option">

          <label>Include keywords</label>

          <input type="text" data-role="include-keywords" placeholder="e.g. trump, policy" />

        </div>

        <div class="xca-option">

          <label>Exclude keywords</label>

          <input type="text" data-role="exclude-keywords" placeholder="e.g. spam, ads" />

        </div>

        <div class="xca-option">

          <label>Max results</label>

          <input type="number" data-role="max-results" min="1" max="25" step="1" />

        </div>

      </div>

      <button type="button" class="xca-ask" data-role="ask">Ask</button>

    </div>

    <div class="xca-answer" data-role="answer">Questions and answers will appear here.</div>

    <div class="xca-results" data-role="results">

      <div class="xca-empty">Capture is running. Tweets will appear here once you ask questions.</div>

    </div>

  `;



  document.body.appendChild(panel);



  panelState.root = panel;

  panelState.toggleButton = panel.querySelector('.xca-toggle');

  panelState.status = panel.querySelector('.xca-status');

  panelState.tweetCount = panel.querySelector('[data-role="tweets"]');

  panelState.accountCount = panel.querySelector('[data-role="accounts"]');

  panelState.results = panel.querySelector('[data-role="results"]');

  panelState.questionInput = panel.querySelector('[data-role="question"]');

  panelState.includeInput = panel.querySelector('[data-role="include-keywords"]');

  panelState.excludeInput = panel.querySelector('[data-role="exclude-keywords"]');

  panelState.maxResultsInput = panel.querySelector('[data-role="max-results"]');

  panelState.askButton = panel.querySelector('[data-role="ask"]');

  panelState.answer = panel.querySelector('[data-role="answer"]');



  hydratePanelQueryOptions();

  if (panelState.includeInput) {

    panelState.includeInput.addEventListener('input', persistPanelQueryOptions);

  }

  if (panelState.excludeInput) {

    panelState.excludeInput.addEventListener('input', persistPanelQueryOptions);

  }

  if (panelState.maxResultsInput) {

    panelState.maxResultsInput.addEventListener('input', persistPanelQueryOptions);

  }



  panelState.toggleButton.addEventListener('click', () => {

    if (isCapturing) {

      stopCapture('Capture paused. Toggle to resume.');

    } else {

      startCapture('ui');

    }

  });



  panelState.askButton.addEventListener('click', () => {

    const query = (panelState.questionInput.value || '').trim();

    if (!query) {

      showPanelStatus('Enter a question to query captured tweets.', 'info');

      return;

    }

    const { includeKeywords, excludeKeywords, maxResults } = getPanelQueryOptions();

    askQuestion({ query, includeKeywords, excludeKeywords, maxResults });

  });

}



function registerRuntimeListeners() {

  chrome.runtime.onMessage.addListener((request) => {

    if (!request || !request.action) {

      return;

    }



    if (request.action === 'startCapture' || request.action === 'startAnalysis') {

      startCapture(request.source || 'popup');

    } else if (request.action === 'stopCapture' || request.action === 'stopAnalysis') {

      stopCapture('Capture stopped from popup.');

    } else if (request.action === 'updateStats') {

      updateStatsDisplay();

    } else if (request.action === 'setUIVisibility') {

      if (typeof request.enabled === 'boolean') {

        setUIVisibility(request.enabled, request.source || 'popup');

      }

    } else if (request.action === 'hideUI') {

      setUIVisibility(false, request.source || 'popup');

    } else if (request.action === 'showUI') {

      setUIVisibility(true, request.source || 'popup');

    } else if (request.action === 'toggleUI') {

      setUIVisibility(!isUIEnabled, request.source || 'popup');

    } else if (request.action === 'askQuestion') {

      // Forwarded queries from popup reuse shared handler

      const { query, includeKeywords, excludeKeywords, maxResults } = request;

      askQuestion({ query, includeKeywords, excludeKeywords, maxResults, source: 'popup' });

    }

  });

}



function registerStorageListeners() {

  if (!chrome || !chrome.storage || !chrome.storage.onChanged) {

    return;

  }



  chrome.storage.onChanged.addListener((changes, areaName) => {

    if (areaName !== 'local') {

      return;

    }




    if (Object.prototype.hasOwnProperty.call(changes, 'captureActive')) {

      const { newValue, oldValue } = changes.captureActive;

      if (newValue !== oldValue) {

        const shouldScrape = Boolean(newValue);

        if (shouldScrape && !isCapturing) {

          startCapture('sync');

        } else if (!shouldScrape && isCapturing) {

          stopCapture('Capture stopped from extension menu.');

        }

      }

    }



    if (Object.prototype.hasOwnProperty.call(changes, 'uiEnabled')) {

      const { newValue, oldValue } = changes.uiEnabled;

      if (newValue !== oldValue) {

        applyUIVisibility(Boolean(newValue), { force: true, suppressStatus: true });

      }

    }

  });

}



function syncInitialState() {

  if (!chrome || !chrome.storage || !chrome.storage.local) {

    updateToggleButton();

    return;

  }



  chrome.storage.local.get(['captureActive', 'uiEnabled'], (data) => {

    const overlayEnabled = typeof (data && data.uiEnabled) === 'boolean' ? data.uiEnabled : true;

    applyUIVisibility(overlayEnabled, { force: true, suppressStatus: true });



    const shouldCapture = Boolean(data && data.captureActive);

    if (shouldCapture) {

      startCapture('restore');

      return;

    }



    updateToggleButton();

  });

}


function startCapture(source = 'ui') {

  if (isCapturing) {

    if (source !== 'sync') {

      showPanelStatus('Capture already running.', 'info');

    }

    return;

  }



  isCapturing = true;

  updateToggleButton();

  const statusMessage = source === 'restore'

    ? 'Capture resumed automatically.'

    : source === 'sync'

      ? 'Capture enabled from extension menu.'

      : 'Capturing tweets from this timeline...';

  if (source !== 'sync') {

    showPanelStatus(statusMessage, 'success');

  }



  ensureTweetProcessingActive();

  persistCaptureState(true);

  console.log('Tweet capture started via', source);

}



function stopCapture(message = 'Capture paused.') {

  if (!isCapturing) {

    return;

  }



  isCapturing = false;

  updateToggleButton();

  persistCaptureState(false);

  teardownTweetProcessing();



  showPanelStatus(message, 'info');

  console.log('Tweet capture paused.');

}



function updateToggleButton() {

  if (!panelState.toggleButton || !panelState.root) {

    return;

  }



  if (isCapturing) {

    panelState.toggleButton.textContent = 'Pause Capture';

    panelState.toggleButton.classList.add('is-active');

    panelState.root.classList.remove('is-paused');

  } else {

    panelState.toggleButton.textContent = 'Start Capture';

    panelState.toggleButton.classList.remove('is-active');

    panelState.root.classList.add('is-paused');

  }

}



function showPanelStatus(message, state = 'info') {

  if (!panelState.status) {

    return;

  }

  panelState.status.textContent = message;

  panelState.status.dataset.state = state;

}



function processVisibleTweets() {

  if (!isProcessingActive()) {

    return;

  }

  const tweetElements = document.querySelectorAll('[data-testid="tweet"]');

  console.log(`Found ${tweetElements.length} tweets on page`);

  tweetElements.forEach((tweetElement) => {

    processTweet(tweetElement);

  });

}



function setupTweetObserver() {

  if (tweetObserver) {

    return;

  }



  tweetObserver = new MutationObserver((mutations) => {

    mutations.forEach((mutation) => {

      mutation.addedNodes.forEach((node) => {

        if (node.nodeType !== Node.ELEMENT_NODE) {

          return;

        }



        const tweetElement = node.querySelector ? node.querySelector('[data-testid=tweet]') : node.matches && node.matches('[data-testid=tweet]') ? node : null;




        if (tweetElement && isProcessingActive()) {

          processTweet(tweetElement);

        }

      });

    });

  });



  tweetObserver.observe(document.body, { childList: true, subtree: true });

}



function ensureScanInterval() {
  if (scanIntervalId) {
    return;
  }

  scanIntervalId = setInterval(() => {
    if (isProcessingActive()) {
      processVisibleTweets();
    }
  }, SCAN_INTERVAL_MS);
}

function clearScanInterval() {
  if (!scanIntervalId) {
    return;
  }

  clearInterval(scanIntervalId);
  scanIntervalId = null;
}



function sendRuntimeMessage(payload) {

  return new Promise((resolve, reject) => {

    try {

      chrome.runtime.sendMessage(payload, (response) => {

        if (chrome.runtime.lastError) {

          reject(chrome.runtime.lastError);

          return;

        }

        resolve(response);

      });

    } catch (error) {

      reject(error);

    }

  });

}



async function processTweet(tweetElement) {

  // Expand any truncated tweet content before extraction
  if (tweetElement && typeof tweetElement.querySelector === 'function') {
    try { await ensureTweetExpanded(tweetElement); } catch (_) {}
  }

  const tweetData = extractTweetData(tweetElement);

  if (!tweetData) {

    return;

  }



  const shouldStore = isCapturing;

  if (!shouldStore) {

    return;

  }



  const tweetId = tweetData.id;

  if (processedTweets.has(tweetId) || processingTweets.has(tweetId)) {

    return;

  }



  processingTweets.add(tweetId);

  let captureComplete = false;

  try {

    console.log('Processing tweet:', tweetData.text.substring(0, 80));



    const response = await sendRuntimeMessage({

      action: 'processTweet',

      tweetData,

      options: {

        analyze: false,

        store: shouldStore

      }

    });



    if (response && response.success) {

      const stored = shouldStore ? Boolean(response.stored) : true;

      if (stored) {

        finalizeTweetCapture(tweetData);

        captureComplete = true;

      } else {

        console.warn('Storage requested but not confirmed for tweet:', tweetId);

        trackProcessedTweetId(tweetId);

        captureComplete = true;

      }

    } else {

      const errorMessage = response && response.error

        ? response.error

        : 'Unknown processing failure';

      console.error('Tweet processing failed:', errorMessage);

      showPanelStatus(errorMessage, 'error');

    }

  } catch (error) {

    console.error('Error processing tweet:', error);

    showPanelStatus(error.message || 'Unexpected error while processing tweet.', 'error');

  } finally {

    processingTweets.delete(tweetId);

    if (!captureComplete) {

      processedTweets.delete(tweetId);

      const idx = processedTweetOrder.indexOf(tweetId);

      if (idx !== -1) {

        processedTweetOrder.splice(idx, 1);

      }

    }

  }

}



function finalizeTweetCapture(tweetData) {

  trackProcessedTweetId(tweetData.id);



  stats.tweetsProcessed += 1;

  stats.accountsAnalyzed.add(tweetData.user.username);



  chrome.storage.local.set({

    tweetsProcessed: stats.tweetsProcessed,

    accountsAnalyzed: stats.accountsAnalyzed.size

  });



  chrome.runtime.sendMessage({ action: 'updateStats' });

  updateStatsDisplay();

}

function trackProcessedTweetId(tweetId) {

  if (!tweetId) {

    return;

  }



  if (!processedTweets.has(tweetId)) {

    processedTweets.add(tweetId);

    processedTweetOrder.push(tweetId);

  }



  while (processedTweetOrder.length > PROCESSED_TWEET_LIMIT) {

    const oldest = processedTweetOrder.shift();

    if (oldest) {

      processedTweets.delete(oldest);

    }

  }

}



function sanitizeText(value) {

  return String(value || '').replace(/[<>]/g, '');

}



function askQuestion(request = {}) {

  if (!panelState.askButton || !panelState.answer) {

    return;

  }



  const payload = typeof request === 'string'

    ? { query: request }

    : Object.assign({ query: '' }, request);



  const query = (payload.query || '').trim();



  if (!query) {

    showPanelStatus('Enter a question to query captured tweets.', 'info');

    return;

  }



  const options = getPanelQueryOptions();

  const includeKeywords = Array.isArray(payload.includeKeywords) && payload.includeKeywords.length

    ? payload.includeKeywords

    : options.includeKeywords;

  const excludeKeywords = Array.isArray(payload.excludeKeywords) && payload.excludeKeywords.length

    ? payload.excludeKeywords

    : options.excludeKeywords;

  const maxResults = Number.isFinite(payload.maxResults)

    ? payload.maxResults

    : options.maxResults;



  panelState.askButton.disabled = true;

  panelState.askButton.textContent = 'Asking...';

  showPanelStatus('Searching captured tweets...', 'info');



  sendRuntimeMessage({

    action: 'askQuestion',

    query,

    includeKeywords,

    excludeKeywords,

    maxResults

  })

    .then((response) => {

      if (!response) {

        throw new Error('No response from background script.');

      }

      if (!response.success) {

        throw new Error(response.error || 'Query failed.');

      }



      renderAnswer(response);

      if (panelState.questionInput) {

        panelState.questionInput.value = '';

      }

      showPanelStatus('Answer generated from captured tweets.', 'success');

    })

    .catch((error) => {

      panelState.answer.textContent = error.message || 'Query failed. Please try again.';

      panelState.answer.classList.add('xca-answer-error');

      showPanelStatus(error.message || 'Query failed. Please try again.', 'error');

    })

    .finally(() => {

      panelState.askButton.disabled = false;

      panelState.askButton.textContent = 'Ask';

    });

}



function renderAnswer(result) {

  if (!panelState.answer) {

    return;

  }



  panelState.answer.classList.remove('xca-answer-error');

  panelState.answer.innerHTML = '';



  const answerText = document.createElement('div');

  answerText.className = 'xca-answer-text';

  answerText.textContent = result.answer || 'No answer returned. Try asking a different question.';

  panelState.answer.appendChild(answerText);



  if (Array.isArray(result.sources) && result.sources.length > 0) {

    const sources = document.createElement('div');

    sources.className = 'xca-answer-sources';

    sources.textContent = `Sources: ${result.sources.join(' | ')}`;

    panelState.answer.appendChild(sources);

  }

}



function updateStatsDisplay() {
  // Update from local stats first
  if (panelState.tweetCount) {
    panelState.tweetCount.textContent = stats.tweetsProcessed;
  }

  if (panelState.accountCount) {
    panelState.accountCount.textContent = stats.accountsAnalyzed.size;
  }

  // Then sync with storage
  chrome.storage.local.get(['tweetsProcessed', 'accountsAnalyzed'], (data) => {
    if (typeof data.tweetsProcessed === 'number') {
      stats.tweetsProcessed = data.tweetsProcessed;
    }

    if (panelState.tweetCount) {
      panelState.tweetCount.textContent = stats.tweetsProcessed;
    }

    const accountCountValue = typeof data.accountsAnalyzed === 'number'
      ? data.accountsAnalyzed
      : stats.accountsAnalyzed.size;

    if (panelState.accountCount) {
      panelState.accountCount.textContent = accountCountValue;
    }
  });
}



function normalizeTweetText(text) {

  return (text || '')

    .replace(/\u00A0/g, ' ')

    .replace(/\r\n/g, '\n')

    .replace(/\t/g, ' ')

    .replace(/[ ]{2,}/g, ' ')

    .replace(/\n{3,}/g, '\n\n')

    .split('\n')

    .map((line) => line.trim())

    .join('\n')

    .trim();

}


function getTweetTextContent(tweetElement) {

  if (!tweetElement || typeof tweetElement.querySelector !== 'function') {

    return '';

  }


  const textElement = tweetElement.querySelector('[data-testid="tweetText"]');

  if (!textElement) {

    return '';

  }


  const fragment = textElement.cloneNode(true);


  const showMoreButtons = fragment.querySelectorAll("button[data-testid='tweet-text-show-more-link']");

  showMoreButtons.forEach((button) => {

    if (button && button.parentNode) {

      button.parentNode.removeChild(button);

    }

  });


  const rawText = fragment.textContent || '';

  return normalizeTweetText(rawText);

}


function extractTweetData(tweetElement) {

  try {

    const text = getTweetTextContent(tweetElement);

    if (!text) return null;



    const userElement = tweetElement.querySelector('[data-testid="User-Name"]');

    if (!userElement) return null;



    const usernameElement = userElement.querySelector('a');

    const username = usernameElement ? usernameElement.href.split('/').pop() : 'unknown';



    const displayNameElement = userElement.querySelector('span');

    const displayName = displayNameElement ? displayNameElement.innerText : username;



    const likeButton = tweetElement.querySelector('[data-testid="like"]');

    const retweetButton = tweetElement.querySelector('[data-testid="retweet"]');

    const replyButton = tweetElement.querySelector('[data-testid="reply"]');



    const likes = likeButton ? extractNumber(likeButton.getAttribute('aria-label')) : 0;

    const retweets = retweetButton ? extractNumber(retweetButton.getAttribute('aria-label')) : 0;

    const replies = replyButton ? extractNumber(replyButton.getAttribute('aria-label')) : 0;



    const timeElement = tweetElement.querySelector('time');

    const timestamp = timeElement ? timeElement.getAttribute('datetime') : new Date().toISOString();



    const followersElement = tweetElement.querySelector('[href*="/followers"]');

    const followingElement = tweetElement.querySelector('[href*="/following"]');



    const followersCount = followersElement ? extractNumber(followersElement.innerText) : 0;

    const followingCount = followingElement ? extractNumber(followingElement.innerText) : 0;



    const accountAge = calculateAccountAge(tweetElement);



    return {

      id: `${username}_${timestamp}`,

      text,

      timestamp,

      likes,

      retweets,

      replies,

      user: {

        username,

        displayName,

        followersCount,

        followingCount,

        accountAge

      }

    };

  } catch (error) {

    console.error('Error extracting tweet data:', error);

    return null;

  }

}



function extractNumber(text) {

  if (!text) return 0;



  const match = text.match(/(\d+(?:\.\d+)?)([KMB]?)/);

  if (!match) return 0;



  const num = parseFloat(match[1]);

  const suffix = match[2];



  switch (suffix) {

    case 'K':

      return Math.floor(num * 1000);

    case 'M':

      return Math.floor(num * 1000000);

    case 'B':

      return Math.floor(num * 1000000000);

    default:

      return Math.floor(num);

  }

}

// Utility: poll a predicate until it returns true or timeout expires
function waitFor(predicate, { timeoutMs = 1500, intervalMs = 50 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      try {
        if (predicate()) {
          resolve(true);
          return;
        }
      } catch (_) {}
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// Ensure a tweet is fully expanded (click Show more; un-clamp quoted tweets)
async function ensureTweetExpanded(tweetElement) {
  if (!tweetElement || typeof tweetElement.querySelector !== 'function') return;

  const showMoreBtn = tweetElement.querySelector("button[data-testid='tweet-text-show-more-link']");
  const textEl = tweetElement.querySelector("[data-testid='tweetText']");
  const initialLen = textEl && textEl.textContent ? textEl.textContent.length : 0;

  if (showMoreBtn) {
    try { showMoreBtn.click(); } catch (_) {}
    await waitFor(() => {
      const btn = tweetElement.querySelector("button[data-testid='tweet-text-show-more-link']");
      const el = tweetElement.querySelector("[data-testid='tweetText']");
      const len = el && el.textContent ? el.textContent.length : 0;
      return !btn || (len > initialLen);
    }, { timeoutMs: 1500, intervalMs: 50 });
  }

  try {
    const quotedTweet = tweetElement.querySelector("div[id^='id__'][aria-labelledby^='id__']");
    if (quotedTweet) {
      const quotedText = quotedTweet.querySelector("div[data-testid='tweetText']");
      if (quotedText && quotedText.style) {
        quotedText.style.removeProperty('-webkit-line-clamp');
      }
    }
  } catch (_) { /* ignore */ }
}

function calculateAccountAge(tweetElement) {
  const timeElement = tweetElement ? tweetElement.querySelector('time') : null;
  if (!timeElement) {
    return 0;
  }

  const datetime = timeElement.getAttribute('datetime');
  if (!datetime) {
    return 0;
  }

  const tweetDate = new Date(datetime);
  if (Number.isNaN(tweetDate.getTime())) {
    return 0;
  }

  const now = Date.now();
  const ageInMs = now - tweetDate.getTime();
  if (ageInMs <= 0) {
    return 0;
  }

  return Math.floor(ageInMs / (1000 * 60 * 60 * 24));
}





function startTweetMonitoring() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (isProcessingActive()) {
        processVisibleTweets();
      }
    });
  } else if (isProcessingActive()) {
    processVisibleTweets();
  }
}



init();
