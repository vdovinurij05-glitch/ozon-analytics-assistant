import { Router, Response } from 'express';
import prisma from '../utils/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// Middleware для проверки админа
async function adminMiddleware(req: AuthRequest, res: Response, next: Function) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Доступ запрещён' });
    return;
  }
  next();
}

// GET /api/admin/stats - Статистика для дашборда
router.get('/stats', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const [totalUsers, totalBalance, recentUsers, todayStart] = await Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({ _sum: { balance: true } }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { sessions: true } } }
      }),
      new Date(new Date().setHours(0, 0, 0, 0))
    ]);

    const activeToday = await prisma.session.groupBy({
      by: ['userId'],
      where: { updatedAt: { gte: todayStart } }
    });

    const totalRevenue = await prisma.transaction.aggregate({
      where: { type: 'usage' },
      _sum: { amount: true }
    });

    res.json({
      totalUsers,
      totalBalance: totalBalance._sum.balance?.toString() || '0',
      totalRevenue: Math.abs(parseFloat(totalRevenue._sum.amount?.toString() || '0')).toFixed(2),
      activeToday: activeToday.length,
      recentUsers
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Ошибка получения статистики' });
  }
});

// GET /api/admin/users - Список пользователей
router.get('/users', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// GET /api/admin/transactions - Список транзакций
router.get('/transactions', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: { email: true, telegramId: true }
        }
      }
    });

    res.json({ transactions });
  } catch (error) {
    console.error('Admin transactions error:', error);
    res.status(500).json({ error: 'Ошибка получения транзакций' });
  }
});

// POST /api/admin/topup - Пополнить баланс пользователю
router.post('/topup', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || amount <= 0) {
      res.status(400).json({ error: 'Неверные параметры' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const newBalance = parseFloat(user.balance.toString()) + amount;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { balance: newBalance }
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: 'topup',
          amount,
          description: 'Пополнение администратором'
        }
      })
    ]);

    res.json({ success: true, newBalance });
  } catch (error) {
    console.error('Admin topup error:', error);
    res.status(500).json({ error: 'Ошибка пополнения' });
  }
});

// POST /api/admin/topup-by-email - Пополнить по email
router.post('/topup-by-email', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount || amount <= 0) {
      res.status(400).json({ error: 'Неверные параметры' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    const newBalance = parseFloat(user.balance.toString()) + amount;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { balance: newBalance }
      }),
      prisma.transaction.create({
        data: {
          userId: user.id,
          type: 'topup',
          amount,
          description: 'Пополнение администратором'
        }
      })
    ]);

    res.json({ success: true, newBalance });
  } catch (error) {
    console.error('Admin topup by email error:', error);
    res.status(500).json({ error: 'Ошибка пополнения' });
  }
});

// POST /api/admin/block-user - Заблокировать/разблокировать пользователя
router.post('/block-user', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, block } = req.body;

    await prisma.user.update({
      where: { id: userId },
      data: { isBlocked: block }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin block user error:', error);
    res.status(500).json({ error: 'Ошибка блокировки' });
  }
});

export default router;
