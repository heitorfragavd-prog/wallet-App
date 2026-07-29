import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { EyemobileDashboardView } from "@/domains/finance/components/EyemobileDashboardView";

const EyemobilePDV = () => {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <main className="p-4 md:p-6">
        <EyemobileDashboardView onConfigure={() => navigate("/admin/webhook-settings")} />
      </main>
    </DashboardLayout>
  );
};

export default EyemobilePDV;
