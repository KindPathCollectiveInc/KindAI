import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import type { ProfileRole } from '@/types/database';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export function RoleGuard({
  allow,
  children,
  fallback,
}: {
  allow: ProfileRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { profile, loading } = useAuth();

  if (loading) return <FullScreenLoading />;
  if (!profile || !allow.includes(profile.role)) {
    return (
      fallback ?? (
        <div className="p-8 text-sm text-slate">
          You don't have access to this section. If you think this is wrong, ask an admin to
          check your role.
        </div>
      )
    );
  }

  return <>{children}</>;
}

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sand text-sm text-slate">
      Loading…
    </div>
  );
}
