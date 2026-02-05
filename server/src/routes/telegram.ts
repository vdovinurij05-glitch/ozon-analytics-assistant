import { Router, Response } from 'express';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WELCOME_BONUS = parseFloat(process.env.WELCOME_BONUS || '1');

// Проверка подписи Telegram
function verifyTelegramAuth(initData: string): boolean {
  if (!BOT_TOKEN) return false;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return calculatedHash === hash;
  } catch {
    return false;
  }
}

// POST /api/auth/telegram - Авторизация через Telegram
router.post('/telegram', async (req, res: Response) => {
  try {
    const { initData, telegramId, firstName, lastName, username } = req.body;

    if (!telegramId) {
      res.status(400).json({ error: 'Telegram ID обязателен' });
      return;
    }

    // В продакшене проверять подпись
    // if (!verifyTelegramAuth(initData)) {
    //   res.status(401).json({ error: 'Неверная подпись Telegram' });
    //   return;
    // }

    // Ищем существующего пользователя
    let user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() }
    });

    // Если нет - создаём нового
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: telegramId.toString(),
          firstName,
          lastName,
          username,
          balance: WELCOME_BONUS
        }
      });

      // Записываем бонус
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'topup',
          amount: WELCOME_BONUS,
          description: 'Приветственный бонус'
        }
      });
    } else {
      // Обновляем данные профиля
      user = await prisma.user.update({
        where: { id: user.id },
        data: { firstName, lastName, username }
      });
    }

    if (user.isBlocked) {
      res.status(403).json({ error: 'Аккаунт заблокирован' });
      return;
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        balance: user.balance.toString()
      }
    });
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

export default router;
