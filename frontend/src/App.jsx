import { useState } from 'react';
import axios from 'axios';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import DriverApp from './components/DriverApp';
import './App.css';

const MODES = [
  { id: 'dashboard', label: 'Dispatch' },
  { id: 'driver', label: 'Driver app' }
];

function App() {
  const [mode, setMode] = useState('dashboard');
  const [user, setUser] = useState(null);

  const handleLogout = () => {
    if (user?.token) {
      axios.post('/api/logout', {}, { headers: { Authorization: `Bearer ${user.token}` } }).catch(() => {});
    }
    setUser(null);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setUser(null);
  };

  if (mode === 'dashboard' && user) {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="shell">
      <header className="shell-bar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Ride Tracker
        </span>
        <nav className="mode-switch" aria-label="Choose an app">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mode-btn"
              aria-pressed={mode === item.id}
              onClick={() => switchMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="shell-main">
        {mode === 'dashboard' ? <LoginPage onLogin={setUser} /> : <DriverApp />}
      </main>
    </div>
  );
}

export default App;
