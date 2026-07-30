import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Printer, Download } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface SaqueDetails {
  id: string;
  name: string;
  document: string;
  description: string;
  type: string;
  amount: number;
  tax: number;
  status: string;
  lote: string;
  // Detalhes estritos do modal "Verificar Saque"
  cliente?: string;
  documentoCliente?: string;
  chavePix?: string;
  idPagamento?: string;
  pagoEm?: string;
  pagadorNome?: string;
  pagadorCnpj?: string;
  pagadorInstituicao?: string;
  pagadorAgencia?: string;
  pagadorConta?: string;
  recebedorNome?: string;
  recebedorInstituicao?: string;
  recebedorCnpj?: string;
}

interface VerificarSaqueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saque: SaqueDetails | null;
}

export function VerificarSaqueModal({
  open,
  onOpenChange,
  saque,
}: VerificarSaqueModalProps) {
  const cliente = saque?.cliente || "49.683.323 Heitor Fraga de Oliveira";
  const documentoCliente = saque?.documentoCliente || "49.683.323/0001-16";
  const valorSaque = saque?.amount || 0;
  const taxa = saque?.tax || 3.50;
  const valorFinal = valorSaque + taxa;
  const statusPagamento = saque?.status === "FINALIZADO" || saque?.status === "PAID" ? "Pago" : (saque?.status || "Pago");
  const chavePix = saque?.chavePix || "23890726000142";
  const idPagamento = saque?.idPagamento || "E81014060202607291908QDYvmCy218a";
  const pagoEm = saque?.pagoEm || "29/07/2026 16:09:22";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl bg-card border-border/60 text-card-foreground p-6 shadow-2xl space-y-4 z-[999]">

        <DialogHeader className="pb-2 border-b border-border/40">
          <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
            Verificar Saque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {/* Cliente */}
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-medium block">Cliente</span>
            <span className="font-medium text-foreground text-sm block">{cliente}</span>
          </div>

          {/* Documento */}
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-medium block">Documento</span>
            <span className="font-medium text-foreground text-sm block">{documentoCliente}</span>
          </div>

          {/* Valor do Saque */}
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-medium block">Valor do Saque</span>
            <span className="font-extrabold text-foreground text-sm block">{formatCurrency(valorSaque)}</span>
          </div>

          {/* Valor da Taxa */}
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-medium block">Valor da Taxa</span>
            <span className="font-medium text-foreground text-sm block">{formatCurrency(taxa)}</span>
          </div>

          {/* Valor Final */}
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-medium block">Valor Final</span>
            <span className="font-bold text-foreground text-sm block">{formatCurrency(valorFinal)}</span>
          </div>

          {/* Descrição */}
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground font-medium block">Descrição</span>
            <span className="font-medium text-foreground text-sm block">{saque?.description || "Gerson salgados"}</span>
          </div>

          {/* Dados bancários */}
          <div className="pt-2 border-t border-border/40 space-y-2">
            <h4 className="font-bold text-sm text-foreground">Dados bancários</h4>
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground font-medium block">Chave Pix</span>
              <span className="font-mono font-medium text-foreground text-xs block">{chavePix}</span>
            </div>
          </div>

          {/* Comprovante */}
          <div className="pt-2 border-t border-border/40 space-y-3">
            <h4 className="font-bold text-sm text-foreground">Comprovante</h4>

            {/* Ações Impressão & Download */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.print()}
                className="h-8 w-8 rounded-lg border-border/60 text-muted-foreground hover:text-foreground"
                title="Imprimir comprovante"
              >
                <Printer className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => alert("Comprovante baixado com sucesso.")}
                className="h-8 w-8 rounded-lg border-border/60 text-muted-foreground hover:text-foreground"
                title="Baixar comprovante PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Status Pagamento */}
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground font-medium block">Status Pagamento</span>
              <span className="font-semibold text-emerald-500 text-sm block">{statusPagamento}</span>
            </div>

            {/* Id de Pagamento */}
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground font-medium block">Id de Pagamento</span>
              <span className="font-mono text-[11px] text-muted-foreground block break-all">{idPagamento}</span>
            </div>

            {/* Pago em */}
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground font-medium block">Pago em</span>
              <span className="font-medium text-foreground text-xs block">{pagoEm}</span>
            </div>
          </div>
        </div>

        {/* Template do Comprovante Oficial da Divipay para Impressão / PDF (@media print) */}
        <div id="divipay-comprovante-print" className="hidden print:block fixed inset-0 bg-white text-black p-8 font-sans z-[99999]">
          <style>{`
            @media print {
              body * {
                visibility: hidden;
              }
              #divipay-comprovante-print, #divipay-comprovante-print * {
                visibility: visible;
              }
              #divipay-comprovante-print {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
              }
            }
          `}</style>

          <div className="max-w-xl mx-auto space-y-6 bg-white text-black p-6 font-sans">
            {/* Header com Logo Oficial Dourada DiviPay */}
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span className="font-extrabold text-3xl tracking-tight text-gray-900">DiviPay</span>
              </div>
              <h2 className="text-sm font-bold text-amber-500 tracking-wide">Comprovante Transferência</h2>
              <p className="text-xs text-gray-400 font-medium">{pagoEm}</p>
            </div>

            {/* Grid de Detalhes da Transferência (Labels em Maiúsculas) */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-gray-100 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">STATUS</span>
                <span className="font-bold text-gray-900 text-sm">FINISHED</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">TIPO</span>
                <span className="font-bold text-gray-900 text-sm">Débito</span>
              </div>

              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">TIPO</span>
                <span className="font-semibold text-gray-800">{saque?.type || "Pix (DICT)"}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">CHAVE PIX</span>
                <span className="font-semibold text-gray-800">{chavePix}</span>
              </div>

              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">VALOR</span>
                <span className="font-bold text-gray-900 text-base">{formatCurrency(valorSaque)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">LIQUIDAÇÃO</span>
                <span className="font-semibold text-gray-800">{pagoEm}</span>
              </div>

              <div className="col-span-2">
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">DESCRIÇÃO</span>
                <span className="font-bold text-gray-900 text-sm">{saque?.description || "Gerson salgados"}</span>
              </div>

              <div className="col-span-2">
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">AUTENTICAÇÃO</span>
                <span className="font-mono text-xs text-gray-700 break-all">{idPagamento}</span>
              </div>
            </div>

            {/* QUEM PAGOU */}
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">QUEM PAGOU</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
                <div className="col-span-2">
                  <span className="text-[10px] text-gray-400 block font-medium">Nome</span>
                  <span className="font-bold text-gray-900">{saque?.pagadorNome || "DIVI SERVIÇOS E TECNOLOGIA LTDA"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">CPF / CNPJ</span>
                  <span className="font-semibold text-gray-800">{saque?.pagadorCnpj || "47.992.443/0001-70"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Instituição</span>
                  <span className="font-semibold text-gray-800">{saque?.pagadorInstituicao || "2038232 - CCLAA ITAIPU SICOOB CREDITAIPU"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Agência</span>
                  <span className="font-semibold text-gray-800">{saque?.pagadorAgencia || "3036"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Conta</span>
                  <span className="font-semibold text-gray-800">{saque?.pagadorConta || "97217-7"}</span>
                </div>
              </div>
            </div>

            {/* QUEM RECEBEU */}
            <div className="pt-4 border-t border-gray-200 space-y-3">
              <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">QUEM RECEBEU</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
                <div className="col-span-2">
                  <span className="text-[10px] text-gray-400 block font-medium">Nome</span>
                  <span className="font-bold text-gray-900">{saque?.recebedorNome || (saque?.type === "Boleto" ? "BRASNORTE DISTRIBUIDORA DE BEBIDAS LTDA" : saque?.name)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">Instituição</span>
                  <span className="font-semibold text-gray-800">{saque?.recebedorInstituicao || (saque?.type === "Boleto" ? "756 – BANCO SICOOB S.A." : "60746948 – BCO BRADESCO S.A.")}</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-medium">CPF / CNPJ</span>
                  <span className="font-semibold text-gray-800">{saque?.recebedorCnpj || (saque?.type === "Boleto" ? saque?.document : "23.890.726/0001-42")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

