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
import { Badge } from "@/shared/components/ui/badge";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { toast } from "sonner";
import { Search, Shield, ShieldAlert, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";

export default function AdminUsers() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [plans, setPlans] = useState<any[]>([]);

    useEffect(() => {
        fetchUsers();
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        const { data } = await supabase.from('plans').select('*');
        setPlans(data || []);
    };

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
          *,
          subscriptions (
            status,
            plan_id,
            plans (name)
          )
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            toast.error("Erro ao carregar usuários");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId: string, newRole: 'user' | 'admin') => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;
            toast.success(`Função atualizada para ${newRole}`);
            fetchUsers();
        } catch (error) {
            toast.error("Erro ao atualizar função");
        }
    };

    const handlePlanChange = async (userId: string, planId: string) => {
        try {
            const { error } = await supabase
                .from('subscriptions')
                .upsert({
                    user_id: userId,
                    plan_id: planId,
                    status: 'active',
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;
            toast.success("Plano atualizado com sucesso!");
            fetchUsers();
        } catch (error) {
            toast.error("Erro ao atualizar plano");
        }
    };

    const filteredUsers = users.filter(user =>
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-gray-50">
                <div className="container mx-auto py-10 px-4">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4 text-gray-900">Painel Administrativo</h1>
                        <AdminTabs />
                    </div>
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900">Gerenciar Usuários</h2>
                        <div className="relative w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                            <Input
                                placeholder="Buscar por nome ou email..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Função</TableHead>
                                <TableHead>Plano</TableHead>
                                <TableHead>Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
                                </TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">Nenhum usuário encontrado</TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => {
                                    const sub = user.subscriptions?.[0];
                                    const planName = sub?.plans?.name || 'Gratuito';

                                    return (
                                        <TableRow key={user.id}>
                                            <TableCell className="font-medium">{user.name || 'Sem nome'}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>
                                                    {user.role === 'admin' ? 'Administrador' : 'Usuário'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                    {planName}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Dialog>
                                                        <DialogTrigger asChild>
                                                            <Button size="sm" variant="outline">
                                                                <UserCheck className="h-4 w-4 mr-2" />
                                                                Gerenciar
                                                            </Button>
                                                        </DialogTrigger>
                                                        <DialogContent>
                                                            <DialogHeader>
                                                                <DialogTitle>Gerenciar {user.name}</DialogTitle>
                                                            </DialogHeader>
                                                            <div className="space-y-4 py-4">
                                                                <div className="space-y-2">
                                                                    <label className="text-sm font-medium">Alterar Função</label>
                                                                    <div className="flex gap-2">
                                                                        <Button
                                                                            variant={user.role === 'user' ? 'default' : 'outline'}
                                                                            onClick={() => handleRoleChange(user.id, 'user')}
                                                                            size="sm"
                                                                        >
                                                                            Usuário
                                                                        </Button>
                                                                        <Button
                                                                            variant={user.role === 'admin' ? 'destructive' : 'outline'}
                                                                            onClick={() => handleRoleChange(user.id, 'admin')}
                                                                            size="sm"
                                                                        >
                                                                            Administrador
                                                                        </Button>
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-2">
                                                                    <label className="text-sm font-medium">Alterar Plano</label>
                                                                    <Select onValueChange={(value) => handlePlanChange(user.id, value)}>
                                                                        <SelectTrigger>
                                                                            <SelectValue placeholder="Selecione um plano" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {plans.map(plan => (
                                                                                <SelectItem key={plan.id} value={plan.id}>
                                                                                    {plan.name} - R$ {plan.price}
                                                                                </SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                        </DialogContent>
                                                    </Dialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
