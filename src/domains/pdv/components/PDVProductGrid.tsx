import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Plus, Cookie, Coffee, CupSoda, Croissant, Sandwich, Package, Cigarette, Loader2, Beer, Pill, Box, Coins, Percent } from "lucide-react";

export interface PDVProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  icon?: React.ReactNode;
  image?: string;
}

const CATEGORIES = [
  { id: "todos", label: "Todos" },
  { id: "café", label: "Café" },
  { id: "bebidas", label: "Bebidas" },
  { id: "doces", label: "Doces" },
  { id: "chocolate", label: "Chocolate" },
  { id: "salgadinhos", label: "Salgadinhos" },
  { id: "promoção funcion.", label: "Promoção Funcion." },
  { id: "cigarro", label: "Cigarro" },
  { id: "cerveja", label: "Cerveja" },
  { id: "biscoito", label: "Biscoito" },
  { id: "remedio", label: "Remédio" },
  { id: "armario", label: "Armário" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "outros", label: "Outros" }
];

export function getProductIcon(category: string, name: string): React.ReactNode {
  const c = category.toLowerCase();
  const n = name.toLowerCase();
  
  if (c.includes("promoção") || c.includes("promoc") || c.includes("funcion")) {
    return <Percent className="w-6 h-6 text-orange-400" />;
  }
  if (c.includes("café") || c.includes("cafe") || n.includes("café") || n.includes("cafe")) {
    return <Coffee className="w-6 h-6 text-amber-500" />;
  }
  if (c.includes("cerveja") || n.includes("cerveja") || n.includes("skol") || n.includes("brahma") || n.includes("original") || n.includes("corona") || n.includes("spaten") || n.includes("stella") || n.includes("eisenbahn")) {
    return <Beer className="w-6 h-6 text-yellow-400" />;
  }
  if (c.includes("bebida") || n.includes("água") || n.includes("agua") || n.includes("suco") || n.includes("coca") || n.includes("refrigerante") || n.includes("fanta") || n.includes("itambezinho") || n.includes("gatorade") || n.includes("power ade") || n.includes("leão")) {
    return <CupSoda className="w-6 h-6 text-cyan-400" />;
  }
  if (c.includes("doce") || n.includes("bala") || n.includes("doce") || n.includes("pudim") || n.includes("bolo") || n.includes("trident") || n.includes("paçoquita") || n.includes("halls") || n.includes("icekiss") || n.includes("tic tac") || n.includes("pirulito")) {
    return <Croissant className="w-6 h-6 text-pink-400" />;
  }
  if (c.includes("chocolate") || n.includes("snickers") || n.includes("talento") || n.includes("ouro branco") || n.includes("trento") || n.includes("sonho de valsa") || n.includes("prestigio") || n.includes("baton") || n.includes("kit kat")) {
    return <Cookie className="w-6 h-6 text-purple-400" />;
  }
  if (c.includes("biscoito") || n.includes("biscoito") || n.includes("cookies") || n.includes("teens")) {
    return <Cookie className="w-6 h-6 text-rose-400" />;
  }
  if (c.includes("salgadinho") || c.includes("salgados") || n.includes("salgado") || n.includes("pringles") || n.includes("elma") || n.includes("batata") || n.includes("coxinha") || n.includes("pipoca") || n.includes("torcida") || n.includes("pururuca") || n.includes("torresmo") || n.includes("amendoim") || n.includes("doritos") || n.includes("ruffles")) {
    return <Sandwich className="w-6 h-6 text-emerald-400" />;
  }
  if (c.includes("cigarro") || n.includes("cigarro") || n.includes("porto faria") || n.includes("dunhill") || n.includes("strike") || n.includes("rothmans") || n.includes("isqueiro")) {
    return <Cigarette className="w-6 h-6 text-yellow-500" />;
  }
  if (c.includes("remedio") || n.includes("dorflex") || n.includes("dipirona") || n.includes("dramin") || n.includes("sonrisal") || n.includes("eno")) {
    return <Pill className="w-6 h-6 text-red-400" />;
  }
  if (c.includes("armario") || n.includes("armario") || n.includes("manta") || n.includes("baralho") || n.includes("escova") || n.includes("sabonete") || n.includes("protetor")) {
    return <Box className="w-6 h-6 text-lime-400" />;
  }
  if (c.includes("dinheiro") || n.includes("dinheiro") || /^\d+([,.]\d+)?$/.test(n)) {
    return <Coins className="w-6 h-6 text-emerald-500 animate-pulse" />;
  }
  return <Package className="w-6 h-6 text-slate-400" />;
}

interface Props {
  products: PDVProduct[];
  searchQuery: string;
  activeCategory: string;
  onCategoryChange: (c: string) => void;
  onAddToCart: (p: PDVProduct) => void;
  isLoading?: boolean;
}

export const PDVProductGrid: React.FC<Props> = ({
  products,
  searchQuery,
  activeCategory,
  onCategoryChange,
  onAddToCart,
  isLoading = false
}) => {
  const filtered = products.filter((p) => {
    const matchesCat = activeCategory === "todos" || p.category === activeCategory;
    const matchesSearch =
      searchQuery.trim() === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.includes(searchQuery);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Categories Horizontal Selector */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-1 shrink-0 scrollbar-thin select-none">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.id}
            size="sm"
            variant={activeCategory === cat.id ? "default" : "outline"}
            className={`text-xs rounded-full px-4 py-1 h-8 whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? "bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md shadow-emerald-600/10"
                : "border-[#1E2942] text-slate-400 hover:text-emerald-400 bg-[#1C2541]/20 hover:bg-[#1C2541]/40"
            }`}
            onClick={() => onCategoryChange(cat.id)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Grid Container */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-2" />
          <p className="text-xs uppercase tracking-widest font-bold">Carregando catálogo do Eyemobile...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto pb-2 flex-1 scrollbar-thin">
          {filtered.map((product) => {
            const icon = getProductIcon(product.category, product.name);
            return (
              <button
                key={product.id}
                onClick={() => onAddToCart(product)}
                className="group flex flex-col items-center p-4 bg-[#1C2541]/40 border border-[#1E2942]/60 rounded-2xl hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all active:scale-95 text-left relative"
              >
                <div className="w-14 h-14 rounded-xl bg-slate-800/60 flex items-center justify-center text-emerald-400 mb-3 group-hover:bg-emerald-500/10 transition-colors overflow-hidden">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const placeholder = parent.querySelector(".image-fallback");
                          if (placeholder) {
                            placeholder.classList.remove("hidden");
                          }
                        }
                      }}
                    />
                  ) : null}
                  <div className={`image-fallback ${product.image ? "hidden" : ""}`}>
                    {icon}
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-200 text-center leading-tight mb-2 h-8 line-clamp-2">
                  {product.name}
                </p>
                <p className="text-sm font-extrabold text-emerald-400">
                  {product.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-12">
          <Package className="w-10 h-10 mb-2 opacity-50 text-slate-400" />
          <p className="text-sm font-medium">Nenhum produto encontrado</p>
        </div>
      )}
    </div>
  );
};
