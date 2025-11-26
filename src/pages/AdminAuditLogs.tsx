import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/shared/components/ui/table";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Badge } from "@/shared/components/ui/badge";
import { Shield, User, CreditCard, Settings, FileText } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";

interface AuditLog {
    id: string;
    admin_id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: any;
    created_at: string;
    profiles: {
        name: string;
        email: string;
    };
}

export default function AdminAuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        fetchLogs();
    }, [filter]);

    const fetchLogs = async () => {
        try {
            let query = supabase
                .from('admin_logs')
                .select(`
                    *,
                    profiles (name, email)
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            if (filter !== "all") {
                query = query.eq('entity_type', filter);
            }

            const { data, error } = await query;

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            toast.error("Erro ao carregar logs");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const getActionBadge = (action: string) => {
        const colors: Record<string, string> = {
            create: "bg-green-500/10 text-green-600 dark:text-green-400",
            update: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            delete: "bg-red-500/10 text-red-600 dark:text-red-400",
            renew: "bg-purple-100 text-purple-800",
            cancel: "bg-orange-100 text-orange-800",
        };

        const actionType = action.split('_')[0].toLowerCase();
        const colorClass = colors[actionType] || "bg-muted text-foreground";

        return (
            <Badge variant="outline" className={colorClass}>
                {action}
            </Badge>
        );
    };

    const getEntityIcon = (entityType: string) => {
        const icons: Record<string, any> = {
            user: User,
            subscription: CreditCard,
            plan: Settings,
            limit: FileText,
        };

        const Icon = icons[entityType] || Shield;
        return <Icon className="h-4 w-4" />;
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatDetails = (details: any) => {
        if (!details || Object.keys(details).length === 0) return '-';
        
        return Object.entries(details)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
    };

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-background">
                <div className="container mx-auto py-10 px-4">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4 text-foreground">Painel Administrativo</h1>
                        <AdminTabs />
                    </div>

                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-semibold text-foreground">Logs de Auditoria</h2>
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger className="w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas as ações</SelectItem>
                                <SelectItem value="user">Usuários</SelectItem>
                                <SelectItem value="subscription">Assinaturas</SelectItem>
                                <SelectItem value="plan">Planos</SelectItem>
                                <SelectItem value="limit">Limites</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data/Hora</TableHead>
                                    <TableHead>Administrador</TableHead>
                                    <TableHead>Ação</TableHead>
                                    <TableHead>Entidade</TableHead>
                                    <TableHead>Detalhes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
                                    </TableRow>
                                ) : logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">
                                            Nenhum log encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-mono text-sm">
                                                {formatDate(log.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{log.profiles?.name || 'Admin'}</div>
                                                    <div className="text-sm text-muted-foreground">{log.profiles?.email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {getActionBadge(log.action)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {getEntityIcon(log.entity_type)}
                                                    <span className="capitalize">{log.entity_type}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                                                {formatDetails(log.details)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {logs.length > 0 && (
                        <div className="mt-4 text-sm text-muted-foreground text-center">
                            Mostrando os últimos 100 registros
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
