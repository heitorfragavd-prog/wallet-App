import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { DollarSign, Users, CreditCard, Activity } from "lucide-react";
import { toast } from "sonner";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        activeSubscriptions: 0,
        totalUsers: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            // Fetch total revenue
            const { data: payments, error: paymentsError } = await supabase
                .from('subscription_payments')
                .select('amount')
                .eq('status', 'paid');

            if (paymentsError) throw paymentsError;
            const totalRevenue = payments?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

            // Fetch active subscriptions count
            const { count: activeSubs, error: subsError } = await supabase
                .from('subscriptions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active');

            if (subsError) throw subsError;

            // Fetch total users count
            const { count: totalUsers, error: usersError } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            if (usersError) throw usersError;

            setStats({
                totalRevenue,
                activeSubscriptions: activeSubs || 0,
                totalUsers: totalUsers || 0,
            });

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error("Erro ao carregar dados do dashboard");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <DashboardLayout>
            <div className="flex justify-center items-center h-screen">Carregando...</div>
        </DashboardLayout>
    );

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-background">
                <div className="container mx-auto py-10 px-4">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4 text-foreground">Painel Administrativo</h1>
                        <AdminTabs />
                    </div>

                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalRevenue)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Total acumulado
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
                                <CreditCard className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.activeSubscriptions}</div>
                                <p className="text-xs text-muted-foreground">
                                    Usuários com planos ativos
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Usuários Totais</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                                <p className="text-xs text-muted-foreground">
                                    Total de usuários cadastrados
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.totalUsers > 0 
                                        ? ((stats.activeSubscriptions / stats.totalUsers) * 100).toFixed(1)
                                        : 0}%
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Usuários com assinaturas
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
