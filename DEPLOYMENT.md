# 🚀 ИНСТРУКЦИЯ ПО РАЗВЕРТЫВАНИЮ ПРИЛОЖЕНИЯ УПРАВЛЕНИЯ КОНТРАКТАМИ

## ЭТАП 1: ПОДГОТОВКА (15 минут)

### 1.1 Создайте аккаунты (если ещё нет)
- Heroku: https://www.heroku.com/
- Vercel: https://vercel.com/
- GitHub: https://github.com/ (для хранения кода)

### 1.2 Установите необходимые инструменты
```bash
# Установите Node.js (если ещё не установлен)
# https://nodejs.org/ (выберите LTS версию)

# Установите Heroku CLI
npm install -g heroku

# Установите Git
# https://git-scm.com/
```

---

## ЭТАП 2: ПОДГОТОВКА BACKEND (Heroku)

### 2.1 Создайте приложение на Heroku
```bash
# Логинитесь в Heroku
heroku login

# Создайте приложение
heroku create your-app-name-backend
# Замените "your-app-name-backend" на уникальное имя
# Например: project-manager-backend-2024
```

### 2.2 Добавьте базу данных PostgreSQL
```bash
# Добавьте PostgreSQL в приложение
heroku addons:create heroku-postgresql:hobby-dev --app your-app-name-backend
```

### 2.3 Получите DATABASE_URL
```bash
# Получите переменные окружения
heroku config --app your-app-name-backend

# Вы увидите что-то вроде:
# DATABASE_URL: postgresql://user:pass@host:port/database
# Скопируйте это значение
```

### 2.4 Установите переменные окружения
```bash
# Задайте JWT_SECRET
heroku config:set JWT_SECRET=your-super-secret-key-12345 --app your-app-name-backend

# Проверьте переменные
heroku config --app your-app-name-backend
```

### 2.5 Инициализируйте БД
```bash
# Подключитесь к PostgreSQL через heroku CLI
heroku pg:psql --app your-app-name-backend

# Вставьте содержимое файла init.sql
# Скопируйте весь текст из init.sql и вставьте в терминал
# Или используйте:
heroku pg:psql --app your-app-name-backend < init.sql
```

### 2.6 Разверните backend
```bash
# Инициализируйте Git репозиторий (если ещё не сделали)
cd project-manager-full
git init
git add .
git commit -m "Initial commit"

# Добавьте Heroku remote
git remote add heroku https://git.heroku.com/your-app-name-backend.git

# Разверните
git push heroku main
# или
git push heroku master

# Проверьте логи
heroku logs --tail --app your-app-name-backend
```

### 2.7 Проверьте, что backend работает
```bash
# Откройте в браузере
https://your-app-name-backend.herokuapp.com/api/health
# Вы должны увидеть: {"status":"OK","timestamp":"2024-03-04T..."}
```

---

## ЭТАП 3: ПОДГОТОВКА FRONTEND (Vercel)

### 3.1 Создайте React приложение локально
```bash
# Создайте React приложение
npx create-react-app project-manager-frontend

# Перейдите в папку
cd project-manager-frontend

# Замените содержимое App.jsx на код из App.jsx (см. выше)
# Или скопируйте весь файл frontend/App.jsx

# Установите зависимости
npm install lucide-react
```

### 3.2 Создайте .env файл для frontend
```bash
# В папке проекта создайте .env
echo "REACT_APP_API_URL=https://your-app-name-backend.herokuapp.com/api" > .env
# Замените your-app-name-backend на то же имя, что на Heroku
```

### 3.3 Тестируйте локально
```bash
# Запустите frontend локально
npm start

# Откроется http://localhost:3000
# Попробуйте войти:
# Email: sarzheev.iv@gmail.com
# Пароль: rambaram16
```

### 3.4 Разверните на Vercel
```bash
# Убедитесь, что вы в папке project-manager-frontend

# Способ 1: Через GitHub (рекомендуется)
# 1. Создайте репозиторий на GitHub
# 2. Запушьте код туда
# 3. На Vercel: https://vercel.com/new
# 4. Выберите GitHub репозиторий
# 5. Установите переменную окружения REACT_APP_API_URL
# 6. Разверните

# Способ 2: Через Vercel CLI
npm i -g vercel
vercel

# Следуйте инструкциям в терминале
# Когда спросит о переменных окружения, добавьте:
# REACT_APP_API_URL = https://your-app-name-backend.herokuapp.com/api
```

---

## ЭТАП 4: ПРОВЕРКА

