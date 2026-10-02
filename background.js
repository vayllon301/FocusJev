// FocusJev Background Service Worker / Event Page
// Cross-browser: Works in Zen, Firefox, Chrome, Brave, Edge
// Powered by Jev (TypeSafe) on OpenRouter

const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'typesafe/jev-1.13';
const DEFAULT_THRESHOLD = 0.40;

const DEFAULT_WHITELIST = [
  'chrome://',
  'chrome-extension://',
  'moz-extension://',
  'about:',
  'resource://',
  'view-source:',
  'edge://',
  'devtools://',
  'localhost',
  '127.0.0.1'
];

// In-memory cache and evaluating tab tracking
const sessionCache = new Map(); // url -> { allowed: boolean, score: number, reason: string }
const evaluatingTabIds = new Set();

// Initialize extension defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['config', 'session', 'stats', 'blockHistory']);
  
  if (!current.config) {
    await chrome.storage.local.set({
      config: {
        apiKey: '',
        model: DEFAULT_MODEL,
        threshold: DEFAULT_THRESHOLD,
        showNotifications: true,
        closeExistingOnStart: true,
        whitelist: DEFAULT_WHITELIST
      }
    });
  }

  if (!current.session) {
    await chrome.storage.local.set({
      session: {
        active: false,
        goal: '',
        durationMinutes: 25,
        startTime: null,
        endTime: null
      }
    });
  }

  if (!current.stats) {
    await chrome.storage.local.set({
      stats: {
        blockedCount: 0,
        allowedCount: 0
      }
    });
  }

  if (!current.blockHistory) {
    await chrome.storage.local.set({ blockHistory: [] });
  }

  updateBadge(false, 0);
});

// Update extension icon badge
function updateBadge(isActive, blockedCount = 0) {
  try {
    if (!chrome.action) return;
    if (!isActive) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    chrome.action.setBadgeText({ text: blockedCount > 0 ? String(blockedCount) : 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: blockedCount > 0 ? '#EF4444' : '#6366F1' });
  } catch (e) {
    console.warn('Badge update error:', e);
  }
}

// Alarm listener for session timer expiration
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'focusTimer') {
    await endFocusSession('timer_expired');
  }
});

// Stop / end session
async function endFocusSession(reason = 'manual') {
  await chrome.alarms.clear('focusTimer');
  const { session, stats, config } = await chrome.storage.local.get(['session', 'stats', 'config']);

  if (session && session.active) {
    session.active = false;
    await chrome.storage.local.set({ session });
    updateBadge(false);
    sessionCache.clear();

    if (reason === 'timer_expired' && config?.showNotifications !== false) {
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🎉 Focus Session Completed!',
          message: `Great job! Goal: "${session.goal}". Distractions blocked: ${stats?.blockedCount || 0}.`,
          priority: 2
        });
      } catch (err) {
        console.warn('Notification error:', err);
      }
    }
  }
}

// Check if a URL should bypass AI judgment
function isWhitelisted(url, customWhitelist = []) {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();

  // Always ignore internal browser tabs, new tab, and empty tabs
  if (
    lowerUrl.startsWith('chrome://') ||
    lowerUrl.startsWith('chrome-extension://') ||
    lowerUrl.startsWith('moz-extension://') ||
    lowerUrl.startsWith('edge://') ||
    lowerUrl.startsWith('about:') ||
    lowerUrl.startsWith('resource://') ||
    lowerUrl.startsWith('view-source:') ||
    lowerUrl.startsWith('devtools://') ||
    lowerUrl === 'chrome://newtab/' ||
    lowerUrl === 'about:newtab' ||
    lowerUrl === 'about:home' ||
    lowerUrl === 'about:blank'
  ) {
    return true;
  }

  const allWhitelist = [...DEFAULT_WHITELIST, ...(customWhitelist || [])];
  for (const item of allWhitelist) {
    if (item && lowerUrl.includes(item.toLowerCase().trim())) {
      return true;
    }
  }

  return false;
}

