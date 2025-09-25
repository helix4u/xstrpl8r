// Content script for X.com tweet monitoring
const PANEL_ID = 'xai-analyzer-panel';
let isAnalyzing = false;
let processedTweets = new Set();
const stats = {
  tweetsProcessed: 0,
  accountsAnalyzed: new Set()
};

let tweetObserver = null;

const panelState = {
  root: null,
  toggleButton: null,
  status: null,
  tweetCount: null,
  accountCount: null,
  results: null,
  questionInput: null,
  askButton: null,
  answer: null
};

function init() {
  console.log('X.com AI Analyzer content script loaded');
  injectPanelStyles();
  createFloatingPanel();
  registerRuntimeListeners();
  startTweetMonitoring();
  updateStatsDisplay();
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
      right: 24px;
      bottom: 24px;
      width: 360px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      background: rgba(17, 17, 17, 0.92);
      color: #f2f2f2;
      font-family: 'Segoe UI', Arial, sans-serif;
      border-radius: 12px;
      box-shadow: 0 18px 32px rgba(0, 0, 0, 0.35);
      z-index: 2147483647;
      overflow: hidden;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID}.is-paused {
      opacity: 0.9;
    }

    #${PANEL_ID} .xca-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    #${PANEL_ID} .xca-title {
      font-size: 16px;
      font-weight: 600;
    }

    #${PANEL_ID} .xca-toggle {
      border: none;
      border-radius: 20px;
      background: #0078d4;
      color: #ffffff;
      cursor: pointer;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.2s ease;
    }

    #${PANEL_ID} .xca-toggle.is-active {
      background: #d43f00;
    }

    #${PANEL_ID} .xca-toggle:disabled {
      opacity: 0.6;
      cursor: default;
    }

    #${PANEL_ID} .xca-status {
      padding: 8px 16px;
      font-size: 12px;
      color: #d0d0d0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    #${PANEL_ID} .xca-status[data-state="error"] {
      color: #ffb3b3;
    }

    #${PANEL_ID} .xca-status[data-state="success"] {
      color: #8ce199;
    }

    #${PANEL_ID} .xca-stats {
      display: flex;
      gap: 16px;
      padding: 8px 16px;
      font-size: 12px;
      color: #bbbbbb;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    #${PANEL_ID} .xca-stats strong {
      color: #ffffff;
    }

    #${PANEL_ID} .xca-question {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(255, 255, 255, 0.02);
    }

    #${PANEL_ID} .xca-question input {
      flex: 1;
      padding: 8px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      font-size: 13px;
    }

    #${PANEL_ID} .xca-question input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }

    #${PANEL_ID} .xca-question button {
      border: none;
      border-radius: 6px;
      background: #00a870;
      color: #ffffff;
      cursor: pointer;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.2s ease;
    }

    #${PANEL_ID} .xca-question button:disabled {
      opacity: 0.6;
      cursor: default;
    }

    #${PANEL_ID} .xca-answer {
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.4;
      color: #e6e6e6;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      max-height: 120px;
      overflow-y: auto;
    }

    #${PANEL_ID} .xca-answer.xca-answer-error {
      color: #ffb3b3;
    }

    #${PANEL_ID} .xca-answer .xca-answer-sources {
      margin-top: 8px;
      font-size: 12px;
      color: #bbbbbb;
    }

    #${PANEL_ID} .xca-results {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    #${PANEL_ID} .xca-empty {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      text-align: center;
      padding: 24px 0;
    }

    #${PANEL_ID} .xca-result {
      background: rgba(255, 255, 255, 0.04);
      border-radius: 10px;
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #${PANEL_ID} .xca-result-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.75);
    }

    #${PANEL_ID} .xca-result-text {
      font-size: 13px;
      color: #ffffff;
      white-space: pre-wrap;
    }

    #${PANEL_ID} .xca-result-analysis {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.8);
    }

    #${PANEL_ID} .xca-result-flags {
      font-size: 11px;
      color: #ffb347;
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
      <span class="xca-title">X.com AI Analyzer</span>
      <button class="xca-toggle" type="button">Start Analysis</button>
    </div>
    <div class="xca-status" data-state="info">Analyzer idle. Toggle to start collecting tweets.</div>
    <div class="xca-stats">
      <span>Tweets: <strong data-role="tweets">0</strong></span>
      <span>Accounts: <strong data-role="accounts">0</strong></span>
    </div>
    <div class="xca-question">
      <input type="text" data-role="question" placeholder="Ask about analyzed tweets..." />
      <button type="button" data-role="ask">Ask</button>
    </div>
    <div class="xca-answer" data-role="answer">Questions and answers will appear here.</div>
    <div class="xca-results" data-role="results">
      <div class="xca-empty">No tweets analyzed yet.</div>
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
  panelState.askButton = panel.querySelector('[data-role="ask"]');
  panelState.answer = panel.querySelector('[data-role="answer"]');

  panelState.toggleButton.addEventListener('click', () => {
    if (isAnalyzing) {
      stopAnalysis('Analysis paused. Toggle to resume.');
    } else {
      startAnalysis('ui');
    }
  });

  panelState.askButton.addEventListener('click', () => {
    const query = (panelState.questionInput.value || '').trim();
    if (!query) {
      showPanelStatus('Enter a question to query analyzed tweets.', 'info');
      return;
    }
    askQuestion(query);
  });
}

