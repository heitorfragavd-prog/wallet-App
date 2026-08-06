import {
  // Alimentação / Comida
  Utensils,
  Coffee,
  Pizza,
  Sandwich,
  Apple,
  // Transporte
  Car,
  Bus,
  Bike,
  Train,
  Fuel,
  // Moradia
  Home,
  Building,
  Key,
  // Serviços / Contas
  Wifi,
  Smartphone,
  Tv,
  Droplets,
  Zap,
  // Saúde / Beleza
  HeartPulse,
  Pill,
  Dumbbell,
  Sparkles,
  // Educação
  GraduationCap,
  BookOpen,
  // Lazer / Entretenimento
  Film,
  Music,
  Gamepad2,
  Ticket,
  // Compras / Varejo
  ShoppingBag,
  ShoppingCart,
  Package,
  // Finanças / Renda
  DollarSign,
  Wallet,
  Banknote,
  Coins,
  CreditCard,
  PiggyBank,
  // Investimentos
  TrendingUp,
  PieChart,
  BarChart3,
  // Salário / Trabalho
  Briefcase,
  Laptop,
  // Viagens
  Plane,
  MapPin,
  Suitcase,
  // Pets
  Bone,
  // Presentes / Doações
  Gift,
  Heart,
  // Impostos / Taxas
  FileText,
  Receipt,
  // Seguros
  ShieldCheck,
  // Manutenção
  Wrench,
  // Genérico / Padrão
  Tag,
  Circle,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

export interface CategoriaIconMap {
  nome: string;
  icone: LucideIcon;
  palavrasChave: string[];
}

const ICON_MAP: CategoriaIconMap[] = [
  // RECEITAS
  { nome: "Salário", icone: Briefcase, palavrasChave: ["salario", "salário", "vencimento", "folha", "pagamento", "pro labore", "pro-labore"] },
  { nome: "Freelance", icone: Laptop, palavrasChave: ["freelance", "freela", "renda extra", "bico", "trabalho extra", "home office"] },
  { nome: "Investimentos", icone: TrendingUp, palavrasChave: ["investimento", "investimentos", "rendimento", "dividendo", "juros", "ações", "fundo", "cdb", "tesouro", "cripto", "crypto", "trade"] },
  { nome: "Aluguel Recebido", icone: Home, palavrasChave: ["aluguel recebido", "aluguel", "locação", "locacao", "imóvel", "imovel", "aluguel"] },
  { nome: "Vendas", icone: ShoppingBag, palavrasChave: ["venda", "vendas", "revenda", "e-commerce", "marketplace", "mercado livre", "shopee"] },
  { nome: "Restituição", icone: FileText, palavrasChave: ["restituição", "restituicao", "imposto de renda", "irpf", "devolução", "devolucao"] },
  { nome: "Presente Recebido", icone: Gift, palavrasChave: ["presente", "presente recebido", "doação recebida", "doacao recebida"] },
  { nome: "Reembolso", icone: Receipt, palavrasChave: ["reembolso", "estorno", "cashback", "devolução dinheiro", "devolucao dinheiro"] },
  { nome: "Pensão", icone: Heart, palavrasChave: ["pensão", "pensao", "alimentos", "pensão alimentícia", "pensao alimenticia"] },
  { nome: "Aposentadoria", icone: PiggyBank, palavrasChave: ["aposentadoria", "inss", "previdência", "previdencia", "benefício", "beneficio"] },

  // DESPESAS
  { nome: "Alimentação", icone: Utensils, palavrasChave: ["alimentação", "alimentacao", "comida", "supermercado", "mercado", "mercearia", "restaurante", "lanche", "ifood", "uber eats", "rappi", "padaria", "açougue", "acougue", "hortifruti"] },
  { nome: "Café", icone: Coffee, palavrasChave: ["café", "cafe", "cafeteria", "starbucks", "cafezinho"] },
  { nome: "Transporte", icone: Car, palavrasChave: ["transporte", "uber", "99", "taxi", "táxi", "ônibus", "onibus", "metrô", "metro", "trem", "combustível", "combustivel", "gasolina", "etanol", "posto", "estacionamento", "pedágio", "pedagio", "ipva", "licenciamento", "dpvat", "seguro auto", "manutenção carro", "manutencao carro", "carro"] },
  { nome: "Moradia", icone: Home, palavrasChave: ["moradia", "aluguel", "condomínio", "condominio", "iptu", "financiamento", "casa", "apartamento", "imóvel", "imovel", "reforma", "manutenção casa", "manutencao casa"] },
  { nome: "Água", icone: Droplets, palavrasChave: ["água", "agua", "sabesp", "conta de água", "conta de agua", "hidro"] },
  { nome: "Luz / Energia", icone: Zap, palavrasChave: ["luz", "energia", "eletricidade", "conta de luz", "enel", "light", "cemig", "cpfl", "eletropaulo"] },
  { nome: "Internet", icone: Wifi, palavrasChave: ["internet", "banda larga", "fibra", "wifi", "wi-fi", "provedor", "claro", "vivo", "oi", "tim", "sky"] },
  { nome: "Celular / Telefone", icone: Smartphone, palavrasChave: ["celular", "telefone", "plano", "recarga", "vivo", "claro", "tim", "oi", "whatsapp"] },
  { nome: "TV / Streaming", icone: Tv, palavrasChave: ["tv", "streaming", "netflix", "spotify", "disney", "amazon prime", "globoplay", "hbo", "paramount", "youtube premium", "deezer", "tv a cabo", "tv por assinatura"] },
  { nome: "Saúde", icone: HeartPulse, palavrasChave: ["saúde", "saude", "médico", "medico", "hospital", "clínica", "clinica", "exame", "remédio", "remedio", "farmácia", "farmacia", "drogaria", "plano de saúde", "plano de saude", "unimed", "amil", "bradesco saúde", "sulamerica", "odontologia", "dentista", "psicólogo", "psicologo", "terapia"] },
  { nome: "Educação", icone: GraduationCap, palavrasChave: ["educação", "educacao", "escola", "faculdade", "universidade", "curso", "pós", "pos", "mestrado", "doutorado", "mba", "inglês", "ingles", "escola filhos", "material escolar", "livro", "apostila"] },
  { nome: "Lazer", icone: Film, palavrasChave: ["lazer", "cinema", "teatro", "show", "parque", "viagem", "passeio", "balada", "bar", "happy hour", "jogo", "games", "steam", "playstation", "xbox", "nintendo"] },
  { nome: "Compras", icone: ShoppingCart, palavrasChave: ["compras", "shopping", "loja", "magazine", "casas bahia", "americanas", "submarino", "mercado livre", "shopee", "amazon", "roupa", "calçado", "calcado", "vestuário", "vestuario"] },
  { nome: "Beleza / Estética", icone: Sparkles, palavrasChave: ["beleza", "estética", "estetica", "cabelo", "cabeleireiro", "salo", "salão", "manicure", "pedicure", "depilação", "depilacao", "maquiagem", "cosméticos", "cosmeticos", "perfume", "barbearia"] },
  { nome: "Academia / Esporte", icone: Dumbbell, palavrasChave: ["academia", "ginástica", "ginastica", "crossfit", "pilates", "yoga", "natação", "natacao", "corrida", "personal", "esporte", "fitness"] },
  { nome: "Pet", icone: Bone, palavrasChave: ["pet", "cachorro", "gato", "veterinário", "veterinario", "ração", "racao", "petshop", "banho", "tosa"] },
  { nome: "Impostos / Taxas", icone: FileText, palavrasChave: ["imposto", "taxa", "tarifa", "iptu", "ipva", "dpvat", "licenciamento", "certidão", "certidao", "cartório", "cartorio", "boleto", "tarifa bancária", "tarifa bancaria", "anuidade", "iof"] },
  { nome: "Seguros", icone: ShieldCheck, palavrasChave: ["seguro", "seguro de vida", "seguro residencial", "seguro auto", "previdência privada", "previdencia privada"] },
  { nome: "Assinaturas", icone: CreditCard, palavrasChave: ["assinatura", "assinaturas", "recorrente", "mensalidade", "anuidade", "prime", "spotify", "netflix", "gympass"] },
  { nome: "Educação Filhos", icone: BookOpen, palavrasChave: ["escola filho", "creche", "berçario", "bercario", "material filho", "uniforme", "lancheira"] },
  { nome: "Viagem", icone: Plane, palavrasChave: ["viagem", "passagem", "hospedagem", "hotel", "pousada", "airbnb", "aluguel temporada", "turismo", "férias", "ferias"] },
  { nome: "Presentes / Doações", icone: Gift, palavrasChave: ["presente", "doação", "doacao", "caridade", "ong", "igreja", "dízimo", "dizimo", "oferta"] },
  { nome: "Manutenção", icone: Wrench, palavrasChave: ["manutenção", "manutencao", "reparo", "conserto", "encanador", "eletricista", "pintor", "dedetização", "dedetizacao"] },
  { nome: "Outros", icone: Tag, palavrasChave: ["outros", "diversos", "variados", "miscelânea", "miscelanea"] },
];

// Ícones padrão por tipo (fallback)
export const DEFAULT_ICONS = {
  receita: DollarSign,
  despesa: ShoppingCart,
};

// Normaliza string para comparação
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .trim();
}

// Encontra o ícone mais adequado baseado no nome da categoria
export function getIconForCategoria(nome: string, tipo: "receita" | "despesa"): LucideIcon {
  const normalized = normalize(nome);

  // 1. Match exato de palavra-chave
  for (const entry of ICON_MAP) {
    for (const kw of entry.palavrasChave) {
      if (normalized.includes(normalize(kw))) {
        return entry.icone;
      }
    }
  }

  // 2. Match parcial do nome da categoria no mapa
  for (const entry of ICON_MAP) {
    if (normalized.includes(normalize(entry.nome))) {
      return entry.icone;
    }
  }

  // 3. Fallback por tipo
  return DEFAULT_ICONS[tipo];
}

// Retorna o nome do ícone (string) para salvar no banco
export function getIconNameForCategoria(nome: string, tipo: "receita" | "despesa"): string {
  const icon = getIconForCategoria(nome, tipo);
  // Pega o nome da função/componente (ex: "Utensils", "Home", "Car")
  return icon.displayName || icon.name || "Tag";
}

// Exporta o mapa completo para uso no seletor visual (futuro)
export { ICON_MAP };