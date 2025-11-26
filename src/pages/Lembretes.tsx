import { useState } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Bell, Calendar, Clock, Filter, Search } from "lucide-react";
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
    if (hours === 24) return "24 horas antes";
    if (hours === 48) return "48 horas antes";
    if (hours === 72) return "72 horas antes";
    if (hours === 168) return "1 semana antes";
    return `${hours} horas antes`;
  };

  const filteredReminders = reminders.filter((reminder) => {
    const matchesStatus = statusFilter === "all" || reminder.status === statusFilter;
    const matchesSearch =
      searchTerm === "" ||
      reminder.dividas?.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reminder.dividas?.credor?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const clearFilters = () => {
    setStatusFilter("all");
    setSearchTerm("");
  };

  // Statistics
  const totalReminders = reminders.length;
  const pendingReminders = reminders.filter((r) => r.status === "pending").length;
  const sentReminders = reminders.filter((r) => r.status === "sent").length;
  const failedReminders = reminders.filter((r) => r.status === "failed").length;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Lembretes
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Gerencie os lembretes das suas dívidas
            </p>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold">{totalReminders}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-yellow-600">
                {pendingReminders}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enviados</CardTitle>
              <Calendar className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-green-600">
                {sentReminders}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Falhas</CardTitle>
              <Bell className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg md:text-2xl font-bold text-red-600">
                {failedReminders}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou credor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <select
                  title="Filtrar por status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full sm:w-48 px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">Todos os status</option>
                  <option value="pending">Pendentes</option>
                  <option value="sent">Enviados</option>
                  <option value="failed">Falhas</option>
                </select>

                <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                  <Filter className="w-4 h-4 mr-2" />
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reminders List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">
              Lembretes ({filteredReminders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando lembretes...
              </div>
            ) : filteredReminders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum lembrete encontrado.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Credor</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Lembrete</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enviado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReminders.map((reminder) => (
                        <TableRow key={reminder.id}>
                          <TableCell className="font-medium">
                            <Link
                              to="/dividas"
                              className="text-orange-600 hover:underline"
                            >
                              {reminder.dividas?.descricao || "—"}
                            </Link>
                          </TableCell>
                          <TableCell>{reminder.dividas?.credor || "—"}</TableCell>
                          <TableCell>
                            {reminder.dividas?.data_vencimento
                              ? formatDate(reminder.dividas.data_vencimento)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {getReminderHoursLabel(reminder.reminder_hours)}
                          </TableCell>
                          <TableCell>
                            <ReminderStatusBadge
                              status={reminder.status}
                              triggerAt={reminder.trigger_at}
                              sentAt={reminder.sent_at}
                            />
                          </TableCell>
                          <TableCell>
                            {reminder.sent_at ? formatDateTime(reminder.sent_at) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-4">
                  {filteredReminders.map((reminder) => (
                    <Card key={reminder.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Link
                              to="/dividas"
                              className="font-medium text-orange-600 hover:underline"
                            >
                              {reminder.dividas?.descricao || "—"}
                            </Link>
                            <p className="text-sm text-muted-foreground">
                              {reminder.dividas?.credor || "—"}
                            </p>
                          </div>
                          <ReminderStatusBadge
                            status={reminder.status}
                            triggerAt={reminder.trigger_at}
                            sentAt={reminder.sent_at}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Vencimento</p>
                            <p className="font-medium">
                              {reminder.dividas?.data_vencimento
                                ? formatDate(reminder.dividas.data_vencimento)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Lembrete</p>
                            <p className="font-medium">
                              {getReminderHoursLabel(reminder.reminder_hours)}
                            </p>
                          </div>
                          {reminder.sent_at && (
                            <div className="col-span-2">
                              <p className="text-muted-foreground">Enviado em</p>
                              <p className="font-medium">
                                {formatDateTime(reminder.sent_at)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Lembretes;
