import { Bot, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://147.45.50.254:3000/webapp';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// Команда /start
bot.command('start', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('📊 Открыть личный кабинет', WEBAPP_URL)
    .row()
    .url('📢 Канал разработчика', 'https://t.me/first_seller');

  await ctx.reply(
    `👋 Добро пожаловать в *Ozon Analytics Assistant*!\n\n` +
    `🤖 Это AI-помощник для анализа данных на Ozon.\n\n` +
    `📱 *Возможности:*\n` +
    `• Анализ продаж и конкурентов\n` +
    `• Рекомендации по оптимизации\n` +
    `• История чатов\n\n` +
    `💰 При регистрации — бонус *$1* на счёт!\n\n` +
    `👇 Нажмите кнопку ниже, чтобы открыть личный кабинет:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
});

// Команда /balance
bot.command('balance', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('💰 Проверить баланс', WEBAPP_URL);

  await ctx.reply(
    '💰 Чтобы проверить баланс, откройте личный кабинет:',
    { reply_markup: keyboard }
  );
});

// Команда /help
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📖 *Помощь по Ozon Analytics Assistant*\n\n` +
    `*Команды:*\n` +
    `/start — Главное меню\n` +
    `/balance — Проверить баланс\n` +
    `/apikey — Получить API ключ\n` +
    `/help — Эта справка\n\n` +
    `*Как пользоваться:*\n` +
    `1. Установите Chrome расширение\n` +
    `2. Получите API ключ в личном кабинете\n` +
    `3. Введите ключ в настройках расширения\n` +
    `4. Откройте seller.ozon.ru или ozon.ru\n` +
    `5. Задавайте вопросы AI!\n\n` +
    `📞 Поддержка: @first_seller`,
    { parse_mode: 'Markdown' }
  );
});

// Команда /apikey
bot.command('apikey', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('🔑 Получить API ключ', WEBAPP_URL);

  await ctx.reply(
    '🔑 Получите API ключ в личном кабинете.\n\n' +
    '⚠️ *Важно:* ключ показывается только один раз, сохраните его!',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
});

// Админ команда - статистика
bot.command('admin', async (ctx) => {
  const userId = ctx.from?.id;

  if (!userId || !ADMIN_IDS.includes(userId)) {
    await ctx.reply('⛔ У вас нет доступа к этой команде.');
    return;
  }

  const keyboard = new InlineKeyboard()
    .webApp('📊 Админ-панель', `${WEBAPP_URL}/admin`);

  await ctx.reply(
    '🔐 *Админ-панель*\n\nНажмите кнопку для доступа:',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
});

// Обработка текстовых сообщений
bot.on('message:text', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .webApp('📊 Открыть личный кабинет', WEBAPP_URL);

  await ctx.reply(
    '🤖 Я бот для управления Ozon Analytics Assistant.\n\n' +
    'Используйте кнопку ниже для доступа к личному кабинету или команду /help для справки.',
    { reply_markup: keyboard }
  );
});

// Запуск бота
bot.start({
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} started!`);
  }
});

console.log('Starting bot...');
