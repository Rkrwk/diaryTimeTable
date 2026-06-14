import { Routes, Route } from 'react-router-dom';
import Nav from './components/Nav';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Today from './pages/Today';
import Schedule from './pages/Schedule';
import Weekly from './pages/Weekly';
import Monthly from './pages/Monthly';
import Shared from './pages/Shared';
import PublicView from './pages/PublicView';
import DayDetail from './pages/DayDetail';
import Goals from './pages/Goals';

export default function App() {
  return (
    <>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/view" element={<PublicView />} />
          <Route path="/view/:code" element={<PublicView />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Today />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <Schedule />
              </ProtectedRoute>
            }
          />
          <Route
            path="/weekly"
            element={
              <ProtectedRoute>
                <Weekly />
              </ProtectedRoute>
            }
          />
          <Route
            path="/day/:date"
            element={
              <ProtectedRoute>
                <DayDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monthly"
            element={
              <ProtectedRoute>
                <Monthly />
              </ProtectedRoute>
            }
          />
          <Route
            path="/goals"
            element={
              <ProtectedRoute>
                <Goals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shared"
            element={
              <ProtectedRoute>
                <Shared />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </>
  );
}
