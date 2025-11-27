import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  Bell,
  Calendar,
  Clock,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  BellRing,
  Building2,
  Timer,
} from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { useDebtReminders } from "@/domains/finance/hooks/useDebtReminders";
import { ReminderStatusBadge } from "@/domains/finance/components/ReminderStatusBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";

type StatusFilter = "all" | "pending" | "sent" | "failed";

const Lembretes = () => {
  const { reminders, loading } = useDebtReminders();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const getReminderHoursLabel = (hours: number) => {
    if (hours === 24) return "24h antes";
    if (hours === 48) return "48h antes";
    if (hours === 72) return "72h antes";
    if (hours === 168) return "1 semana";
    return `${hours}h antes`;
  };

  // Dados processados
  const { filteredReminders, totalReminders, pendingReminders, sentReminders, failedReminders } = useMemo(() => {
    const filtered = reminders
      .filter((reminder) => {
        const matchesStatus = statusFilter === "all" || reminder.status === statusFilter;
        const matchesSearch =
          searchTerm === "" ||
          reminder.dividas?.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          reminder.dividas?.credor?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        // Ordenar: pendentes primeiro (por trigger_at mais próximo), depois enviados, depois falhas
        const statusPriority: { [key: string]: number } = { pending: 0, sent: 1, failed: 2 };
        const priorityA = statusPriority[a.status] ?? 1;
        const priorityB = statusPriority[b.status] ?? 1;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return new Date(a.trigger_at).getTime() - new Date(b.trigger_at).getTime();
      });

    return {
      filteredReminders: filtered,
      totalReminders: reminders.length,
      pendingReminders: reminders.filter((r) => r.status === "pending").length,
      sentReminders: reminders.filter((r) => r.status === "sent").length,
      failedReminders: reminders.filter((r) => r.status === "failed").length,
    };
  }, [reminders, statusFilter, searchTerm]);

  const clearFilters = () => {
    setStatusFilter("all");
    setSearchTerm("");
  };

  const temFiltrosAtivos = statusFilter !== "all" || searchTerm !== "";

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Pendentes";
      case "sent": return "Enviados";
      case "failed": return "Falhas";
      default: return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-3 shadow-lg shadow-amber-500/20">
            <BellRing className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lembretes</h1>
            <p className="text-muted-foreground">Gerencie os lembretes das suas dívidas</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-foreground">{totalReminders}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-violet-500/20">
                  <Bell className="w-5 h-5 text-violet-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-yellow-600">{pendingReminders}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/20">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Enviados</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-green-500">{sentReminders}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-green-500/20">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Falhas</p>
                  {loading ? <Skeleton className="h-8 w-16" /> : (
                    <p className="text-2xl font-bold text-red-500">{failedReminders}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-red-500/20">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por descrição ou credor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-10 px-3 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Todos os status</option>
                <option value="pending">Pendentes</option>
                <option value="sent">Enviados</option>
                <option value="failed">Falhas</option>
              </select>
              {temFiltrosAtivos && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-10">
                  <X className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              )}
            </div>
            {temFiltrosAtivos && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="text-xs text-muted-foreground">Filtros ativos:</span>
                {searchTerm && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    Busca: {searchTerm}
                    <button onClick={() => setSearchTerm("")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    {getStatusLabel(statusFilter)}
                    <button onClick={() => setStatusFilter("all")} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-2">
                  {filteredReminders.length} resultado{filteredReminders.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </CardContent>
        </Card>


        {/* Lista Desktop */}
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold">Dívida</TableHead>
                    <TableHead className="font-semibold">Credor</TableHead>
                    <TableHead className="font-semibold">Vencimento</TableHead>
                    <TableHead className="font-semibold">Antecedência</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Enviado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredReminders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <Bell className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        Nenhum lembrete encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReminders.map((reminder) => (
                      <TableRow key={reminder.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${
                              reminder.status === "pending" ? "bg-yellow-500/10" :
                              reminder.status === "sent" ? "bg-green-500/10" : "bg-red-500/10"
                            }`}>
                              <BellRing className={`w-4 h-4 ${
                                reminder.status === "pending" ? "text-yellow-600" :
                                reminder.status === "sent" ? "text-green-500" : "text-red-500"
                              }`} />
                            </div>
                            <Link to="/dividas" className="font-medium text-amber-600 hover:text-amber-700 hover:underline">
                              {reminder.dividas?.descricao || "—"}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building2 className="w-3.5 h-3.5" />
                            <span className="text-sm">{reminder.dividas?.credor || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="text-sm">
                              {reminder.dividas?.data_vencimento ? formatDate(reminder.dividas.data_vencimento) : "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            <Timer className="w-3 h-3 mr-1" />
                            {getReminderHoursLabel(reminder.reminder_hours)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <ReminderStatusBadge status={reminder.status} triggerAt={reminder.trigger_at} sentAt={reminder.sent_at} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {reminder.sent_at ? formatDateTime(reminder.sent_at) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Lista Mobile */}
        <div className="md:hidden">
          <Card>
            <CardContent className="p-4">
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="p-4 rounded-xl border border-border space-y-3">
                        <div className="flex justify-between"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-20" /></div>
                        <Skeleton className="h-4 w-24" />
                        <div className="grid grid-cols-2 gap-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div>
                      </div>
                    ))}
                  </div>
                ) : filteredReminders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Bell className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhum lembrete encontrado</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredReminders.map((reminder) => (
                      <div
                        key={reminder.id}
                        className={`p-4 rounded-xl border ${
                          reminder.status === "pending" ? "border-yellow-500/30 bg-yellow-500/5" :
                          reminder.status === "sent" ? "border-green-500/30 bg-green-500/5" :
                          "border-red-500/30 bg-red-500/5"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${
                              reminder.status === "pending" ? "bg-yellow-500/10" :
                              reminder.status === "sent" ? "bg-green-500/10" : "bg-red-500/10"
                            }`}>
                              <BellRing className={`w-4 h-4 ${
                                reminder.status === "pending" ? "text-yellow-600" :
                                reminder.status === "sent" ? "text-green-500" : "text-red-500"
                              }`} />
                            </div>
                            <div>
                              <Link to="/dividas" className="font-medium text-amber-600 hover:underline">
                                {reminder.dividas?.descricao || "—"}
                              </Link>
                              <p className="text-xs text-muted-foreground">{reminder.dividas?.credor || "—"}</p>
                            </div>
                          </div>
                          <ReminderStatusBadge status={reminder.status} triggerAt={reminder.trigger_at} sentAt={reminder.sent_at} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Vencimento</p>
                            <p className="font-medium">
                              {reminder.dividas?.data_vencimento ? formatDate(reminder.dividas.data_vencimento) : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Antecedência</p>
                            <Badge variant="outline" className="font-normal text-xs">
                              {getReminderHoursLabel(reminder.reminder_hours)}
                            </Badge>
                          </div>
                          {reminder.sent_at && (
                            <div className="col-span-2">
                              <p className="text-xs text-muted-foreground">Enviado em</p>
                              <p className="font-medium text-sm">{formatDateTime(reminder.sent_at)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Lembretes;
