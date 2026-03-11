const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// JWT secret - ОБЯЗАТЕЛЬНО должен быть установлен в переменных окружения!
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ ОШИБКА: JWT_SECRET не установлен в переменных окружения!');
  process.exit(1);
}

// Middleware для проверки JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен не найден' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Недействительный токен' });
    req.user = user;
    next();
  });
};

// ============= AUTH ROUTES =============

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Проверяем, есть ли уже такой пользователь
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаём пользователя
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );

    res.status(201).json({ 
      message: 'Пользователь зарегистрирован',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Ищем пользователя
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }

    const user = result.rows[0];

    // Проверяем пароль
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }

    // Генерируем JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ 
      message: 'Успешный вход',
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============= CONTRACT ROUTES =============

// Получить все контракты
app.get('/api/contracts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contracts ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения контрактов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить контракт по ID
app.get('/api/contracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM contracts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт не найден' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Ошибка получения контракта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить контракт
app.put('/api/contracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, progress, total_price, work_price, equipment_price } = req.body;

    // ✅ ВАЛИДАЦИЯ ДАННЫХ
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Название контракта обязательно' });
    }

    if (!['активный', 'завершён', 'на паузе'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус. Допустимые: активный, завершён, на паузе' });
    }

    if (isNaN(progress) || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Прогресс должен быть от 0 до 100' });
    }

    if (isNaN(total_price) || total_price < 0) {
      return res.status(400).json({ error: 'Общая сумма должна быть положительным числом' });
    }

    if (isNaN(work_price) || work_price < 0) {
      return res.status(400).json({ error: 'Сумма работ должна быть положительным числом' });
    }

    if (isNaN(equipment_price) || equipment_price < 0) {
      return res.status(400).json({ error: 'Сумма оборудования должна быть положительным числом' });
    }

    // Проверяем что контракт существует
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт не найден' });
    }

    // Логируем изменение
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [
        req.user.id,
        'UPDATE',
        'contracts',
        id,
        JSON.stringify({ name, status, progress, total_price, work_price, equipment_price })
      ]
    );

    const result = await pool.query(
      'UPDATE contracts SET name = $1, status = $2, progress = $3, total_price = $4, work_price = $5, equipment_price = $6 WHERE id = $7 RETURNING *',
      [name, status, progress, total_price, work_price, equipment_price, id]
    );

    res.json({ message: 'Контракт обновлён', contract: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления контракта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить контракт
app.delete('/api/contracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем что контракт существует
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт не найден' });
    }

    // Логируем удаление
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'DELETE', 'contracts', id, JSON.stringify({ id })]
    );

    await pool.query('DELETE FROM contracts WHERE id = $1', [id]);

    res.json({ message: 'Контракт удалён', id });
  } catch (error) {
    console.error('Ошибка удаления контракта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============= TASKS ROUTES =============

// Получить задачи
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY due_date');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения задач:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать задачу
app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { contract_id, title, status, due_date, assigned_to } = req.body;

    // ✅ ВАЛИДАЦИЯ ДАННЫХ
    if (!contract_id || isNaN(contract_id)) {
      return res.status(400).json({ error: 'contract_id обязателен и должен быть числом' });
    }

    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Название задачи обязательно' });
    }

    if (!['новая', 'в работе', 'завершена', 'отложена'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус. Допустимые: новая, в работе, завершена, отложена' });
    }

    if (due_date && isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'Дата должна быть в формате ISO (2026-03-11)' });
    }

    // ✅ ПРОВЕРКА ЧТО КОНТРАКТ СУЩЕСТВУЕТ
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [contract_id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт с таким ID не найден' });
    }

    // Логируем создание
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, details) VALUES ($1, $2, $3, $4)',
      [
        req.user.id,
        'INSERT',
        'tasks',
        JSON.stringify({ contract_id, title, status, due_date, assigned_to })
      ]
    );

    const result = await pool.query(
      'INSERT INTO tasks (contract_id, title, status, due_date, assigned_to) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [contract_id, title, status, due_date, assigned_to]
    );

    res.status(201).json({ message: 'Задача создана', task: result.rows[0] });
  } catch (error) {
    console.error('Ошибка создания задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить задачу
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, due_date, assigned_to } = req.body;

    // ✅ ВАЛИДАЦИЯ
    if (title && title.trim() === '') {
      return res.status(400).json({ error: 'Название задачи не может быть пусто' });
    }

    if (status && !['новая', 'в работе', 'завершена', 'отложена'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус задачи' });
    }

    if (due_date && isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'Дата должна быть в формате ISO' });
    }

    // Проверяем что задача существует
    const taskExists = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskExists.rows.length === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Логируем изменение
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'UPDATE', 'tasks', id, JSON.stringify({ title, status, due_date, assigned_to })]
    );

    const result = await pool.query(
      'UPDATE tasks SET title = COALESCE($1, title), status = COALESCE($2, status), due_date = COALESCE($3, due_date), assigned_to = COALESCE($4, assigned_to) WHERE id = $5 RETURNING *',
      [title, status, due_date, assigned_to, id]
    );

    res.json({ message: 'Задача обновлена', task: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить задачу
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем что задача существует
    const taskExists = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskExists.rows.length === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    // Логируем удаление
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'DELETE', 'tasks', id, JSON.stringify({ id })]
    );

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);

    res.json({ message: 'Задача удалена', id });
  } catch (error) {
    console.error('Ошибка удаления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============= LETTERS ROUTES =============

// Получить письма
app.get('/api/letters', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM letters ORDER BY date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения писем:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать письмо
app.post('/api/letters', authenticateToken, async (req, res) => {
  try {
    const { contract_id, from, subject, status } = req.body;

    // ✅ ВАЛИДАЦИЯ ДАННЫХ
    if (!contract_id || isNaN(contract_id)) {
      return res.status(400).json({ error: 'contract_id обязателен и должен быть числом' });
    }

    if (!from || from.trim() === '') {
      return res.status(400).json({ error: 'Поле "от" обязательно' });
    }

    if (!subject || subject.trim() === '') {
      return res.status(400).json({ error: 'Тема письма обязательна' });
    }

    if (!['входящее', 'исходящее', 'архив'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус. Допустимые: входящее, исходящее, архив' });
    }

    // ✅ ПРОВЕРКА ЧТО КОНТРАКТ СУЩЕСТВУЕТ
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [contract_id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт с таким ID не найден' });
    }

    // Логируем создание
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'INSERT', 'letters', JSON.stringify({ contract_id, from, subject, status })]
    );

    const result = await pool.query(
      'INSERT INTO letters (contract_id, from, subject, status, date) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [contract_id, from, subject, status]
    );

    res.status(201).json({ message: 'Письмо добавлено', letter: result.rows[0] });
  } catch (error) {
    console.error('Ошибка создания письма:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить письмо
app.put('/api/letters/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, status } = req.body;

    // ✅ ВАЛИДАЦИЯ
    if (subject && subject.trim() === '') {
      return res.status(400).json({ error: 'Тема письма не может быть пуста' });
    }

    if (status && !['входящее', 'исходящее', 'архив'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус письма' });
    }

    // Проверяем что письмо существует
    const letterExists = await pool.query('SELECT id FROM letters WHERE id = $1', [id]);
    if (letterExists.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }

    // Логируем изменение
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'UPDATE', 'letters', id, JSON.stringify({ subject, status })]
    );

    const result = await pool.query(
      'UPDATE letters SET subject = COALESCE($1, subject), status = COALESCE($2, status) WHERE id = $3 RETURNING *',
      [subject, status, id]
    );

    res.json({ message: 'Письмо обновлено', letter: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления письма:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить письмо
app.delete('/api/letters/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Проверяем что письмо существует
    const letterExists = await pool.query('SELECT id FROM letters WHERE id = $1', [id]);
    if (letterExists.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }

    // Логируем удаление
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'DELETE', 'letters', id, JSON.stringify({ id })]
    );

    await pool.query('DELETE FROM letters WHERE id = $1', [id]);

    res.json({ message: 'Письмо удалено', id });
  } catch (error) {
    console.error('Ошибка удаления письма:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============= AUDIT LOG =============

// Получить историю изменений
app.get('/api/audit-log', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.email FROM audit_log al 
       JOIN users u ON al.user_id = u.id 
       ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения лога:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============= INITIALIZATION =============

// Инициализация пользователя при запуске
const initUser = async () => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      ['sarzheev.iv@gmail.com']
    );
    
    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('rambaram16', 10);
      
      await pool.query(
        'INSERT INTO users (email, password) VALUES ($1, $2)',
        ['sarzheev.iv@gmail.com', hashedPassword]
      );
      console.log('✅ Пользователь sarzheev.iv@gmail.com создан!');
    } else {
      console.log('✅ Пользователь уже существует');
    }
  } catch (err) {
    console.error('❌ Ошибка инициализации пользователя:', err);
  }
};

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  await initUser();
});