function registerRuntimeListeners() {
  chrome.runtime.onMessage.addListener((request) => {
    if (!request || !request.action) {
      return;
    }

    if (request.action === 'startAnalysis') {
      startAnalysis('popup');
    } else if (request.action === 'stopAnalysis') {
      stopAnalysis('Analysis stopped from popup.');
    } else if (request.action === 'updateStats') {
      updateStatsDisplay();
    }
  });
}

function startAnalysis(source = 'ui') {
  if (isAnalyzing) {
    showPanelStatus('Analysis already running.', 'info');
    return;
  }

  isAnalyzing = true;
  updateToggleButton();
  showPanelStatus('Analyzing tweets in this timeline...', 'success');
  processVisibleTweets();
  setupTweetObserver();
  console.log(`Tweet analysis started via ${source}`);
}

function stopAnalysis(message = 'Analysis paused.') {
  if (!isAnalyzing) {
    return;
  }

  isAnalyzing = false;
  updateToggleButton();
  showPanelStatus(message, 'info');
  console.log('Tweet analysis paused.');
}

function updateToggleButton() {
  if (!panelState.toggleButton || !panelState.root) {
    return;
  }

  if (isAnalyzing) {
    panelState.toggleButton.textContent = 'Pause Analysis';
    panelState.toggleButton.classList.add('is-active');
    panelState.root.classList.remove('is-paused');
  } else {
    panelState.toggleButton.textContent = 'Start Analysis';
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
  const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
  console.log(`Found ${tweetElements.length} tweets on page`);

  tweetElements.forEach((tweetElement) => {
    if (isAnalyzing) {
      processTweet(tweetElement);
    }
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

        const tweetElement = node.querySelector
          ? node.querySelector('[data-testid="tweet"]')
          : node.matches && node.matches('[data-testid="tweet"]')
            ? node
            : null;

        if (tweetElement && isAnalyzing) {
          processTweet(tweetElement);
        }
      });
    });
  });

  tweetObserver.observe(document.body, { childList: true, subtree: true });
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
  try {
    const tweetData = extractTweetData(tweetElement);
    if (!tweetData || processedTweets.has(tweetData.id)) {
      return;
    }

    processedTweets.add(tweetData.id);
    console.log('Processing tweet:', tweetData.text.substring(0, 80));

    const response = await sendRuntimeMessage({
      action: 'analyzeTweet',
      tweetData
    });

    if (response && response.success) {
      console.log('Tweet analysis completed:', response.analysis);
      addAnalysisResult(tweetData, response.analysis);
    } else {
      const errorMessage = response && response.error
        ? response.error
        : 'Unknown analysis failure';
      console.error('Tweet analysis failed:', errorMessage);
      showPanelStatus(errorMessage, 'error');
    }

    stats.tweetsProcessed += 1;
    stats.accountsAnalyzed.add(tweetData.user.username);

    chrome.storage.local.set({
      tweetsProcessed: stats.tweetsProcessed,
      accountsAnalyzed: stats.accountsAnalyzed.size
    });

    chrome.runtime.sendMessage({ action: 'updateStats' });
    updateStatsDisplay();
  } catch (error) {
    console.error('Error processing tweet:', error);
    showPanelStatus(error.message || 'Unexpected error while processing tweet.', 'error');
  }
}

