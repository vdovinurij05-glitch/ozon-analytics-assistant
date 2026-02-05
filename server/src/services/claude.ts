import Anthropic from '@anthropic-ai/sdk';
import { PageData, CLAUDE_PRICES } from '../types/index.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;

// Системный промпт
const SYSTEM_PROMPT = `Ты - эксперт-аналитик для продавцов на маркетплейсе Ozon. Твоя задача - анализировать данные со страницы аналитики Ozon и отвечать на вопросы пользователя.

Правила:
1. Отвечай на русском языке
2. Анализируй предоставленные данные и давай конкретные ответы
3. Если данных недостаточно, честно скажи об этом
4. Используй числа и проценты из данных, когда это уместно
5. Давай практические рекомендации продавцу
6. Будь кратким, но информативным
7. Выделяй ключевые показатели жирным шрифтом (используя **текст**)
8. Если видишь проблемы или аномалии в данных, указывай на них

Ты работаешь в сервисе Ozon Analytics Assistant от @first_seller.`;

// Форматирование данных страницы
function formatPageData(pageData: PageData): string {
  let formatted = `## Данные со страницы Ozon\n\n`;
  formatted += `**URL:** ${pageData.url}\n`;
  formatted += `**Заголовок:** ${pageData.pageTitle}\n`;
  formatted += `**Время:** ${pageData.timestamp}\n\n`;

  if (pageData.texts && pageData.texts.length > 0) {
    formatted += `### Заголовки:\n`;
    pageData.texts.forEach(t => {
      formatted += `- ${t.type}: ${t.content}\n`;
    });
    formatted += '\n';
  }

  if (pageData.tables && pageData.tables.length > 0) {
    formatted += `### Таблицы:\n`;
    pageData.tables.forEach((table, i) => {
      formatted += `\n**Таблица ${i + 1}:**\n`;
      if (table.headers.length > 0) {
        formatted += `Заголовки: ${table.headers.join(' | ')}\n`;
      }
      if (table.rows.length > 0) {
        formatted += `Данные:\n`;
        table.rows.slice(0, 20).forEach(row => {
          formatted += `  ${row.join(' | ')}\n`;
        });
        if (table.rows.length > 20) {
          formatted += `  ... и ещё ${table.rows.length - 20} строк\n`;
        }
      }
    });
    formatted += '\n';
  }

  if (pageData.metrics && pageData.metrics.length > 0) {
    formatted += `### Метрики:\n`;
    pageData.metrics.slice(0, 50).forEach(m => {
      if (m.value && m.context) {
        formatted += `- ${m.context}\n`;
      } else if (m.content) {
        formatted += `- ${m.content}\n`;
      }
    });
    formatted += '\n';
  }

  if (pageData.charts && pageData.charts.length > 0) {
    formatted += `### Графики:\n`;
    pageData.charts.forEach((chart, i) => {
      formatted += `- График ${i + 1}:`;
      if (chart.ariaLabel) formatted += ` ${chart.ariaLabel}`;
      if (chart.title) formatted += ` ${chart.title}`;
      if (chart.legend) formatted += ` (${chart.legend})`;
      formatted += '\n';
    });
  }

  return formatted;
}

export interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Отправка запроса в Claude
export async function sendToClaude(
  userMessage: string,
  pageData: PageData,
  chatHistory: ChatMessage[] = []
): Promise<ClaudeResponse> {
  const formattedData = formatPageData(pageData);

  // Формируем сообщения
  const messages: Anthropic.MessageParam[] = [];

  // Добавляем историю чата
  chatHistory.forEach(msg => {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  });

  // Добавляем текущий запрос
  messages.push({
    role: 'user',
    content: `${formattedData}\n\n---\n\n**Вопрос:** ${userMessage}`
  });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages
  });

  const textContent = response.content.find(c => c.type === 'text');
  const content = textContent && 'text' in textContent ? textContent.text : '';

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
  };
}

// Расчёт стоимости
export function calculateCost(inputTokens: number, outputTokens: number): number {
  const multiplier = parseFloat(process.env.PRICE_MULTIPLIER || '3');

  const inputCost = (inputTokens / 1_000_000) * CLAUDE_PRICES.INPUT_PER_MILLION * multiplier;
  const outputCost = (outputTokens / 1_000_000) * CLAUDE_PRICES.OUTPUT_PER_MILLION * multiplier;

  return inputCost + outputCost;
}
