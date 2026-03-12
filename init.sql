-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица контрактов
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  status VARCHAR(50),
  progress INTEGER,
  total_price NUMERIC(15,2),
  work_price NUMERIC(15,2),
  equipment_price NUMERIC(15,2),
  contract_date DATE,
  customer VARCHAR(255),
  contractor VARCHAR(255),
  area VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица объектов в контрактах
CREATE TABLE IF NOT EXISTS objects (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
  name VARCHAR(500),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица задач
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

-- Таблица писем
-- ВАЖНО: "from" — зарезервированное слово в SQL, используем "sender"
CREATE TABLE IF NOT EXISTS letters (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
  sender VARCHAR(500),
  subject VARCHAR(500),
  status VARCHAR(50),
  date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица логирования изменений
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50),
  table_name VARCHAR(100),
  record_id INTEGER,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_letters_contract ON letters(contract_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Первый пользователь (если таблица пуста)
INSERT INTO users (email, password) VALUES 
  ('sarzheev.iv@gmail.com', '$2a$10$dXJ3SW6G7P50eS3BQySGCOYvjU5b9fpVQ9PVUWr8E5xVfUJWUWzUi')
ON CONFLICT (email) DO NOTHING;

-- Тестовые контракты
INSERT INTO contracts (name, status, progress, total_price, work_price, equipment_price, contract_date, customer, contractor, area) VALUES
  ('Контракт №0173200001424000790: Усиление электроснабжения кабельных линий (Линии 73, 104)', 'Проектирование', 35, 1662177109.21, 1134019924.24, 391409541.02, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '296,6 м²'),
  ('Контракт №0173200001424000795: Реконструкция системы электроснабжения (Линии 50, 161)', 'Проектирование', 40, 1438540950.60, 918715773.55, 379731763.79, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '456,3 м²'),
  ('Контракт №0173200001424000796: Усиление энергоснабжения кабельных линий (Линия 162)', 'Проектирование', 25, 383104736.12, 218225759.56, 123789211.94, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '69,4 м²'),
  ('Контракт №0173200001424000799: Реконструкция ЛЭП и ТПС (Линии 49, 84)', 'Проектирование', 20, 1864557328.75, 1152438821.98, 560113884.98, '2024-07-03', 'ГУП Московский метрополитен', 'ООО ТрансЭнергоСнаб', '955 м²')
ON CONFLICT DO NOTHING;