function addAnalysisResult(tweetData, analysis) {
  if (!panelState.results) {
    return;
  }

  const redFlags = Array.isArray(analysis.red_flags)
    ? analysis.red_flags
    : analysis.red_flags
    ? [analysis.red_flags]
    : [];

  const item = document.createElement('div');
  item.className = 'xca-result';

  const header = document.createElement('div');
  header.className = 'xca-result-header';
  header.innerHTML = `
    <span>@${sanitizeText(tweetData.user.username)}</span>
    <span>Toxicity ${Number(analysis.toxicity_score ?? 0).toFixed(1)}/10 � Bot ${Number(analysis.bot_likelihood ?? 0).toFixed(1)}/10</span>
  `;

  const text = document.createElement('div');
  text.className = 'xca-result-text';
  text.textContent = tweetData.text;

  const analysisSummary = document.createElement('div');
  analysisSummary.className = 'xca-result-analysis';
  analysisSummary.textContent = analysis.analysis || 'No analysis summary provided.';

  item.appendChild(header);
  item.appendChild(text);
  item.appendChild(analysisSummary);

  if (redFlags.length > 0) {
    const flags = document.createElement('div');
    flags.className = 'xca-result-flags';
    flags.textContent = `Red flags: ${redFlags.join(', ')}`;
    item.appendChild(flags);
  }

  if (panelState.results.querySelector('.xca-empty')) {
    panelState.results.innerHTML = '';
  }

  panelState.results.prepend(item);

  while (panelState.results.children.length > 20) {
    panelState.results.removeChild(panelState.results.lastElementChild);
  }
}

function sanitizeText(value) {
  return String(value || '').replace(/[<>]/g, '');
}

function askQuestion(query) {
  if (!panelState.askButton || !panelState.answer) {
    return;
  }

  panelState.askButton.disabled = true;
  panelState.askButton.textContent = 'Asking...';
  showPanelStatus('Querying analyzed tweets...', 'info');

  sendRuntimeMessage({ action: 'askQuestion', query })
    .then((response) => {
      if (!response) {
        throw new Error('No response from background script.');
      }
      if (!response.success) {
        throw new Error(response.error || 'Query failed.');
      }

      renderAnswer(response);
      panelState.questionInput.value = '';
      showPanelStatus('Answer generated from analyzed tweets.', 'success');
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

function extractTweetData(tweetElement) {
  try {
    const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
    if (!textElement) return null;

    const text = textElement.innerText;

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

function calculateAccountAge(tweetElement) {
  const timeElement = tweetElement.querySelector('time');
  if (timeElement) {
    const tweetDate = new Date(timeElement.getAttribute('datetime'));
    const now = new Date();
    return Math.floor((now - tweetDate) / (1000 * 60 * 60 * 24));
  }
  return 0;
}

function startTweetMonitoring() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (isAnalyzing) {
        processVisibleTweets();
      }
    });
  } else if (isAnalyzing) {
    processVisibleTweets();
  }
}

init();

