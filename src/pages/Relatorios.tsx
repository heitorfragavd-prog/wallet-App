import { useState, useMemo } from "react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Progress } from "@/shared/components/ui/progress";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { DateRangePicker, useDateRangeFilter } from "@/shared/components/DateRangePicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Tooltip,
  Legend,
  TooltipProps,
} from "recharts";
import { icons, FileDown } from "lucide-react";
import { useExportarRelatorios } from "@/domains/finance/hooks/useExportarRelatorios";
import {
  TrendingUp,
  TrendingDown,
  Download,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Target,
  Percent,
  Activity,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useTransacoes } from "@/domains/finance/hooks/useTransacoes";
import { useReceitas } from "@/domains/finance/hooks/useReceitas";
import { useMetas } from "@/domains/finance/hooks/useMetas";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useRecurringTransactions } from "@/domains/finance/hooks/useRecurringTransactions";
import { TagFilter } from "@/domains/finance/components/TagFilter";

// ── Constantes ──────────────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão Crédito" },
  { value: "cartao_debito", label: "Cartão Débito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
  { value: "outro", label: "Outro" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const formatarData = (dataString: string) => {
  if (!dataString) return "";
  const [ano, mes, dia] = dataString.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
};

const getPrimeiroDiaMes = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
};

const getMesPorExtenso = (date: Date) => {
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${meses[date.getMonth()]}/${date.getFullYear()}`;
};

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

// ── Hook principal de dados ─────────────────────────────────────────────────
import type { DateRange } from "@/shared/components/DateRangePicker/DateRangePicker";

interface FilterParams {
  dateRange: DateRange;
  selectedTipo: "todas" | "receita" | "despesa";
  selectedCategories: string[];
  selectedConta: string;
  selectedPaymentMethods: string[];
  selectedTags: string[];
  searchText: string;
  valorMin: number | null;
  valorMax: number | null;
}

function useRelatoriosData(
  transacoes: ReturnType<typeof import("@/domains/finance/hooks/useTransacoes").useTransacoes>["transacoes"],
  loading: boolean,
  filters: FilterParams,
) {
  return useMemo(() => {
    const empty = {
      chartData: [], categoryData: [], filteredTransactions: [],
      totalReceitas: 0, totalDespesas: 0, saldoTotal: 0,
      receitasMesAnterior: 0, despesasMesAnterior: 0,
      topCategoriasDespesa: [], topCategoriasReceita: [],
      mediaReceitaDiaria: 0, mediaDespesaDiaria: 0,
      diasComTransacoes: 0, maiorReceita: null, maiorDespesa: null,
    };

    if (loading || !transacoes.length) return empty;

    const {
      dateRange, selectedTipo, selectedCategories, selectedConta,
      selectedPaymentMethods, selectedTags, searchText, valorMin, valorMax,
    } = filters;

    const dataInicio = dateRange.startDate ?? getPrimeiroDiaMes();
    const dataFim = dateRange.endDate ?? new Date().toISOString().split("T")[0];

    // ── Filtros encadeados ─────────────────────────────────────────────────
    let filtered = transacoes.filter((t) => {
      const d = t.data.split("T")[0];
      return d >= dataInicio && d <= dataFim;
    });

    if (selectedTipo !== "todas") {
      filtered = filtered.filter((t) => t.tipo === selectedTipo);
    }

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((t) =>
        selectedCategories.includes(t.categorias?.nome ?? "Sem categoria")
      );
    }

    if (selectedConta !== "todas") {
      filtered = filtered.filter((t) => (t as any).conta_id === selectedConta);
    }

    if (selectedPaymentMethods.length > 0) {
      filtered = filtered.filter((t) =>
        selectedPaymentMethods.includes((t as any).metodo_pagamento ?? "")
      );
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter((t) => {
        const tags: string[] = (t as any).tags ?? [];
        return selectedTags.some((tag) => tags.includes(tag));
      });
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter((t) =>
        t.descricao.toLowerCase().includes(q)
      );
    }

    if (valorMin !== null) {
      filtered = filtered.filter((t) => Number(t.valor) >= valorMin);
    }
    if (valorMax !== null) {
      filtered = filtered.filter((t) => Number(t.valor) <= valorMax);
    }

    // ── Totais ─────────────────────────────────────────────────────────────
    const totalReceitas = filtered
      .filter((t) => t.tipo === "receita")
      .reduce((s, t) => s + Number(t.valor), 0);
    const totalDespesas = filtered
      .filter((t) => t.tipo === "despesa")
      .reduce((s, t) => s + Number(t.valor), 0);
    const saldoTotal = totalReceitas - totalDespesas;

    // ── Mês anterior (sem filtros adicionais, apenas date-range) ───────────
    const inicioMesAnterior = (() => {
      const d = new Date(dataInicio + "T12:00:00");
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    })();
    const fimMesAnterior = (() => {
      const d = new Date(dataInicio + "T12:00:00");
      d.setDate(0);
      return d.toISOString().split("T")[0];
    })();
    const mesAnterior = transacoes.filter((t) => {
      const d = t.data.split("T")[0];
      return d >= inicioMesAnterior && d <= fimMesAnterior;
    });
    const receitasMesAnterior = mesAnterior
      .filter((t) => t.tipo === "receita")
      .reduce((s, t) => s + Number(t.valor), 0);
    const despesasMesAnterior = mesAnterior
      .filter((t) => t.tipo === "despesa")
      .reduce((s, t) => s + Number(t.valor), 0);

    // ── Chart data (por dia se ≤ 60 dias, senão por mês) ──────────────────
    const diffDias = Math.round(
      (new Date(dataFim + "T12:00:00").getTime() - new Date(dataInicio + "T12:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
    ) + 1;
    const groupByDay = diffDias <= 60;

    const periodMap: Record<string, { receitas: number; despesas: number; sortKey: string }> = {};
    filtered.forEach((t) => {
      const d = new Date(t.data.split("T")[0] + "T12:00:00");
      let key: string;
      let sortKey: string;
      if (groupByDay) {
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        key = `${dd}/${mm}`;
        sortKey = t.data.split("T")[0];
      } else {
        key = getMesPorExtenso(d);
        sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      if (!periodMap[key]) periodMap[key] = { receitas: 0, despesas: 0, sortKey };
      if (t.tipo === "receita") periodMap[key].receitas += Number(t.valor);
      else periodMap[key].despesas += Number(t.valor);
    });
    const chartData = Object.entries(periodMap)
      .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
      .map(([mes, vals]) => ({
        mes,
        receitas: vals.receitas,
        despesas: vals.despesas,
        saldo: vals.receitas - vals.despesas,
      }));

    // ── Top categorias despesa (com cor e icone) ───────────────────────────
    const catDespMap: Record<string, { valor: number; cor: string; icone?: string }> = {};
    filtered.filter((t) => t.tipo === "despesa").forEach((t) => {
      const cat = t.categorias?.nome || "Sem categoria";
      if (!catDespMap[cat]) {
        catDespMap[cat] = {
          valor: 0,
          cor: t.categorias?.cor || "#6B7280",
          icone: t.categorias?.icone,
        };
      }
      catDespMap[cat].valor += Number(t.valor);
    });
    const topCategoriasDespesa = Object.entries(catDespMap)
      .sort(([, a], [, b]) => b.valor - a.valor)
      .map(([categoria, data]) => ({ categoria, ...data }));

    // ── Top categorias receita (com cor) ───────────────────────────────────
    const catRecMap: Record<string, { valor: number; cor: string; icone?: string }> = {};
    filtered.filter((t) => t.tipo === "receita").forEach((t) => {
      const cat = t.categorias?.nome || "Sem categoria";
      if (!catRecMap[cat]) {
        catRecMap[cat] = {
          valor: 0,
          cor: t.categorias?.cor || "#22c55e",
          icone: t.categorias?.icone,
        };
      }
      catRecMap[cat].valor += Number(t.valor);
    });
    const topCategoriasReceita = Object.entries(catRecMap)
      .sort(([, a], [, b]) => b.valor - a.valor)
      .map(([categoria, data]) => ({ categoria, ...data }));

    // categoryData para o PieChart com cor e icone
    const categoryData = topCategoriasDespesa.map((c) => ({
      ...c,
      name: c.categoria,
      value: c.valor,
    }));

    // ── Estatísticas ───────────────────────────────────────────────────────
    const diasComTransacoes = new Set(filtered.map((t) => t.data.split("T")[0])).size || 1;
    const mediaReceitaDiaria = totalReceitas / diasComTransacoes;
    const mediaDespesaDiaria = totalDespesas / diasComTransacoes;

    const maiorReceita =
      filtered
        .filter((t) => t.tipo === "receita")
        .sort((a, b) => Number(b.valor) - Number(a.valor))[0] || null;
    const maiorDespesa =
      filtered
        .filter((t) => t.tipo === "despesa")
        .sort((a, b) => Number(b.valor) - Number(a.valor))[0] || null;

    // ── Transações filtradas para tabela ───────────────────────────────────
    const filteredTransactions = filtered
      .sort((a, b) => b.data.localeCompare(a.data))
      .map((t) => ({
        id: t.id,
        data: t.data,
        descricao: t.descricao,
        categoria: t.categorias?.nome || "Sem categoria",
        valor: Number(t.valor),
        tipo: t.tipo as "receita" | "despesa",
        conta_id: (t as any).conta_id as string | undefined,
        metodo_pagamento: (t as any).metodo_pagamento as string | undefined,
      }));

    return {
      chartData, categoryData, filteredTransactions,
      totalReceitas, totalDespesas, saldoTotal,
      receitasMesAnterior, despesasMesAnterior,
      topCategoriasDespesa, topCategoriasReceita,
      mediaReceitaDiaria, mediaDespesaDiaria,
      diasComTransacoes, maiorReceita, maiorDespesa,
    };
  }, [transacoes, loading, filters]);
}

// ── Hook de projeção ─────────────────────────────────────────────────────────
function useProjecaoMeses(totalReceitas: number, totalDespesas: number, diasNoPeriodo: number) {
  return useMemo(() => {
    if (totalReceitas === 0 && totalDespesas === 0) return [];
    const receitaMedia = (totalReceitas / diasNoPeriodo) * 30;
    const despesaMedia = (totalDespesas / diasNoPeriodo) * 30;
    const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    const agora = new Date();
    return [1, 2, 3].map((offset) => {
      const d = new Date(agora.getFullYear(), agora.getMonth() + offset, 1);
      return {
        mes: `${meses[d.getMonth()]}/${d.getFullYear()}`,
        receitas: receitaMedia,
        despesas: despesaMedia,
        saldo: receitaMedia - despesaMedia,
      };
    });
  }, [totalReceitas, totalDespesas, diasNoPeriodo]);
}

// ── Status badges helpers ─────────────────────────────────────────────────────
const dividaStatusConfig: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30" },
  vencida:  { label: "Vencida",  color: "bg-red-500/20 text-red-600 border-red-500/30" },
  quitada:  { label: "Quitada",  color: "bg-green-500/20 text-green-600 border-green-500/30" },
};

const metaStatusConfig: Record<string, { label: string; color: string }> = {
  ativa:     { label: "Ativa",     color: "bg-blue-500/20 text-blue-600 border-blue-500/30" },
  concluida: { label: "Concluída", color: "bg-green-500/20 text-green-600 border-green-500/30" },
  pausada:   { label: "Pausada",   color: "bg-gray-500/20 text-gray-600 border-gray-500/30" },
  vencida:   { label: "Vencida",   color: "bg-red-500/20 text-red-600 border-red-500/30" },
};

// ── Componente principal ─────────────────────────────────────────────────────
const Relatorios = () => {
  const { exportarTransacoes_Excel } = useExportarRelatorios();
  const { dateRange, setRange, clearFilter } = useDateRangeFilter();
  const { toast } = useToast();

  // Hooks de dados
  // Busca APENAS o período selecionado + o mês anterior (necessário para a
  // comparação "vs ant."). Antes era useReceitas() sem datas: o hook puxava o
  // ANO INTEIRO da API Divipay — dezenas de requisições paralelas que falhavam
  // e zeravam as receitas digitais do relatório (sobrava só dinheiro+manuais).
  const rangeConsulta = useMemo(() => {
    const end = dateRange.endDate ?? new Date().toISOString().split("T")[0];
    if (!dateRange.startDate) return { startDate: null as string | null, endDate: end };
    const d = new Date(`${dateRange.startDate}T12:00:00`);
    d.setMonth(d.getMonth() - 1);
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return { startDate: start, endDate: end };
  }, [dateRange.startDate, dateRange.endDate]);

  const { transacoes: transacoesBase, loading: loadingTransacoes } = useTransacoes(rangeConsulta);
  const { receitas: receitasConsolidadas, loading: loadingReceitas } = useReceitas(rangeConsulta);

  const transacoes = useMemo(() => {
    // Despesas de useTransacoes
    const despesasApenas = (transacoesBase || []).filter((t) => t.tipo === "despesa");

    // Receitas puras e consolidadas de useReceitas (evita duplicar com a tabela transacoes)
    const receitasApenas = (receitasConsolidadas || []).map((r) => ({
      id: r.id,
      user_id: r.user_id || "",
      descricao: r.descricao || "Receita",
      valor: Number(r.valor || 0),
      tipo: "receita" as const,
      data: r.data,
      created_at: r.created_at || r.data,
      categorias: r.categorias || { nome: "Vendas / Entradas", cor: "#10b981", icone: "DollarSign" },
      metodo_pagamento: r.metodo_pagamento || "pix",
      conta_id: r.conta_id,
      observacoes: r.observacoes,
    }));

    return [...despesasApenas, ...receitasApenas].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
    );
  }, [transacoesBase, receitasConsolidadas]);

  const loading = loadingTransacoes || loadingReceitas;
  const { metas } = useMetas();
  const { categorias } = useCategorias();
  const { contas } = useContasUsuario();
  const { dividas, loading: loadingDividas } = useDividas({});
  const { recorrentes, loading: loadingRecorrentes } = useRecurringTransactions();

  // ── Estados de filtro — Tier 1 (global) ───────────────────────────────
  const [selectedTipo, setSelectedTipo] = useState<"todas" | "receita" | "despesa">("todas");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedConta, setSelectedConta] = useState<string>("todas");
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // ── Estados de filtro — Tier 2 (transações) ───────────────────────────
  const [searchText, setSearchText] = useState("");
  const [valorMinStr, setValorMinStr] = useState("");
  const [valorMaxStr, setValorMaxStr] = useState("");

  // ── Estados de filtro — Tier 3 (seções específicas) ───────────────────
  const [dividaStatus, setDividaStatus] = useState<string>("todas");
  const [dividaSearch, setDividaSearch] = useState<string>("");
  const [metaStatus, setMetaStatus] = useState<string>("todas");
  const [metaTipo, setMetaTipo] = useState<string>("todas");
  const [recorrenteTipo, setRecorrenteTipo] = useState<string>("todas");

  // ── Estado UI ─────────────────────────────────────────────────────────
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllDespesas, setShowAllDespesas] = useState(false);
  const [showAllReceitas, setShowAllReceitas] = useState(false);
  const [txPage, setTxPage] = useState(0);
  const TX_PAGE_SIZE = 25;

  // ── Filtros derivados ─────────────────────────────────────────────────
  const valorMin = valorMinStr ? parseFloat(valorMinStr) : null;
  const valorMax = valorMaxStr ? parseFloat(valorMaxStr) : null;

  const filters: FilterParams = useMemo(
    () => ({
      dateRange,
      selectedTipo,
      selectedCategories,
      selectedConta,
      selectedPaymentMethods,
      selectedTags,
      searchText,
      valorMin,
      valorMax,
    }),
    [dateRange, selectedTipo, selectedCategories, selectedConta, selectedPaymentMethods, selectedTags, searchText, valorMin, valorMax]
  );

  const processedData = useRelatoriosData(transacoes, loading, filters);

  const {
    chartData, categoryData, filteredTransactions,
    totalReceitas, totalDespesas, saldoTotal,
    receitasMesAnterior, despesasMesAnterior,
    topCategoriasDespesa, topCategoriasReceita,
    mediaReceitaDiaria, mediaDespesaDiaria,
    diasComTransacoes, maiorReceita, maiorDespesa,
  } = processedData;

  // ── Variações e métricas derivadas ────────────────────────────────────
  const variacaoReceitas =
    receitasMesAnterior > 0 ? ((totalReceitas - receitasMesAnterior) / receitasMesAnterior) * 100 : 0;
  const variacaoDespesas =
    despesasMesAnterior > 0 ? ((totalDespesas - despesasMesAnterior) / despesasMesAnterior) * 100 : 0;
  const taxaEconomia = totalReceitas > 0 ? ((totalReceitas - totalDespesas) / totalReceitas) * 100 : 0;

  // ── Metas filtradas ────────────────────────────────────────────────────
  const metasFiltradas = useMemo(() => {
    let list = metas;
    if (metaStatus !== "todas") list = list.filter((m) => m.status === metaStatus);
    if (metaTipo !== "todas") list = list.filter((m) => m.tipo === metaTipo);
    return list;
  }, [metas, metaStatus, metaTipo]);

  // ── Dívidas filtradas ─────────────────────────────────────────────────
  const dividasFiltradas = useMemo(() => {
    let list = dividas ?? [];
    if (dividaStatus !== "todas") list = list.filter((d) => d.status === dividaStatus);
    if (dividaSearch.trim()) {
      const q = dividaSearch.toLowerCase();
      list = list.filter(
        (d) =>
          d.descricao?.toLowerCase().includes(q) ||
          d.credor?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dividas, dividaStatus, dividaSearch]);

  // ── Recorrentes filtrados ─────────────────────────────────────────────
  const recorrentesFiltrados = useMemo(() => {
    let list = recorrentes ?? [];
    if (recorrenteTipo !== "todas")
      list = list.filter((r) => r.tipo_transacao === recorrenteTipo);
    return list;
  }, [recorrentes, recorrenteTipo]);

  const totalRecorrentesReceita = useMemo(
    () =>
      recorrentes
        ?.filter((r) => r.tipo_transacao === "receita" && r.ativo)
        .reduce((s, r) => s + Number(r.valor), 0) ?? 0,
    [recorrentes]
  );
  const totalRecorrentesDespesa = useMemo(
    () =>
      recorrentes
        ?.filter((r) => r.tipo_transacao === "despesa" && r.ativo)
        .reduce((s, r) => s + Number(r.valor), 0) ?? 0,
    [recorrentes]
  );

  // ── Projeção ───────────────────────────────────────────────────────────
  const diasNoPeriodo = useMemo(() => {
    if (dateRange.startDate && dateRange.endDate) {
      const from = new Date(dateRange.startDate + "T12:00:00");
      const to = new Date(dateRange.endDate + "T12:00:00");
      return Math.max(1, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }
    return 30;
  }, [dateRange]);

  const projecaoMeses = useProjecaoMeses(totalReceitas, totalDespesas, diasNoPeriodo);

  // ── Contagem de filtros avançados ativos ───────────────────────────────
  const activeAdvancedCount = useMemo(() => {
    let n = 0;
    if (selectedConta !== "todas") n++;
    if (selectedPaymentMethods.length > 0) n++;
    if (selectedTags.length > 0) n++;
    if (searchText.trim()) n++;
    if (valorMinStr || valorMaxStr) n++;
    return n;
  }, [selectedConta, selectedPaymentMethods, selectedTags, searchText, valorMinStr, valorMaxStr]);

  // ── Limpar todos os filtros ────────────────────────────────────────────
  const clearAllFilters = () => {
    clearFilter();
    setSelectedTipo("todas");
    setSelectedCategories([]);
    setSelectedConta("todas");
    setSelectedPaymentMethods([]);
    setSelectedTags([]);
    setSearchText("");
    setValorMinStr("");
    setValorMaxStr("");
    setTxPage(0);
  };

  const hasAnyFilter =
    (dateRange.startDate || dateRange.endDate) ||
    selectedTipo !== "todas" ||
    selectedCategories.length > 0 ||
    activeAdvancedCount > 0;

  // ── Toggle categoria no multi-select ─────────────────────────────────
  const toggleCategory = (nome: string) => {
    setSelectedCategories((prev) =>
      prev.includes(nome) ? prev.filter((c) => c !== nome) : [...prev, nome]
    );
    setTxPage(0);
  };

  // ── Toggle payment method ─────────────────────────────────────────────
  const togglePaymentMethod = (value: string) => {
    setSelectedPaymentMethods((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
    setTxPage(0);
  };

  // ── Export CSV ────────────────────────────────────────────────────────
  const handleExportReport = () => {
    try {
      const csvHeader = "Data,Descrição,Categoria,Valor,Tipo,Conta,Método de Pagamento\n";
      const csvData = filteredTransactions
        .map((t) =>
          [
            t.data.split("T")[0],
            `"${t.descricao}"`,
            `"${t.categoria}"`,
            t.valor,
            t.tipo,
            t.conta_id ?? "",
            t.metodo_pagamento ?? "",
          ].join(",")
        )
        .join("\n");
      const blob = new Blob([csvHeader + csvData], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const dataInicio = dateRange.startDate ?? new Date().toISOString().split("T")[0];
      link.download = `relatorio-${dataInicio}.csv`;
      link.click();
      toast({ title: "Relatório exportado!", description: `${filteredTransactions.length} transações exportadas.` });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    }
  };

  const getPeriodoLabel = () => {
    if (dateRange.startDate && dateRange.endDate) {
      const fmt = (iso: string) => iso.split("-").reverse().join("/");
      return `${fmt(dateRange.startDate)} – ${fmt(dateRange.endDate)}`;
    }
    return "Mês atual";
  };

  // ── Páginas de transações ─────────────────────────────────────────────
  const paginatedTransactions = filteredTransactions.slice(
    txPage * TX_PAGE_SIZE,
    (txPage + 1) * TX_PAGE_SIZE
  );
  const totalTxPages = Math.ceil(filteredTransactions.length / TX_PAGE_SIZE);

  // ── JSX ───────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-3 shadow-lg shadow-cyan-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
              <p className="text-muted-foreground text-sm">{getPeriodoLabel()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              onClick={() => exportarTransacoes_Excel(filteredTransactions, "Relatorio_Transacoes")}
              variant="outline"
              className="gap-2"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar Excel</span>
              <span className="sm:hidden">Excel</span>
            </Button>
            <Button onClick={handleExportReport} variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
          </div>
        </div>

        {/* ── FilterBar ───────────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardContent className="p-3 sm:p-4 space-y-3">
            {/* Row 1 — sempre visível */}
            <div className="flex flex-wrap items-center gap-2">
              {/* DateRangePicker */}
              <DateRangePicker
                value={dateRange}
                onChange={setRange}
                onClear={clearFilter}
                placeholder="Período"
              />

              {/* Tipo toggle */}
              <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5">
                {(["todas", "receita", "despesa"] as const).map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => { setSelectedTipo(tipo); setTxPage(0); }}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      selectedTipo === tipo
                        ? tipo === "receita"
                          ? "bg-green-500 text-white shadow-sm"
                          : tipo === "despesa"
                          ? "bg-red-500 text-white shadow-sm"
                          : "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tipo === "todas" ? "Todas" : tipo === "receita" ? "Receitas" : "Despesas"}
                  </button>
                ))}
              </div>

              {/* Categoria multi-select */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                    <Filter className="w-3 h-3" />
                    {selectedCategories.length === 0
                      ? "Categoria"
                      : `${selectedCategories.length} categoria${selectedCategories.length > 1 ? "s" : ""}`}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <p className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">Categorias</p>
                  <ScrollArea className="max-h-52">
                    <div className="space-y-1">
                      {categorias.map((cat) => (
                        <label
                          key={cat.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedCategories.includes(cat.nome)}
                            onCheckedChange={() => toggleCategory(cat.nome)}
                          />
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.cor }}
                          />
                          <span className="text-xs">{cat.nome}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedCategories.length > 0 && (
                    <button
                      onClick={() => setSelectedCategories([])}
                      className="w-full text-xs text-muted-foreground hover:text-foreground mt-2 pt-2 border-t border-border"
                    >
                      Limpar
                    </button>
                  )}
                </PopoverContent>
              </Popover>

              {/* Mais filtros button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMoreFilters((v) => !v)}
                className="gap-1.5 h-8 text-xs"
              >
                {showMoreFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Mais filtros
                {activeAdvancedCount > 0 && (
                  <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-cyan-500 text-white">
                    {activeAdvancedCount}
                  </Badge>
                )}
              </Button>

              {/* Limpar tudo */}
              {hasAnyFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="gap-1 h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  Limpar
                </Button>
              )}
            </div>

            {/* Row 2 — filtros avançados (colapsável) */}
            {showMoreFilters && (
              <div className="flex flex-wrap items-start gap-3 pt-3 border-t border-border">
                {/* Conta */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Conta</label>
                  <Select
                    value={selectedConta}
                    onValueChange={(v) => { setSelectedConta(v); setTxPage(0); }}
                  >
                    <SelectTrigger className="h-8 text-xs w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as contas</SelectItem>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Método de pagamento */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Método</label>
                  <div className="flex flex-wrap gap-1">
                    {PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.value}
                        onClick={() => togglePaymentMethod(pm.value)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                          selectedPaymentMethods.includes(pm.value)
                            ? "bg-cyan-500 text-white border-cyan-500"
                            : "border-border text-muted-foreground hover:border-cyan-500/50"
                        }`}
                      >
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Tags</label>
                  <TagFilter
                    selectedTags={selectedTags}
                    onTagsChange={(tags) => { setSelectedTags(tags); setTxPage(0); }}
                  />
                </div>

                {/* Faixa de valor */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Valor</label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="De R$"
                      value={valorMinStr}
                      onChange={(e) => { setValorMinStr(e.target.value); setTxPage(0); }}
                      className="h-8 text-xs w-24"
                    />
                    <span className="text-muted-foreground text-xs">–</span>
                    <Input
                      type="number"
                      placeholder="Até R$"
                      value={valorMaxStr}
                      onChange={(e) => { setValorMaxStr(e.target.value); setTxPage(0); }}
                      className="h-8 text-xs w-24"
                    />
                  </div>
                </div>

                {/* Busca por descrição */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Descrição</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={searchText}
                      onChange={(e) => { setSearchText(e.target.value); setTxPage(0); }}
                      className="h-8 text-xs pl-7 w-40"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Chips de filtros ativos */}
            {(selectedCategories.length > 0 || selectedPaymentMethods.length > 0 || selectedTags.length > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                {selectedCategories.map((c) => (
                  <Badge
                    key={c}
                    variant="secondary"
                    className="gap-1 text-xs cursor-pointer"
                    onClick={() => toggleCategory(c)}
                  >
                    {c} <X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
                {selectedPaymentMethods.map((m) => (
                  <Badge
                    key={m}
                    variant="secondary"
                    className="gap-1 text-xs cursor-pointer"
                    onClick={() => togglePaymentMethod(m)}
                  >
                    {PAYMENT_METHODS.find((pm) => pm.value === m)?.label} <X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
                {selectedTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 text-xs cursor-pointer"
                    onClick={() =>
                      setSelectedTags((prev) => prev.filter((t) => t !== tag))
                    }
                  >
                    #{tag} <X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── KPI Cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {/* Receitas */}
          <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Receitas</p>
                <div className="p-1.5 rounded-xl bg-green-500/20">
                  <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 text-green-500" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <>
                  <p className="text-base sm:text-xl font-bold text-green-500 truncate">
                    {formatCurrency(totalReceitas)}
                  </p>
                  {variacaoReceitas !== 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {variacaoReceitas > 0 ? (
                        <TrendingUp className="w-3 h-3 text-green-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className={`text-[10px] sm:text-xs ${variacaoReceitas > 0 ? "text-green-500" : "text-red-500"}`}>
                        {variacaoReceitas > 0 ? "+" : ""}
                        {variacaoReceitas.toFixed(1)}% vs ant.
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Despesas */}
          <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Despesas</p>
                <div className="p-1.5 rounded-xl bg-red-500/20">
                  <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 text-red-500" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <>
                  <p className="text-base sm:text-xl font-bold text-red-500 truncate">
                    {formatCurrency(totalDespesas)}
                  </p>
                  {variacaoDespesas !== 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {variacaoDespesas > 0 ? (
                        <TrendingUp className="w-3 h-3 text-red-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-green-500" />
                      )}
                      <span className={`text-[10px] sm:text-xs ${variacaoDespesas > 0 ? "text-red-500" : "text-green-500"}`}>
                        {variacaoDespesas > 0 ? "+" : ""}
                        {variacaoDespesas.toFixed(1)}% vs ant.
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Saldo */}
          <Card className={`border-0 bg-gradient-to-br ${saldoTotal >= 0 ? "from-blue-500/10 to-blue-500/5" : "from-orange-500/10 to-orange-500/5"}`}>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Saldo</p>
                <div className={`p-1.5 rounded-xl ${saldoTotal >= 0 ? "bg-blue-500/20" : "bg-orange-500/20"}`}>
                  <Wallet className={`w-3 h-3 sm:w-4 sm:h-4 ${saldoTotal >= 0 ? "text-blue-500" : "text-orange-500"}`} />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <p className={`text-base sm:text-xl font-bold truncate ${saldoTotal >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                  {formatCurrency(saldoTotal)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Taxa de economia */}
          <Card className="border-0 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Economia</p>
                <div className="p-1.5 rounded-xl bg-violet-500/20">
                  <Percent className="w-3 h-3 sm:w-4 sm:h-4 text-violet-500" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-16" />
              ) : (
                <>
                  <p className={`text-base sm:text-xl font-bold ${taxaEconomia >= 20 ? "text-green-500" : taxaEconomia >= 0 ? "text-yellow-500" : "text-red-500"}`}>
                    {taxaEconomia.toFixed(1)}%
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    {diasComTransacoes} dia{diasComTransacoes !== 1 ? "s" : ""} c/ transações
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">Visão Geral</TabsTrigger>
            <TabsTrigger value="categories" className="text-xs sm:text-sm">Categorias</TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs sm:text-sm">
              Transações
              {filteredTransactions.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                  {filteredTransactions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="dividas" className="text-xs sm:text-sm">
              Dívidas
              {(dividas ?? []).filter((d) => d.status === "vencida").length > 0 && (
                <Badge className="ml-1 text-[10px] h-4 px-1 bg-red-500 text-white">
                  {(dividas ?? []).filter((d) => d.status === "vencida").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="metas" className="text-xs sm:text-sm">Metas</TabsTrigger>
            <TabsTrigger value="recorrentes" className="text-xs sm:text-sm">Recorrentes</TabsTrigger>
          </TabsList>

          {/* ══ Tab: Visão Geral ════════════════════════════════════════ */}
          <TabsContent value="overview" className="space-y-4">
            {/* Gráfico Receitas vs Despesas */}
            <Card>
              <CardHeader className="pb-2 px-3 sm:px-6">
                <CardTitle className="text-sm sm:text-base">Receitas vs Despesas</CardTitle>
              </CardHeader>
              <CardContent className="px-1 sm:px-4">
                {loading ? (
                  <Skeleton className="h-52 w-full" />
                ) : chartData.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
                    Sem dados no período
                  </div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 10 }}
                          interval={chartData.length > 15 ? Math.floor(chartData.length / 8) : 0}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            color: "hsl(var(--foreground))",
                          }}
                          formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            name === "receitas" ? "Receitas" : "Despesas",
                          ]}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="receitas"
                          stroke="#22c55e"
                          fill="url(#colorReceitas)"
                          strokeWidth={2}
                          name="receitas"
                        />
                        <Area
                          type="monotone"
                          dataKey="despesas"
                          stroke="#ef4444"
                          fill="url(#colorDespesas)"
                          strokeWidth={2}
                          name="despesas"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Destaques + Análise */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-500" />
                    Destaques do Período
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6">
                  {maiorReceita ? (
                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <p className="text-xs text-muted-foreground mb-0.5">Maior Receita</p>
                      <p className="font-medium text-sm">{maiorReceita.descricao}</p>
                      <p className="text-base font-bold text-green-500">
                        {formatCurrency(Number(maiorReceita.valor))}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatarData(maiorReceita.data)}</p>
                    </div>
                  ) : null}
                  {maiorDespesa ? (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-xs text-muted-foreground mb-0.5">Maior Despesa</p>
                      <p className="font-medium text-sm">{maiorDespesa.descricao}</p>
                      <p className="text-base font-bold text-red-500">
                        {formatCurrency(Number(maiorDespesa.valor))}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatarData(maiorDespesa.data)}</p>
                    </div>
                  ) : null}
                  {!maiorReceita && !maiorDespesa && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Sem transações no período
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base">💡 Análise Automática</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6">
                  <div
                    className={`p-3 rounded-xl border ${
                      taxaEconomia >= 20
                        ? "bg-green-500/10 border-green-500/20"
                        : taxaEconomia >= 0
                        ? "bg-yellow-500/10 border-yellow-500/20"
                        : "bg-red-500/10 border-red-500/20"
                    }`}
                  >
                    <p className="text-sm font-medium mb-0.5">Taxa de Economia: {taxaEconomia.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">
                      {taxaEconomia >= 20
                        ? "Excelente! Você está economizando bem."
                        : taxaEconomia >= 0
                        ? "Atenção: tente economizar pelo menos 20%."
                        : "Alerta: suas despesas superam suas receitas."}
                    </p>
                  </div>
                  <div
                    className={`p-3 rounded-xl border ${
                      variacaoDespesas <= 0
                        ? "bg-green-500/10 border-green-500/20"
                        : "bg-yellow-500/10 border-yellow-500/20"
                    }`}
                  >
                    <p className="text-sm font-medium mb-0.5">Tendência de Gastos</p>
                    <p className="text-xs text-muted-foreground">
                      {variacaoDespesas <= 0
                        ? "Ótimo! Seus gastos diminuíram vs mês anterior."
                        : `Seus gastos aumentaram ${variacaoDespesas.toFixed(1)}% vs mês anterior.`}
                    </p>
                  </div>
                  {topCategoriasDespesa[0] && (
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <p className="text-sm font-medium mb-0.5">Principal Despesa</p>
                      <p className="text-xs text-muted-foreground">
                        "{topCategoriasDespesa[0].categoria}" representa{" "}
                        {totalDespesas > 0
                          ? ((topCategoriasDespesa[0].valor / totalDespesas) * 100).toFixed(0)
                          : 0}
                        % das suas despesas.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Projeção de Saldo */}
            {projecaoMeses.length > 0 && (
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-cyan-500" />
                    Projeção — Próximos 3 Meses
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6 space-y-4">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projecaoMeses} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            color: "hsl(var(--foreground))",
                          }}
                          formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            name === "receitas" ? "Receitas proj." : name === "despesas" ? "Despesas proj." : "Saldo",
                          ]}
                        />
                        <Bar dataKey="receitas" fill="#22c55e" radius={[4, 4, 0, 0]} name="receitas" />
                        <Bar dataKey="despesas" fill="#ef4444" radius={[4, 4, 0, 0]} name="despesas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {projecaoMeses.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <span className="text-sm font-medium capitalize">{p.mes}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-green-500">+{p.receitas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                          <span className="text-red-500">-{p.despesas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
                          <span className={`font-semibold ${p.saldo >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                            = {formatCurrency(p.saldo)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    * Projeção baseada na média diária do período selecionado.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ══ Tab: Categorias ═════════════════════════════════════════ */}
          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* PieChart */}
              <Card>
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-sm sm:text-base">Distribuição de Despesas</CardTitle>
                </CardHeader>
                <CardContent className="px-1 sm:px-4">
                  {categoryData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                      Sem despesas no período
                    </div>
                  ) : (
                    <>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={90}
                              dataKey="valor"
                              nameKey="categoria"
                            >
                              {categoryData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={entry.cor}
                                  className="outline-none transition-all duration-300 hover:opacity-80"
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }: TooltipProps<number, string>) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  const pct =
                                    totalDespesas > 0
                                      ? ((data.valor / totalDespesas) * 100).toFixed(1)
                                      : "0";
                                  const iconName = data.icone as keyof typeof icons;
                                  const IconComponent =
                                    iconName && icons[iconName]
                                      ? (icons[iconName] as React.ElementType)
                                      : icons.Tag;
                                  return (
                                    <div className="bg-background/90 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl p-3 min-w-[160px]">
                                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                                        <div
                                          className="flex items-center justify-center w-7 h-7 rounded-full"
                                          style={{ backgroundColor: `${data.cor}20`, color: data.cor }}
                                        >
                                          <IconComponent size={14} />
                                        </div>
                                        <span className="font-semibold text-sm">{data.categoria}</span>
                                      </div>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Valor</span>
                                        <span className="font-bold">{formatCurrency(data.valor)}</span>
                                      </div>
                                      <div className="flex justify-between text-xs mt-1">
                                        <span className="text-muted-foreground">Participação</span>
                                        <span className="font-semibold">{pct}%</span>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Legend fora do Recharts para não sobrepor o gráfico */}
                      <div className="pt-3 px-2 pb-2">
                        <ul className="grid grid-cols-2 gap-x-2 gap-y-2">
                          {(showAllCategories ? categoryData : categoryData.slice(0, 6)).map(
                            (entry, index) => {
                              const iconName = entry.icone as keyof typeof icons;
                              const IconComponent =
                                iconName && icons[iconName]
                                  ? (icons[iconName] as React.ElementType)
                                  : icons.Tag;
                              const pct =
                                totalDespesas > 0
                                  ? ((entry.valor / totalDespesas) * 100).toFixed(1)
                                  : "0";
                              return (
                                <li key={`leg-${index}`} className="flex items-center gap-2 min-w-0">
                                  <div
                                    className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                                    style={{ backgroundColor: `${entry.cor}15`, color: entry.cor }}
                                  >
                                    <IconComponent size={12} />
                                  </div>
                                  <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-medium truncate">{entry.categoria}</span>
                                    <span className="text-[10px] text-muted-foreground">{pct}%</span>
                                  </div>
                                </li>
                              );
                            }
                          )}
                        </ul>
                        {categoryData.length > 6 && (
                          <button
                            onClick={() => setShowAllCategories((v) => !v)}
                            className="mt-3 text-xs text-muted-foreground hover:text-foreground mx-auto flex items-center gap-1"
                          >
                            {showAllCategories ? "Ver menos" : `Ver mais (${categoryData.length - 6})`}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Top listas */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base text-red-500">Top Despesas por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-3 sm:px-6">
                    {(showAllDespesas
                      ? topCategoriasDespesa
                      : topCategoriasDespesa.slice(0, 5)
                    ).map((cat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.cor }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="truncate">{cat.categoria}</span>
                            <span className="font-medium ml-2 flex-shrink-0">
                              {formatCurrency(cat.valor)}
                            </span>
                          </div>
                          <Progress
                            value={totalDespesas > 0 ? (cat.valor / totalDespesas) * 100 : 0}
                            className="h-1"
                          />
                        </div>
                      </div>
                    ))}
                    {topCategoriasDespesa.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground hover:text-red-400"
                        onClick={() => setShowAllDespesas((v) => !v)}
                      >
                        {showAllDespesas ? "Ver menos" : `Ver mais (${topCategoriasDespesa.length - 5})`}
                      </Button>
                    )}
                    {topCategoriasDespesa.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-3">Sem despesas no período</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base text-green-500">Top Receitas por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-3 sm:px-6">
                    {(showAllReceitas
                      ? topCategoriasReceita
                      : topCategoriasReceita.slice(0, 5)
                    ).map((cat, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.cor }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="truncate">{cat.categoria}</span>
                            <span className="font-medium ml-2 flex-shrink-0">
                              {formatCurrency(cat.valor)}
                            </span>
                          </div>
                          <Progress
                            value={totalReceitas > 0 ? (cat.valor / totalReceitas) * 100 : 0}
                            className="h-1"
                          />
                        </div>
                      </div>
                    ))}
                    {topCategoriasReceita.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs text-muted-foreground hover:text-green-400"
                        onClick={() => setShowAllReceitas((v) => !v)}
                      >
                        {showAllReceitas ? "Ver menos" : `Ver mais (${topCategoriasReceita.length - 5})`}
                      </Button>
                    )}
                    {topCategoriasReceita.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-3">Sem receitas no período</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ══ Tab: Transações ═════════════════════════════════════════ */}
          <TabsContent value="transactions" className="space-y-3">
            <Card>
              <CardHeader className="pb-3 px-3 sm:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm sm:text-base">
                    Transações — {filteredTransactions.length} resultado{filteredTransactions.length !== 1 ? "s" : ""}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{getPeriodoLabel()}</p>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                {/* Mobile: cards */}
                <div className="block sm:hidden space-y-2 max-h-[480px] overflow-y-auto">
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="p-3 rounded-lg border border-border">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))
                  ) : paginatedTransactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhuma transação encontrada
                    </div>
                  ) : (
                    paginatedTransactions.map((t) => (
                      <div key={t.id} className="p-3 rounded-lg border border-border">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs text-muted-foreground">{formatarData(t.data)}</span>
                          <span
                            className={`text-sm font-semibold ${
                              t.tipo === "receita" ? "text-green-500" : "text-red-500"
                            }`}
                          >
                            {t.tipo === "receita" ? "+" : "-"}
                            {formatCurrency(t.valor)}
                          </span>
                        </div>
                        <p className="font-medium text-sm truncate">{t.descricao}</p>
                        <Badge variant="secondary" className="font-normal text-xs mt-1">
                          {t.categoria}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop: tabela */}
                <ScrollArea className="h-[420px] hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        [...Array(8)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : paginatedTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                            Nenhuma transação encontrada
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedTransactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-muted-foreground text-sm">
                              {formatarData(t.data)}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{t.descricao}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-normal text-xs">
                                {t.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`text-xs font-normal ${
                                  t.tipo === "receita"
                                    ? "bg-green-500/10 text-green-600 border border-green-500/20"
                                    : "bg-red-500/10 text-red-600 border border-red-500/20"
                                }`}
                              >
                                {t.tipo === "receita" ? "Receita" : "Despesa"}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${
                                t.tipo === "receita" ? "text-green-500" : "text-red-500"
                              }`}
                            >
                              {t.tipo === "receita" ? "+" : "-"}
                              {formatCurrency(t.valor)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {/* Paginação */}
                {totalTxPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      {txPage * TX_PAGE_SIZE + 1}–
                      {Math.min((txPage + 1) * TX_PAGE_SIZE, filteredTransactions.length)} de{" "}
                      {filteredTransactions.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={txPage === 0}
                        onClick={() => setTxPage((p) => p - 1)}
                      >
                        Ant.
                      </Button>
                      <span className="text-xs px-2">
                        {txPage + 1}/{totalTxPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={txPage >= totalTxPages - 1}
                        onClick={() => setTxPage((p) => p + 1)}
                      >
                        Próx.
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ Tab: Dívidas ════════════════════════════════════════════ */}
          <TabsContent value="dividas" className="space-y-4">
            {/* KPIs de dívidas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {[
                {
                  label: "Total em Dívidas",
                  value: formatCurrency((dividas ?? []).reduce((s, d) => s + Number(d.valor_total), 0)),
                  color: "text-foreground",
                },
                {
                  label: "Valor Restante",
                  value: formatCurrency((dividas ?? []).reduce((s, d) => s + Number(d.valor_restante ?? 0), 0)),
                  color: "text-orange-500",
                },
                {
                  label: "Vencidas",
                  value: (dividas ?? []).filter((d) => d.status === "vencida").length.toString(),
                  color: "text-red-500",
                },
                {
                  label: "Quitadas",
                  value: (dividas ?? []).filter((d) => d.status === "quitada").length.toString(),
                  color: "text-green-500",
                },
              ].map((kpi) => (
                <Card key={kpi.label} className="border-border/50">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filtros de dívidas */}
            <div className="flex flex-wrap gap-2">
              <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5">
                {["todas", "pendente", "vencida", "quitada"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setDividaStatus(status)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                      dividaStatus === status
                        ? status === "vencida"
                          ? "bg-red-500 text-white shadow-sm"
                          : status === "quitada"
                          ? "bg-green-500 text-white shadow-sm"
                          : status === "pendente"
                          ? "bg-yellow-500 text-white shadow-sm"
                          : "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {status === "todas" ? "Todas" : dividaStatusConfig[status]?.label ?? status}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar credor..."
                  value={dividaSearch}
                  onChange={(e) => setDividaSearch(e.target.value)}
                  className="h-8 text-xs pl-7 w-44"
                />
              </div>
            </div>

            {/* Tabela de dívidas */}
            <Card>
              <CardContent className="p-0">
                {loadingDividas ? (
                  <div className="p-6 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : dividasFiltradas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma dívida encontrada</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile: cards */}
                    <div className="block sm:hidden space-y-2 p-3">
                      {dividasFiltradas.map((d) => {
                        const cfg = dividaStatusConfig[d.status] ?? { label: d.status, color: "" };
                        const progresso =
                          d.valor_total > 0 ? ((Number(d.valor_pago ?? 0) / Number(d.valor_total)) * 100) : 0;
                        return (
                          <div key={d.id} className="p-3 rounded-lg border border-border">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-medium text-sm">{d.descricao}</p>
                                {d.credor && (
                                  <p className="text-xs text-muted-foreground">{d.credor}</p>
                                )}
                              </div>
                              <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                            </div>
                            <Progress value={progresso} className="h-1.5 mb-2" />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Pago: {formatCurrency(Number(d.valor_pago ?? 0))}</span>
                              <span>Total: {formatCurrency(Number(d.valor_total))}</span>
                            </div>
                            {d.data_vencimento && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Vence: {formatarData(d.data_vencimento)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: tabela */}
                    <ScrollArea className="hidden sm:block h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Credor</TableHead>
                            <TableHead>Valor Total</TableHead>
                            <TableHead>Restante</TableHead>
                            <TableHead>Parcela</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Progresso</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dividasFiltradas.map((d) => {
                            const cfg = dividaStatusConfig[d.status] ?? { label: d.status, color: "" };
                            const progresso =
                              d.valor_total > 0
                                ? (Number(d.valor_pago ?? 0) / Number(d.valor_total)) * 100
                                : 0;
                            return (
                              <TableRow key={d.id}>
                                <TableCell className="font-medium text-sm">{d.descricao}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {d.credor ?? "—"}
                                </TableCell>
                                <TableCell className="text-sm">{formatCurrency(Number(d.valor_total))}</TableCell>
                                <TableCell className="text-sm text-orange-500 font-medium">
                                  {formatCurrency(Number(d.valor_restante ?? 0))}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatCurrency(Number(d.parcelas > 0 ? d.valor_total / d.parcelas : 0))}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {d.data_vencimento ? formatarData(d.data_vencimento) : "—"}
                                </TableCell>
                                <TableCell className="w-24">
                                  <div className="flex items-center gap-2">
                                    <Progress value={progresso} className="h-1.5 flex-1" />
                                    <span className="text-xs text-muted-foreground w-8">
                                      {progresso.toFixed(0)}%
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ Tab: Metas ══════════════════════════════════════════════ */}
          <TabsContent value="metas" className="space-y-4">
            {/* Filtros de metas */}
            <div className="flex flex-wrap gap-2">
              {/* Status */}
              <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5">
                {["todas", "ativa", "concluida", "pausada", "vencida"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setMetaStatus(status)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      metaStatus === status
                        ? status === "ativa"
                          ? "bg-blue-500 text-white shadow-sm"
                          : status === "concluida"
                          ? "bg-green-500 text-white shadow-sm"
                          : status === "vencida"
                          ? "bg-red-500 text-white shadow-sm"
                          : status === "pausada"
                          ? "bg-gray-500 text-white shadow-sm"
                          : "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {status === "todas" ? "Todas" : metaStatusConfig[status]?.label ?? status}
                  </button>
                ))}
              </div>

              {/* Tipo */}
              <Select value={metaTipo} onValueChange={setMetaTipo}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos os tipos</SelectItem>
                  <SelectItem value="economia">Economia</SelectItem>
                  <SelectItem value="investimento">Investimento</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lista de metas */}
            {metasFiltradas.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Target className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhuma meta encontrada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {metasFiltradas.map((meta) => {
                  const progresso =
                    meta.valor_alvo > 0 ? (meta.valor_atual / meta.valor_alvo) * 100 : 0;
                  const cfg = metaStatusConfig[meta.status] ?? { label: meta.status, color: "" };
                  const diasRestantes = meta.data_limite
                    ? Math.ceil(
                        (new Date(meta.data_limite).getTime() - new Date().getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    : null;
                  return (
                    <Card key={meta.id} className="border-border/50">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{meta.titulo}</p>
                            <p className="text-xs text-muted-foreground capitalize">{meta.tipo}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                            <Badge variant="secondary" className="text-xs font-bold">
                              {Math.min(progresso, 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                        <Progress value={Math.min(progresso, 100)} className="h-2 mb-3" />
                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                          <span>Atual: {formatCurrency(meta.valor_atual)}</span>
                          <span>Meta: {formatCurrency(meta.valor_alvo)}</span>
                        </div>
                        {diasRestantes !== null && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {diasRestantes > 0
                              ? `${diasRestantes} dias restantes`
                              : diasRestantes === 0
                              ? "Vence hoje!"
                              : `Venceu há ${Math.abs(diasRestantes)} dias`}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══ Tab: Recorrentes ════════════════════════════════════════ */}
          <TabsContent value="recorrentes" className="space-y-4">
            {/* KPIs recorrentes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Receita Fixa Mensal</p>
                  <p className="text-lg font-bold text-green-500">{formatCurrency(totalRecorrentesReceita)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-red-500/10 to-red-500/5">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Despesa Fixa Mensal</p>
                  <p className="text-lg font-bold text-red-500">{formatCurrency(totalRecorrentesDespesa)}</p>
                </CardContent>
              </Card>
              <Card
                className={`border-0 bg-gradient-to-br ${
                  totalRecorrentesReceita - totalRecorrentesDespesa >= 0
                    ? "from-blue-500/10 to-blue-500/5"
                    : "from-orange-500/10 to-orange-500/5"
                }`}
              >
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Saldo Fixo Mensal</p>
                  <p
                    className={`text-lg font-bold ${
                      totalRecorrentesReceita - totalRecorrentesDespesa >= 0
                        ? "text-blue-500"
                        : "text-orange-500"
                    }`}
                  >
                    {formatCurrency(totalRecorrentesReceita - totalRecorrentesDespesa)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filtro tipo */}
            <div className="flex bg-secondary rounded-lg p-0.5 gap-0.5 w-fit">
              {["todas", "receita", "despesa"].map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => setRecorrenteTipo(tipo)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    recorrenteTipo === tipo
                      ? tipo === "receita"
                        ? "bg-green-500 text-white shadow-sm"
                        : tipo === "despesa"
                        ? "bg-red-500 text-white shadow-sm"
                        : "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tipo === "todas" ? "Todas" : tipo === "receita" ? "Receitas" : "Despesas"}
                </button>
              ))}
            </div>

            {/* Tabela/lista de recorrentes */}
            <Card>
              <CardContent className="p-0">
                {loadingRecorrentes ? (
                  <div className="p-6 space-y-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : recorrentesFiltrados.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <RefreshCw className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma recorrência encontrada</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile */}
                    <div className="block sm:hidden space-y-2 p-3">
                      {recorrentesFiltrados.map((r) => (
                        <div key={r.id} className="p-3 rounded-lg border border-border">
                          <div className="flex justify-between items-start mb-1">
                            <p className="font-medium text-sm">{r.descricao}</p>
                            <span
                              className={`text-sm font-bold ${
                                r.tipo_transacao === "receita" ? "text-green-500" : "text-red-500"
                              }`}
                            >
                              {formatCurrency(Number(r.valor))}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="capitalize">{r.recorrencia}</span>
                            <span>·</span>
                            <Badge
                              className={`text-[10px] px-1.5 ${
                                r.ativo
                                  ? "bg-green-500/10 text-green-600 border-green-500/20"
                                  : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                              }`}
                            >
                              {r.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop */}
                    <ScrollArea className="hidden sm:block h-[380px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Recorrência</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recorrentesFiltrados.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium text-sm">{r.descricao}</TableCell>
                              <TableCell>
                                <Badge
                                  className={`text-xs ${
                                    r.tipo_transacao === "receita"
                                      ? "bg-green-500/10 text-green-600 border border-green-500/20"
                                      : "bg-red-500/10 text-red-600 border border-red-500/20"
                                  }`}
                                >
                                  {r.tipo_transacao === "receita" ? "Receita" : "Despesa"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm capitalize text-muted-foreground">
                                {r.recorrencia}
                              </TableCell>
                              <TableCell
                                className={`font-semibold text-sm ${
                                  r.tipo_transacao === "receita" ? "text-green-500" : "text-red-500"
                                }`}
                              >
                                {r.tipo_transacao === "receita" ? "+" : "-"}
                                {formatCurrency(Number(r.valor))}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={`text-xs ${
                                    r.ativo
                                      ? "bg-green-500/10 text-green-600 border border-green-500/20"
                                      : "bg-gray-500/10 text-gray-500 border border-gray-500/20"
                                  }`}
                                >
                                  {r.ativo ? (
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Ativo
                                    </span>
                                  ) : (
                                    "Inativo"
                                  )}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Relatorios;
