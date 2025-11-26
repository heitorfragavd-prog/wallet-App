import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, CreditCard, Webhook, LogOut } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ThemeToggle } from "@/shared/components/ThemeToggle";

export function AdminSidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            navigate("/");
            toast.success("Logout realizado com sucesso!");
        } catch (error) {
            toast.error("Erro ao fazer logout");
        }
    };

    const menuItems = [
        {
            title: "Dashboard",
            icon: LayoutDashboard,
            path: "/admin",
        },
        {
            title: "Usuários",
            icon: Users,
            path: "/admin/users",
        },
        {
            title: "Planos",
            icon: CreditCard,
            path: "/admin/plans",
        },
        {
            title: "Webhook",
            icon: Webhook,
            path: "/admin/webhook-settings",
        },
    ];

    return (
        <div className="h-screen w-64 bg-background border-r border-border flex flex-col">
            <div className="p-6 border-b border-border">
                <h1 className="text-xl font-bold text-foreground">Wallet Admin</h1>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link key={item.path} to={item.path}>
                            <Button
                                variant={isActive ? "secondary" : "ghost"}
                                className={`w-full justify-start gap-3 ${isActive ? "bg-muted text-foreground" : "text-muted-foreground"
                                    }`}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.title}
                            </Button>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-border">
                <div className="flex items-center justify-between gap-2">
                    <Button
                        variant="ghost"
                        className="justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950 min-h-[44px]"
                        onClick={handleLogout}
                        aria-label="Sair da conta"
                    >
                        <LogOut className="h-5 w-5" />
                        Sair
                    </Button>
                    <ThemeToggle className="min-h-[44px] min-w-[44px]" />
                </div>
            </div>
        </div>
    );
}
