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

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт не найден' });
    }

    res.json({ message: 'Контракт обновлён', contract: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления контракта:', error);
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
