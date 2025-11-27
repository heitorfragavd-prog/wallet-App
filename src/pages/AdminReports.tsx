import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { AdminStatsCard } from "@/domains/admin/components/AdminStatsCard";
import { toast } from "sonner";
import { BarChart3, Users, DollarSign, Activity, TrendingUp } from "lucide-react";
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
    const [period, setPeriod] = useState("6");
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
            const monthlyStats: MonthlyData[] = [];
            
            for (let i = months - 1; i >= 0; i--) {
                const monthStart = new Date();
                monthStart.setMonth(monthStart.getMonth() - i);
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);

                const monthEnd = new Date(monthStart);
                monthEnd.setMonth(monthEnd.getMonth() + 1);

                const { count: usersCount } = await supabase
                    .from('profiles')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', monthStart.toISOString())
                    .lt('created_at', monthEnd.toISOString());

                const { data: payments } = await supabase
                    .from('subscription_payments')
                    .select('amount')
                    .eq('status', 'paid')
                    .gte('payment_date', monthStart.toISOString())
                    .lt('payment_date', monthEnd.toISOString());

                const revenue = payments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

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
            await calculateStats();
        } catch (error) {
            console.error('Error fetching reports:', error);
            toast.error("Erro ao carregar relatórios");
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = async () => {
        const { count: totalUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const { count: newUsers } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', monthStart.toISOString());

        const { data: allPayments } = await supabase
            .from('subscription_payments')
            .select('amount')
            .eq('status', 'paid');

        const totalRevenue = allPayments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

        const { data: monthPayments } = await supabase
            .from('subscription_payments')
            .select('amount')
            .eq('status', 'paid')
            .gte('payment_date', monthStart.toISOString());

        const revenueThisMonth = monthPayments?.reduce((acc, p) => acc + Number(p.amount), 0) || 0;

        const { count: activeSubs } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        const { data: planCounts } = await supabase
            .from('subscriptions')
            .select('plan_id, plans(name)')
            .eq('status', 'active');

        const planFrequency: Record<string, number> = {};
        planCounts?.forEach((sub: { plans: { name: string } | null }) => {
            const planName = sub.plans?.name || 'Desconhecido';
            planFrequency[planName] = (planFrequency[planName] || 0) + 1;
        });

        const mostPopularPlan = Object.entries(planFrequency)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

        const { count: cancelledSubs } = await supabase
            .from('subscriptions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'cancelled')
            .gte('updated_at', monthStart.toISOString());

        const churnRate = activeSubs && cancelledSubs 
            ? ((cancelledSubs / (activeSubs + cancelledSubs)) * 100)
            : 0;

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

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const maxValue = Math.max(...monthlyData.map(d => Math.max(d.users, d.subscriptions)), 1);
    const maxRevenue = Math.max(...monthlyData.map(d => d.revenue), 1);

    return (
        <AdminLayoutModern>
            <AdminPageHeader
                title="Relatórios e Análises"
                subtitle="Visualize métricas e tendências do sistema"
                icon={BarChart3}
                iconColor="bg-orange-500"
                breadcrumbs={[
                    { label: 'Admin', path: '/admin' },
                    { label: 'Sistema' },
                    { label: 'Relatórios' }
                ]}
                actions={
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
                }
            />

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <AdminStatsCard
                    title="Novos Usuários (Mês)"
                    value={stats.newUsersThisMonth}
                    subtitle={`Total: ${stats.totalUsers}`}
                    icon={Users}
                    gradient="blue"
                    loading={loading}
                />
                <AdminStatsCard
                    title="Receita (Mês)"
                    value={formatCurrency(stats.revenueThisMonth)}
                    subtitle={`Total: ${formatCurrency(stats.totalRevenue)}`}
                    icon={DollarSign}
                    gradient="green"
                    loading={loading}
                />
                <AdminStatsCard
                    title="Taxa de Churn"
                    value={`${stats.churnRate.toFixed(1)}%`}
                    subtitle="Este mês"
                    icon={Activity}
                    gradient="red"
                    loading={loading}
                />
                <AdminStatsCard
                    title="ARPU"
                    value={formatCurrency(stats.avgRevenuePerUser)}
                    subtitle="Receita média por usuário"
                    icon={TrendingUp}
                    gradient="purple"
                    loading={loading}
                />
            </div>

            {loading ? (
                <div className="text-center py-8">Carregando...</div>
            ) : (
                <div className="space-y-6">
                    {/* Gráfico de Crescimento de Usuários */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Crescimento de Usuários</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-64 flex items-end justify-between gap-2">
                                {monthlyData.map((data, index) => (
                                    <div key={index} className="flex-1 flex flex-col items-center gap-2">
                                        <div 
                                            className="w-full bg-blue-500/20 dark:bg-blue-500/30 rounded-t relative group cursor-pointer hover:bg-blue-500/30 dark:hover:bg-blue-500/40 transition-colors"
                                            style={{ height: `${(data.users / maxValue) * 100}%`, minHeight: '4px' }}
                                        >
                                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
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
                                        <div 
                                            className="w-full bg-green-500/20 dark:bg-green-500/30 rounded-t relative group cursor-pointer hover:bg-green-500/30 dark:hover:bg-green-500/40 transition-colors"
                                            style={{ height: `${(data.revenue / maxRevenue) * 100}%`, minHeight: '4px' }}
                                        >
                                            <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                                {formatCurrency(data.revenue)}
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
                                <div className="text-3xl font-bold text-orange-500">{stats.mostPopularPlan}</div>
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
                                <div className="text-3xl font-bold text-green-500">{stats.activeSubscriptions}</div>
                                <p className="text-sm text-muted-foreground mt-2">
                                    Total de assinaturas pagas ativas
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </AdminLayoutModern>
    );
}