// Call Jev on OpenRouter
async function judgeWithJev(apiKey, model, goal, tabUrl, tabTitle) {
  const modelToUse = model || DEFAULT_MODEL;

  const payload = {
    model: modelToUse,
    state: `User Goal: "${goal}"\nPage Title: "${tabTitle || 'Unknown'}"\nPage URL: "${tabUrl}"`,
    questions: {
      is_relevant_to_goal: {
        type: 'noul',
        instructions: `Is this webpage or browsing activity directly relevant, useful, or productive for the user's focus goal: "${goal}"?`,
        criteria: {
          true: `Webpages, tools, research, documentation, search results, articles, or resources that directly support or relate to: "${goal}".`,
          false: `Unrelated websites, entertainment, social media (unless explicitly required by the goal), gaming, shopping, irrelevant news, or off-topic distractions.`
        }
      }
    }
  };

  try {
    const res = await fetch(OPENROUTER_DECISIONS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://focusjev.extension',
        'X-Title': 'FocusJev Tab Enforcer'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      const noulResult = data?.answers?.is_relevant_to_goal?.noul;
      if (typeof noulResult === 'number') {
        return {
          score: noulResult,
          method: 'decisions_api'
        };
      }
    } else {
      console.warn('Jev decisions API returned status:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Jev decisions API error:', err);
  }

  // Graceful Fallback: Chat completion endpoint with Jev or fallback model
  try {
    const chatPayload = {
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: 'You are an objective AI focus monitor. Given a user goal, page title, and URL, determine if the page is relevant and productive for the goal. Output only a JSON object: {"is_relevant": true|false, "relevance_score": 0.0 to 1.0, "reason": "short explanation"}.'
        },
        {
          role: 'user',
          content: `Goal: "${goal}"\nPage Title: "${tabTitle}"\nURL: "${tabUrl}"`
        }
      ],
      response_format: { type: 'json_object' }
    };

    const chatRes = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://focusjev.extension',
        'X-Title': 'FocusJev Tab Enforcer'
      },
      body: JSON.stringify(chatPayload)
    });

    if (chatRes.ok) {
      const data = await chatRes.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content || '{}');
      const score = typeof parsed.relevance_score === 'number' ? parsed.relevance_score : (parsed.is_relevant ? 0.9 : 0.1);
      return {
        score: score,
        reason: parsed.reason || '',
        method: 'chat_api'
      };
    }
  } catch (chatErr) {
    console.error('OpenRouter Chat fallback error:', chatErr);
  }

  throw new Error('Unable to get judgment from OpenRouter model.');
}

// Evaluate a single tab against active goal
async function evaluateTab(tabId, tabUrl, tabTitle) {
  if (evaluatingTabIds.has(tabId)) return;

  const { session, config, stats, blockHistory } = await chrome.storage.local.get([
    'session',
    'config',
    'stats',
    'blockHistory'
  ]);

  if (!session || !session.active || !session.goal) return;
  if (!config || !config.apiKey) return;

  if (isWhitelisted(tabUrl, config.whitelist)) {
    return;
  }

  // Check cache for this exact URL
  const cached = sessionCache.get(tabUrl);
  if (cached) {
    if (!cached.allowed) {
      await hardCloseTab(tabId, tabUrl, tabTitle, cached.score, config, session);
    }
    return;
  }

  evaluatingTabIds.add(tabId);

  try {
    const threshold = typeof config.threshold === 'number' ? config.threshold : DEFAULT_THRESHOLD;
    const judgment = await judgeWithJev(
      config.apiKey,
      config.model || DEFAULT_MODEL,
      session.goal,
      tabUrl,
      tabTitle
    );

    const isAllowed = judgment.score >= threshold;

    // Cache result
    sessionCache.set(tabUrl, {
      allowed: isAllowed,
      score: judgment.score,
      timestamp: Date.now()
    });

    if (!isAllowed) {
      // Off-task tab detected -> Hard close immediately!
      await hardCloseTab(tabId, tabUrl, tabTitle, judgment.score, config, session);

      // Record in stats & history
      const newBlockedCount = (stats?.blockedCount || 0) + 1;
      const updatedStats = {
        blockedCount: newBlockedCount,
        allowedCount: stats?.allowedCount || 0
      };

      const historyEntry = {
        id: 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        url: tabUrl,
        title: tabTitle || tabUrl,
        score: Math.round(judgment.score * 100),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        goal: session.goal
      };

      const updatedHistory = [historyEntry, ...(blockHistory || [])].slice(0, 50);

      await chrome.storage.local.set({
        stats: updatedStats,
        blockHistory: updatedHistory
      });

      updateBadge(true, newBlockedCount);
    } else {
      const updatedStats = {
        blockedCount: stats?.blockedCount || 0,
        allowedCount: (stats?.allowedCount || 0) + 1
      };
      await chrome.storage.local.set({ stats: updatedStats });
    }
  } catch (err) {
    console.error('Error during tab judgment:', err);
  } finally {
    evaluatingTabIds.delete(tabId);
  }
}

