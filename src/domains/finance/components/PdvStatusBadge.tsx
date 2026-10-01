import React from "react";
import { Badge } from "@/shared/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { PdvReconciliationStatus } from "@/types/pdv-reconciliation";

interface PdvStatusBadgeProps {
  status: PdvReconciliationStatus | "already_reconciled" | string;
  className?: string;
}

export const PdvStatusBadge: React.FC<PdvStatusBadgeProps> = ({ status, className = "" }) => {
  switch (status) {
    case "conciliada":
      return (
        <Badge
          variant="outline"
          className={`bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Conciliada</span>
        </Badge>
      );
    case "already_reconciled":
      return (
        <Badge
          variant="outline"
          className={`bg-blue-500/10 text-blue-500 border-blue-500/20 font-medium inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${className}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Já Conciliada</span>
        </Badge>
      );
    case "pendente":
      return (
        <Badge
          variant="outline"
          className={`bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${className}`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Pendente</span>
        </Badge>
      );
    case "estornada":
      return (
        <Badge
          variant="outline"
          className={`bg-purple-500/10 text-purple-500 border-purple-500/20 font-medium inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${className}`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Estornada</span>
        </Badge>
      );
    case "falha":
    default:
      return (
        <Badge
          variant="outline"
          className={`bg-rose-500/10 text-rose-500 border-rose-500/20 font-medium inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${className}`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Falha</span>
        </Badge>
      );
  }
};
