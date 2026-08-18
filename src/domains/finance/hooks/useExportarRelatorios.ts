import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadCsv, downloadSpreadsheet } from "@/shared/utils/spreadsheetExport";

export function useExportarRelatorios() {
  const exportarDRE_PDF = (dreData: any, periodo: string) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("DRE - Demonstracao do Resultado", 14, 20);
    doc.setFontSize(12);
    doc.text(`Periodo: ${periodo || "Atual"}`, 14, 30);
    const rows = dreData?.linhas?.map((l: any) => [
      " ".repeat(l.indent || 0) + l.label,
      `R$ ${l.valor?.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    ]) || [];
    autoTable(doc, { head: [["Item", "Valor"]], body: rows, startY: 40, styles: { fontSize: 10 }, headStyles: { fillColor: [59, 130, 246] } });
    const filename = periodo ? `DRE_${periodo.replace(/\s/g, "_")}.pdf` : "DRE_Demonstrativo.pdf";
    doc.save(filename);
  };

  const exportarDRE_Excel = (dre: any, historico: any[], periodo: string) => {
    const dreRows = dre?.linhas?.map((l: any) => ({
      Item: l.label, Valor: l.valor,
      "Valor Formatado": l.valor < 0 ? `(${Math.abs(l.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      "% Receita": l.percentualSobreReceita !== undefined ? `${l.percentualSobreReceita.toFixed(1)}%` : "",
      Tipo: l.tipo,
    })) || [];
    const sheets = [{ name: "DRE", rows: dreRows }];

    if (historico && historico.length > 0) {
      const evoRows = historico.map((h) => ({
        Período: h.periodo, "Receita Bruta": h.receitaBruta, "Lucro Bruto": h.lucroBruto,
        EBITDA: h.ebitda, "Lucro Líquido": h.lucroLiquido, "Despesas Operacionais": h.despesasOperacionais,
        "Margem Bruta (%)": h.margemBruta, "Margem EBITDA (%)": h.margemEbitda, "Margem Líquida (%)": h.margemLiquida,
      }));
      sheets.push({ name: "Evolucao", rows: evoRows });
    }

    const resumoRows = [
      { Indicador: "Período", Valor: periodo },
      { Indicador: "Receita Bruta", Valor: dre?.receitaBruta },
      { Indicador: "Receita Líquida", Valor: dre?.receitaLiquida },
      { Indicador: "CMV", Valor: dre?.cmv },
      { Indicador: "Lucro Bruto", Valor: dre?.lucroBruto },
      { Indicador: "Margem Bruta (%)", Valor: dre?.margemBruta },
      { Indicador: "Despesas Operacionais", Valor: dre?.despesasOperacionais },
      { Indicador: "EBITDA", Valor: dre?.ebitda },
      { Indicador: "Margem EBITDA (%)", Valor: dre?.margemEbitda },
      { Indicador: "Depreciação", Valor: dre?.depreciacao },
      { Indicador: "LAIR", Valor: dre?.lair },
      { Indicador: "IRPJ", Valor: dre?.irpj },
      { Indicador: "Lucro Líquido", Valor: dre?.lucroLiquido },
      { Indicador: "Margem Líquida (%)", Valor: dre?.margemLiquida },
    ];
    sheets.push({ name: "Resumo", rows: resumoRows });
    const filename = periodo ? `DRE_${periodo.replace(/\//g, "-")}.xls` : "DRE_Demonstrativo.xls";
    downloadSpreadsheet(sheets, filename);
  };

  const exportarTransacoes_Excel = (transacoes: any[], titulo: string) => {
    const dados = transacoes.map((t) => ({ Data: t.data, Descricao: t.descricao, Tipo: t.tipo, Valor: t.valor, Categoria: t.categoria?.nome || t.categorias?.nome || "" }));
    downloadSpreadsheet([{ name: "Transacoes", rows: dados }], `${titulo}.xls`);
  };

  const exportarCSV = (dados: any[], nomeArquivo: string) => {
    downloadCsv(dados, `${nomeArquivo}.csv`);
  };

  return { exportarDRE_PDF, exportarDRE_Excel, exportarTransacoes_Excel, exportarCSV };
}
