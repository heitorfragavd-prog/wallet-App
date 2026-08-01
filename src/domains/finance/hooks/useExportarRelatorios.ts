import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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

    autoTable(doc, {
      head: [["Item", "Valor"]],
      body: rows,
      startY: 40,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    const filename = periodo ? `DRE_${periodo.replace(/\s/g, "_")}.pdf` : "DRE_Demonstrativo.pdf";
    doc.save(filename);
  };

  const exportarTransacoes_Excel = (transacoes: any[], titulo: string) => {
    const dados = transacoes.map((t) => ({
      Data: t.data,
      Descricao: t.descricao,
      Tipo: t.tipo,
      Valor: t.valor,
      Categoria: t.categoria?.nome || t.categorias?.nome || "",
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transacoes");
    XLSX.writeFile(wb, `${titulo}.xlsx`);
  };

  const exportarCSV = (dados: any[], nomeArquivo: string) => {
    const ws = XLSX.utils.json_to_sheet(dados);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${nomeArquivo}.csv`;
    link.click();
  };

  return { exportarDRE_PDF, exportarTransacoes_Excel, exportarCSV };
}
