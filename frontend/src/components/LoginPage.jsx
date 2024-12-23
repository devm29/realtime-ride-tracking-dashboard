import { useState } from 'react';
import axios from 'axios';
import './LoginPage.css';

function LoginPage({ onLogin }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/login', credentials);

      if (response.data.profile?.role !== 'dispatcher') {
        setError('This sign-in is for the dispatch desk. Drivers use the Driver App.');
      } else {
        onLogin({
          username: credentials.username,
          profile: response.data.profile,
          token: response.data.token
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-intro" aria-labelledby="login-intro-title">
        <p className="eyebrow">Dispatch desk</p>
        <h1 id="login-intro-title">Every car on the board, as it moves.</h1>
        <ul className="login-points">
          <li><strong>Live positions.</strong> Drivers stream their location over WebSockets and appear on the city grid within a second.</li>
          <li><strong>Online and offline.</strong> The roster updates when a driver starts or stops sharing, with an alert either way.</li>
          <li><strong>Follow one driver.</strong> Pick a car to get its coordinates every five seconds and a warning when it goes quiet.</li>
        </ul>
      </section>

      <form onSubmit={handleSubmit} className="login-form panel" aria-labelledby="login-form-title">
        <h2 id="login-form-title">Dashboard login</h2>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <label htmlFor="username">Username</label>
        <input
          type="text"
          id="username"
          name="username"
          autoComplete="username"
          value={credentials.username}
          onChange={handleInputChange}
          placeholder="dispatcher"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          type="password"
          id="password"
          name="password"
          autoComplete="current-password"
          value={credentials.password}
          onChange={handleInputChange}
          placeholder="dispatch1"
          required
        />

        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Access dashboard'}
        </button>

        <p className="demo-note">
          Demo access: <code>dispatcher</code> / <code>dispatch1</code>
        </p>
      </form>
    </div>
  );
}

export default LoginPage;