// Safely hard close the tab and prevent closing the browser window if it's the last tab
async function hardCloseTab(tabId, tabUrl, tabTitle, score, config, session) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;

    // Check how many tabs exist in this window
    const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
    if (windowTabs.length <= 1) {
      // If it's the only tab, open a new blank tab first so the window doesn't close
      await chrome.tabs.create({ windowId: tab.windowId });
    }

    // Immediately remove the off-task tab
    await chrome.tabs.remove(tabId);

    // Show desktop notification if enabled
    if (config?.showNotifications !== false) {
      try {
        const displayTitle = tabTitle ? `"${tabTitle.slice(0, 45)}..."` : tabUrl.slice(0, 45);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🚫 FocusJev Closed Off-Task Tab',
          message: `${displayTitle}\nRelevance to "${session.goal}": ${Math.round(score * 100)}%`,
          priority: 1
        });
      } catch (notifErr) {
        console.warn('Notification error:', notifErr);
      }
    }
  } catch (e) {
    console.warn('Could not remove tab (might have already been closed):', e);
  }
}

// Scan all open tabs when session starts
async function scanAllOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url && !isWhitelisted(tab.url)) {
      evaluateTab(tab.id, tab.url, tab.title || '');
    }
  }
}

// Listen to tab updates (page load or URL change)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only evaluate when status is complete or URL has changed
  if (changeInfo.status === 'complete' || changeInfo.url) {
    const url = changeInfo.url || tab.url;
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      evaluateTab(tabId, url, tab.title || '');
    }
  }
});

// Message listener for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'START_SESSION') {
    handleStartSession(request.data)
      .then((res) => sendResponse({ success: true, session: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.type === 'STOP_SESSION') {
    endFocusSession('manual')
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'TEST_CONNECTION') {
    testOpenRouterConnection(request.data.apiKey, request.data.model)
      .then((res) => sendResponse({ success: true, result: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ blockHistory: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Start focus session
async function handleStartSession({ goal, durationMinutes }) {
  const { config } = await chrome.storage.local.get(['config']);
  if (!config || !config.apiKey) {
    throw new Error('OpenRouter API key is required before starting a session.');
  }

  const duration = parseInt(durationMinutes, 10) || 25;
  const startTime = Date.now();
  const endTime = startTime + duration * 60 * 1000;

  const session = {
    active: true,
    goal: goal.trim(),
    durationMinutes: duration,
    startTime: startTime,
    endTime: endTime
  };

  // Reset stats and cache for new session
  sessionCache.clear();
  await chrome.storage.local.set({
    session,
    stats: { blockedCount: 0, allowedCount: 0 }
  });

  // Set alarm for session end
  await chrome.alarms.clear('focusTimer');
  chrome.alarms.create('focusTimer', { when: endTime });

  updateBadge(true, 0);

  // If enabled, scan existing tabs to close distractions immediately
  if (config.closeExistingOnStart !== false) {
    scanAllOpenTabs();
  }

  return session;
}

// Test OpenRouter connectivity with Jev
async function testOpenRouterConnection(apiKey, model) {
  if (!apiKey) throw new Error('API key cannot be empty.');
  const modelToUse = model || DEFAULT_MODEL;

  const res = await fetch(OPENROUTER_DECISIONS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://focusjev.extension',
      'X-Title': 'FocusJev Tab Enforcer'
    },
    body: JSON.stringify({
      model: modelToUse,
      state: 'Test connection for FocusJev',
      questions: {
        test: {
          type: 'noul',
          instructions: 'Is this connection valid?',
          criteria: {
            true: 'Connection is working',
            false: 'Connection failed'
          }
        }
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    // Also test chat endpoint if decisions endpoint returns error
    const chatRes = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [{ role: 'user', content: 'respond with ok' }]
      })
    });

    if (!chatRes.ok) {
      throw new Error(`OpenRouter returned HTTP ${res.status}: ${errorText || 'Unauthorized or invalid key'}`);
    }
  }

  return { status: 'Connected successfully with ' + modelToUse };
}
