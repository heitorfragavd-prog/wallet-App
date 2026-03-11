import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/core/logging/LoggerService";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.warn('NotFound', 'Rota não encontrada', { pathname: location.pathname });
  }, [location.pathname]);

  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const homePath = isAuthenticated ? "/dashboard" : "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
        <Link
          to={homePath}
          className="text-blue-500 hover:text-blue-700 underline"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
