import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { hashPassword, verifyPassword, generateApiKey, hashApiKey } from '../utils/apiKey.js';
import { authMiddleware, generateToken } from '../middleware/auth.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// Схемы валидации
const registerSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(6, 'Пароль должен быть не менее 6 символов'),
  telegramUsername: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// POST /api/auth/register - Регистрация
router.post('/register', async (req, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    // Проверяем, существует ли пользователь
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }

    // Создаём пользователя с бонусным балансом $1
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        balance: 1.00 // Бонус $1 при регистрации
      }
    });

    // Записываем бонусную транзакцию
    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'topup',
        amount: 1.00,
        description: 'Бонус при регистрации'
      }
    });

    // Генерируем токен
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'Регистрация успешна',
      token,
      user: {
        id: user.id,
        email: user.email,
        balance: user.balance
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// POST /api/auth/login - Вход
router.post('/login', async (req, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    const isValidPassword = await verifyPassword(data.password, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
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
        email: user.email,
        balance: user.balance
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// POST /api/auth/api-key - Генерация API ключа
router.post('/api-key', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    // Генерируем новый API ключ
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);

    // Обновляем пользователя
    await prisma.user.update({
      where: { id: req.user.id },
      data: { apiKeyHash }
    });

    res.json({
      apiKey,
      message: 'Сохраните этот ключ - он показывается только один раз!'
    });
  } catch (error) {
    console.error('API key generation error:', error);
    res.status(500).json({ error: 'Ошибка генерации API ключа' });
  }
});

// GET /api/auth/me - Текущий пользователь
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        balance: req.user.balance,
        hasApiKey: !!req.user.apiKeyHash,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

export default router;
