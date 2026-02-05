import { Router, Response } from 'express';
import prisma from '../utils/prisma.js';
import { apiKeyMiddleware, authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// GET /api/billing/balance - Текущий баланс (для плагина)
router.get('/balance', apiKeyMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    res.json({
      balance: parseFloat(req.user.balance.toString()),
      email: req.user.email
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: 'Ошибка получения баланса' });
  }
});

// GET /api/billing/usage - История расходов
router.get('/usage', apiKeyMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    const { limit = '50', offset = '0' } = req.query;

    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    // Статистика за текущий месяц
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyStats = await prisma.transaction.aggregate({
      where: {
        userId: req.user.id,
        type: 'usage',
        createdAt: { gte: startOfMonth }
      },
      _sum: { amount: true },
      _count: true
    });

    res.json({
      transactions,
      stats: {
        monthlySpent: Math.abs(parseFloat(monthlyStats._sum.amount?.toString() || '0')),
        monthlyRequests: monthlyStats._count
      }
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// GET /api/billing/stats - Детальная статистика (для веб-интерфейса)
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    // Статистика за разные периоды
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [todayStats, weekStats, monthStats, totalMessages] = await Promise.all([
      prisma.transaction.aggregate({
        where: {
          userId: req.user.id,
          type: 'usage',
          createdAt: { gte: todayStart }
        },
        _sum: { amount: true },
        _count: true
      }),
      prisma.transaction.aggregate({
        where: {
          userId: req.user.id,
          type: 'usage',
          createdAt: { gte: weekStart }
        },
        _sum: { amount: true },
        _count: true
      }),
      prisma.transaction.aggregate({
        where: {
          userId: req.user.id,
          type: 'usage',
          createdAt: { gte: monthStart }
        },
        _sum: { amount: true },
        _count: true
      }),
      prisma.message.count({
        where: {
          session: { userId: req.user.id }
        }
      })
    ]);

    res.json({
      balance: parseFloat(req.user.balance.toString()),
      today: {
        spent: Math.abs(parseFloat(todayStats._sum.amount?.toString() || '0')),
        requests: todayStats._count
      },
      week: {
        spent: Math.abs(parseFloat(weekStats._sum.amount?.toString() || '0')),
        requests: weekStats._count
      },
      month: {
        spent: Math.abs(parseFloat(monthStats._sum.amount?.toString() || '0')),
        requests: monthStats._count
      },
      totalMessages
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// POST /api/billing/topup - Пополнение (заглушка для будущей интеграции)
router.post('/topup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    // TODO: Интеграция с платёжной системой (ЮKassa, Stripe)
    // Пока возвращаем инструкцию

    res.json({
      message: 'Для пополнения баланса свяжитесь с @first_seller в Telegram',
      telegramChannel: 'https://t.me/first_seller',
      currentBalance: parseFloat(req.user.balance.toString())
    });
  } catch (error) {
    console.error('Topup error:', error);
    res.status(500).json({ error: 'Ошибка пополнения' });
  }
});

export default router;
