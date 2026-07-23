import React from "react";

export type BancoId =
  | "nubank"
  | "itau"
  | "bradesco"
  | "caixa"
  | "bb"
  | "inter"
  | "santander"
  | "sicredi"
  | "sicoob"
  | "btg"
  | "picpay"
  | "c6"
  | "xp"
  | "mercadopago"
  | "outro";

export interface BankConfig {
  id: BancoId;
  nome: string;
  corBg: string;
  corTexto: string;
}

export const BANCOS_CONFIG: Record<BancoId, BankConfig> = {
  nubank: { id: "nubank", nome: "Nubank", corBg: "#820AD1", corTexto: "#FFFFFF" },
  itau: { id: "itau", nome: "Itaú", corBg: "#EC7000", corTexto: "#FFFFFF" },
  bradesco: { id: "bradesco", nome: "Bradesco", corBg: "#CC092F", corTexto: "#FFFFFF" },
  caixa: { id: "caixa", nome: "Caixa Econômica", corBg: "#0066B3", corTexto: "#FFFFFF" },
  bb: { id: "bb", nome: "Banco do Brasil", corBg: "#F8D117", corTexto: "#0038A8" },
  inter: { id: "inter", nome: "Banco Inter", corBg: "#FF7A00", corTexto: "#FFFFFF" },
  santander: { id: "santander", nome: "Santander", corBg: "#EC0000", corTexto: "#FFFFFF" },
  sicredi: { id: "sicredi", nome: "Sicredi", corBg: "#3FA110", corTexto: "#FFFFFF" },
  sicoob: { id: "sicoob", nome: "Sicoob", corBg: "#003641", corTexto: "#00AE9D" },
  btg: { id: "btg", nome: "BTG Pactual", corBg: "#001E62", corTexto: "#FFFFFF" },
  picpay: { id: "picpay", nome: "PicPay", corBg: "#11C76F", corTexto: "#FFFFFF" },
  c6: { id: "c6", nome: "C6 Bank", corBg: "#18181B", corTexto: "#FFFFFF" },
  xp: { id: "xp", nome: "XP Investimentos", corBg: "#000000", corTexto: "#FFFFFF" },
  mercadopago: { id: "mercadopago", nome: "Mercado Pago", corBg: "#00A8F0", corTexto: "#FFFFFF" },
  outro: { id: "outro", nome: "Outro Banco", corBg: "#3B82F6", corTexto: "#FFFFFF" },
};

export function detectarBancoPorNome(nome: string): BancoId {
  const n = (nome || "").toLowerCase();
  if (n.includes("nu") || n.includes("nubank")) return "nubank";
  if (n.includes("itaú") || n.includes("itau")) return "itau";
  if (n.includes("bradesco")) return "bradesco";
  if (n.includes("caixa") || n.includes("cef")) return "caixa";
  if (n.includes("banco do brasil") || n.includes("bb")) return "bb";
  if (n.includes("inter")) return "inter";
  if (n.includes("santander")) return "santander";
  if (n.includes("sicredi")) return "sicredi";
  if (n.includes("sicoob")) return "sicoob";
  if (n.includes("btg")) return "btg";
  if (n.includes("picpay") || n.includes("pic pay")) return "picpay";
  if (n.includes("c6")) return "c6";
  if (n.includes("xp")) return "xp";
  if (n.includes("mercado pago") || n.includes("mercadopago")) return "mercadopago";
  return "outro";
}

interface BankLogoBadgeProps {
  nomeOuId?: string;
  bancoId?: BancoId;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const BankLogoBadge: React.FC<BankLogoBadgeProps> = ({
  nomeOuId,
  bancoId: idProp,
  size = "md",
  className = "",
}) => {
  const bId = idProp || (nomeOuId ? detectarBancoPorNome(nomeOuId) : "outro");
  const config = BANCOS_CONFIG[bId] || BANCOS_CONFIG.outro;

  const sizeClasses = {
    sm: "w-7 h-7 text-[10px]",
    md: "w-10 h-10 text-xs font-bold",
    lg: "w-12 h-12 text-sm font-extrabold",
  }[size];

  const renderLogoContent = () => {
    switch (bId) {
      case "nubank":
        return <span className="font-extrabold tracking-tighter text-white">nu</span>;
      case "itau":
        return <span className="font-black text-white tracking-tight lowercase">itaú</span>;
      case "bradesco":
        return (
          <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
            <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.8L19.2 8 12 11.2 4.8 8 12 4.8zM4 9.6l7 3.1v6.5l-7-3.5V9.6zm16 6.1l-7 3.5v-6.5l7-3.1v6.1z" />
          </svg>
        );
      case "caixa":
        return <span className="font-black text-white tracking-tighter">X</span>;
      case "bb":
        return <span className="font-black text-blue-900 tracking-tighter">BB</span>;
      case "inter":
        return <span className="font-extrabold text-white text-[11px] lowercase">inter</span>;
      case "santander":
        return (
          <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
            <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 12l7.03 5.61C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9z" />
          </svg>
        );
      case "btg":
        return <span className="font-black text-white text-[10px] tracking-tighter uppercase">btg</span>;
      case "picpay":
        return <span className="font-black text-white tracking-tighter">P</span>;
      case "c6":
        return <span className="font-black text-white text-[11px] tracking-tighter uppercase">C6</span>;
      case "xp":
        return <span className="font-black text-white text-[10px] tracking-tighter uppercase">XP</span>;
      case "mercadopago":
        return (
          <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-2 15l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
          </svg>
        );
      case "sicredi":
        return <span className="font-black text-white text-[10px] tracking-tighter">SICREDI</span>;
      case "sicoob":
        return <span className="font-black text-emerald-400 text-[10px] tracking-tighter">SICOOB</span>;
      default:
        return (
          <span className="font-bold text-white text-xs uppercase">
            {(config.nome || "BA").substring(0, 2)}
          </span>
        );
    }
  };

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform hover:scale-105 ${sizeClasses} ${className}`}
      style={{ backgroundColor: config.corBg, color: config.corTexto }}
      title={config.nome}
    >
      {renderLogoContent()}
    </div>
  );
};
