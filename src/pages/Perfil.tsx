import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Progress } from "@/shared/components/ui/progress";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Camera,
  Lock,
  Trash2,
  Shield,
  Crown,
  Sparkles,
  ChevronRight,
  Check,
  ArrowUpCircle,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useProfile } from "@/domains/auth/hooks/useProfile";
import { useUserSubscription } from "@/domains/auth/hooks/useUserSubscription";
import { usePlanLimits } from "@/domains/admin/hooks/usePlanLimits";
import { ChangePasswordModal } from "@/domains/auth/components/auth/ChangePasswordModal";
import { DeleteAccountModal } from "@/domains/auth/components/auth/DeleteAccountModal";
import { UpgradePlanModal } from "@/domains/auth/components/profile/UpgradePlanModal";

const FEATURE_LABELS: Record<string, string> = {
  transactions_this_month: "Transações",
  transactions_per_month: "Transações",
  custom_categories: "Categorias",
  ai_analysis_this_month: "Análises IA",
  ai_analysis_per_month: "Análises IA",
  file_uploads_this_month: "Uploads",
  file_uploads_per_month: "Uploads",
  vehicles: "Veículos",
  goals: "Metas",
  market_items: "Itens Mercado",
};

const Perfil = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { profile, loading, updateProfile, uploadAvatar } = useProfile();
  const { subscription, plan, loading: loadingPlan, isHighestTier } = useUserSubscription();
  const { limits, usage, loading: loadingLimits } = usePlanLimits();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    endereco: "",
    avatar: ""
  });

  useEffect(() => {
    if (profile && user) {
      setFormData({
        nome: profile.name || "",
        email: user.email || "",
        telefone: profile.telefone || "",
        endereco: profile.endereco || "",
        avatar: profile.avatar_url || ""
      });
    }
  }, [profile, user]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({ title: "Erro", description: "Por favor, selecione apenas arquivos de imagem.", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Erro", description: "A imagem deve ter no máximo 5MB.", variant: "destructive" });
        return;
      }
      const avatarUrl = await uploadAvatar(file);
      if (avatarUrl) {
        setFormData(prev => ({ ...prev, avatar: avatarUrl }));
      }
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    const success = await updateProfile({
      name: formData.nome,
      telefone: formData.telefone,
      endereco: formData.endereco,
      avatar_url: formData.avatar
    });
    if (success) setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (profile && user) {
      setFormData({
        nome: profile.name || "",
        email: user.email || "",
        telefone: profile.telefone || "",
        endereco: profile.endereco || "",
        avatar: profile.avatar_url || ""
      });
    }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatRegistrationDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-500"></div>
            <p className="mt-4 text-muted-foreground">Carregando perfil...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isPremium = plan && plan.price > 0;
  const featureKeys = Object.keys(limits);

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-3 shadow-lg shadow-orange-500/20">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
              <p className="text-muted-foreground">Gerencie suas informações pessoais</p>
            </div>
          </div>
          {isPremium && (
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1.5 px-3 py-1.5">
              <Crown className="w-4 h-4" />
              Premium
            </Badge>
          )}
        </div>

        {/* Profile Card + Security */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Avatar Card */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 to-orange-500/5">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative group">
                  <Avatar className="w-28 h-28 border-4 border-orange-500/20 cursor-pointer transition-transform group-hover:scale-105" onClick={handleAvatarClick}>
                    <AvatarImage src={formData.avatar} />
                    <AvatarFallback className="text-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                      {getInitials(formData.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    className="absolute -bottom-1 -right-1 rounded-full w-9 h-9 bg-orange-500 hover:bg-orange-600 shadow-lg"
                    onClick={handleAvatarClick}
                  >
                    <Camera className="w-4 h-4 text-white" />
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </div>
                <h2 className="mt-4 text-xl font-bold text-foreground">{formData.nome}</h2>
                <p className="text-sm text-muted-foreground">{formData.email}</p>
                
                <div className="mt-4 w-full space-y-2">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Membro desde {profile ? formatRegistrationDate(profile.created_at) : 'N/A'}</span>
                  </div>
                  {formData.endereco && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>{formData.endereco}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card className="lg:col-span-2 relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/20">
                  <Shield className="w-5 h-5 text-blue-500" />
                </div>
                <CardTitle className="text-lg">Segurança da Conta</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-between h-14 bg-background/50 hover:bg-background/80 border-border/50"
                onClick={() => setShowChangePasswordModal(true)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Lock className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Alterar Senha</p>
                    <p className="text-xs text-muted-foreground">Atualize sua senha de acesso</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-between h-14 bg-background/50 hover:bg-red-500/10 border-border/50 group"
                onClick={() => setShowDeleteAccountModal(true)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-red-500">Excluir Conta</p>
                    <p className="text-xs text-muted-foreground">Remover permanentemente sua conta</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-red-500" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Plan + Usage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan Card */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/20">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                  </div>
                  <CardTitle className="text-lg">Plano Atual</CardTitle>
                </div>
                {isPremium && (
                  <Badge className="bg-amber-500/20 text-amber-500 border-0">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingPlan ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : plan ? (
                <>
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                    {subscription && (
                      <p className="text-sm text-muted-foreground">
                        Status: <span className="text-green-500 font-medium">{subscription.status}</span>
                      </p>
                    )}
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Recursos incluídos:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {plan.features.slice(0, 4).map((feature, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            <span className="truncate">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isHighestTier ? (
                    <Badge variant="secondary" className="w-full justify-center py-2.5 bg-orange-500/20 text-orange-500 border-0">
                      <Crown className="w-4 h-4 mr-1.5" />
                      Plano Máximo
                    </Badge>
                  ) : (
                    <Button 
                      onClick={() => setShowUpgradeModal(true)} 
                      className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                    >
                      <ArrowUpCircle className="w-4 h-4 mr-2" />
                      Fazer Upgrade
                    </Button>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Usage Card */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500/10 to-green-500/5">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20">
                  <BarChart3 className="w-5 h-5 text-emerald-500" />
                </div>
                <CardTitle className="text-lg">Uso do Plano</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loadingLimits ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {featureKeys.slice(0, 6).map((featureKey) => {
                    const limit = limits[featureKey];
                    const current = usage[featureKey as keyof typeof usage] || 0;
                    const label = FEATURE_LABELS[featureKey] || featureKey;
                    const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : (current > 0 ? 100 : 0);
                    const isOverLimit = current > limit && limit > 0;
                    const isNearLimit = percentage >= 80 && !isOverLimit;

                    return (
                      <div key={featureKey} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <div className="flex items-center gap-1.5">
                            {isOverLimit && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                            <span className={`font-medium ${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-yellow-500' : 'text-foreground'}`}>
                              {current} / {limit === -1 ? '∞' : limit}
                            </span>
                          </div>
                        </div>
                        <Progress 
                          value={limit === -1 ? 0 : percentage} 
                          className={`h-1.5 ${isOverLimit ? '[&>div]:bg-red-500' : isNearLimit ? '[&>div]:bg-yellow-500' : '[&>div]:bg-emerald-500'}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Personal Info */}
        <Card className="border-0 bg-gradient-to-br from-slate-500/10 to-slate-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-slate-500/20">
                <User className="w-5 h-5 text-slate-500" />
              </div>
              <CardTitle className="text-lg">Informações Pessoais</CardTitle>
            </div>
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="bg-background/50">
                Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button onClick={handleSave} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                  Salvar
                </Button>
                <Button onClick={handleCancel} variant="outline" size="sm" className="bg-background/50">
                  Cancelar
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-muted-foreground flex items-center gap-2">
                  <User className="w-4 h-4" /> Nome Completo
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleInputChange('nome', e.target.value)}
                  disabled={!isEditing}
                  className="bg-background/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground flex items-center gap-2">
                  <Mail className="w-4 h-4" /> E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  disabled
                  className="bg-background/50 border-border/50 opacity-60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone" className="text-muted-foreground flex items-center gap-2">
                  <Phone className="w-4 h-4" /> Telefone
                </Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => handleInputChange('telefone', e.target.value)}
                  disabled={!isEditing}
                  className="bg-background/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endereco" className="text-muted-foreground flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Endereço
                </Label>
                <Input
                  id="endereco"
                  value={formData.endereco}
                  onChange={(e) => handleInputChange('endereco', e.target.value)}
                  disabled={!isEditing}
                  className="bg-background/50 border-border/50"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <ChangePasswordModal isOpen={showChangePasswordModal} onClose={() => setShowChangePasswordModal(false)} />
      <DeleteAccountModal isOpen={showDeleteAccountModal} onClose={() => setShowDeleteAccountModal(false)} />
      {plan && (
        <UpgradePlanModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlanId={plan.id}
          currentPlanPrice={plan.price}
        />
      )}
    </DashboardLayout>
  );
};

export default Perfil;
