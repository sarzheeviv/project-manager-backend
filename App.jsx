import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, Filter, Search, Clock, AlertCircle, CheckCircle2, Mail, FileText, Trash2, LogOut, Edit2, Save, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export default function ProjectManager() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedContract, setSelectedContract] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [expandedContract, setExpandedContract] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  // ============= LOGIN/REGISTER =============
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
      console.error('Ошибка входа:', error);
      alert('Ошибка подключения');
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

  // ============= LOAD DATA =============
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

      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        setContracts(contractsData);
      }
      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
      }
      if (lettersRes.ok) {
        const lettersData = await lettersRes.json();
        setLetters(lettersData);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============= UPDATE CONTRACT =============
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

      if (response.ok) {
        loadData();
        setEditingId(null);
        alert('Контракт обновлен успешно!');
      } else {
        alert('Ошибка обновления');
      }
    } catch (error) {
      console.error('Ошибка обновления:', error);
    }
  };

  useEffect(() => {
    if (token && !user) {
      loadData();
    }
  }, [token]);

  // ============= RENDER LOGIN SCREEN =============
  if (!token) {
    return <LoginScreen onLogin={handleLogin} loading={loading} />;
  }

  // ============= DATA PROCESSING =============
  const urgentCount = tasks.filter(t => t.status === 'urgent').length;
  const filteredContracts = contracts.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredTasks = selectedContract === 'all' 
    ? tasks 
    : tasks.filter(t => t.contract_id === parseInt(selectedContract));
  const filteredLetters = selectedContract === 'all' 
    ? letters 
    : letters.filter(l => l.contract_id === parseInt(selectedContract));

  const getStatusColor = (status) => {
    const colors = {
      'Проектирование': 'bg-blue-50 border-blue-200 text-blue-700',
      'Согласование': 'bg-amber-50 border-amber-200 text-amber-700',
      'На согласовании': 'bg-amber-50 border-amber-200 text-amber-700',
      'Завершено': 'bg-green-50 border-green-200 text-green-700'
    };
    return colors[status] || 'bg-gray-50 border-gray-200 text-gray-700';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Управление контрактами</h1>
            <p className="text-sm text-slate-500 mt-1">4 государственных контракта • {user?.email}</p>
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
              {tab.badge && <span className="ml-2 inline-block bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Найти контракт..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredContracts.map(contract => (
                <ContractCard 
                  key={contract.id} 
                  contract={contract}
                  expanded={expandedContract === contract.id}
                  onExpand={() => setExpandedContract(expandedContract === contract.id ? null : contract.id)}
                  onEdit={() => {
                    setEditingId(contract.id);
                    setEditData(contract);
                  }}
                  editing={editingId === contract.id}
                  editData={editData}
                  onSave={() => handleUpdateContract(contract.id, editData)}
                  onCancel={() => setEditingId(null)}
                  onEditDataChange={setEditData}
                />
              ))}
            </div>
          </div>
        )}

        {/* TASKS TAB */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <div className="flex gap-4">
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
            </div>
            <div className="space-y-3">
              {filteredTasks.map(task => (
                <div key={task.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-white">
                  <div className={`w-2 h-12 rounded-full ${task.status === 'urgent' ? 'bg-red-500' : 'bg-blue-500'}`} />
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900">{task.title}</h4>
                    <p className="text-sm text-slate-500 mt-1">Срок: {task.due_date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LETTERS TAB */}
        {activeTab === 'letters' && (
          <div className="space-y-6">
            <div className="flex gap-4">
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
            </div>
            <div className="space-y-3">
              {filteredLetters.map(letter => (
                <div key={letter.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg bg-white">
                  <Mail className="w-5 h-5 text-slate-400" />
                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900">{letter.subject}</h4>
                    <p className="text-sm text-slate-500 mt-1">{letter.from}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-600">{letter.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FINANCES TAB */}
        {activeTab === 'finances' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6">
              <h3 className="text-2xl font-bold mb-4">Финансовый обзор</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-blue-100 text-sm">Общая стоимость</p>
                  <p className="text-3xl font-bold">5,35 млрд. руб.</p>
                  <p className="text-xs text-blue-200 mt-1">5 348 380 124,68 руб.</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Стоимость работ</p>
                  <p className="text-3xl font-bold">3,42 млрд. руб.</p>
                  <p className="text-xs text-blue-200 mt-1">3 423 400 279,33 руб.</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm">Стоимость оборудования</p>
                  <p className="text-3xl font-bold">1,40 млрд. руб.</p>
                  <p className="text-xs text-blue-200 mt-1">1 464 044 401,73 руб.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {contracts.map(contract => (
                <div key={contract.id} className="bg-white border border-slate-200 rounded-lg p-6">
                  <h4 className="font-semibold text-slate-900 mb-2">{contract.name.substring(0, 80)}</h4>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="text-xs text-slate-600 font-medium">🔨 Работы</p>
                      <p className="text-lg font-bold text-blue-700 mt-1">{(contract.work_price / 1000000).toFixed(1)} млн.</p>
                      <p className="text-xs text-slate-600 mt-2 font-mono">
                        {contract.work_price?.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} руб.
                      </p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded">
                      <p className="text-xs text-slate-600 font-medium">⚙️ Оборудование</p>
                      <p className="text-lg font-bold text-amber-700 mt-1">{(contract.equipment_price / 1000000).toFixed(1)} млн.</p>
                      <p className="text-xs text-slate-600 mt-2 font-mono">
                        {contract.equipment_price?.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} руб.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="bg-white border border-slate-200 rounded-lg p-8">
            <h3 className="text-xl font-semibold text-slate-900 mb-6">Основные сроки</h3>
            <div className="space-y-6">
              {contracts.map(contract => (
                <div key={contract.id} className="border-l-4 border-blue-500 pl-6">
                  <h4 className="font-semibold text-slate-900 mb-3">{contract.name.substring(0, 80)}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Начало работ:</span>
                      <span className="font-medium">{contract.contract_date}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Проектная документация:</span>
                      <span className="font-medium">до 2025-04-15</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Госэкспертиза:</span>
                      <span className="font-medium">до 2025-05-01</span>
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

// Login Component
function LoginScreen({ onLogin, loading }) {
  const [email, setEmail] = useState('sarzheev.iv@gmail.com');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">Управление контрактами</h1>
        <p className="text-slate-600 text-center mb-8">ГУП Московский метрополитен</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Введите пароль"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : 'Вход'}
          </button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-8">
          Система управления контрактами и финансами
        </p>
      </div>
    </div>
  );
}

// Contract Card Component with Edit
function ContractCard({ contract, expanded, onExpand, onEdit, editing, editData, onSave, onCancel, onEditDataChange }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition bg-white">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 text-lg mb-2">{contract.name}</h3>
            <span className={`inline-block px-3 py-1 text-sm rounded-full border ${
              contract.status === 'Проектирование' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-700'
            }`}>
              {contract.status}
            </span>
          </div>
          <button onClick={onExpand} className="text-slate-400 hover:text-slate-600">
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
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
            <p className="text-sm font-medium text-slate-600 mb-3">Объекты в контракте:</p>
            <div className="space-y-2 text-sm">
              {/* Здесь будут объекты */}
              <div className="bg-slate-50 p-2 rounded">ЭТП-73, ЭТП-104, КЛ-600В</div>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button onClick={onEdit} className="flex-1 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium">
            <Edit2 className="w-4 h-4 inline mr-2" />
            Редактировать
          </button>
          <button className="flex-1 px-4 py-2 bg-slate-50 text-slate-700 rounded-lg hover:bg-slate-100 transition text-sm font-medium">
            Документы
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 text-xs">
          <p className="text-slate-600"><strong>Сумма:</strong> {contract.total_price?.toLocaleString('ru-RU', {minimumFractionDigits: 2})} руб.</p>
          <p className="text-slate-600 mt-1"><strong>Контракт от:</strong> {contract.contract_date}</p>
        </div>
      </div>
    </div>
  );
}
