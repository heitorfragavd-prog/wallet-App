import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { AdminTabs } from "@/domains/admin/components/AdminTabs";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { TrendingUp, Users, DollarSign, Activity, Calendar } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";

interface MonthlyData {
    month: string;
    users: number;
    revenue: number;
    subscriptions: number;
}

export default function AdminReports() {
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState("6"); // meses
    const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
    const [stats, setStats] = useState({
        totalUsers: 0,
        newUsersThisMonth: 0,
        totalRevenue: 0,
        revenueThisMonth: 0,
        activeSubscriptions: 0,
        churnRate: 0,
        avgRevenuePerUser: 0,
        mostPopularPlan: "",
    });

    useEffect(() => {
        fetchReportsData();
    }, [period]);

    const fetchReportsData = async () => {
        try {
            const months = parseInt(period);
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - months);

            // Buscar dados mensais
            const monthlyStats: MonthlyData[] = [];
            for (let i = months - 1; i >= 0; i--) {
                const monthStart = new Date();
                monthStart.setMonth(monthStart.getMonth() - i);
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);

                const monthEnd = new Date(monthStart);
                monthEnd.setMonth(monthEnd.getMonth() + 1);

                // Contar usuários criados no mês
                const { count: usersCount } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', monthStart.toISOString())
                    .lt('created_at', monthEnd.toISOString());

                // Contar receita do mês
                const { data: payments } = await supabase
                    .from('subscription_payments')
                    .select('amount')
                    .eq('status', 'paid')
                    .gte('payment_date', monthStart.toISOString())
                    .lt('payment_date', monthEnd.toISOString());

                const revenue = payments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

                // Contar assinaturas ativas no final do mês
                const { count: subsCount } = await supabase
                    .from('subscriptions')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'active')
                    .lte('created_at', monthEnd.toISOString());

                monthlyStats.push({
                    month: monthStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
                    users: usersCount || 0,
                    revenue,
                    subscriptions: subsCount || 0,
                });
            }

            setMonthlyData(monthlyStats);

            // Calcular estatísticas gerais
            await calculateStats();
        } catch (error) {
            console.error('Error fetching reports:', error);
            toast.error("Erro ao carregar relatórios");
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = async () => {
        // Total de usuários
        const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        // Novos usuários este mês
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { count: newUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        // Receita total
        const { data: allPayments } = await supabase
            .from('subscription_payments')
            .select('amount')
            .eq('status', 'paid');

        const totalRevenue = allPayments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

        // Receita este mês
        const { data: monthPayments } = await supabase
            .from('subscription_payments')
            .select('amount')
            .eq('status', 'paid')
            .gte('payment_date', monthStart.toISOString());

        const revenueThisMonth = monthPayments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

        // Assinaturas ativas
        const { count: activeSubs } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        // Plano mais popular
        const { data: planCounts } = await supabase
            .from('subscriptions')
            .select('plan_id, plans(name)')
            .eq('status', 'active');

        const planFrequency: Record<string, number> = {};
        planCounts?.forEach((sub: any) => {
            const planName = sub.plans?.name || 'Desconhecido';
            planFrequency[planName] = (planFrequency[planName] || 0) + 1;
        });

        const mostPopularPlan = Object.entries(planFrequency)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

        // Taxa de churn (simplificada)
        const { count: cancelledSubs } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'cancelled')
            .gte('updated_at', monthStart.toISOString());

        const churnRate = activeSubs && cancelledSubs 
            ? ((cancelledSubs / (activeSubs + cancelledSubs)) * 100)
            : 0;

        // Receita média por usuário
        const avgRevenuePerUser = totalUsers ? totalRevenue / totalUsers : 0;

        setStats({
            totalUsers: totalUsers || 0,
            newUsersThisMonth: newUsers || 0,
            totalRevenue,
            revenueThisMonth,
            activeSubscriptions: activeSubs || 0,
            churnRate,
            avgRevenuePerUser,
            mostPopularPlan,
        });
    };

    const maxValue = Math.max(...monthlyData.map(d => Math.max(d.users, d.subscriptions)));
    const maxRevenue = Math.max(...monthlyData.map(d => d.revenue));

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-background">
                <div className="container mx-auto py-10 px-4">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold mb-4 text-foreground">Painel Administrativo</h1>
                        <AdminTabs />
                    </div>

                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-semibold text-foreground">Relatórios e Análises</h2>
                        <Select value={period} onValueChange={setPeriod}>
                            <SelectTrigger className="w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="3">Últimos 3 meses</SelectItem>
                                <SelectItem value="6">Últimos 6 meses</SelectItem>
                                <SelectItem value="12">Últimos 12 meses</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {loading ? (
                        <div className="text-center py-8">Carregando...</div>
                    ) : (
                        <div className="space-y-8">
                            {/* Cards de Estatísticas */}
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Novos Usuários (Mês)</CardTitle>
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{stats.newUsersThisMonth}</div>
                                        <p className="text-xs text-muted-foreground">
                                            Total: {stats.totalUsers}
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Receita (Mês)</CardTitle>
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.revenueThisMonth)}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalRevenue)}
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Taxa de Churn</CardTitle>
                                        <Activity className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">{stats.churnRate.toFixed(1)}%</div>
                                        <p className="text-xs text-muted-foreground">
                                            Este mês
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">ARPU</CardTitle>
                                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.avgRevenuePerUser)}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Receita média por usuário
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Gráfico de Crescimento de Usuários */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Crescimento de Usuários</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64 flex items-end justify-between gap-2">
                                        {monthlyData.map((data, index) => (
                                            <div key={index} className="flex-1 flex flex-col items-center gap-2">
                                                <div className="w-full bg-blue-100 rounded-t relative group cursor-pointer hover:bg-blue-200 transition-colors"
                                                    style={{ height: `${(data.users / maxValue) * 100}%` }}>
                                                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                        {data.users} usuários
                                                    </div>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{data.month}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Gráfico de Receita */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Análise de Receita</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64 flex items-end justify-between gap-2">
                                        {monthlyData.map((data, index) => (
                                            <div key={index} className="flex-1 flex flex-col items-center gap-2">
                                                <div className="w-full bg-green-100 rounded-t relative group cursor-pointer hover:bg-green-200 transition-colors"
                                                    style={{ height: `${maxRevenue > 0 ? (data.revenue / maxRevenue) * 100 : 0}%` }}>
                                                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.revenue)}
                                                    </div>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{data.month}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Informações Adicionais */}
                            <div className="grid gap-4 md:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Plano Mais Popular</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-bold text-orange-600">{stats.mostPopularPlan}</div>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Plano com mais assinaturas ativas
                                        </p>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Assinaturas Ativas</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-3xl font-bold text-green-600">{stats.activeSubscriptions}</div>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Total de assinaturas pagas ativas
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
