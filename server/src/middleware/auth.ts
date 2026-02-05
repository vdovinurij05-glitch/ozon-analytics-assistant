import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import { AuthRequest } from '../types/index.js';
import { verifyApiKey } from '../utils/apiKey.js';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

// Middleware для JWT аутентификации (для веб-интерфейса)
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      res.status(401).json({ error: 'Пользователь не найден' });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ error: 'Аккаунт заблокирован' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
}

// Middleware для API ключа (для плагина)
export async function apiKeyMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'Требуется API ключ' });
      return;
    }

    if (!apiKey.startsWith('oaa_')) {
      res.status(401).json({ error: 'Неверный формат API ключа' });
      return;
    }

    // Ищем пользователя по хэшу ключа
    const users = await prisma.user.findMany({
      where: { apiKeyHash: { not: null } }
    });

    let foundUser = null;
    for (const user of users) {
      if (user.apiKeyHash && await verifyApiKey(apiKey, user.apiKeyHash)) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      res.status(401).json({ error: 'Неверный API ключ' });
      return;
    }

    if (foundUser.isBlocked) {
      res.status(403).json({ error: 'Аккаунт заблокирован' });
      return;
    }

    // Проверка баланса
    if (parseFloat(foundUser.balance.toString()) <= 0) {
      res.status(402).json({
        error: 'Недостаточно средств на балансе',
        balance: 0
      });
      return;
    }

    req.user = foundUser;
    req.apiKey = apiKey;
    next();
  } catch (error) {
    console.error('API Key auth error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}

// Генерация JWT токена
export function generateToken(userId: string): string {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
