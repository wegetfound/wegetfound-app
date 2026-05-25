import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Login } from './auth/Login';
import { Dashboard } from './dashboard/Dashboard';
import { FreeAudit } from './free-audit/FreeAudit';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="centered"><p className="muted">Loading…</p></div>;
  return session ? <Dashboard /> : <Login />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/audit" element={<FreeAudit />} />
        <Route
          path="*"
          element={
            <AuthProvider>
              <Gate />
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
