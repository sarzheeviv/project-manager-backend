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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ ОШИБКА: JWT_SECRET не установлен в переменных окружения!');
  process.exit(1);
}

// ✅ ИСПРАВЛЕНИЕ #2: Правильные статусы контрактов (соответствуют фронтенду и БД)
const CONTRACT_STATUSES = ['Проектирование', 'Согласование', 'На согласовании', 'Завершено', 'На паузе'];
const TASK_STATUSES = ['новая', 'в работе', 'завершена', 'отложена'];
const LETTER_STATUSES = ['входящее', 'исходящее', 'архив'];

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

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );
    res.status(201).json({ message: 'Пользователь зарегистрирован', user: result.rows[0] });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }
    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверные учётные данные' });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Успешный вход', token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============= CONTRACT ROUTES =============

app.get('/api/contracts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contracts ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Ошибка получения контрактов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.post('/api/contracts', authenticateToken, async (req, res) => {
  try {
    const { name, status, progress, customer, contractor, contract_date, area } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Название контракта обязательно' });
    }
    if (!CONTRACT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Некорректный статус` });
    }
    const result = await pool.query(
      `INSERT INTO contracts (name, status, progress, customer, contractor, contract_date, area, total_price, work_price, equipment_price, pir_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,0,0) RETURNING *`,
      [name.trim(), status || 'Проектирование', progress || 0, customer || null, contractor || null, contract_date || null, area || null]
    );
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'INSERT', 'contracts', result.rows[0].id, JSON.stringify({name})]
    );
    res.status(201).json({ message: 'Контракт создан', contract: result.rows[0] });
  } catch (error) {
    console.error('Ошибка создания контракта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

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

app.put('/api/contracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, progress, total_price, work_price, equipment_price, pir_price, contract_date, end_date, expiry_date } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Название контракта обязательно' });
    }
    // ✅ ИСПРАВЛЕНИЕ #2: правильная проверка статуса
    if (!CONTRACT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Некорректный статус. Допустимые: ${CONTRACT_STATUSES.join(', ')}` });
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

    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт не найден' });
    }

    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'UPDATE', 'contracts', id, JSON.stringify({ name, status, progress, total_price, work_price, equipment_price })]
    );

    const result = await pool.query(
      'UPDATE contracts SET name=$1, status=$2, progress=$3, total_price=$4, work_price=$5, equipment_price=$6, pir_price=$7, contract_date=$8, end_date=$9, expiry_date=$10, updated_at=NOW() WHERE id=$11 RETURNING *',
      [name, status, progress, total_price, work_price, equipment_price, pir_price||null, contract_date||null, end_date||null, expiry_date||null, id]
    );

    res.json({ message: 'Контракт обновлён', contract: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления контракта:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ✅ ИСПРАВЛЕНИЕ #3: CASCADE в БД, но также добавляем явную обработку
app.delete('/api/contracts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт не найден' });
    }
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

