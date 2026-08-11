import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PDVHeader } from "@/domains/pdv/components/PDVHeader";
import { PDVSearchInput } from "@/domains/pdv/components/PDVSearchInput";
import { PDVProductGrid, type PDVProduct } from "@/domains/pdv/components/PDVProductGrid";
import { PDVCart } from "@/domains/pdv/components/PDVCart";
import { PDVPaymentModal } from "@/domains/pdv/components/PDVPaymentModal";
import { PDVSidebar, type PDVTab } from "@/domains/pdv/components/PDVSidebar";
import { PDVOperacoesView } from "@/domains/pdv/components/PDVOperacoesView";
import PDVConfigurarView from "@/domains/pdv/components/PDVConfigurarView";
import { TERMINALS, DEFAULT_TERMINAL_SERIAL } from "@/domains/pdv/services/pdvActionService";
import { usePDVCart } from "@/domains/pdv/hooks/usePDVCart";
import { usePDVHotkeys } from "@/domains/pdv/hooks/usePDVHotkeys";
import { useToast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { ArrowLeft, Store, RefreshCw, Smartphone, CheckCircle2, Lock, AlertTriangle, Coins, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Movimentacao {
  tipo: "abertura" | "venda" | "sangria" | "reforco";
  valor: number;
  hora: string;
  motivo?: string;
}

interface Venda {
  id: string;
  total: number;
  hora: string;
  itens: number;
  metodo: string;
}

const DEFAULT_PRODUCTS: PDVProduct[] = [
  { id: "1", name: "Salgado Assado", price: 8.0, category: "salgados" },
  { id: "2", name: "Pão de Queijo", price: 6.0, category: "salgados" },
  { id: "3", name: "Café Expresso", price: 5.0, category: "café" },
  { id: "4", name: "Refrigerante Lata", price: 7.0, category: "bebidas" },
  { id: "5", name: "Bolo de Cenoura", price: 9.0, category: "doces" },
  { id: "6", name: "Café com Leite", price: 6.5, category: "café" },
  { id: "7", name: "Suco Natural", price: 8.5, category: "bebidas" },
  { id: "8", name: "Combo Café + Salgado", price: 12.0, category: "combos" },
  { id: "9", name: "Coxinha", price: 7.5, category: "salgados" },
  { id: "10", name: "Pudim", price: 8.0, category: "doces" },
  { id: "11", name: "Água Mineral", price: 4.0, category: "bebidas" },
  { id: "12", name: "Combo Refri + Salgado", price: 13.5, category: "combos" },
];

function getProductCategory(name: string): string {
  const n = name.toLowerCase();
  
  if (n.includes("combo") || n.includes("funcion") || n.includes("promoc") || n.includes("promoção")) return "promoção funcion.";
  if (n.includes("café") || n.includes("cafe") || n.includes("c/leite") || n.includes("expresso") || n.includes("pingado")) return "café";
  if (n.includes("cerveja") || n.includes("skol") || n.includes("brahma") || n.includes("original") || n.includes("corona") || n.includes("spaten") || n.includes("stella") || n.includes("eisenbahn")) return "cerveja";
  if (n.includes("água") || n.includes("agua") || n.includes("suco") || n.includes("refrigerante") || n.includes("coca") || n.includes("refr") || n.includes("lata") || n.includes("guarana") || n.includes("itambezinho") || n.includes("bebida") || n.includes("gatorade") || n.includes("power ade") || n.includes("leão") || n.includes("fanta")) return "bebidas";
  if (n.includes("trident") || n.includes("paçoquita") || n.includes("bala") || n.includes("chiclete") || n.includes("doce") || n.includes("chic") || n.includes("mentos") || n.includes("fini") || n.includes("butter toffe") || n.includes("caramelo") || n.includes("pudim") || n.includes("bolo") || n.includes("pirulito")) return "doces";
  if (n.includes("snickers") || n.includes("talento") || n.includes("ouro branco") || n.includes("serenata") || n.includes("chocolate") || n.includes("barra") || n.includes("choc") || n.includes("trento")) return "chocolate";
  if (n.includes("biscoito") || n.includes("cookies") || n.includes("teens")) return "biscoito";
  if (n.includes("salgadinho") || n.includes("pringles") || n.includes("elma") || n.includes("batata") || n.includes("doritos") || n.includes("ruffles") || n.includes("amendoim") || n.includes("coxinha") || n.includes("pipoca") || n.includes("torcida") || n.includes("pururuca") || n.includes("torresmo") || n.includes("salgado")) return "salgadinhos";
  if (n.includes("cigarro") || n.includes("porto faria") || n.includes("dunhill") || n.includes("strike") || n.includes("rothmans") || n.includes("isqueiro")) return "cigarro";
  if (n.includes("remedio") || n.includes("dorflex") || n.includes("dipirona") || n.includes("dramin") || n.includes("sonrisal") || n.includes("sal de fruta") || n.includes("eno ") || n.includes(" eno")) return "remedio";
  if (n.includes("armario") || n.includes("manta") || n.includes("baralho") || n.includes("escova") || n.includes("sabonete") || n.includes("protetor") || n.includes("pente")) return "armario";
  if (n.includes("dinheiro") || /^\d+([,.]\d+)?$/.test(n)) return "dinheiro";
  
  return "outros";
}

const PDVPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estados principais com persistência no LocalStorage
  const [isCaixaAberto, setIsCaixaAberto] = useState<boolean>(() => {
    return localStorage.getItem("pdv_is_caixa_aberto") === "true";
  });
  const [saldoCaixa, setSaldoCaixa] = useState<number>(() => {
    const saved = localStorage.getItem("pdv_saldo_caixa");
    return saved ? parseFloat(saved) : 0;
  });
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>(() => {
    const saved = localStorage.getItem("pdv_movimentacoes");
    return saved ? JSON.parse(saved) : [];
  });
  const [vendas, setVendas] = useState<Venda[]>(() => {
    const saved = localStorage.getItem("pdv_vendas");
    return saved ? JSON.parse(saved) : [];
  });

  // Estados de navegação e visualização
  const [activeTab, setActiveTab] = useState<PDVTab>(isCaixaAberto ? "vender" : "operacoes");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("todos");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [products, setProducts] = useState<PDVProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [terminalSerial, setTerminalSerial] = useState<string>(() => {
    return localStorage.getItem("pdv_terminal_serial") ?? DEFAULT_TERMINAL_SERIAL;
  });

  const activeTerminal = TERMINALS.find(t => t.serial === terminalSerial);

  const handleTerminalChange = (serial: string) => {
    setTerminalSerial(serial);
    localStorage.setItem("pdv_terminal_serial", serial);
    const label = TERMINALS.find(t => t.serial === serial)?.label ?? serial;
    toast({ title: "Terminal Atualizado", description: `Maquininha ativa: ${label}` });
  };

  // Estados dos modais de operações
  const [abrirCaixaOpen, setAbrirCaixaOpen] = useState(false);
  const [sangriaOpen, setSangriaOpen] = useState(false);
  const [reforcoOpen, setReforcoOpen] = useState(false);
  const [fechamentoOpen, setFechamentoOpen] = useState(false);

  // Estados dos inputs dos modais
  const [aberturaValor, setAberturaValor] = useState("");
  const [sangriaValor, setSangriaValor] = useState("");
  const [sangriaMotivo, setSangriaMotivo] = useState("");
  const [reforcoValor, setReforcoValor] = useState("");

  const { items, subtotal, discount, total, itemCount, addItem, removeItem, incrementQuantity, decrementQuantity, clearCart } = usePDVCart();

  // Sincronizar com localStorage sempre que houver alteração
  useEffect(() => {
    localStorage.setItem("pdv_is_caixa_aberto", String(isCaixaAberto));
  }, [isCaixaAberto]);

  useEffect(() => {
    localStorage.setItem("pdv_saldo_caixa", String(saldoCaixa));
  }, [saldoCaixa]);

  useEffect(() => {
    localStorage.setItem("pdv_movimentacoes", JSON.stringify(movimentacoes));
  }, [movimentacoes]);

  useEffect(() => {
    localStorage.setItem("pdv_vendas", JSON.stringify(vendas));
  }, [vendas]);

  const focusSearch = useCallback(() => {
    if (activeTab === "vender" && isCaixaAberto) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [activeTab, isCaixaAberto]);

  const handleAddToCart = useCallback((product: PDVProduct) => {
    if (!isCaixaAberto) return;
    addItem(product);
    setSearchQuery("");
    setTimeout(focusSearch, 50);
  }, [addItem, focusSearch, isCaixaAberto]);

  const fetchProducts = useCallback(async (showToast = false) => {
    setIsLoadingProducts(true);
    try {
      const { data, error } = await supabase.functions.invoke("eyemobile-sync", {
        body: { mode: "PRODUCTS" }
      });
      if (error) throw error;
      if (data?.products && Array.isArray(data.products)) {
        const mapped: PDVProduct[] = data.products.map((p: any) => {
          const cat = getProductCategory(p.name);
          return {
            id: String(p.id ?? p.sku ?? ""),
            name: String(p.name ?? "Produto sem nome").trim(),
            price: Number(p.default_price ?? p.price ?? 0),
            category: cat,
          };
        });
        setProducts(mapped);
        localStorage.setItem("pdv_produtos_cache", JSON.stringify(mapped));
        if (showToast) {
          toast({ title: "Sincronizado!", description: `${mapped.length} produtos carregados do Eyemobile.` });
        }
      } else {
        throw new Error("Resposta de produtos inválida");
      }
    } catch (err: any) {
      console.error("Erro ao sincronizar produtos:", err);
      if (showToast) {
        toast({
          title: "Erro de Sincronização",
          description: "Não foi possível conectar ao Eyemobile. Usando dados locais.",
          variant: "destructive"
        });
      }
      const cached = localStorage.getItem("pdv_produtos_cache");
      if (cached) {
        setProducts(JSON.parse(cached));
      } else {
        setProducts(DEFAULT_PRODUCTS);
      }
    } finally {
      setIsLoadingProducts(false);
    }
  }, [toast]);

  useEffect(() => {
    const cached = localStorage.getItem("pdv_produtos_cache");
    if (cached) {
      setProducts(JSON.parse(cached));
    } else {
      fetchProducts(false);
    }
  }, [fetchProducts]);

  const handleSearch = useCallback(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const match = products.find((p) => p.id === query || p.name.toLowerCase().includes(query));
    if (match) handleAddToCart(match);
  }, [searchQuery, products, handleAddToCart]);

  usePDVHotkeys({
    onF2: focusSearch,
    onF4: () => { if (items.length > 0 && isCaixaAberto && activeTab === "vender") setPaymentModalOpen(true); },
    onF8: () => { if (items.length > 0 && isCaixaAberto && activeTab === "vender") setPaymentModalOpen(true); },
    onEsc: () => {
      if (paymentModalOpen) {
        setPaymentModalOpen(false);
      } else {
        clearCart();
        setSearchQuery("");
        focusSearch();
      }
    },
    onEnter: handleSearch,
  });

  const getHoraAtual = () => {
    return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Funções das Operações de Caixa
  const handleAbrirCaixa = () => {
    const valor = parseFloat(aberturaValor) || 0;
    if (valor < 0) {
      toast({ title: "Valor Inválido", description: "O saldo inicial não pode ser negativo.", variant: "destructive" });
      return;
    }
    setSaldoCaixa(valor);
    setIsCaixaAberto(true);
    setMovimentacoes([{ tipo: "abertura", valor, hora: getHoraAtual() }]);
    setVendas([]);
    setAbrirCaixaOpen(false);
    setAberturaValor("");
    setActiveTab("vender");
    toast({ title: "Caixa Aberto!", description: `Caixa aberto com fundo inicial de ${fmt(valor)}.` });
  };

  const handleConfirmSangria = () => {
    const valor = parseFloat(sangriaValor) || 0;
    if (valor <= 0) {
      toast({ title: "Valor inválido", description: "Digite um valor maior que zero.", variant: "destructive" });
      return;
    }
    if (valor > saldoCaixa) {
      toast({ title: "Saldo insuficiente", description: `Você tem apenas ${fmt(saldoCaixa)} em dinheiro na gaveta.`, variant: "destructive" });
      return;
    }
    setSaldoCaixa((prev) => prev - valor);
    setMovimentacoes((prev) => [...prev, { tipo: "sangria", valor, hora: getHoraAtual(), motivo: sangriaMotivo || "Retirada padrão" }]);
    setSangriaOpen(false);
    setSangriaValor("");
    setSangriaMotivo("");
    toast({ title: "Sangria Realizada!", description: `Retirado ${fmt(valor)} do caixa.` });
  };

  const handleConfirmReforco = () => {
    const valor = parseFloat(reforcoValor) || 0;
    if (valor <= 0) {
      toast({ title: "Valor inválido", description: "Digite um valor maior que zero.", variant: "destructive" });
      return;
    }
    setSaldoCaixa((prev) => prev + valor);
    setMovimentacoes((prev) => [...prev, { tipo: "reforco", valor, hora: getHoraAtual() }]);
    setReforcoOpen(false);
    setReforcoValor("");
    toast({ title: "Reforço Realizado!", description: `Adicionado ${fmt(valor)} à gaveta.` });
  };

  const handleConfirmFechamento = () => {
    setIsCaixaAberto(false);
    setSaldoCaixa(0);
    setMovimentacoes([]);
    setVendas([]);
    setFechamentoOpen(false);
    setActiveTab("operacoes");
    toast({ title: "Caixa Fechado!", description: "O expediente do caixa foi encerrado." });
  };

  const handleSuccessVenda = (completedPayments: Array<{ method: string; amount: number }>) => {
    // 1. Calcula o total em dinheiro desta venda para atualizar o saldo físico na gaveta
    const cashTotal = completedPayments
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + p.amount, 0);

    setSaldoCaixa((prev) => prev + cashTotal);

    // 2. Adiciona a venda ao histórico
    const metodosUtilizados = Array.from(new Set(completedPayments.map(p => {
      if (p.method === "cash") return "Dinheiro";
      if (p.method === "pix") return "Pix";
      if (p.method === "credit") return "Crédito";
      return "Débito";
    }))).join(" + ");

    const novaVenda: Venda = {
      id: `VND-${Date.now()}`,
      total: total,
      hora: getHoraAtual(),
      itens: itemCount,
      metodo: metodosUtilizados
    };
    setVendas((prev) => [novaVenda, ...prev]);

    // 3. Adiciona a movimentação de venda
    setMovimentacoes((prev) => [...prev, { tipo: "venda", valor: total, hora: getHoraAtual(), motivo: `Forma: ${metodosUtilizados}` }]);

    // 4. Limpa o carrinho
    clearCart();
    setSearchQuery("");
    setTimeout(focusSearch, 100);
  };

  const handleSincronizar = () => {
    toast({ title: "Sincronizando...", description: "Baixando catálogo de produtos do Eyemobile..." });
    fetchProducts(true);
  };

  return (
    <div className="h-screen w-screen flex bg-[#0a0e1a] text-white overflow-hidden font-sans">
      
      {/* 1. BARRA LATERAL ESQUERDA */}
      <PDVSidebar activeTab={activeTab} onTabChange={setActiveTab} disabled={!isCaixaAberto} />

      {/* 2. ÁREA CENTRAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <PDVHeader terminalLabel={activeTerminal?.label} />

        {/* Botão de retorno superior */}
        <div className="px-5 pt-3 shrink-0">
          <Button variant="ghost" size="sm" className="text-[11px] text-slate-500 hover:text-slate-300 h-7" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />Voltar ao Painel Principal
          </Button>
        </div>

        {/* CONTEÚDO PRINCIPAL (BLOQUEADO SE CAIXA FECHADO) */}
        <div className="flex-1 overflow-hidden p-5 flex gap-5">
          {!isCaixaAberto ? (
            /* TELA DE CAIXA FECHADO */
            <div className="flex-1 flex flex-col items-center justify-center bg-[#111827]/40 border border-[#1E2942]/60 rounded-3xl p-8 text-center max-w-4xl mx-auto my-auto h-[70vh]">
              <div className="w-24 h-24 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6 animate-pulse">
                <Lock className="w-12 h-12" />
              </div>
              <h2 className="text-3xl font-black tracking-tight text-white uppercase">Caixa Fechado</h2>
              <p className="text-sm text-slate-400 mt-2 font-medium">DIRIJA-SE A OUTRO CAIXA OU EFETUE A ABERTURA DE EXPEDIENTE</p>
              <div className="w-full max-w-md border-t border-[#1E2942] my-6" />
              <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-6">Abra o caixa para iniciar as vendas</p>
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm justify-center">
                <Button className="h-12 flex-1 bg-[#7CB342] hover:bg-[#6fa03b] text-white font-extrabold text-sm rounded-xl shadow-lg shadow-green-600/10 active:scale-[0.98]" onClick={() => setAbrirCaixaOpen(true)}>
                  ABRIR CAIXA
                </Button>
                <Button variant="outline" className="h-12 flex-1 border-orange-500/40 text-orange-400 hover:bg-orange-500/10 font-bold text-sm rounded-xl" onClick={handleSincronizar}>
                  LER DADOS DO ERP
                </Button>
              </div>
            </div>
          ) : (
            /* CONTEÚDO TABS ATIVOS DO CAIXA ABERTO */
            <div className="flex-1 flex overflow-hidden gap-5">
              {activeTab === "vender" && (
                <div className="flex-1 flex overflow-hidden gap-5">
                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="mb-4 shrink-0">
                      <PDVSearchInput ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} onSearch={handleSearch} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <PDVProductGrid products={products} searchQuery={searchQuery} activeCategory={activeCategory} onCategoryChange={setActiveCategory} onAddToCart={handleAddToCart} isLoading={isLoadingProducts} />
                    </div>
                  </div>
                  <div className="w-[380px] shrink-0 hidden lg:flex">
                    <PDVCart items={items} subtotal={subtotal} discount={discount} total={total} itemCount={itemCount} onIncrement={incrementQuantity} onDecrement={decrementQuantity} onRemove={removeItem} onClear={clearCart} onCheckout={() => setPaymentModalOpen(true)} onCashPayment={() => setPaymentModalOpen(true)} />
                  </div>
                </div>
              )}

              {activeTab === "operacoes" && (
                <div className="flex-1 overflow-hidden">
                  <PDVOperacoesView
                    saldoCaixa={saldoCaixa}
                    movimentacoes={movimentacoes}
                    vendas={vendas}
                    onSangria={() => setSangriaOpen(true)}
                    onReforco={() => setReforcoOpen(true)}
                    onFechamento={() => setFechamentoOpen(true)}
                    onSincronizar={handleSincronizar}
                  />
                </div>
              )}

              {activeTab === "configurar" && (
                <div className="flex-1 overflow-auto p-6">
                  <PDVConfigurarView
                    terminalSerial={terminalSerial}
                    onTerminalChange={handleTerminalChange}
                    onBack={() => setActiveTab("vender")}
                  />
                </div>
              )}

              {["entregar", "atender", "sincronizar"].includes(activeTab) && (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#111827]/40 border border-[#1E2942]/60 rounded-3xl p-8 text-center max-w-lg mx-auto">
                  <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
                  <h3 className="text-lg font-bold text-white capitalize">Módulo {activeTab}</h3>
                  <p className="text-sm text-slate-400 mt-2">Esta funcionalidade está integrada ao MarketUP e encontra-se em homologação no ambiente de desenvolvimento.</p>
                  <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={() => setActiveTab("vender")}>Voltar para as Vendas</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. MODAIS E DIÁLOGOS DE EXPEDIENTE */}

      {/* A. MODAL ABERTURA DE CAIXA */}
      <Dialog open={abrirCaixaOpen} onOpenChange={setAbrirCaixaOpen}>
        <DialogContent className="sm:max-w-md bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2"><Store className="w-5 h-5 text-[#7CB342]" />Abertura de Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Fundo de Caixa Inicial (Troco de Gaveta)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">R$</span>
                <Input type="number" step="0.01" placeholder="0,00" value={aberturaValor} onChange={(e) => setAberturaValor(e.target.value)} className="pl-10 bg-[#1C2541]/80 border-[#1E2942] text-white font-mono font-bold" autoFocus />
              </div>
              <p className="text-[10px] text-slate-500">Informe a quantia física em moedas e notas presentes na gaveta para iniciar as operações.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button className="bg-[#7CB342] hover:bg-[#6fa03b] text-white font-bold rounded-xl" onClick={handleAbrirCaixa}>Confirmar Abertura</Button>
            <Button variant="outline" className="border-[#1E2942] rounded-xl text-slate-300 hover:bg-slate-800" onClick={() => setAbrirCaixaOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* B. MODAL SANGRIA (RETIRADA) */}
      <Dialog open={sangriaOpen} onOpenChange={setSangriaOpen}>
        <DialogContent className="sm:max-w-md bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-rose-400"><ArrowUpCircle className="w-5 h-5" />Sangria de Caixa (Retirada)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex justify-between items-center"><span className="text-xs font-bold text-slate-300">Disponível em Caixa:</span><span className="text-base font-black text-rose-400">{fmt(saldoCaixa)}</span></div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Valor a Retirar (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">R$</span>
                <Input type="number" step="0.01" placeholder="0,00" value={sangriaValor} onChange={(e) => setSangriaValor(e.target.value)} className="pl-10 bg-[#1C2541]/80 border-[#1E2942] text-white font-mono font-bold" autoFocus />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Motivo da Sangria</label>
              <Input type="text" placeholder="Ex: Pagamento de fornecedor, depósito em cofre" value={sangriaMotivo} onChange={(e) => setSangriaMotivo(e.target.value)} className="bg-[#1C2541]/80 border-[#1E2942] text-white font-semibold" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button className="bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl" onClick={handleConfirmSangria}>Confirmar Sangria</Button>
            <Button variant="outline" className="border-[#1E2942] rounded-xl text-slate-300 hover:bg-slate-800" onClick={() => setAbrirCaixaOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* C. MODAL REFORÇO (SUPRIMENTO) */}
      <Dialog open={reforcoOpen} onOpenChange={setReforcoOpen}>
        <DialogContent className="sm:max-w-md bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-amber-400"><ArrowDownCircle className="w-5 h-5" />Reforço de Caixa (Suprimento)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Valor a Adicionar (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">R$</span>
                <Input type="number" step="0.01" placeholder="0,00" value={reforcoValor} onChange={(e) => setReforcoValor(e.target.value)} className="pl-10 bg-[#1C2541]/80 border-[#1E2942] text-white font-mono font-bold" autoFocus />
              </div>
              <p className="text-[10px] text-slate-500">Adicione troco físico para manter a operação sem quebras de gaveta.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button className="bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl" onClick={handleConfirmReforco}>Confirmar Reforço</Button>
            <Button variant="outline" className="border-[#1E2942] rounded-xl text-slate-300 hover:bg-slate-800" onClick={() => setReforcoOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* D. MODAL CONFERÊNCIA E FECHAMENTO DE CAIXA */}
      <Dialog open={fechamentoOpen} onOpenChange={setFechamentoOpen}>
        <DialogContent className="sm:max-w-md bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-rose-400"><Lock className="w-5 h-5" />Fechamento de Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-xs text-slate-400">Verifique o fechamento financeiro do caixa abaixo para encerrar o expediente:</p>
            <div className="space-y-2 bg-[#1C2541]/40 border border-[#1E2942]/60 rounded-2xl p-4">
              
              {/* Saldo Inicial */}
              <div className="flex justify-between text-xs text-slate-300">
                <span>Fundo Inicial</span>
                <span className="font-mono font-bold">
                  {fmt(movimentacoes.find((m) => m.tipo === "abertura")?.valor || 0)}
                </span>
              </div>

              {/* Vendas em Dinheiro */}
              <div className="flex justify-between text-xs text-slate-300">
                <span>(+) Vendas em Dinheiro</span>
                <span className="font-mono font-bold text-emerald-400">
                  {fmt(movimentacoes.filter((m) => m.tipo === "venda" && m.motivo?.includes("Dinheiro")).reduce((sum, m) => sum + m.valor, 0))}
                </span>
              </div>

              {/* Vendas em Outros Metodos */}
              <div className="flex justify-between text-xs text-slate-300">
                <span>(+) Vendas Cartão / Pix</span>
                <span className="font-mono font-bold text-blue-400">
                  {fmt(movimentacoes.filter((m) => m.tipo === "venda" && !m.motivo?.includes("Dinheiro")).reduce((sum, m) => sum + m.valor, 0))}
                </span>
              </div>

              {/* Reforços */}
              <div className="flex justify-between text-xs text-slate-300">
                <span>(+) Reforços na Gaveta</span>
                <span className="font-mono font-bold text-amber-400">
                  {fmt(movimentacoes.filter((m) => m.tipo === "reforco").reduce((sum, m) => sum + m.valor, 0))}
                </span>
              </div>

              {/* Sangrias */}
              <div className="flex justify-between text-xs text-slate-300">
                <span>(-) Sangrias do Turno</span>
                <span className="font-mono font-bold text-rose-400">
                  {fmt(movimentacoes.filter((m) => m.tipo === "sangria").reduce((sum, m) => sum + m.valor, 0))}
                </span>
              </div>

              <div className="border-t border-[#1E2942] my-2 pt-2 flex justify-between text-sm font-bold text-slate-200">
                <span>Saldo Físico Estimado</span>
                <span className="font-mono font-extrabold text-emerald-400">{fmt(saldoCaixa)}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">Ao confirmar o fechamento, as estatísticas locais desta sessão serão zeradas e a gaveta do caixa será bloqueada.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button className="bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl" onClick={handleConfirmFechamento}>Fechar Caixa</Button>
            <Button variant="outline" className="border-[#1E2942] rounded-xl text-slate-300 hover:bg-slate-800" onClick={() => setFechamentoOpen(false)}>Voltar ao Caixa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* E. MODAL DE CHECKOUT/PAGAMENTOS */}
      <PDVPaymentModal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} total={total} items={items} onSuccess={handleSuccessVenda} />

    </div>
  );
};

export default PDVPage;

