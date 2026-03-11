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
import { Input } from "@/shared/components/ui/input";
import { Card } from "@/shared/components/ui/card";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { toast } from "sonner";
import { Pencil, Save, X, Gauge } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";

interface PlanLimit {
    id: string;
    plan_id: string;
    feature_key: string;
    limit_value: number | null;
    plan_name?: string;
}

export default function AdminPlanLimits() {
    const [limits, setLimits] = useState<PlanLimit[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");

    useEffect(() => {
        fetchLimits();
    }, []);

    const fetchLimits = async () => {
        try {
            const { data, error } = await supabase
                .from('plan_limits')
                .select(`
                    *,
                    plans (name)
                `)
                .order('plan_id');

            if (error) throw error;

            const limitsWithPlanName = data?.map(limit => ({
                ...limit,
                plan_name: (limit.plans as { name: string } | null)?.name
            })) || [];

            setLimits(limitsWithPlanName);
        } catch (error) {
            toast.error("Erro ao carregar limites");
            logger.error('AdminPage', 'Erro na operação', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (limit: PlanLimit) => {
        setEditingId(limit.id);
        setEditValue(limit.limit_value?.toString() || "");
    };

    const handleSave = async (limitId: string) => {
        try {
            const value = editValue === "" ? null : parseInt(editValue);

            const { error } = await supabase
                .from('plan_limits')
                .update({ limit_value: value })
                .eq('id', limitId);

            if (error) throw error;

            toast.success("Limite atualizado com sucesso!");
            setEditingId(null);
            fetchLimits();
        } catch (error) {
            toast.error("Erro ao atualizar limite");
            logger.error('AdminPage', 'Erro na operação', { error: error instanceof Error ? error.message : String(error) });
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditValue("");
    };

    const getFeatureName = (key: string): string => {
        const names: Record<string, string> = {
            transactions_per_month: "Transações por mês",
            custom_categories: "Categorias personalizadas",
            ai_analysis_per_month: "Análises de IA por mês",
            file_uploads_per_month: "Uploads por mês",
            vehicles: "Veículos",
            goals: "Metas",
            market_items: "Itens de mercado",
        };
        return names[key] || key;
    };

    const groupedLimits = limits.reduce((acc, limit) => {
        const planName = limit.plan_name || 'Sem plano';
        if (!acc[planName]) {
            acc[planName] = [];
        }
        acc[planName].push(limit);
        return acc;
    }, {} as Record<string, PlanLimit[]>);

    return (
        <AdminLayoutModern>
            <AdminPageHeader
                title="Limites de Planos"
                subtitle="Gerenciar limites de recursos por plano"
                icon={Gauge}
                iconColor="bg-indigo-500"
                breadcrumbs={[
                    { label: 'Admin', path: '/admin' },
                    { label: 'Usuários & Planos' },
                    { label: 'Limites' }
                ]}
            />

            {loading ? (
                <div className="text-center py-8">Carregando...</div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedLimits).map(([planName, planLimits]) => (
                        <Card key={planName} className="overflow-hidden">
                            <div className="px-6 py-4 bg-muted/50 border-b border-border">
                                <h3 className="text-lg font-semibold text-foreground">Plano {planName}</h3>
                            </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Recurso</TableHead>
                                                <TableHead>Limite</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {planLimits.map((limit) => (
                                                <TableRow key={limit.id}>
                                                    <TableCell className="font-medium">
                                                        {getFeatureName(limit.feature_key)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {editingId === limit.id ? (
                                                            <Input
                                                                type="number"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                placeholder="Deixe vazio para ilimitado"
                                                                className="w-48"
                                                            />
                                                        ) : (
                                                            <Badge variant={limit.limit_value === null ? "default" : "secondary"}>
                                                                {limit.limit_value === null ? "Ilimitado" : limit.limit_value}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {editingId === limit.id ? (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => handleSave(limit.id)}
                                                                >
                                                                    <Save className="h-4 w-4 text-green-600" />
                                                                </Button>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={handleCancel}
                                                                >
                                                                    <X className="h-4 w-4 text-red-600" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleEdit(limit)}
                                                            >
                                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Card>
                        ))}
                    </div>
                )}
        </AdminLayoutModern>
    );
}
