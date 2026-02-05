// Ozon Analytics Assistant - Background Service Worker
// Работает с нашим сервером (прокси к Claude API)
// Разработчик: @first_seller

// URL сервера
const API_BASE_URL = 'http://147.45.50.254:3000';

// Получаем API ключ из storage
async function getApiKey() {
  const result = await chrome.storage.sync.get(['apiKey']);
  return result.apiKey;
}

// Получаем текущую сессию
async function getSessionId(domain) {
  const key = `session_${domain.replace(/\./g, '_')}`;
  const result = await chrome.storage.local.get([key]);
  return result[key];
}

// Сохраняем сессию
async function saveSessionId(domain, sessionId) {
  const key = `session_${domain.replace(/\./g, '_')}`;
  await chrome.storage.local.set({ [key]: sessionId });
}

// Определяем домен
function getDomain(url) {
  if (url.includes('seller.ozon.ru')) return 'seller.ozon.ru';
  if (url.includes('ozon.ru')) return 'ozon.ru';
  return 'unknown';
}

// Запрос к серверу
async function apiRequest(endpoint, method, body, apiKey) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Ошибка сервера: ${response.status}`);
  }

  return data;
}

// Отправка сообщения
async function sendMessage(userMessage, pageData, sessionId) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('API ключ не настроен. Откройте настройки расширения.');
  }

  const domain = getDomain(pageData.url);
  const currentSessionId = sessionId || await getSessionId(domain);

  const response = await apiRequest('/api/chat/message', 'POST', {
    message: userMessage,
    pageData: pageData,
    sessionId: currentSessionId
  }, apiKey);

  // Сохраняем ID сессии
  if (response.sessionId) {
    await saveSessionId(domain, response.sessionId);
  }

  return response;
}

// Получение баланса
async function getBalance() {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new Error('API ключ не настроен');
  }

  return await apiRequest('/api/billing/balance', 'GET', null, apiKey);
}

// Получение истории чата
async function getChatHistory(sessionId) {
  const apiKey = await getApiKey();

  if (!apiKey || !sessionId) {
    return { messages: [] };
  }

  try {
    return await apiRequest(`/api/chat/history/${sessionId}`, 'GET', null, apiKey);
  } catch (e) {
    return { messages: [] };
  }
}

// Обработчик сообщений от content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Отправка сообщения в чат
  if (request.type === 'SEND_MESSAGE') {
    sendMessage(request.message, request.pageData, request.sessionId)
      .then(response => {
        sendResponse({
          answer: response.answer,
          sessionId: response.sessionId,
          usage: response.usage
        });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }

  // Получение баланса
  if (request.type === 'GET_BALANCE') {
    getBalance()
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        sendResponse({ error: error.message, balance: 0 });
      });
    return true;
  }

  // Получение истории
  if (request.type === 'GET_HISTORY') {
    getChatHistory(request.sessionId)
      .then(response => {
        sendResponse(response);
      })
      .catch(error => {
        sendResponse({ error: error.message, messages: [] });
      });
    return true;
  }

  // Получение сессии для домена
  if (request.type === 'GET_SESSION') {
    getSessionId(request.domain)
      .then(sessionId => {
        sendResponse({ sessionId });
      });
    return true;
  }

  // Получение API ключа
  if (request.type === 'GET_API_KEY') {
    getApiKey().then(key => {
      sendResponse({ apiKey: key || '' });
    });
    return true;
  }

  // Сохранение API ключа
  if (request.type === 'SAVE_API_KEY') {
    chrome.storage.sync.set({ apiKey: request.apiKey }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Очистка сессии
  if (request.type === 'CLEAR_SESSION') {
    const domain = request.domain || 'seller.ozon.ru';
    const key = `session_${domain.replace(/\./g, '_')}`;
    chrome.storage.local.remove([key]).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// При установке расширения
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'popup.html' });
  }
});
