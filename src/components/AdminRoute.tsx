import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_EMAILS } from "@/lib/config";
import FullScreenLoader from "@/components/FullScreenLoader";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  // Must be logged in
  if (!user) return <Navigate to="/auth" replace />;

  // Must be an admin (case-insensitive)
  if (!ADMIN_EMAILS.some(e => e.toLowerCase() === (user.email || "").toLowerCase())) {
    return <Navigate to="/feed" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
