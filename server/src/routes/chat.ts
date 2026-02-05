import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma.js';
import { apiKeyMiddleware } from '../middleware/auth.js';
import { AuthRequest, SendMessageRequest, PageData } from '../types/index.js';
import { sendToClaude, calculateCost, ChatMessage } from '../services/claude.js';

const router = Router();

// Валидация запроса
const messageSchema = z.object({
  message: z.string().min(1, 'Сообщение не может быть пустым'),
  pageData: z.object({
    url: z.string(),
    pageTitle: z.string(),
    timestamp: z.string(),
    tables: z.array(z.any()).optional().default([]),
    metrics: z.array(z.any()).optional().default([]),
    charts: z.array(z.any()).optional().default([]),
    texts: z.array(z.any()).optional().default([])
  }),
  sessionId: z.string().optional()
});

// Определение домена из URL
function getDomainFromUrl(url: string): string {
  if (url.includes('seller.ozon.ru')) return 'seller.ozon.ru';
  if (url.includes('ozon.ru')) return 'ozon.ru';
  return 'unknown';
}

// POST /api/chat/message - Отправить сообщение
router.post('/message', apiKeyMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    const data = messageSchema.parse(req.body) as SendMessageRequest;
    const domain = getDomainFromUrl(data.pageData.url);

    // Получаем или создаём сессию
    let session;
    if (data.sessionId) {
      session = await prisma.session.findFirst({
        where: {
          id: data.sessionId,
          userId: req.user.id,
          domain,
          isActive: true
        }
      });
    }

    // Если сессии нет или она для другого домена - создаём новую
    if (!session) {
      // Деактивируем старые сессии этого домена
      await prisma.session.updateMany({
        where: {
          userId: req.user.id,
          domain,
          isActive: true
        },
        data: { isActive: false }
      });

      session = await prisma.session.create({
        data: {
          userId: req.user.id,
          domain
        }
      });
    }

    // Получаем историю сообщений (последние 20)
    const history = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 20
    });

    const chatHistory: ChatMessage[] = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    // Отправляем в Claude
    const claudeResponse = await sendToClaude(
      data.message,
      data.pageData as PageData,
      chatHistory
    );

    // Рассчитываем стоимость
    const cost = calculateCost(claudeResponse.inputTokens, claudeResponse.outputTokens);

    // Проверяем баланс
    const currentBalance = parseFloat(req.user.balance.toString());
    if (currentBalance < cost) {
      res.status(402).json({
        error: 'Недостаточно средств',
        required: cost,
        balance: currentBalance
      });
      return;
    }

    // Сохраняем сообщение пользователя
    await prisma.message.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: data.message,
        pageUrl: data.pageData.url,
        pageData: data.pageData as any
      }
    });

    // Сохраняем ответ
    await prisma.message.create({
      data: {
        sessionId: session.id,
        role: 'assistant',
        content: claudeResponse.content,
        inputTokens: claudeResponse.inputTokens,
        outputTokens: claudeResponse.outputTokens,
        cost
      }
    });

    // Списываем с баланса
    const newBalance = currentBalance - cost;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { balance: newBalance }
    });

    // Записываем транзакцию
    await prisma.transaction.create({
      data: {
        userId: req.user.id,
        type: 'usage',
        amount: -cost,
        description: `Запрос: ${claudeResponse.inputTokens} in / ${claudeResponse.outputTokens} out`
      }
    });

    res.json({
      answer: claudeResponse.content,
      sessionId: session.id,
      usage: {
        inputTokens: claudeResponse.inputTokens,
        outputTokens: claudeResponse.outputTokens,
        cost: Math.round(cost * 10000) / 10000,
        balanceRemaining: Math.round(newBalance * 10000) / 10000
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Ошибка обработки запроса' });
  }
});

// GET /api/chat/sessions - Список сессий
router.get('/sessions', apiKeyMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    const sessions = await prisma.session.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { messages: true } }
      }
    });

    res.json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
});

// GET /api/chat/history/:sessionId - История сессии
router.get('/history/:sessionId', apiKeyMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    const { sessionId } = req.params;

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId: req.user.id
      }
    });

    if (!session) {
      res.status(404).json({ error: 'Сессия не найдена' });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        pageUrl: true,
        inputTokens: true,
        outputTokens: true,
        cost: true,
        createdAt: true
      }
    });

    res.json({
      session,
      messages
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

// DELETE /api/chat/session/:sessionId - Удалить сессию
router.delete('/session/:sessionId', apiKeyMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Не авторизован' });
      return;
    }

    const { sessionId } = req.params;

    await prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId: req.user.id
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Ошибка удаления сессии' });
  }
});

export default router;
