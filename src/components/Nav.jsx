import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Nav() {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <header className="nav">
      <div className="nav-inner">
        <span className="brand">Schedule Tracker</span>
        <nav className="nav-links">
          <NavLink to="/" end>
            Today
          </NavLink>
          <NavLink to="/schedule">Schedule</NavLink>
          <NavLink to="/weekly">Weekly</NavLink>
          <NavLink to="/monthly">Monthly</NavLink>
          <NavLink to="/goals">Goals</NavLink>
          <NavLink to="/shared">Sharing</NavLink>
          <button type="button" className="link-btn" onClick={signOut}>
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
