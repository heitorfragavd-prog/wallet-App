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
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { toast } from "sonner";
import { Badge } from "@/shared/components/ui/badge";
import { RefreshCw, AlertCircle, Receipt } from "lucide-react";
import { logger } from "@/core/logging/LoggerService";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";

interface Subscription {
    id: string;
    user_id: string;
    plan_id: string;
    status: string;
    expires_at: string | null;
    created_at: string;
    profiles: {
        name: string;
        email: string;
    };
    plans: {
        name: string;
        price: number;
    };
}

export default function AdminSubscriptions() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [renewDialogOpen, setRenewDialogOpen] = useState(false);
    const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
    const [renewMonths, setRenewMonths] = useState("1");

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    const fetchSubscriptions = async () => {
        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .select(`
                    *,
                    profiles (name, email),
                    plans (name, price)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSubscriptions(data || []);
        } catch (_error) {
            toast.error("Erro ao carregar assinaturas");
            logger.error('AdminSubscriptions', 'Erro ao carregar assinaturas', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    const handleRenew = async () => {
        if (!selectedSub) return;

        try {
            const months = parseInt(renewMonths);
            const currentExpiry = selectedSub.expires_at 
                ? new Date(selectedSub.expires_at)
                : new Date();
            
            // Se já expirou, começar de hoje
            if (currentExpiry < new Date()) {
                currentExpiry.setTime(Date.now());
            }

            const newExpiry = new Date(currentExpiry);
            newExpiry.setMonth(newExpiry.getMonth() + months);

            const { error } = await supabase
                .from('subscriptions')
                .update({
                    expires_at: newExpiry.toISOString(),
                    status: 'active'
                })
                .eq('id', selectedSub.id);

            if (error) throw error;

            toast.success(`Assinatura renovada por ${months} ${months === 1 ? 'mês' : 'meses'}!`);
            setRenewDialogOpen(false);
            setSelectedSub(null);
            fetchSubscriptions();
        } catch (_error) {
            toast.error("Erro ao renovar assinatura");
            logger.error('AdminSubscriptions', 'Erro ao renovar assinatura', { id: selectedSub?.id, error: error instanceof Error ? error.message : String(error) });
        }
    };

    const handleCancelSubscription = async (subId: string) => {
        if (!confirm("Tem certeza que deseja cancelar esta assinatura?")) return;

        try {
            const { error } = await supabase
                .from('subscriptions')
                .update({ status: 'cancelled' })
                .eq('id', subId);

            if (error) throw error;

            toast.success("Assinatura cancelada!");
            fetchSubscriptions();
        } catch (_error) {
            toast.error("Erro ao cancelar assinatura");
        }
    };

    const handleReactivate = async (subId: string) => {
        try {
            const { error } = await supabase
                .from('subscriptions')
                .update({ status: 'active' })
                .eq('id', subId);

            if (error) throw error;

            toast.success("Assinatura reativada!");
            fetchSubscriptions();
        } catch (_error) {
            toast.error("Erro ao reativar assinatura");
        }
    };

    const getStatusBadge = (status: string, expiresAt: string | null) => {
        if (status === 'cancelled') {
            return <Badge variant="destructive">Cancelada</Badge>;
        }

        if (expiresAt) {
            const expiry = new Date(expiresAt);
            const now = new Date();
            const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilExpiry < 0) {
                return <Badge variant="destructive">Expirada</Badge>;
            } else if (daysUntilExpiry <= 7) {
                return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                    Expira em {daysUntilExpiry} dias
                </Badge>;
            }
        }

        return <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
            Ativa
        </Badge>;
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const getExpiringCount = () => {
        const now = new Date();
        return subscriptions.filter(sub => {
            if (!sub.expires_at || sub.status !== 'active') return false;
            const expiry = new Date(sub.expires_at);
            const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
        }).length;
    };

    const getExpiredCount = () => {
        const now = new Date();
        return subscriptions.filter(sub => {
            if (!sub.expires_at) return false;
            return new Date(sub.expires_at) < now;
        }).length;
    };

    return (
        <AdminLayoutModern>
            <AdminPageHeader
                title="Assinaturas"
                subtitle="Gerenciar assinaturas de usuários"
                icon={Receipt}
                iconColor="bg-green-500"
                breadcrumbs={[
                    { label: 'Admin', path: '/admin' },
                    { label: 'Financeiro' },
                    { label: 'Assinaturas' }
                ]}
            />

            {/* Alertas */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
                {getExpiringCount() > 0 && (
                    <Card className="bg-yellow-500/10 border-yellow-500/20 p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Assinaturas Expirando</h3>
                                <p className="text-sm text-yellow-700 dark:text-yellow-200">
                                    {getExpiringCount()} assinatura(s) expirando nos próximos 7 dias
                                </p>
                            </div>
                        </div>
                    </Card>
                )}
                {getExpiredCount() > 0 && (
                    <Card className="bg-red-500/10 border-red-500/20 p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="font-semibold text-red-900 dark:text-red-100">Assinaturas Expiradas</h3>
                                <p className="text-sm text-red-700 dark:text-red-200">
                                    {getExpiredCount()} assinatura(s) expirada(s)
                                </p>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            <Card className="overflow-hidden">
                <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Usuário</TableHead>
                                    <TableHead>Plano</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Expira em</TableHead>
                                    <TableHead>Criada em</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
                                    </TableRow>
                                ) : subscriptions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">Nenhuma assinatura encontrada</TableCell>
                                    </TableRow>
                                ) : (
                                    subscriptions.map((sub) => (
                                        <TableRow key={sub.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{sub.profiles?.name || 'Sem nome'}</div>
                                                    <div className="text-sm text-muted-foreground">{sub.profiles?.email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{sub.plans?.name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        R$ {sub.plans?.price?.toFixed(2)}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(sub.status, sub.expires_at)}
                                            </TableCell>
                                            <TableCell>{formatDate(sub.expires_at)}</TableCell>
                                            <TableCell>{formatDate(sub.created_at)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Dialog open={renewDialogOpen && selectedSub?.id === sub.id} onOpenChange={(open) => {
                                                        setRenewDialogOpen(open);
                                                        if (!open) setSelectedSub(null);
                                                    }}>
                                                        <DialogTrigger asChild>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => setSelectedSub(sub)}
                                                            >
                                                                <RefreshCw className="h-4 w-4 mr-2" />
                                                                Renovar
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>Renovar Assinatura</DialogTitle>
                                                            </DialogHeader>
                                                            <div className="space-y-4 py-4">
                                                                <div className="space-y-2">
                                                                    <Label>Período de Renovação</Label>
                                                                    <Select value={renewMonths} onValueChange={setRenewMonths}>
                                                                        <SelectTrigger>
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="1">1 mês</SelectItem>
                                                                            <SelectItem value="3">3 meses</SelectItem>
                                                                            <SelectItem value="6">6 meses</SelectItem>
                                                                            <SelectItem value="12">12 meses</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                            <DialogFooter>
                                                                <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>
                                                                    Cancelar
                                                                </Button>
                                                                <Button onClick={handleRenew}>
                                                                    Renovar
                                                                </Button>
                                                            </DialogFooter>
                                                        </DialogContent>
                                                    </Dialog>

                                                    {sub.status === 'active' ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleCancelSubscription(sub.id)}
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleReactivate(sub.id)}
                                                        >
                                                            Reativar
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                        </TableBody>
                    </Table>
                </Card>
        </AdminLayoutModern>
    );
}
