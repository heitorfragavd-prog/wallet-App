import React from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { FluxoCaixaChart } from "@/domains/finance/components/FluxoCaixaChart";

const FluxoCaixaPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <FluxoCaixaChart />
      </div>
    </DashboardLayout>
  );
};

export default FluxoCaixaPage;
