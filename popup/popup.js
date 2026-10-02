// FocusJev Popup Logic

let timerInterval = null;
let currentDurationMinutes = 25;

// Elements
const navBtns = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const blockedBadge = document.getElementById('blockedBadge');

// Focus Tab Elements
const missingKeyBanner = document.getElementById('missingKeyBanner');
const goToSettingsBtn = document.getElementById('goToSettingsBtn');
const setupView = document.getElementById('setupView');
const activeView = document.getElementById('activeView');
const goalInput = document.getElementById('goalInput');
const chips = document.querySelectorAll('.chip');
const durationPills = document.querySelectorAll('.duration-pill');
const customMinutesInput = document.getElementById('customMinutes');
const startSessionBtn = document.getElementById('startSessionBtn');
const stopSessionBtn = document.getElementById('stopSessionBtn');

// Active View Elements
const activeGoalDisplay = document.getElementById('activeGoalDisplay');
const timeRemainingDisplay = document.getElementById('timeRemainingDisplay');
const activeBlockedCount = document.getElementById('activeBlockedCount');
const activeAllowedCount = document.getElementById('activeAllowedCount');
const activeModelSlug = document.getElementById('activeModelSlug');
const feedCountText = document.getElementById('feedCountText');
const recentFeedList = document.getElementById('recentFeedList');

// History Log Elements
const fullHistoryList = document.getElementById('fullHistoryList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Settings Elements
const apiKeyInput = document.getElementById('apiKeyInput');
const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');
const testKeyBtn = document.getElementById('testKeyBtn');
const testResult = document.getElementById('testResult');
const modelInput = document.getElementById('modelInput');
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdLabel = document.getElementById('thresholdLabel');
const showNotificationsCheckbox = document.getElementById('showNotificationsCheckbox');
const closeExistingCheckbox = document.getElementById('closeExistingCheckbox');
const whitelistInput = document.getElementById('whitelistInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const saveFeedback = document.getElementById('saveFeedback');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupDurationPills();
  setupChips();
  setupThresholdSlider();
  setupSettingsHandlers();
  setupActionButtons();

  await refreshAll();

  // Listen for background updates
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.session || changes.stats || changes.blockHistory) {
        refreshAll();
      }
    }
  });
});

// Navigation tab switching
function setupNavigation() {
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      navBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((t) => t.classList.remove('active'));

      btn.classList.add('active');
      const targetElement = document.getElementById(targetTab);
      if (targetElement) {
        targetElement.classList.add('active');
      }
    });
  });

  goToSettingsBtn.addEventListener('click', () => {
    document.querySelector('.nav-btn[data-tab="settingsTab"]').click();
  });
}

// Duration Selection
function setupDurationPills() {
  durationPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      durationPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      customMinutesInput.value = '';
      currentDurationMinutes = parseInt(pill.getAttribute('data-mins'), 10);
    });
  });

  customMinutesInput.addEventListener('input', () => {
    const val = parseInt(customMinutesInput.value, 10);
    if (val && val > 0) {
      durationPills.forEach((p) => p.classList.remove('active'));
      currentDurationMinutes = val;
    }
  });
}

// Chips for quick goals
function setupChips() {
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      goalInput.value = chip.getAttribute('data-chip');
      goalInput.focus();
    });
  });
}

// Strictness Slider
function setupThresholdSlider() {
  thresholdSlider.addEventListener('input', () => {
    updateSliderLabel(parseInt(thresholdSlider.value, 10));
  });
}

function updateSliderLabel(val) {
  let label = 'Balanced';
  if (val <= 25) label = 'Lenient';
  else if (val >= 50) label = 'Strict';
  thresholdLabel.textContent = `${label} (${val}%)`;
}

// Settings Handlers
function setupSettingsHandlers() {
  toggleKeyVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleKeyVisibility.textContent = '🔒';
    } else {
      apiKeyInput.type = 'password';
      toggleKeyVisibility.textContent = '👁️';
    }
  });

  testKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelInput.value.trim();
    if (!key) {
      testResult.textContent = 'Enter an API key first';
      testResult.className = 'test-result-text error';
      return;
    }

    testResult.textContent = 'Testing Jev connection...';
    testResult.className = 'test-result-text';
    testKeyBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_CONNECTION',
        data: { apiKey: key, model: model }
      });

      if (response && response.success) {
        testResult.textContent = '✓ Jev connection verified!';
        testResult.className = 'test-result-text success';
      } else {
        testResult.textContent = '✗ ' + (response?.error || 'Failed to connect');
        testResult.className = 'test-result-text error';
      }
    } catch (err) {
      testResult.textContent = '✗ Connection error: ' + err.message;
      testResult.className = 'test-result-text error';
    } finally {
      testKeyBtn.disabled = false;
    }
  });

  saveSettingsBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelInput.value.trim() || 'typesafe/jev-1.13';
    const threshold = parseInt(thresholdSlider.value, 10) / 100.0;
    const showNotifications = showNotificationsCheckbox.checked;
    const closeExistingOnStart = closeExistingCheckbox.checked;
    const whitelist = whitelistInput.value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const config = {
      apiKey: key,
      model: model,
      threshold: threshold,
      showNotifications: showNotifications,
      closeExistingOnStart: closeExistingOnStart,
      whitelist: whitelist
    };

    await chrome.storage.local.set({ config });

    saveFeedback.classList.remove('hidden');
    setTimeout(() => {
      saveFeedback.classList.add('hidden');
    }, 2500);

    await refreshAll();
  });
}

