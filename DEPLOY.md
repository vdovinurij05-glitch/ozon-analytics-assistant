# Инструкция по деплою Ozon Analytics Assistant

## Быстрый старт

### 1. Подготовка VPS (Ubuntu 22.04)

Подключитесь к серверу и запустите скрипт настройки:

```bash
# Скачайте и запустите скрипт
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/ozon-analytics-assistant/main/scripts/setup-server.sh | sudo bash
```

Или вручную:

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Перезайдите в систему для применения группы docker
exit
```

### 2. Создание SSH ключа для GitHub Actions

На сервере:

```bash
# Создайте SSH ключ
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_deploy -N ""

# Добавьте публичный ключ в authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Скопируйте приватный ключ (понадобится для GitHub)
cat ~/.ssh/github_deploy
```

### 3. Настройка GitHub Secrets

Перейдите в репозиторий → Settings → Secrets and variables → Actions

Добавьте следующие секреты:

| Secret | Описание | Пример |
|--------|----------|--------|
| `SERVER_IP` | IP адрес сервера | `123.45.67.89` |
| `SERVER_USER` | SSH пользователь | `deploy` или `root` |
| `SSH_PRIVATE_KEY` | Приватный SSH ключ | Содержимое `~/.ssh/github_deploy` |
| `ANTHROPIC_API_KEY` | API ключ Anthropic | `sk-ant-...` |
| `JWT_SECRET` | Секрет для JWT токенов | Случайная строка 32+ символа |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | Случайная строка 16+ символа |

**Генерация случайных строк:**
```bash
# JWT_SECRET
openssl rand -base64 32

# POSTGRES_PASSWORD
openssl rand -base64 16
```

### 4. Первый деплой

```bash
# Сделайте коммит и push в main ветку
git add .
git commit -m "Initial deploy"
git push origin main
```

GitHub Actions автоматически:
1. Соберёт Docker образ
2. Загрузит файлы на сервер
3. Запустит контейнеры
4. Выполнит миграции БД

---

## Ручной деплой (без CI/CD)

Если нужно развернуть вручную:

```bash
# На сервере
cd /opt/ozon-assistant

# Создайте .env файл
cat > .env << 'EOF'
POSTGRES_USER=ozon
POSTGRES_PASSWORD=ваш_пароль_postgres
POSTGRES_DB=ozon_assistant
ANTHROPIC_API_KEY=ваш_ключ_anthropic
JWT_SECRET=ваш_jwt_секрет
PRICE_MULTIPLIER=3
WELCOME_BONUS=1
EOF

# Запустите контейнеры
docker compose up -d

# Проверьте логи
docker compose logs -f

# Выполните миграции
docker compose exec api npx prisma migrate deploy
```

---

## Проверка работы

```bash
# Проверка health endpoint
curl http://YOUR_SERVER_IP:3000/health

# Должен вернуть:
# {"status":"ok","timestamp":"2026-02-05T..."}

# Проверка логов
docker compose logs api
docker compose logs postgres
```

---

## Обновление manifest.json в расширении

После деплоя обновите URL API в расширении:

```json
// manifest.json
"host_permissions": [
  "https://seller.ozon.ru/*",
  "https://ozon.ru/*",
  "https://www.ozon.ru/*",
  "http://YOUR_SERVER_IP:3000/*"  // или https://api.yourdomain.ru/*
]
```

```javascript
// content.js и background.js
const API_URL = 'http://YOUR_SERVER_IP:3000';
// или после настройки домена:
// const API_URL = 'https://api.yourdomain.ru';
```

---

## Настройка домена (опционально)

### 1. Добавьте A-запись в DNS

```
api.yourdomain.ru → YOUR_SERVER_IP
```

### 2. Установите Certbot и получите SSL

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получение сертификата
sudo certbot --nginx -d api.yourdomain.ru
```

### 3. Настройте Nginx

Создайте файл `/etc/nginx/sites-available/ozon-assistant`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.ru;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.ru/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Активируйте конфиг
sudo ln -s /etc/nginx/sites-available/ozon-assistant /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Полезные команды

```bash
# Логи в реальном времени
docker compose logs -f

# Перезапуск
docker compose restart

# Остановка
docker compose down

# Полная очистка (включая БД!)
docker compose down -v

# Статус контейнеров
docker compose ps

# Подключение к БД
docker compose exec postgres psql -U ozon -d ozon_assistant

# Бэкап БД
docker compose exec postgres pg_dump -U ozon ozon_assistant > backup.sql
```

---

## Troubleshooting

### Контейнер не запускается

```bash
# Проверьте логи
docker compose logs api

# Частые причины:
# - Неверный ANTHROPIC_API_KEY
# - БД не успела запуститься (подождите и перезапустите)
```

### Ошибка подключения к БД

```bash
# Проверьте что postgres работает
docker compose ps

# Проверьте переменные окружения
docker compose exec api env | grep DATABASE
```

### Миграции не применились

```bash
# Вручную запустите миграции
docker compose exec api npx prisma migrate deploy

# Или сбросьте БД (УДАЛИТ ВСЕ ДАННЫЕ!)
docker compose exec api npx prisma migrate reset --force
```

---

## Контакты

- Telegram: [@first_seller](https://t.me/first_seller)
