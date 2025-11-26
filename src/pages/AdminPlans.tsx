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
import { Textarea } from "@/shared/components/ui/textarea";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Link } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";

interface Plan {
    id: string;
    name: string;
    price: number;
    features: string[];
}

export default function AdminPlans() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        price: "",
        features: ""
    });

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        try {
            const { data, error } = await supabase
                .from('plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;
            
            // Parse features if they're stored as JSON
            const plansWithFeatures = data?.map(plan => ({
                ...plan,
                features: Array.isArray(plan.features) ? plan.features : []
            })) || [];
            
            setPlans(plansWithFeatures);
        } catch (error) {
            toast.error("Erro ao carregar planos");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            const featuresArray = formData.features.split('\n').filter(f => f.trim() !== '');

            const planData = {
                name: formData.name,
                price: Number(formData.price),
                features: featuresArray
            };

            if (editingPlan) {
                const { error } = await supabase
                    .from('plans')
                    .update(planData)
                    .eq('id', editingPlan.id);
                if (error) throw error;
                toast.success("Plano atualizado com sucesso!");
            } else {
                const { error } = await supabase
                    .from('plans')
                    .insert(planData);
                if (error) throw error;
                toast.success("Plano criado com sucesso!");
            }

            setIsDialogOpen(false);
            fetchPlans();
            resetForm();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Erro ao salvar plano";
            toast.error(errorMessage);
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este plano?")) return;

        try {
            const { error } = await supabase
                .from('plans')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success("Plano excluído com sucesso!");
            fetchPlans();
        } catch (error) {
            toast.error("Erro ao excluir plano");
        }
    };

    const resetForm = () => {
        setEditingPlan(null);
        setFormData({ name: "", price: "", features: "" });
    };

    const handleEdit = (plan: Plan) => {
        setEditingPlan(plan);
        setFormData({
            name: plan.name,
            price: plan.price.toString(),
            features: plan.features?.join('\n') || ""
        });
        setIsDialogOpen(true);
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
                        <h2 className="text-2xl font-semibold text-foreground">Gerenciar Planos</h2>
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Novo Plano
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Nome do Plano</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ex: Pro, Enterprise"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Preço (R$)</Label>
                                    <Input
                                        type="number"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Funcionalidades (uma por linha)</Label>
                                    <Textarea
                                        value={formData.features}
                                        onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                                        placeholder="Acesso ilimitado&#10;Suporte prioritário"
                                        rows={5}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                                <Button onClick={handleSave}>Salvar</Button>
                            </DialogFooter>
                        </DialogContent>
                        </Dialog>
                    </div>

                    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Preço</TableHead>
                                <TableHead>Funcionalidades</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell>
                                </TableRow>
                            ) : plans.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8">Nenhum plano encontrado</TableCell>
                                </TableRow>
                            ) : (
                                plans.map((plan) => (
                                    <TableRow key={plan.id}>
                                        <TableCell className="font-medium text-lg">{plan.name}</TableCell>
                                        <TableCell className="font-bold text-green-600">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.price)}
                                        </TableCell>
                                        <TableCell>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground">
                                                {plan.features?.slice(0, 3).map((feature: string, i: number) => (
                                                    <li key={i}>{feature}</li>
                                                ))}
                                                {plan.features?.length > 3 && (
                                                    <li className="list-none text-muted-foreground text-xs mt-1">
                                                        +{plan.features.length - 3} mais...
                                                    </li>
                                                )}
                                            </ul>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button size="icon" variant="ghost" onClick={() => handleEdit(plan)}>
                                                    <Pencil className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => handleDelete(plan.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
