import { AuthProvider, useAuth } from './auth/AuthProvider';
import { Login } from './auth/Login';
import { Dashboard } from './dashboard/Dashboard';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="centered"><p className="muted">Loading…</p></div>;
  return session ? <Dashboard /> : <Login />;
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
