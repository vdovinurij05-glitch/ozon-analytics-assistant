import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Error:', err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message
    });
    return;
  }

  // Ошибки Prisma
  if (err.name === 'PrismaClientKnownRequestError') {
    res.status(400).json({
      error: 'Ошибка базы данных'
    });
    return;
  }

  // Ошибки валидации Zod
  if (err.name === 'ZodError') {
    res.status(400).json({
      error: 'Неверные данные запроса',
      details: err.message
    });
    return;
  }

  // Неизвестная ошибка
  res.status(500).json({
    error: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Внутренняя ошибка сервера'
  });
}
