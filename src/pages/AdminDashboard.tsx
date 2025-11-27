import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Users, CreditCard, TrendingUp, LayoutDashboard, UserPlus, Plus, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { AdminStatsCard } from "@/domains/admin/components/AdminStatsCard";
import { RecentActivityCard } from "@/domains/admin/components/RecentActivityCard";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

export default function AdminDashboard() {
    const navigate = useNavigate();
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

    const conversionRate = stats.totalUsers > 0 
        ? ((stats.activeSubscriptions / stats.totalUsers) * 100).toFixed(1)
        : '0';

    return (
        <AdminLayoutModern>
            <AdminPageHeader
                title="Dashboard"
                subtitle="Visão geral do sistema"
                icon={LayoutDashboard}
                iconColor="bg-orange-500"
                breadcrumbs={[
                    { label: 'Admin', path: '/admin' },
                    { label: 'Dashboard' }
                ]}
            />

            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <AdminStatsCard
                    title="Receita Total"
                    value={new Intl.NumberFormat('pt-BR', { 
                        style: 'currency', 
                        currency: 'BRL' 
                    }).format(stats.totalRevenue)}
                    subtitle="Total acumulado"
                    icon={DollarSign}
                    gradient="green"
                    loading={loading}
                />
                <AdminStatsCard
                    title="Usuários Totais"
                    value={stats.totalUsers}
                    subtitle="Total de usuários cadastrados"
                    icon={Users}
                    gradient="blue"
                    loading={loading}
                />
                <AdminStatsCard
                    title="Assinaturas Ativas"
                    value={stats.activeSubscriptions}
                    subtitle="Usuários com planos ativos"
                    icon={CreditCard}
                    gradient="purple"
                    loading={loading}
                />
                <AdminStatsCard
                    title="Taxa de Conversão"
                    value={`${conversionRate}%`}
                    subtitle="Usuários com assinaturas"
                    icon={TrendingUp}
                    gradient="orange"
                    loading={loading}
                />
            </div>

            {/* Quick Actions */}
            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="text-lg font-semibold">Ações Rápidas</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <Button
                            onClick={() => navigate('/admin/users')}
                            className="flex items-center gap-2"
                        >
                            <UserPlus className="h-4 w-4" />
                            Novo Usuário
                        </Button>
                        <Button
                            onClick={() => navigate('/admin/plans')}
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Novo Plano
                        </Button>
                        <Button
                            onClick={() => navigate('/admin/reports')}
                            variant="outline"
                            className="flex items-center gap-2"
                        >
                            <BarChart3 className="h-4 w-4" />
                            Ver Relatórios
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-1">
                <RecentActivityCard />
            </div>
        </AdminLayoutModern>
    );
}
