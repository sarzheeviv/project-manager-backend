import React, { useState, useEffect } from 'react';
import { ChevronDown, Search, Mail, LogOut, Edit2, Save, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ✅ ИСПРАВЛЕНИЕ #2: статусы совпадают с БД и бэкендом
const CONTRACT_STATUSES = ['Проектирование', 'Согласование', 'На согласовании', 'Завершено', 'На паузе'];
const TASK_STATUSES = ['новая', 'в работе', 'завершена', 'отложена'];

export default function ProjectManager() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedContract, setSelectedContract] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedContract, setExpandedContract] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const handleLogin = async (email, password) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
        loadData(data.token);
      } else {
        alert('Ошибка входа: ' + data.error);
      }
    } catch (error) {
      alert('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setContracts([]);
    setTasks([]);
    setLetters([]);
  };

  const loadData = async (tokenToUse = token) => {
    if (!tokenToUse) return;
    try {
      setLoading(true);
      const headers = { 'Authorization': `Bearer ${tokenToUse}` };
      const [contractsRes, tasksRes, lettersRes] = await Promise.all([
        fetch(`${API_URL}/contracts`, { headers }),
        fetch(`${API_URL}/tasks`, { headers }),
        fetch(`${API_URL}/letters`, { headers })
      ]);
      if (contractsRes.ok) setContracts(await contractsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (lettersRes.ok) setLetters(await lettersRes.json());
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContract = async (id, data) => {
    try {
      const response = await fetch(`${API_URL}/contracts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (response.ok) {
        await loadData();
        setEditingId(null);
      } else {
        alert('Ошибка: ' + result.error);
      }
    } catch (error) {
      alert('Ошибка подключения');
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  if (!token) return <LoginScreen onLogin={handleLogin} loading={loading} />;

  // ✅ ИСПРАВЛЕНИЕ #6: правильный подсчёт срочных задач (статус на русском)
  const urgentCount = tasks.filter(t => t.status === 'в работе').length;

  const filteredContracts = contracts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredTasks = selectedContract === 'all'
    ? tasks
    : tasks.filter(t => t.contract_id === parseInt(selectedContract));
  const filteredLetters = selectedContract === 'all'
    ? letters
    : letters.filter(l => l.contract_id === parseInt(selectedContract));

  // ✅ ИСПРАВЛЕНИЕ #5: динамический расчёт финансов из БД
  const totalPrice = contracts.reduce((sum, c) => sum + parseFloat(c.total_price || 0), 0);
  const totalWork = contracts.reduce((sum, c) => sum + parseFloat(c.work_price || 0), 0);
  const totalEquip = contracts.reduce((sum, c) => sum + parseFloat(c.equipment_price || 0), 0);

  const fmt = (n) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtBln = (n) => (n / 1_000_000_000).toFixed(2) + ' млрд.';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Управление контрактами</h1>
            <p className="text-sm text-slate-500 mt-1">{contracts.length} контракта • {user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
          >
            <LogOut className="w-4 h-4" />
            Выход
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 flex gap-8">
          {[
            { id: 'overview', label: '📊 Обзор' },
            { id: 'tasks', label: '✓ Задачи', badge: urgentCount },
            { id: 'letters', label: '✉️ Письма' },
            { id: 'finances', label: '💰 Финансы' },
            { id: 'timeline', label: '📅 Графики' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span className="ml-2 inline-block bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {loading && (
          <div className="text-center py-8 text-slate-500">Загрузка...</div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && !loading && (
          <div className="space-y-8">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Найти контракт..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredContracts.map(contract => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  expanded={expandedContract === contract.id}
                  onExpand={() => setExpandedContract(expandedContract === contract.id ? null : contract.id)}
                  editing={editingId === contract.id}
                  editData={editData}
                  onEdit={() => { setEditingId(contract.id); setEditData({ ...contract }); }}
                  onSave={() => handleUpdateContract(contract.id, editData)}
                  onCancel={() => setEditingId(null)}
                  onEditDataChange={setEditData}
                  fmt={fmt}
                />
              ))}
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab === 'tasks' && !loading && (
          <div className="space-y-6">
            <select
              value={selectedContract}
              onChange={(e) => setSelectedContract(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg"
            >
              <option value="all">Все контракты</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>{c.name.substring(0, 50)}</option>
              ))}
            </select>

            {filteredTasks.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Задач пока нет</p>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-white">
                    <div className={`w-2 h-12 rounded-full ${
                      task.status === 'в работе' ? 'bg-blue-500' :
                      task.status === 'завершена' ? 'bg-green-500' :
                      task.status === 'отложена' ? 'bg-amber-500' : 'bg-slate-300'
                    }`} />
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900">{task.title}</h4>
                      <p className="text-sm text-slate-500 mt-1">
                        {task.due_date ? `Срок: ${task.due_date}` : 'Срок не указан'}
                        {task.assigned_to && ` • ${task.assigned_to}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${
                      task.status === 'в работе' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      task.status === 'завершена' ? 'bg-green-50 text-green-700 border-green-200' :
                      task.status === 'отложена' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>{task.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LETTERS TAB */}
        {activeTab === 'letters' && !loading && (
          <div className="space-y-6">
            <select
              value={selectedContract}
              onChange={(e) => setSelectedContract(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg"
            >
              <option value="all">Все контракты</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>{c.name.substring(0, 50)}</option>
              ))}
            </select>

            {filteredLetters.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Писем пока нет</p>
            ) : (
              <div className="space-y-3">
                {filteredLetters.map(letter => (
                  <div key={letter.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-white">
                    <Mail className="w-5 h-5 text-slate-400 shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900">{letter.subject}</h4>
                      {/* ✅ ИСПРАВЛЕНИЕ #1: используем letter.sender вместо letter.from */}
                      <p className="text-sm text-slate-500 mt-1">{letter.sender}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${
                      letter.status === 'входящее' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      letter.status === 'исходящее' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>{letter.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FINANCES TAB — ✅ ИСПРАВЛЕНИЕ #5: динамические данные из БД */}
        {activeTab === 'finances' && !loading && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6">
              <h3 className="text-2xl font-bold mb-4">Финансовый обзор</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-blue-100 text-sm">Общая стоимость</p>
                  <p className="text-3xl font-bold">{fmtBln(totalPrice)} руб.</p>
                  <p className="text-xs text-blue-200 mt-1">{fmt(totalPrice)} руб.</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Стоимость работ</p>
                  <p className="text-3xl font-bold">{fmtBln(totalWork)} руб.</p>
                  <p className="text-xs text-blue-200 mt-1">{fmt(totalWork)} руб.</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Стоимость оборудования</p>
                  <p className="text-3xl font-bold">{fmtBln(totalEquip)} руб.</p>
                  <p className="text-xs text-blue-200 mt-1">{fmt(totalEquip)} руб.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {contracts.map(contract => (
                <div key={contract.id} className="bg-white border border-slate-200 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-slate-900">{contract.name.substring(0, 80)}</h4>
                    <span className="text-sm text-slate-500">{contract.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-3 rounded">
                      <p className="text-xs text-slate-500 font-medium">💰 Общая</p>
                      <p className="text-sm font-bold text-slate-700 mt-1">{fmt(parseFloat(contract.total_price || 0))} руб.</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="text-xs text-slate-500 font-medium">🔨 Работы</p>
                      <p className="text-sm font-bold text-blue-700 mt-1">{fmt(parseFloat(contract.work_price || 0))} руб.</p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded">
                      <p className="text-xs text-slate-500 font-medium">⚙️ Оборудование</p>
                      <p className="text-sm font-bold text-amber-700 mt-1">{fmt(parseFloat(contract.equipment_price || 0))} руб.</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-slate-500">Прогресс</span>
                      <span className="text-xs font-bold text-slate-700">{contract.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${contract.progress}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && !loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-8">
            <h3 className="text-xl font-semibold text-slate-900 mb-6">Основные сроки</h3>
            <div className="space-y-6">
              {contracts.map(contract => (
                <div key={contract.id} className="border-l-4 border-blue-500 pl-6">
                  <h4 className="font-semibold text-slate-900 mb-3">{contract.name.substring(0, 80)}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Дата контракта:</span>
                      <span className="font-medium">{contract.contract_date}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Прогресс:</span>
                      <span className="font-medium">{contract.progress}%</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Статус:</span>
                      <span className="font-medium">{contract.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============= LOGIN SCREEN =============
function LoginScreen({ onLogin, loading }) {
  const [email, setEmail] = useState('sarzheev.iv@gmail.com');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">Управление контрактами</h1>
        <p className="text-slate-600 text-center mb-8">ГУП Московский метрополитен</p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onLogin(email, password)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Введите пароль"
            />
          </div>
          <button
            onClick={() => onLogin(email, password)}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : 'Вход'}
          </button>
        </div>
        <p className="text-xs text-slate-500 text-center mt-8">Система управления контрактами и финансами</p>
      </div>
    </div>
  );
}

// ============= CONTRACT CARD =============
// ✅ ИСПРАВЛЕНИЕ #4: реализована форма редактирования
function ContractCard({ contract, expanded, onExpand, editing, editData, onEdit, onSave, onCancel, onEditDataChange, fmt }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition bg-white">
      <div className="p-6">
        {!editing ? (
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-base mb-2">{contract.name}</h3>
                <span className={`inline-block px-3 py-1 text-sm rounded-full border ${
                  contract.status === 'Проектирование' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                  contract.status === 'Завершено' ? 'bg-green-50 border-green-200 text-green-700' :
                  contract.status === 'На паузе' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                  'bg-gray-50 border-gray-200 text-gray-700'
                }`}>{contract.status}</span>
              </div>
              <button onClick={onExpand} className="text-slate-400 hover:text-slate-600 ml-2">
                <ChevronDown className={`w-5 h-5 transition ${expanded ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-slate-600">Прогресс</span>
                <span className="text-sm font-bold text-slate-900">{contract.progress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition" style={{ width: `${contract.progress}%` }} />
              </div>
            </div>

            {expanded && (
              <div className="mt-4 pt-4 border-t border-slate-200 space-y-1 text-sm text-slate-600">
                <p><strong>Заказчик:</strong> {contract.customer}</p>
                <p><strong>Подрядчик:</strong> {contract.contractor}</p>
                <p><strong>Площадь:</strong> {contract.area}</p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-200 text-xs">
              <p className="text-slate-600"><strong>Сумма:</strong> {fmt(parseFloat(contract.total_price || 0))} руб.</p>
              <p className="text-slate-600 mt-1"><strong>Контракт от:</strong> {contract.contract_date}</p>
            </div>

            <button
              onClick={onEdit}
              className="mt-4 w-full px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium flex items-center justify-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Редактировать
            </button>
          </>
        ) : (
          /* ✅ ИСПРАВЛЕНИЕ #4: форма редактирования */
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Редактирование контракта</h3>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Название</label>
              <input
                type="text"
                value={editData.name || ''}
                onChange={(e) => onEditDataChange({ ...editData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Статус</label>
              <select
                value={editData.status || ''}
                onChange={(e) => onEditDataChange({ ...editData, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Прогресс ({editData.progress}%)</label>
              <input
                type="range"
                min="0"
                max="100"
                value={editData.progress || 0}
                onChange={(e) => onEditDataChange({ ...editData, progress: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Общая сумма (руб.)</label>
                <input
                  type="number"
                  value={editData.total_price || ''}
                  onChange={(e) => onEditDataChange({ ...editData, total_price: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Стоимость работ (руб.)</label>
                <input
                  type="number"
                  value={editData.work_price || ''}
                  onChange={(e) => onEditDataChange({ ...editData, work_price: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Стоимость оборудования (руб.)</label>
                <input
                  type="number"
                  value={editData.equipment_price || ''}
                  onChange={(e) => onEditDataChange({ ...editData, equipment_price: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onSave}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Сохранить
              </button>
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-medium flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
