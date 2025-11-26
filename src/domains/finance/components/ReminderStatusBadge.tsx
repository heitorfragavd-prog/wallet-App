import { Badge } from "@/shared/components/ui/badge";
import { Bell, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReminderStatusBadgeProps {
  status: "pending" | "sent" | "failed";
  triggerAt?: string;
  sentAt?: string;
}

export const ReminderStatusBadge = ({
  status,
  triggerAt,
  sentAt,
}: ReminderStatusBadgeProps) => {
  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", {
        locale: ptBR,
      });
    } catch {
      return dateString;
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case "pending":
        return {
          icon: Clock,
          label: "Pendente",
          className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
          tooltip: triggerAt ? `Agendado para ${formatDateTime(triggerAt)}` : "Agendado",
        };
      case "sent":
        return {
          icon: CheckCircle,
          label: "Enviado",
          className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
          tooltip: sentAt ? `Enviado em ${formatDateTime(sentAt)}` : "Enviado",
        };
      case "failed":
        return {
          icon: AlertCircle,
          label: "Falhou",
          className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
          tooltip: "Falha ao enviar lembrete",
        };
      default:
        return {
          icon: Bell,
          label: "Desconhecido",
          className: "bg-muted text-muted-foreground",
          tooltip: "",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1 ${config.className}`}
      title={config.tooltip}
    >
      <Icon className="w-3 h-3" />
      <span className="text-xs">{config.label}</span>
    </Badge>
  );
};