### 4.1 Проверьте работу приложения
1. Откройте URL Vercel (вроде: https://project-manager-frontend-abc123.vercel.app)
2. Введите данные для входа:
   - Email: sarzheev.iv@gmail.com
   - Пароль: rambaram16
3. Проверьте, что загружаются контракты
4. Попробуйте редактировать контракт

### 4.2 Проверьте, что данные сохраняются
1. Измените статус контракта
2. Обновите страницу (Ctrl+R)
3. Данные должны сохраниться

### 4.3 Проверьте, что история работает
Откройте в браузере:
```
https://your-app-name-backend.herokuapp.com/api/audit-log
# (скопируйте Authorization token из браузера DevTools)
```

---

## ЭТАП 5: ДОБАВЛЕНИЕ КОМАНДЫ (ПОЗЖЕ)

Когда будете готовы добавить команду:

### 5.1 Добавьте функцию регистрации в frontend
```javascript
// Добавьте кнопку "Зарегистрироваться" на экран входа
// POST /api/auth/register с email и password
```

### 5.2 Установите правила доступа
В backend добавьте проверку ролей:
```javascript
// Только администратор может редактировать контракты
// Другие пользователи только просматривают
```

---

## ВАЖНЫЕ КОМАНДЫ

### Heroku команды
```bash
# Просмотр логов
heroku logs --tail --app your-app-name-backend

# Перезагрузка приложения
heroku restart --app your-app-name-backend

# Удаление приложения (если что-то пошло не так)
heroku destroy --app your-app-name-backend --confirm your-app-name-backend

# Подключение к БД
heroku pg:psql --app your-app-name-backend
```

### Git команды
```bash
# Добавьте изменения
git add .

# Сделайте commit
git commit -m "Описание изменений"

# Разверните на Heroku
git push heroku main

# Разверните на GitHub
git push origin main
```

---

## ЧЕКЛИСТ РАЗВЁРТЫВАНИЯ

- [ ] Создан аккаунт на Heroku
- [ ] Создан аккаунт на Vercel
- [ ] Установлены необходимые инструменты (Node.js, Heroku CLI, Git)
- [ ] Создано приложение на Heroku
- [ ] Добавлена PostgreSQL база данных
- [ ] Инициализирована база данных (init.sql)
- [ ] Установлены переменные окружения (DATABASE_URL, JWT_SECRET)
- [ ] Backend развёрнут на Heroku и работает
- [ ] Создано React приложение
- [ ] Файл .env настроен для frontend
- [ ] Frontend разверн на Vercel
- [ ] Проверена аутентификация (вход работает)
- [ ] Проверено, что данные сохраняются
- [ ] Проверена история изменений

---

## РЕШЕНИЕ ПРОБЛЕМ

### Ошибка "DATABASE_URL не найден"
```bash
# Проверьте, что PostgreSQL успешно добавлена
heroku addons:list --app your-app-name-backend

# Если её нет, добавьте:
heroku addons:create heroku-postgresql:hobby-dev --app your-app-name-backend
```

### Ошибка "Пользователь не авторизован"
1. Проверьте, что переменная JWT_SECRET установлена
2. Проверьте, что токен правильно отправляется в заголовке Authorization
3. Убедитесь, что пароль правильно захеширован в БД

### Frontend не подключается к backend
1. Проверьте переменную REACT_APP_API_URL в .env
2. Убедитесь, что backend URL правильный (без trailing slash)
3. Проверьте CORS настройки в server.js

---

## РЕЗЕРВНЫЕ КОПИИ БД

Heroku автоматически делает резервные копии. Чтобы восстановить:

```bash
# Создайте резервную копию
heroku pg:backups:capture --app your-app-name-backend

# Просмотрите список резервных копий
heroku pg:backups --app your-app-name-backend

# Загрузите резервную копию локально
heroku pg:backups:download --app your-app-name-backend
```

---

## ПОДДЕРЖКА

При возникновении проблем:
1. Проверьте логи: `heroku logs --tail`
2. Проверьте, что все переменные окружения установлены
3. Убедитесь, что база данных инициализирована
4. Проверьте, что backend и frontend используют одинаковый API URL

---

**Приложение готово к использованию! 🎉**

После развёртывания вы сможете:
- Входить с паролем (sarzheev.iv@gmail.com / rambaram16)
- Редактировать контракты и финансовые данные
- Видеть историю всех изменений
- Добавлять новых пользователей команды (позже)
- Делать резервные копии данных
