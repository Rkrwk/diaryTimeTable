import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(username, password);
      } else {
        await signUp(username, password);
      }
      // With email confirmation off, both flows land you in a session.
      navigate('/');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="display">Schedule Tracker</h1>
        <div className="tabs">
          <button
            type="button"
            className={mode === 'signin' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signin');
              setError('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signup');
              setError('');
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourname"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
