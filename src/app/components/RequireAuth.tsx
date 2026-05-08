import { Navigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard — redirects to /login if the user is not authenticated.
 * Wrap any route that must be protected from unauthenticated access.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null; // Wait for auth state to resolve

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
