// Ozon Analytics Assistant - Content Script
// Собирает данные со страницы и предоставляет UI для взаимодействия
// Разработчик: @first_seller

(function() {
    'use strict';

    // Проверяем, что мы на странице Ozon
    const currentUrl = window.location.href;
    if (!currentUrl.includes('ozon.ru')) {
        return;
    }

    // Определяем режим работы
    const isSellerMode = currentUrl.includes('seller.ozon.ru');
    const mode = isSellerMode ? 'seller' : 'competitor';

    // Состояние приложения
    let isExpanded = false;
    let isLoading = false;
    let currentSessionId = null;
    let currentBalance = 0;

    // Создаём плавающую кнопку и панель чата
    function createFloatingUI() {
        const container = document.createElement('div');
        container.id = 'ozon-assistant-container';
        container.innerHTML = `
            <button id="ozon-assistant-btn" title="Ozon Analytics Assistant">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 19H11V17H13V19ZM15.07 11.25L14.17 12.17C13.45 12.9 13 13.5 13 15H11V14.5C11 13.4 11.45 12.4 12.17 11.67L13.41 10.41C13.78 10.05 14 9.55 14 9C14 7.9 13.1 7 12 7C10.9 7 10 7.9 10 9H8C8 6.79 9.79 5 12 5C14.21 5 16 6.79 16 9C16 9.88 15.64 10.68 15.07 11.25Z" fill="white"/>
                </svg>
            </button>
            <div id="ozon-assistant-panel">
                <div id="ozon-assistant-header">
                    <div class="header-left">
                        <span class="header-title">Ozon Assistant</span>
                        <span class="header-mode">${isSellerMode ? 'Кабинет' : 'Конкуренты'}</span>
                    </div>
                    <div class="header-right">
                        <span id="ozon-assistant-balance" title="Ваш баланс">$0.00</span>
                        <button id="ozon-assistant-close">&times;</button>
                    </div>
                </div>
                <div id="ozon-assistant-chat">
                    <div id="ozon-assistant-messages">
                        <div class="assistant-message">
                            👋 Привет! Я помогу проанализировать данные на этой странице.
                            <br><br>
                            ${isSellerMode
                                ? 'Вы в кабинете продавца. Спрашивайте о продажах, товарах, аналитике.'
                                : 'Вы на странице Ozon. Спрашивайте о конкурентах, ценах, товарах.'}
                            <br><br>
                            <small>Разработчик: <a href="https://t.me/first_seller" target="_blank">@first_seller</a></small>
                        </div>
                    </div>
                </div>
                <div id="ozon-assistant-input-area">
                    <textarea id="ozon-assistant-input" placeholder="Задайте вопрос о данных на странице..." rows="2"></textarea>
                    <button id="ozon-assistant-send">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="white"/>
                        </svg>
                    </button>
                </div>
                <div id="ozon-assistant-footer">
                    <button id="ozon-assistant-clear" title="Начать новый чат">🗑️ Очистить</button>
                    <span id="ozon-assistant-usage"></span>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        setupEventListeners();
        loadBalance();
        loadHistory();
    }

    // Настройка обработчиков событий
    function setupEventListeners() {
        const btn = document.getElementById('ozon-assistant-btn');
        const panel = document.getElementById('ozon-assistant-panel');
        const closeBtn = document.getElementById('ozon-assistant-close');
        const sendBtn = document.getElementById('ozon-assistant-send');
        const input = document.getElementById('ozon-assistant-input');
        const clearBtn = document.getElementById('ozon-assistant-clear');

        btn.addEventListener('click', () => {
            isExpanded = !isExpanded;
            panel.classList.toggle('expanded', isExpanded);
            btn.classList.toggle('hidden', isExpanded);
            if (isExpanded) {
                input.focus();
                loadBalance();
            }
        });

        closeBtn.addEventListener('click', () => {
            isExpanded = false;
            panel.classList.remove('expanded');
            btn.classList.remove('hidden');
        });

        sendBtn.addEventListener('click', sendMessage);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        clearBtn.addEventListener('click', clearChat);
    }

    // Загрузка баланса
    async function loadBalance() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_BALANCE' });
            if (response && typeof response.balance === 'number') {
                currentBalance = response.balance;
                updateBalanceDisplay();
            }
        } catch (e) {
            console.error('Ошибка загрузки баланса:', e);
        }
    }

    // Обновление отображения баланса
    function updateBalanceDisplay() {
        const balanceEl = document.getElementById('ozon-assistant-balance');
        if (balanceEl) {
            balanceEl.textContent = `$${currentBalance.toFixed(2)}`;
            balanceEl.classList.toggle('low-balance', currentBalance < 1);
        }
    }

    // Загрузка истории
    async function loadHistory() {
        const domain = isSellerMode ? 'seller.ozon.ru' : 'ozon.ru';

        try {
            const sessionResponse = await chrome.runtime.sendMessage({
                type: 'GET_SESSION',
                domain
            });

            if (sessionResponse && sessionResponse.sessionId) {
                currentSessionId = sessionResponse.sessionId;

                const historyResponse = await chrome.runtime.sendMessage({
                    type: 'GET_HISTORY',
                    sessionId: currentSessionId
                });

                if (historyResponse && historyResponse.messages) {
                    const messagesContainer = document.getElementById('ozon-assistant-messages');

                    historyResponse.messages.forEach(msg => {
                        if (msg.role === 'user') {
                            addMessage(msg.content, 'user', false);
                        } else {
                            addMessage(msg.content, 'assistant', false);
                        }
                    });

                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            }
        } catch (e) {
            console.error('Ошибка загрузки истории:', e);
        }
    }

    // Очистка чата
    async function clearChat() {
        const domain = isSellerMode ? 'seller.ozon.ru' : 'ozon.ru';

        try {
            await chrome.runtime.sendMessage({
                type: 'CLEAR_SESSION',
                domain
            });

            currentSessionId = null;

            const messagesContainer = document.getElementById('ozon-assistant-messages');
            messagesContainer.innerHTML = `
                <div class="assistant-message">
                    🆕 Новый чат начат. Задавайте вопросы!
                </div>
            `;

            document.getElementById('ozon-assistant-usage').textContent = '';
        } catch (e) {
            console.error('Ошибка очистки чата:', e);
        }
    }

    // Сбор данных со страницы
    function collectPageData() {
        const data = {
            url: window.location.href,
            pageTitle: document.title,
            timestamp: new Date().toISOString(),
            tables: [],
            metrics: [],
            charts: [],
            texts: []
        };

        // Собираем данные из таблиц
        const tables = document.querySelectorAll('table');
        tables.forEach((table, index) => {
            const tableData = { index, headers: [], rows: [] };

            table.querySelectorAll('th').forEach(th => {
                tableData.headers.push(th.textContent.trim());
            });

            table.querySelectorAll('tbody tr').forEach(row => {
                const rowData = [];
                row.querySelectorAll('td').forEach(td => {
                    rowData.push(td.textContent.trim());
                });
                if (rowData.length > 0) {
                    tableData.rows.push(rowData);
                }
            });

            if (tableData.headers.length > 0 || tableData.rows.length > 0) {
                data.tables.push(tableData);
            }
        });

        // Собираем метрики
        const metricSelectors = [
            '[class*="metric"]', '[class*="stat"]', '[class*="card"]',
            '[class*="widget"]', '[class*="kpi"]', '[class*="summary"]',
            '[class*="price"]', '[class*="rating"]', '[class*="review"]'
        ];

        const seen = new Set();
        metricSelectors.forEach(selector => {
            try {
                document.querySelectorAll(selector).forEach(el => {
                    const text = el.textContent.trim();
                    if (text && text.length < 500 && /[\d.,]+/.test(text)) {
                        const key = text.substring(0, 100);
                        if (!seen.has(key)) {
                            seen.add(key);
                            data.metrics.push({
                                content: text.replace(/\s+/g, ' ')
                            });
                        }
                    }
                });
            } catch (e) {}
        });

        // Собираем заголовки
        document.querySelectorAll('h1, h2, h3, h4').forEach(h => {
            const text = h.textContent.trim();
            if (text) {
                data.texts.push({ type: h.tagName.toLowerCase(), content: text });
            }
        });

        // Ограничиваем размер данных
        data.metrics = data.metrics.slice(0, 100);
        data.tables = data.tables.slice(0, 10);

        return data;
    }

    // Отправка сообщения
    async function sendMessage() {
        const input = document.getElementById('ozon-assistant-input');
        const sendBtn = document.getElementById('ozon-assistant-send');
        const usageEl = document.getElementById('ozon-assistant-usage');

        const userMessage = input.value.trim();
        if (!userMessage || isLoading) return;

        // Добавляем сообщение пользователя
        addMessage(userMessage, 'user');
        input.value = '';

        // Показываем индикатор загрузки
        isLoading = true;
        sendBtn.disabled = true;
        const loadingMessage = addMessage('Анализирую данные...', 'assistant', true);

        try {
            // Собираем данные со страницы
            const pageData = collectPageData();

            // Отправляем запрос
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_MESSAGE',
                message: userMessage,
                pageData: pageData,
                sessionId: currentSessionId
            });

            // Убираем индикатор загрузки
            loadingMessage.remove();

            if (response.error) {
                addMessage(`❌ ${response.error}`, 'assistant');
            } else {
                addMessage(response.answer, 'assistant');
                currentSessionId = response.sessionId;

                // Обновляем информацию о расходе
                if (response.usage) {
                    currentBalance = response.usage.balanceRemaining;
                    updateBalanceDisplay();
                    usageEl.textContent = `Использовано: ${response.usage.inputTokens}+${response.usage.outputTokens} токенов ($${response.usage.cost.toFixed(4)})`;
                }
            }
        } catch (error) {
            loadingMessage.remove();
            addMessage(`❌ Ошибка: ${error.message}`, 'assistant');
        }

        isLoading = false;
        sendBtn.disabled = false;

        // Прокручиваем к последнему сообщению
        const messagesContainer = document.getElementById('ozon-assistant-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Добавление сообщения в чат
    function addMessage(text, role, isLoading = false) {
        const messagesContainer = document.getElementById('ozon-assistant-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `${role}-message${isLoading ? ' loading' : ''}`;

        // Форматируем текст
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        messageDiv.innerHTML = formattedText;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return messageDiv;
    }

    // Инициализация
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createFloatingUI);
        } else {
            createFloatingUI();
        }
    }

    init();
})();
