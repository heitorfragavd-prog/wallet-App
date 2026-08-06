import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ShieldCheck, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useSenhaInvestimentos } from "../hooks/useSenhaInvestimentos";

interface InvestimentoSenhaModalProps {
  onSuccess: () => void;
}

export const InvestimentoSenhaModal: React.FC<InvestimentoSenhaModalProps> = ({ onSuccess }) => {
  const { hasPassword, loading, cadastrarSenha, validarSenha, tentativasRestantes } = useSenhaInvestimentos();
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleValidar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senha) return;

    setSubmitting(true);
    setErrorMsg("");
    const ok = await validarSenha(senha);
    setSubmitting(false);

    if (ok) {
      onSuccess();
    } else {
      setSenha("");
    }
  };

  const handleCadastrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (senha.length < 4) {
      setErrorMsg("A senha precisa ter pelo menos 4 caracteres.");
      return;
    }

    if (senha !== confirmarSenha) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    setSubmitting(true);
    const ok = await cadastrarSenha(senha);
    setSubmitting(false);

    if (ok) {
      onSuccess();
    }
  };

  if (loading) {
    return (
      <Dialog open={true}>
        <DialogContent className="sm:max-w-[400px] bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-foreground flex flex-col items-center justify-center p-8">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
          <p className="text-sm text-slate-400 font-medium">Verificando segurança...</p>
        </DialogContent>
      </Dialog>
    );
  }

  const isCadastro = hasPassword === false;

  return (
    <Dialog open={true}>
      <DialogContent 
        className="sm:max-w-[400px] bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-foreground rounded-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex flex-col items-center space-y-2">
          <div className="bg-emerald-500/10 p-3 rounded-full text-emerald-400 border border-emerald-500/20">
            {isCadastro ? <ShieldCheck className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
          </div>
          <DialogTitle className="text-xl font-extrabold tracking-tight">
            {isCadastro ? "Criar Senha de Acesso" : "Área Protegida"}
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-slate-400">
            {isCadastro
              ? "Cadastre uma senha de segurança exclusiva para gerenciar sua carteira de investimentos."
              : "Digite sua senha de investimentos para liberar a visualização."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={isCadastro ? handleCadastrar : handleValidar} className="space-y-4 pt-4">
          <div className="space-y-2 relative">
            <Label htmlFor="senha" className="text-xs font-semibold text-slate-300">
              {isCadastro ? "Senha de Investimentos" : "Digite sua senha"}
            </Label>
            <div className="relative">
              <Input
                id="senha"
                type={showSenha ? "text" : "password"}
                className="bg-[#1C2541]/50 border-[#1E2942] focus:border-emerald-500 rounded-xl pr-10 text-center font-mono tracking-widest text-lg focus:ring-emerald-500/20"
                placeholder="••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                onClick={() => setShowSenha(!showSenha)}
              >
                {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isCadastro && (
            <div className="space-y-2">
              <Label htmlFor="confirmarSenha" className="text-xs font-semibold text-slate-300">
                Confirme a senha
              </Label>
              <Input
                id="confirmarSenha"
                type={showSenha ? "text" : "password"}
                className="bg-[#1C2541]/50 border-[#1E2942] focus:border-emerald-500 rounded-xl text-center font-mono tracking-widest text-lg"
                placeholder="••••"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                disabled={submitting}
              />
            </div>
          )}

          {errorMsg && (
            <p className="text-xs font-semibold text-rose-400 text-center">{errorMsg}</p>
          )}

          {!isCadastro && tentativasRestantes < 3 && (
            <p className="text-[11px] text-amber-400 text-center font-semibold">
              Tentativas restantes: {tentativasRestantes}
            </p>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl shadow-lg transition-all"
            disabled={submitting || !senha}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : isCadastro ? (
              "Cadastrar Senha"
            ) : (
              "Acessar Carteira"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