app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks ORDER BY due_date');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { contract_id, title, status, due_date, assigned_to } = req.body;

    if (!contract_id || isNaN(contract_id)) {
      return res.status(400).json({ error: 'contract_id обязателен и должен быть числом' });
    }
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Название задачи обязательно' });
    }
    if (!TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Некорректный статус. Допустимые: ${TASK_STATUSES.join(', ')}` });
    }
    if (due_date && isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'Дата должна быть в формате ISO (2026-03-11)' });
    }

    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [contract_id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт с таким ID не найден' });
    }

    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'INSERT', 'tasks', JSON.stringify({ contract_id, title, status, due_date, assigned_to })]
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

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, due_date, assigned_to } = req.body;

    if (title && title.trim() === '') {
      return res.status(400).json({ error: 'Название задачи не может быть пусто' });
    }
    if (status && !TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус задачи' });
    }
    if (due_date && isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'Дата должна быть в формате ISO' });
    }

    const taskExists = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskExists.rows.length === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'UPDATE', 'tasks', id, JSON.stringify({ title, status, due_date, assigned_to })]
    );

    const result = await pool.query(
      'UPDATE tasks SET title=COALESCE($1,title), status=COALESCE($2,status), due_date=COALESCE($3,due_date), assigned_to=COALESCE($4,assigned_to), updated_at=NOW() WHERE id=$5 RETURNING *',
      [title, status, due_date, assigned_to, id]
    );
    res.json({ message: 'Задача обновлена', task: result.rows[0] });
  } catch (error) {
    console.error('Ошибка обновления задачи:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const taskExists = await pool.query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (taskExists.rows.length === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'DELETE', 'tasks', id, JSON.stringify({ id })]
    );
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Задача удалена', id });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============= LETTERS ROUTES =============

app.get('/api/letters', authenticateToken, async (req, res) => {
  try {
    // ✅ ИСПРАВЛЕНИЕ #1: используем "sender" вместо зарезервированного "from"
    const result = await pool.query('SELECT * FROM letters ORDER BY date DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/letters', authenticateToken, async (req, res) => {
  try {
    // ✅ ИСПРАВЛЕНИЕ #1: принимаем "sender" вместо "from"
    const { contract_id, sender, subject, status } = req.body;

    if (!contract_id || isNaN(contract_id)) {
      return res.status(400).json({ error: 'contract_id обязателен и должен быть числом' });
    }
    if (!sender || sender.trim() === '') {
      return res.status(400).json({ error: 'Поле "sender" (отправитель) обязательно' });
    }
    if (!subject || subject.trim() === '') {
      return res.status(400).json({ error: 'Тема письма обязательна' });
    }
    if (!LETTER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Некорректный статус. Допустимые: ${LETTER_STATUSES.join(', ')}` });
    }

    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [contract_id]);
    if (contractExists.rows.length === 0) {
      return res.status(404).json({ error: 'Контракт с таким ID не найден' });
    }

    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, details) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'INSERT', 'letters', JSON.stringify({ contract_id, sender, subject, status })]
    );

    // ✅ ИСПРАВЛЕНИЕ #1: "sender" вместо "from"
    const result = await pool.query(
      'INSERT INTO letters (contract_id, sender, subject, status, date) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
      [contract_id, sender, subject, status]
    );
    res.status(201).json({ message: 'Письмо добавлено', letter: result.rows[0] });
  } catch (error) {
    console.error('Ошибка создания письма:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/api/letters/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, status } = req.body;

    if (subject && subject.trim() === '') {
      return res.status(400).json({ error: 'Тема письма не может быть пуста' });
    }
    if (status && !LETTER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус письма' });
    }

    const letterExists = await pool.query('SELECT id FROM letters WHERE id = $1', [id]);
    if (letterExists.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }

    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'UPDATE', 'letters', id, JSON.stringify({ subject, status })]
    );

    const result = await pool.query(
      'UPDATE letters SET subject=COALESCE($1,subject), status=COALESCE($2,status) WHERE id=$3 RETURNING *',
      [subject, status, id]
    );
    res.json({ message: 'Письмо обновлено', letter: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/letters/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const letterExists = await pool.query('SELECT id FROM letters WHERE id = $1', [id]);
    if (letterExists.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }
    await pool.query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'DELETE', 'letters', id, JSON.stringify({ id })]
    );
    await pool.query('DELETE FROM letters WHERE id = $1', [id]);
    res.json({ message: 'Письмо удалено', id });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// ============= PAYMENTS ROUTES =============

