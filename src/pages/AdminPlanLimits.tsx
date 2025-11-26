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
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Pencil, Save, X } from "lucide-react";
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
                plan_name: (limit.plans as any)?.name
            })) || [];

            setLimits(limitsWithPlanName);
        } catch (error) {
            toast.error("Erro ao carregar limites");
            console.error(error);
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
            console.error(error);
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
        <DashboardLayout>
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto py-10 px-4">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4 text-gray-900">Painel Administrativo</h1>
                        <AdminTabs />
                    </div>

                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900">Gerenciar Limites de Recursos</h2>
                    </div>

                    {loading ? (
                        <div className="text-center py-8">Carregando...</div>
                    ) : (
                        <div className="space-y-8">
                            {Object.entries(groupedLimits).map(([planName, planLimits]) => (
                                <div key={planName} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                                        <h3 className="text-lg font-semibold text-gray-900">Plano {planName}</h3>
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
                                                                <Pencil className="h-4 w-4 text-gray-500" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
