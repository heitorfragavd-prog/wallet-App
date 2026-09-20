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
import { AdminLayoutModern } from "@/domains/admin/components/AdminLayoutModern";
import { AdminPageHeader } from "@/domains/admin/components/AdminPageHeader";
import { toast } from "sonner";
import { Pencil, Save, X, Copy, Check, ExternalLink, Wallet } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";

interface PaymentLink {
    id: string;
    plan_id: string;
    payment_link: string;
    gateway_name: string;
    is_active: boolean;
    plans: {
        name: string;
        price: number;
    };
}

export default function AdminPaymentSettings() {
    const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>("");
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    // Detectar ambiente e gerar URL correta do webhook
    const getWebhookUrl = () => {
        const hostname = window.location.hostname;
        
        // Se estiver em produção (domínio real)
        if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            // Usar o domínio do Supabase
            // Você precisa substituir pelo seu projeto Supabase
            return 'https://xjrjenniszhshrgtdjcp.supabase.co/functions/v1/payment-webhook';
        }
        
        // Se estiver em desenvolvimento local
        return 'http://localhost:54321/functions/v1/payment-webhook';
    };

    const webhookUrl = getWebhookUrl();

    useEffect(() => {
        fetchPaymentLinks();
    }, []);

    const fetchPaymentLinks = async () => {
        try {
            const { data, error } = await supabase
                .from('payment_links')
                .select(`
                    *,
                    plans (name, price)
                `)
                .order('plans(price)');

            if (error) throw error;
            setPaymentLinks(data || []);
        } catch (_error) {
            toast.error("Erro ao carregar links de pagamento");
            logger.error('AdminPage', 'Erro na operação', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (link: PaymentLink) => {
        setEditingId(link.id);
        setEditValue(link.payment_link);
    };

    const handleSave = async (linkId: string) => {
        try {
            const { error } = await supabase
                .from('payment_links')
                .update({ payment_link: editValue })
                .eq('id', linkId);

            if (error) throw error;

            toast.success("Link atualizado com sucesso!");
            setEditingId(null);
            fetchPaymentLinks();
        } catch (_error) {
            toast.error("Erro ao atualizar link");
            logger.error('AdminPage', 'Erro na operação', { error: error instanceof Error ? error.message : String(error) });
        }
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditValue("");
    };

    const handleToggleActive = async (linkId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase
                .from('payment_links')
                .update({ is_active: !currentStatus })
                .eq('id', linkId);

            if (error) throw error;

            toast.success(`Link ${!currentStatus ? 'ativado' : 'desativado'} com sucesso!`);
            fetchPaymentLinks();
        } catch (_error) {
            toast.error("Erro ao atualizar status");
        }
    };

    const copyToClipboard = async (text: string, type: 'webhook' | 'link', linkId?: string) => {
        try {
            await navigator.clipboard.writeText(text);
            if (type === 'webhook') {
                setCopiedWebhook(true);
                setTimeout(() => setCopiedWebhook(false), 2000);
            } else {
                setCopiedLink(linkId || null);
                setTimeout(() => setCopiedLink(null), 2000);
            }
            toast.success("Copiado para área de transferência!");
        } catch (_error) {
            toast.error("Erro ao copiar");
        }
    };

    return (
        <AdminLayoutModern>
            <AdminPageHeader
                title="Configurações de Pagamento"
                subtitle="Gerenciar links de pagamento e webhooks"
                icon={Wallet}
                iconColor="bg-emerald-500"
                breadcrumbs={[
                    { label: 'Admin', path: '/admin' },
                    { label: 'Financeiro' },
                    { label: 'Pagamentos' }
                ]}
            />

            <div className="space-y-6">
                        {/* Webhook URL Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>URL do Webhook</CardTitle>
                                <CardDescription>
                                    Configure esta URL no seu gateway de pagamento para receber notificações de pagamento
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex gap-2">
                                    <Input
                                        value={webhookUrl}
                                        readOnly
                                        className="font-mono text-sm"
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                                    >
                                        {copiedWebhook ? (
                                            <Check className="h-4 w-4 text-green-600" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <h4 className="font-semibold text-blue-900 mb-2">Formato do Payload:</h4>
                                    <pre className="text-xs bg-card p-3 rounded border overflow-x-auto">
{`// Formato Pepper (automático)
{
  "platform": "Pepper",
  "status": "paid",
  "customer": {
    "email": "cliente@email.com",
    "name": "Nome do Cliente",
    "phone": "(11) 99999-9999"
  },
  "transaction": {
    "id": "TXN123",
    "amount": 2990
  },
  "offer": {
    "title": "Pro"
  }
}

// Formato Genérico (também suportado)
{
  "event": "payment_completed",
  "email": "cliente@email.com",
  "plan_name": "Pro",
  "amount": 29.90
}`}
                                    </pre>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Payment Links Table */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Links de Pagamento por Plano</CardTitle>
                                <CardDescription>
                                    Configure os links de checkout do seu gateway de pagamento para cada plano
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? (
                                    <div className="text-center py-8">Carregando...</div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Plano</TableHead>
                                                <TableHead>Preço</TableHead>
                                                <TableHead>Link de Pagamento</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paymentLinks.map((link) => (
                                                <TableRow key={link.id}>
                                                    <TableCell className="font-medium">
                                                        {link.plans?.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        {new Intl.NumberFormat('pt-BR', { 
                                                            style: 'currency', 
                                                            currency: 'BRL' 
                                                        }).format(link.plans?.price || 0)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {editingId === link.id ? (
                                                            <Input
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                placeholder="https://seu-gateway.com/checkout/..."
                                                                className="font-mono text-sm"
                                                            />
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-sm truncate max-w-md">
                                                                    {link.payment_link}
                                                                </span>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => copyToClipboard(link.payment_link, 'link', link.id)}
                                                                >
                                                                    {copiedLink === link.id ? (
                                                                        <Check className="h-4 w-4 text-green-600" />
                                                                    ) : (
                                                                        <Copy className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => window.open(link.payment_link, '_blank')}
                                                                >
                                                                    <ExternalLink className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge 
                                                            variant={link.is_active ? "default" : "secondary"}
                                                            className="cursor-pointer"
                                                            onClick={() => handleToggleActive(link.id, link.is_active)}
                                                        >
                                                            {link.is_active ? "Ativo" : "Inativo"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {editingId === link.id ? (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    onClick={() => handleSave(link.id)}
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
                                                                onClick={() => handleEdit(link)}
                                                            >
                                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        {/* Instructions Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Como Funciona</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold">
                                        1
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1">Configure os Links de Pagamento</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Edite os links acima com as URLs de checkout do seu gateway de pagamento para cada plano.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold">
                                        2
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1">Configure o Webhook no Gateway</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Copie a URL do webhook acima e configure no seu gateway de pagamento para receber notificações.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold">
                                        3
                                    </div>
                                    <div>
                                        <h4 className="font-semibold mb-1">Processamento Automático</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Quando um pagamento for confirmado, o sistema automaticamente:
                                        </p>
                                        <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 ml-4">
                                            <li>Cria ou atualiza a assinatura do usuário</li>
                                            <li>Envia um magic link por email para novos usuários</li>
                                            <li>Registra o pagamento no sistema</li>
                                        </ul>
                                    </div>
                                </div>
                            </CardContent>
                </Card>
            </div>
        </AdminLayoutModern>
    );
}
