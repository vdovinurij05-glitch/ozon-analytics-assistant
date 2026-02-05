// Ozon Analytics Assistant - Popup Script
// Разработчик: @first_seller

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const statusDiv = document.getElementById('status');
    const toggleBtn = document.getElementById('toggleVisibility');

    // Загружаем сохранённый ключ
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_API_KEY' });
        if (response.apiKey) {
            apiKeyInput.value = response.apiKey;
        }
    } catch (e) {
        console.error('Ошибка загрузки ключа:', e);
    }

    // Переключение видимости пароля
    toggleBtn.addEventListener('click', () => {
        const type = apiKeyInput.type === 'password' ? 'text' : 'password';
        apiKeyInput.type = type;
    });

    // Сохранение ключа
    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            showStatus('Введите API ключ', 'error');
            return;
        }

        if (!apiKey.startsWith('oaa_')) {
            showStatus('Неверный формат ключа. Ключ должен начинаться с "oaa_"', 'error');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Сохранение...';

        try {
            await chrome.runtime.sendMessage({
                type: 'SAVE_API_KEY',
                apiKey: apiKey
            });

            showStatus('Ключ сохранён! Откройте seller.ozon.ru или ozon.ru', 'success');
        } catch (e) {
            showStatus('Ошибка сохранения: ' + e.message, 'error');
        }

        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
    });

    // Показ статуса
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;

        if (type === 'success') {
            setTimeout(() => {
                statusDiv.className = 'status';
            }, 5000);
        }
    }

    // Сохранение по Enter
    apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveBtn.click();
        }
    });
});
