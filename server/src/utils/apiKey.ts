import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

// Генерация API ключа для клиента
export function generateApiKey(): string {
  const uuid = uuidv4().replace(/-/g, '');
  return `oaa_${uuid}`;
}

// Хэширование API ключа для хранения в БД
export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 10);
}

// Проверка API ключа
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

// Хэширование пароля
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Проверка пароля
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
