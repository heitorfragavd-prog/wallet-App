import { Link, useLocation } from "react-router-dom";

export const AdminTabs = () => {
  const location = useLocation();
  
  const tabs = [
    { path: "/admin", label: "Dashboard" },
    { path: "/admin/users", label: "Usuários" },
    { path: "/admin/plans", label: "Planos" },
    { path: "/admin/limits", label: "Limites" },
    { path: "/admin/subscriptions", label: "Assinaturas" },
    { path: "/admin/payment-settings", label: "Pagamentos" },
    { path: "/admin/reports", label: "Relatórios" },
    { path: "/admin/audit", label: "Auditoria" },
  ];

  return (
    <div className="flex gap-2 border-b border-gray-200">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={`px-4 py-2 ${
              isActive
                ? "border-b-2 border-orange-500 text-orange-600 font-medium"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
};
