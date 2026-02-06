import { Request } from 'express';
import { User } from '@prisma/client';

// Расширяем Request для добавления user
export interface AuthRequest extends Request {
  user?: User;
  apiKey?: string;
}

// Данные страницы от плагина
export interface PageData {
  url: string;
  pageTitle: string;
  timestamp: string;
  tables: TableData[];
  metrics: MetricData[];
  charts: ChartData[];
  texts: TextData[];
}

export interface TableData {
  index: number;
  headers: string[];
  rows: string[][];
}

export interface MetricData {
  selector?: string;
  content?: string;
  value?: string;
  context?: string;
}

export interface ChartData {
  index: number;
  type: string;
  ariaLabel?: string;
  title?: string;
  legend?: string;
}

export interface TextData {
  type: string;
  content: string;
}

// Запрос на отправку сообщения
export interface SendMessageRequest {
  message: string;
  pageData: PageData;
  sessionId?: string;
}

// Ответ с использованием токенов
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  balanceRemaining: number;
}

// Ответ чата
export interface ChatResponse {
  answer: string;
  sessionId: string;
  usage: TokenUsage;
}

// Цены Claude Opus (себестоимость за 1M токенов)
export const CLAUDE_PRICES = {
  INPUT_PER_MILLION: 15,   // $15 за 1M input токенов (Opus)
  OUTPUT_PER_MILLION: 75,  // $75 за 1M output токенов (Opus)
};
