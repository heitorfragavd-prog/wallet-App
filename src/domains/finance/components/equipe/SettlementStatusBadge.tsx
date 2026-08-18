import { Badge } from "@/shared/components/ui/badge";
import type { AcertoStatus } from "@/domains/finance/hooks/useEquipeAcertos";

const labels: Record<AcertoStatus, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente",
  processando: "Processando",
  pago: "Pago",
  falhou: "Falhou",
  cancelado: "Cancelado",
  ajustado: "Ajustado",
};

export function SettlementStatusBadge({ status }: { status: AcertoStatus }) {
  return <Badge variant="outline">{labels[status]}</Badge>;
}