// Получить все платежи
app.get('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { contract_id } = req.query;
    let query = 'SELECT * FROM payments';
    let params = [];
    if (contract_id) { query += ' WHERE contract_id = $1'; params = [contract_id]; }
    query += ' ORDER BY payment_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Добавить платёж
app.post('/api/payments', authenticateToken, async (req, res) => {
  try {
    const { contract_id, amount, payment_date, purpose } = req.body;
    if (!contract_id || isNaN(contract_id)) return res.status(400).json({ error: 'contract_id обязателен' });
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Сумма должна быть положительным числом' });
    if (!payment_date || isNaN(Date.parse(payment_date))) return res.status(400).json({ error: 'Дата обязательна' });
    if (!purpose || purpose.trim() === '') return res.status(400).json({ error: 'Назначение платежа обязательно' });
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id = $1', [contract_id]);
    if (contractExists.rows.length === 0) return res.status(404).json({ error: 'Контракт не найден' });
    await pool.query('INSERT INTO audit_log (user_id, action, table_name, details) VALUES ($1, $2, $3, $4)', [req.user.id, 'INSERT', 'payments', JSON.stringify({ contract_id, amount, payment_date, purpose })]);
    const result = await pool.query('INSERT INTO payments (contract_id, amount, payment_date, purpose) VALUES ($1, $2, $3, $4) RETURNING *', [contract_id, amount, payment_date, purpose]);
    res.status(201).json({ message: 'Платёж добавлен', payment: result.rows[0] });
  } catch (error) { console.error('Ошибка добавления платежа:', error); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Удалить платёж
app.delete('/api/payments/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const exists = await pool.query('SELECT id FROM payments WHERE id = $1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Платёж не найден' });
    await pool.query('INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'DELETE', 'payments', id, JSON.stringify({ id })]);
    await pool.query('DELETE FROM payments WHERE id = $1', [id]);
    res.json({ message: 'Платёж удалён', id });
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Редактировать платёж
app.put('/api/payments/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_date, purpose } = req.body;
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Сумма должна быть положительным числом' });
    if (!payment_date || isNaN(Date.parse(payment_date))) return res.status(400).json({ error: 'Дата обязательна' });
    if (!purpose || purpose.trim() === '') return res.status(400).json({ error: 'Назначение обязательно' });
    const exists = await pool.query('SELECT id FROM payments WHERE id = $1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Платёж не найден' });
    await pool.query('INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1, $2, $3, $4, $5)', [req.user.id, 'UPDATE', 'payments', id, JSON.stringify({ amount, payment_date, purpose })]);
    const result = await pool.query('UPDATE payments SET amount=$1, payment_date=$2, purpose=$3 WHERE id=$4 RETURNING *', [amount, payment_date, purpose, id]);
    res.json({ message: 'Платёж обновлён', payment: result.rows[0] });
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});
// ============= STAGES ROUTES =============

app.get('/api/contracts/:contract_id/stages', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stages WHERE contract_id=$1 ORDER BY start_date, id', [req.params.contract_id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/contracts/:contract_id/stages', authenticateToken, async (req, res) => {
  try {
    const { contract_id } = req.params;
    const { name, start_date, end_date, price, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Название этапа обязательно' });
    const result = await pool.query(
      'INSERT INTO stages (contract_id, name, start_date, end_date, price, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [contract_id, name.trim(), start_date||null, end_date||null, price||null, status||'в работе']
    );
    res.status(201).json({ stage: result.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/stages/:id', authenticateToken, async (req, res) => {
  try {
    const { name, start_date, end_date, price, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
    const result = await pool.query(
      'UPDATE stages SET name=$1, start_date=$2, end_date=$3, price=$4, status=$5 WHERE id=$6 RETURNING *',
      [name.trim(), start_date||null, end_date||null, price||null, status||'в работе', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Этап не найден' });
    res.json({ stage: result.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/stages/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM stages WHERE id=$1', [req.params.id]);
    res.json({ id: req.params.id });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============= SUBCONTRACTS ROUTES =============

// GET — возвращает договоры с массивом contract_ids
app.get('/api/subcontracts', authenticateToken, async (req, res) => {
  try {
    const { contract_id } = req.query;
    let q = `
      SELECT s.*, COALESCE(
        array_agg(sc.contract_id) FILTER (WHERE sc.contract_id IS NOT NULL), '{}'
      ) AS contract_ids
      FROM subcontracts s
      LEFT JOIN subcontract_contracts sc ON sc.subcontract_id = s.id
    `;
    let params = [];
    if (contract_id) {
      q += ` WHERE s.id IN (SELECT subcontract_id FROM subcontract_contracts WHERE contract_id=$1)`;
      params = [contract_id];
    }
    q += ` GROUP BY s.id ORDER BY s.created_at DESC`;
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// POST — создать договор с привязкой к нескольким контрактам
app.post('/api/subcontracts', authenticateToken, async (req, res) => {
  try {
    const { contract_ids, number, name, contractor, type, amount, start_date, end_date, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
    if (!contract_ids || !contract_ids.length) return res.status(400).json({ error: 'Выберите хотя бы один контракт' });
    const result = await pool.query(
      'INSERT INTO subcontracts (contract_id, number, name, contractor, type, amount, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [contract_ids[0], number||null, name.trim(), contractor||null, type||null, amount||null, start_date||null, end_date||null, status||'в работе']
    );
    const subId = result.rows[0].id;
    for (const cid of contract_ids) {
      await pool.query('INSERT INTO subcontract_contracts (subcontract_id, contract_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [subId, cid]);
    }
    const full = await pool.query(
      `SELECT s.*, COALESCE(array_agg(sc.contract_id) FILTER (WHERE sc.contract_id IS NOT NULL), '{}') AS contract_ids
       FROM subcontracts s LEFT JOIN subcontract_contracts sc ON sc.subcontract_id=s.id WHERE s.id=$1 GROUP BY s.id`,
      [subId]
    );
    res.status(201).json({ subcontract: full.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// PUT — обновить + пересинхронизировать привязки к контрактам
app.put('/api/subcontracts/:id', authenticateToken, async (req, res) => {
  try {
    const { contract_ids, number, name, contractor, type, amount, start_date, end_date, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
    const result = await pool.query(
      'UPDATE subcontracts SET number=$1, name=$2, contractor=$3, type=$4, amount=$5, start_date=$6, end_date=$7, status=$8 WHERE id=$9 RETURNING *',
      [number||null, name.trim(), contractor||null, type||null, amount||null, start_date||null, end_date||null, status||'в работе', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Договор не найден' });
    if (contract_ids && contract_ids.length) {
      await pool.query('DELETE FROM subcontract_contracts WHERE subcontract_id=$1', [req.params.id]);
      for (const cid of contract_ids) {
        await pool.query('INSERT INTO subcontract_contracts (subcontract_id, contract_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, cid]);
      }
    }
    const full = await pool.query(
      `SELECT s.*, COALESCE(array_agg(sc.contract_id) FILTER (WHERE sc.contract_id IS NOT NULL), '{}') AS contract_ids
       FROM subcontracts s LEFT JOIN subcontract_contracts sc ON sc.subcontract_id=s.id WHERE s.id=$1 GROUP BY s.id`,
      [req.params.id]
    );
    res.json({ subcontract: full.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/subcontracts/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM subcontracts WHERE id=$1', [req.params.id]);
    res.json({ id: req.params.id });
  } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============= OBJECTS ROUTES =============

// Получить объекты контракта
app.get('/api/contracts/:contract_id/objects', authenticateToken, async (req, res) => {
  try {
    const { contract_id } = req.params;
    const result = await pool.query('SELECT * FROM objects WHERE contract_id=$1 ORDER BY id', [contract_id]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Добавить объект
app.post('/api/contracts/:contract_id/objects', authenticateToken, async (req, res) => {
  try {
    const { contract_id } = req.params;
    const { name, status } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Название объекта обязательно' });
    const contractExists = await pool.query('SELECT id FROM contracts WHERE id=$1', [contract_id]);
    if (contractExists.rows.length === 0) return res.status(404).json({ error: 'Контракт не найден' });
    const result = await pool.query(
      'INSERT INTO objects (contract_id, name, status) VALUES ($1, $2, $3) RETURNING *',
      [contract_id, name.trim(), status || 'Проектирование']
    );
    res.status(201).json({ message: 'Объект добавлен', object: result.rows[0] });
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Редактировать объект
app.put('/api/objects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Название обязательно' });
    const exists = await pool.query('SELECT id FROM objects WHERE id=$1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Объект не найден' });
    const result = await pool.query(
      'UPDATE objects SET name=$1, status=$2 WHERE id=$3 RETURNING *',
      [name.trim(), status || 'Проектирование', id]
    );
    res.json({ message: 'Объект обновлён', object: result.rows[0] });
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Удалить объект
app.delete('/api/objects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const exists = await pool.query('SELECT id FROM objects WHERE id=$1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'Объект не найден' });
    await pool.query('DELETE FROM objects WHERE id=$1', [id]);
    res.json({ message: 'Объект удалён', id });
  } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ============= AUDIT LOG =============

app.get('/api/audit-log', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.*, u.email FROM audit_log al 
       JOIN users u ON al.user_id = u.id 
       ORDER BY al.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============= INITIALIZATION =============

// ✅ Автоматическое создание таблиц при запуске
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        status VARCHAR(50),
        progress INTEGER,
        total_price NUMERIC(15,2),
        work_price NUMERIC(15,2),
        equipment_price NUMERIC(15,2),
        contract_date DATE,
        end_date DATE,
        expiry_date DATE,
        customer VARCHAR(255),
        contractor VARCHAR(255),
        area VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS expiry_date DATE;
      ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pir_price NUMERIC(15,2);

      CREATE TABLE IF NOT EXISTS stages (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        name VARCHAR(500) NOT NULL,
        start_date DATE,
        end_date DATE,
        price NUMERIC(15,2),
        status VARCHAR(50) DEFAULT 'в работе',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subcontracts (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
        number VARCHAR(200),
        name VARCHAR(500) NOT NULL,
        contractor VARCHAR(500),
        type VARCHAR(100),
        amount NUMERIC(15,2),
        start_date DATE,
        end_date DATE,
        status VARCHAR(100) DEFAULT 'в работе',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subcontract_contracts (
        id SERIAL PRIMARY KEY,
        subcontract_id INTEGER REFERENCES subcontracts(id) ON DELETE CASCADE,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        UNIQUE(subcontract_id, contract_id)
      );

      -- Migrate existing links to junction table
      INSERT INTO subcontract_contracts (subcontract_id, contract_id)
        SELECT id, contract_id FROM subcontracts WHERE contract_id IS NOT NULL
        ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS objects (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        name VARCHAR(500),
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        title VARCHAR(500),
        status VARCHAR(50),
        due_date DATE,
        assigned_to VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS letters (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        sender VARCHAR(500),
        subject VARCHAR(500),
        status VARCHAR(50),
        date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(50),
        table_name VARCHAR(100),
        record_id INTEGER,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_letters_contract ON letters(contract_id);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
        amount NUMERIC(15,2) NOT NULL,
        payment_date DATE NOT NULL,
        purpose VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
      CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
    `);
    console.log('✅ Таблицы созданы');

    // Тестовые контракты (если таблица пустая)
    const existing = await pool.query('SELECT COUNT(*) FROM contracts');
    if (parseInt(existing.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO contracts (name, status, progress, total_price, work_price, equipment_price, contract_date, customer, contractor, area) VALUES
        ('Контракт №0173200001424000790: Усиление электроснабжения кабельных линий (Линии 73, 104)', 'Проектирование', 35, 1662177109.21, 1134019924.24, 391409541.02, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '296,6 м²'),
        ('Контракт №0173200001424000795: Реконструкция системы электроснабжения (Линии 50, 161)', 'Проектирование', 40, 1438540950.60, 918715773.55, 379731763.79, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '456,3 м²'),
        ('Контракт №0173200001424000796: Усиление энергоснабжения кабельных линий (Линия 162)', 'Проектирование', 25, 383104736.12, 218225759.56, 123789211.94, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '69,4 м²'),
        ('Контракт №0173200001424000799: Реконструкция ЛЭП и ТПС (Линии 49, 84)', 'Проектирование', 20, 1864557328.75, 1152438821.98, 560113884.98, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '955 м²')
      `);
      console.log('✅ Тестовые контракты добавлены');
    }
  } catch (err) {
    console.error('❌ Ошибка инициализации БД:', err.message);
  }
};

const initUser = async () => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', ['sarzheev.iv@gmail.com']);
    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('rambaram16', 10);
      await pool.query('INSERT INTO users (email, password) VALUES ($1, $2)', ['sarzheev.iv@gmail.com', hashedPassword]);
      console.log('✅ Пользователь sarzheev.iv@gmail.com создан!');
    } else {
      console.log('✅ Пользователь уже существует');
    }
  } catch (err) {
    console.error('❌ Ошибка инициализации пользователя:', err);
  }
};

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  await initDB();   // сначала создаём таблицы
  await initUser(); // потом создаём пользователя
});
