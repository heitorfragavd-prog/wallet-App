import React from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { DRETable } from "@/domains/finance/components/DRETable";

const DREPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <DRETable />
      </div>
    </DashboardLayout>
  );
};

export default DREPage;
