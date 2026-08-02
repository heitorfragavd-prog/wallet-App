import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Valor por extenso simplificado (centavos incluídos)
function valorPorExtenso(valor: number): string {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dezADezenove = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const tresDigitos = (n: number): string => {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const partes: string[] = [];
    const c = Math.floor(n / 100);
    const resto = n % 100;
    if (c > 0) partes.push(centenas[c]);
    if (resto > 0) {
      if (resto < 10) partes.push(unidades[resto]);
      else if (resto < 20) partes.push(dezADezenove[resto - 10]);
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        partes.push(dezenas[d] + (u > 0 ? ` e ${unidades[u]}` : ""));
      }
    }
    return partes.join(" e ");
  };

  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);
  const partes: string[] = [];

  if (inteiro === 0 && centavos === 0) return "zero reais";

  const milhoes = Math.floor(inteiro / 1000000);
  const milhares = Math.floor((inteiro % 1000000) / 1000);
  const resto = inteiro % 1000;

  const blocos: string[] = [];
  if (milhoes > 0) blocos.push(`${milhoes === 1 ? "um" : tresDigitos(milhoes)} milh${milhoes === 1 ? "ão" : "ões"}`);
  if (milhares > 0) blocos.push(`${milhares === 1 ? "mil" : `${tresDigitos(milhares)} mil`}`);
  if (resto > 0) blocos.push(tresDigitos(resto));

  if (blocos.length > 0) partes.push(`${blocos.join(" ")} ${inteiro === 1 ? "real" : "reais"}`);
  if (centavos > 0) partes.push(`${tresDigitos(centavos)} centavo${centavos === 1 ? "" : "s"}`);

  return partes.join(" e ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { valor, pagador, recebedor, descricao, data, cidade } = await req.json();

    if (!valor || !pagador || !recebedor) {
      return new Response(JSON.stringify({ error: "valor, pagador e recebedor são obrigatórios." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const valorNum = Number(valor);
    const dataFormatada = data
      ? new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const cidadeUf = cidade || "____________________";

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recibo - ${recebedor}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 40px; border: 2px solid #333; color: #222; }
  h1 { text-align: center; letter-spacing: 8px; margin-bottom: 4px; }
  .valor-destaque { text-align: center; font-size: 1.4em; font-weight: bold; margin: 12px 0 32px; padding: 8px; border: 1px solid #999; background: #f7f7f7; }
  .texto { font-size: 1.1em; line-height: 2; text-align: justify; }
  .texto strong { border-bottom: 1px dotted #666; }
  .data-cidade { text-align: right; margin: 40px 0 60px; font-size: 1.05em; }
  .assinatura { text-align: center; margin-top: 60px; }
  .linha { border-top: 1px solid #333; width: 60%; margin: 0 auto 6px; }
  .nome { font-weight: bold; }
  @media print { body { border: none; margin: 0; } }
</style>
</head>
<body>
  <h1>RECIBO</h1>
  <div class="valor-destaque">${formatBRL(valorNum)}</div>
  <p class="texto">
    Recebemos de <strong>${pagador}</strong> a quantia de
    <strong>${formatBRL(valorNum)}</strong> (${valorPorExtenso(valorNum)}),
    referente a <strong>${descricao || "prestação de serviços / pagamento"}</strong>.
  </p>
  <p class="texto">
    Para maior clareza, firmamos o presente recibo, dando plena e irrevogável quitação
    do valor acima descrito.
  </p>
  <p class="data-cidade">${cidadeUf}, ${dataFormatada}</p>
  <div class="assinatura">
    <div class="linha"></div>
    <p class="nome">${recebedor}</p>
    <p>Recebedor</p>
  </div>
</body>
</html>`;

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Erro ao gerar recibo" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
