#!/bin/bash

# ===========================================
# Ozon Analytics Assistant - Server Setup
# Для Ubuntu 22.04 / Debian 12
# ===========================================

set -e

echo "🚀 Настройка сервера для Ozon Analytics Assistant"
echo "================================================="

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Запустите скрипт с sudo: sudo bash setup-server.sh"
  exit 1
fi

# Обновление системы
echo "📦 Обновление системы..."
apt update && apt upgrade -y

# Установка Docker
echo "🐳 Установка Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh

    # Добавление текущего пользователя в группу docker
    usermod -aG docker $SUDO_USER
else
    echo "Docker уже установлен"
fi

# Установка Docker Compose
echo "🐳 Установка Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    apt install -y docker-compose-plugin
else
    echo "Docker Compose уже установлен"
fi

# Создание директории проекта
echo "📁 Создание директории проекта..."
mkdir -p /opt/ozon-assistant
chown -R $SUDO_USER:$SUDO_USER /opt/ozon-assistant

# Установка дополнительных инструментов
echo "🔧 Установка дополнительных инструментов..."
apt install -y curl wget git htop

# Настройка файрвола
echo "🔥 Настройка файрвола..."
apt install -y ufw
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp  # API порт (можно убрать после настройки nginx)
ufw --force enable

# Настройка swap (если мало RAM)
echo "💾 Настройка swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Создание пользователя для деплоя (опционально)
echo "👤 Создание пользователя deploy..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    usermod -aG docker deploy
    mkdir -p /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh

    echo ""
    echo "⚠️  Добавьте SSH ключ для пользователя deploy:"
    echo "   echo 'ваш_публичный_ключ' >> /home/deploy/.ssh/authorized_keys"
    echo ""
fi

# Итоги
echo ""
echo "✅ Настройка завершена!"
echo ""
echo "📋 Следующие шаги:"
echo "1. Добавьте SSH ключ:"
echo "   ssh-keygen -t ed25519 -C 'github-actions'"
echo "   cat ~/.ssh/id_ed25519.pub >> /home/deploy/.ssh/authorized_keys"
echo ""
echo "2. Скопируйте приватный ключ для GitHub Secrets:"
echo "   cat ~/.ssh/id_ed25519"
echo ""
echo "3. Настройте GitHub Secrets:"
echo "   - SERVER_IP: $(curl -s ifconfig.me)"
echo "   - SERVER_USER: deploy"
echo "   - SSH_PRIVATE_KEY: (содержимое id_ed25519)"
echo "   - ANTHROPIC_API_KEY: (ваш ключ)"
echo "   - JWT_SECRET: $(openssl rand -base64 32)"
echo "   - POSTGRES_PASSWORD: $(openssl rand -base64 16)"
echo ""
echo "4. Сделайте push в main ветку для деплоя"
echo ""