// Action Buttons
function setupActionButtons() {
  startSessionBtn.addEventListener('click', async () => {
    const goal = goalInput.value.trim();
    if (!goal) {
      goalInput.focus();
      goalInput.style.borderColor = '#EF4444';
      setTimeout(() => (goalInput.style.borderColor = ''), 1500);
      return;
    }

    const { config } = await chrome.storage.local.get(['config']);
    if (!config || !config.apiKey) {
      document.querySelector('.nav-btn[data-tab="settingsTab"]').click();
      apiKeyInput.focus();
      return;
    }

    startSessionBtn.disabled = true;
    startSessionBtn.textContent = 'Starting...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_SESSION',
        data: {
          goal: goal,
          durationMinutes: currentDurationMinutes
        }
      });

      if (response && response.success) {
        await refreshAll();
      } else {
        alert(response?.error || 'Could not start session.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      startSessionBtn.disabled = false;
      startSessionBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Focus Session
      `;
    }
  });

  stopSessionBtn.addEventListener('click', async () => {
    if (confirm('End this focus session early?')) {
      await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
      await refreshAll();
    }
  });

  clearHistoryBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    await refreshAll();
  });
}

// Refresh whole UI
async function refreshAll() {
  const { session, config, stats, blockHistory } = await chrome.storage.local.get([
    'session',
    'config',
    'stats',
    'blockHistory'
  ]);

  // Check API key
  const hasKey = !!(config && config.apiKey);
  if (!hasKey) {
    missingKeyBanner.classList.remove('hidden');
  } else {
    missingKeyBanner.classList.add('hidden');
  }

  // Populate settings form if not dirty
  if (config) {
    if (!apiKeyInput.value && config.apiKey) apiKeyInput.value = config.apiKey;
    if (config.model) modelInput.value = config.model;
    if (typeof config.threshold === 'number') {
      const pct = Math.round(config.threshold * 100);
      thresholdSlider.value = pct;
      updateSliderLabel(pct);
    }
    showNotificationsCheckbox.checked = config.showNotifications !== false;
    closeExistingCheckbox.checked = config.closeExistingOnStart !== false;
    if (Array.isArray(config.whitelist) && !whitelistInput.value) {
      whitelistInput.value = config.whitelist.join(', ');
    }
  }

  // Update blocked badge
  const blockedCount = stats?.blockedCount || 0;
  blockedBadge.textContent = String(blockedCount);

  // Check session state
  if (session && session.active && session.endTime && session.endTime > Date.now()) {
    // ACTIVE VIEW
    setupView.classList.add('hidden');
    activeView.classList.remove('hidden');

    statusPill.className = 'status-pill active';
    statusText.textContent = 'ACTIVE';

    activeGoalDisplay.textContent = session.goal || 'Focus Mode';
    activeBlockedCount.textContent = String(stats?.blockedCount || 0);
    activeAllowedCount.textContent = String(stats?.allowedCount || 0);

    const modelName = (config?.model || 'typesafe/jev-1.13').split('/').pop();
    activeModelSlug.textContent = modelName;

    feedCountText.textContent = `${blockedCount} closed`;

    // Render Recent Feed (last 3)
    renderRecentFeed(blockHistory || []);

    // Start Timer
    startCountdown(session.endTime);
  } else {
    // INACTIVE VIEW
    stopCountdown();
    setupView.classList.remove('hidden');
    activeView.classList.add('hidden');

    statusPill.className = 'status-pill idle';
    statusText.textContent = 'IDLE';
  }

  // Render Full History Log
  renderFullHistory(blockHistory || []);
}

// Countdown timer
function startCountdown(endTime) {
  stopCountdown();

  function update() {
    const diff = endTime - Date.now();
    if (diff <= 0) {
      timeRemainingDisplay.textContent = '00:00';
      stopCountdown();
      refreshAll();
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    timeRemainingDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  update();
  timerInterval = setInterval(update, 1000);
}

function stopCountdown() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Render recent feed in active view
function renderRecentFeed(history) {
  if (!history || history.length === 0) {
    recentFeedList.innerHTML = '<div class="feed-empty">No off-task tabs detected yet. You\'re locked in!</div>';
    return;
  }

  const items = history.slice(0, 3);
  recentFeedList.innerHTML = items
    .map(
      (item) => `
    <div class="feed-item">
      <div class="feed-item-left">
        <span class="feed-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title || 'Untitled')}</span>
        <span class="feed-item-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</span>
      </div>
      <span class="feed-badge">${item.score}% match</span>
    </div>
  `
    )
    .join('');
}

// Render full history list in Blocked tab
function renderFullHistory(history) {
  if (!history || history.length === 0) {
    fullHistoryList.innerHTML = '<div class="feed-empty">No distractions blocked yet.</div>';
    return;
  }

  fullHistoryList.innerHTML = history
    .map(
      (item) => `
    <div class="feed-item">
      <div class="feed-item-left">
        <span class="feed-item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title || 'Untitled')}</span>
        <span class="feed-item-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</span>
        <span style="font-size: 9px; color: #64748B; margin-top: 2px;">
          Closed at ${item.time} &bull; Goal: "${escapeHtml(item.goal || '')}"
        </span>
      </div>
      <span class="feed-badge">${item.score}% match</span>
    </div>
  `
    )
    .join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
