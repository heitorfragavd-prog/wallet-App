import React from "react";
import { ICONES } from "../../../node_modules/@edusites/bancos-brasil/src/icones.js";

export type BancoSlug = (keyof typeof ICONES) | "divipay";

export interface BankConfig {
  slug: BancoSlug;
  nome: string;
  corBg: string;
}

export const BANCOS_BRASIL_LIST: BankConfig[] = [
  { slug: "nubank", nome: "Nubank", corBg: "#820AD1" },
  { slug: "itau", nome: "Itaú", corBg: "#EC7000" },
  { slug: "bradesco", nome: "Bradesco", corBg: "#CC092F" },
  { slug: "caixa", nome: "Caixa", corBg: "#0066B3" },
  { slug: "bancodobrasil", nome: "Banco do Brasil", corBg: "#F8D117" },
  { slug: "inter", nome: "Banco Inter", corBg: "#FF7A00" },
  { slug: "santander", nome: "Santander", corBg: "#EC0000" },
  { slug: "sicredi", nome: "Sicredi", corBg: "#3FA110" },
  { slug: "sicoob", nome: "Sicoob", corBg: "#003641" },
  { slug: "btg", nome: "BTG Pactual", corBg: "#001E62" },
  { slug: "picpay", nome: "PicPay", corBg: "#11C76F" },
  { slug: "c6", nome: "C6 Bank", corBg: "#18181B" },
  { slug: "xp", nome: "XP Investimentos", corBg: "#000000" },
  { slug: "mercadopago", nome: "Mercado Pago", corBg: "#00A8F0" },
  { slug: "pagbank", nome: "PagBank", corBg: "#00A859" },
  { slug: "cora", nome: "Cora", corBg: "#FE3E6D" },
  { slug: "infinitepay", nome: "InfinitePay", corBg: "#000000" },
  { slug: "divipay", nome: "DiviPay", corBg: "#FF9900" },
];

export function mapearNomeParaSlug(nome: string): BancoSlug | null {
  const n = (nome || "").toLowerCase();
  if (n.includes("nu") || n.includes("nubank")) return "nubank";
  if (n.includes("itaú") || n.includes("itau")) return "itau";
  if (n.includes("bradesco")) return "bradesco";
  if (n.includes("caixa") || n.includes("cef")) return "caixa";
  if (n.includes("banco do brasil") || n.includes("bb")) return "bancodobrasil";
  if (n.includes("inter")) return "inter";
  if (n.includes("santander")) return "santander";
  if (n.includes("sicredi")) return "sicredi";
  if (n.includes("sicoob")) return "sicoob";
  if (n.includes("btg")) return "btg";
  if (n.includes("picpay") || n.includes("pic pay")) return "picpay";
  if (n.includes("c6")) return "c6";
  if (n.includes("xp")) return "xp";
  if (n.includes("mercado pago") || n.includes("mercadopago")) return "mercadopago";
  if (n.includes("pagbank") || n.includes("pagseguro")) return "pagbank";
  if (n.includes("cora")) return "cora";
  if (n.includes("infinite")) return "infinitepay";
  if (n.includes("divi")) return "divipay";
  return null;
}

interface BankLogoBadgeProps {
  nomeOuId?: string;
  slug?: BancoSlug;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const BankLogoBadge: React.FC<BankLogoBadgeProps> = ({
  nomeOuId,
  slug: slugProp,
  size = "md",
  className = "",
}) => {
  const targetSlug = slugProp || (nomeOuId ? mapearNomeParaSlug(nomeOuId) : null);
  const bankConfig = BANCOS_BRASIL_LIST.find((b) => b.slug === targetSlug);

  const sizeClasses = {
    sm: "w-7 h-7 p-1.5 text-[9px]",
    md: "w-10 h-10 p-2 text-xs",
    lg: "w-12 h-12 p-2.5 text-sm",
  }[size];

  const DIVIPAY_SVG = `<svg viewBox="0 0 108 108" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M 38 28 H 68 L 68 42 L 80 42 L 80 54 H 52 L 38 40 Z" fill="currentColor" />
    <path d="M 70 80 H 40 L 40 66 L 28 66 L 28 54 H 56 L 70 68 Z" fill="currentColor" />
  </svg>`;

  const svgRaw = targetSlug === "divipay"
    ? DIVIPAY_SVG
    : (targetSlug && ICONES[targetSlug as keyof typeof ICONES] ? ICONES[targetSlug as keyof typeof ICONES] : null);

  if (svgRaw) {
    // Adiciona fill white para SVGs que usam fill="none"
    const formattedSvg = svgRaw
      .replace('<svg ', `<svg class="w-full h-full text-white fill-current" `);

    return (
      <div
        className={`rounded-full flex items-center justify-center shrink-0 shadow-md transition-transform hover:scale-105 ${sizeClasses} ${className}`}
        style={{ backgroundColor: bankConfig?.corBg || "#3B82F6" }}
        dangerouslySetInnerHTML={{ __html: formattedSvg }}
        title={bankConfig?.nome || nomeOuId}
      />
    );
  }

  // Fallback se for uma conta genérica
  const iniciais = (nomeOuId || "BC").substring(0, 2).toUpperCase();
  return (
    <div
      className={`rounded-full bg-blue-600 text-white font-extrabold flex items-center justify-center shrink-0 shadow-md ${sizeClasses} ${className}`}
    >
      {iniciais}
    </div>
  );
};
