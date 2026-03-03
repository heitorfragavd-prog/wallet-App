# Wallet Design System Guide

Este documento descreve o sistema de design do Wallet para que possa ser replicado em outros projetos. Inclui cores, tipografia, componentes, padrões de layout e exemplos de código.

## 📋 Índice

1. [Stack Tecnológica](#stack-tecnológica)
2. [Paleta de Cores](#paleta-de-cores)
3. [Tipografia](#tipografia)
4. [Componentes Base](#componentes-base)
5. [Layout e Estrutura](#layout-e-estrutura)
6. [Padrões de Cards](#padrões-de-cards)
7. [Sidebar e Navegação](#sidebar-e-navegação)
8. [Dark Mode](#dark-mode)
9. [Animações e Transições](#animações-e-transições)
10. [Exemplos Práticos](#exemplos-práticos)

---

## Stack Tecnológica

```json
{
  "framework": "React 18 + TypeScript",
  "build": "Vite",
  "styling": "Tailwind CSS + CSS Variables",
  "components": "shadcn/ui (Radix UI)",
  "icons": "Lucide React",
  "utilities": [
    "class-variance-authority",
    "clsx", 
    "tailwind-merge"
  ]
}
```

### Dependências Essenciais

```bash
npm install tailwindcss postcss autoprefixer
npm install @radix-ui/react-slot
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react
npm install tailwindcss-animate
```

---

## Paleta de Cores

### Variáveis CSS (Light Mode)

```css
:root {
  /* Cores Base */
  --background: 0 0% 100%;           /* Branco */
  --foreground: 222.2 84% 4.9%;      /* Texto escuro */
  
  /* Cards e Superfícies */
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  
  /* Cores Primárias */
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  
  /* Cores Secundárias */
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  
  /* Estados */
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  
  /* Bordas e Inputs */
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  
  /* Raio de Borda */
  --radius: 0.5rem;
  
  /* Sidebar */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 240 5.3% 26.1%;
  --sidebar-primary: 240 5.9% 10%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 240 4.8% 95.9%;
  --sidebar-accent-foreground: 240 5.9% 10%;
  --sidebar-border: 220 13% 91%;
  --sidebar-ring: 217.2 91.2% 59.8%;
}
```

### Variáveis CSS (Dark Mode)

```css
.dark {
  --background: 224 71% 4%;          /* Azul escuro profundo */
  --foreground: 213 31% 91%;         /* Texto claro */
  
  --card: 224 71% 6%;                /* Cards levemente mais claros */
  --card-foreground: 213 31% 91%;
  --popover: 224 71% 6%;
  --popover-foreground: 213 31% 91%;
  
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  
  --secondary: 222 47% 11%;
  --secondary-foreground: 210 40% 98%;
  
  --muted: 223 47% 11%;
  --muted-foreground: 215 20% 65%;
  
  --accent: 222 47% 11%;
  --accent-foreground: 210 40% 98%;
  
  --destructive: 0 63% 31%;
  --destructive-foreground: 210 40% 98%;
  
  --border: 216 34% 24%;
  --input: 216 34% 24%;
  --ring: 24 95% 53%;                /* Laranja - cor de destaque */
  
  /* Sidebar Dark */
  --sidebar-background: 224 71% 6%;
  --sidebar-foreground: 213 31% 91%;
  --sidebar-primary: 24 95% 53%;     /* Laranja */
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 222 47% 11%;
  --sidebar-accent-foreground: 213 31% 91%;
  --sidebar-border: 216 34% 17%;
  --sidebar-ring: 24 95% 53%;
}
```

### Cores Semânticas (Tailwind Classes)

| Uso | Classe Light | Classe Dark | Hex Aproximado |
|-----|--------------|-------------|----------------|
| Sucesso/Receitas | `text-green-500` | `text-green-500` | #22c55e |
| Erro/Despesas | `text-red-500` | `text-red-500` | #ef4444 |
| Alerta | `text-yellow-500` | `text-yellow-600` | #eab308 |
| Info/Saldo | `text-blue-500` | `text-blue-500` | #3b82f6 |
| Destaque Principal | `text-orange-500` | `text-orange-500` | #f97316 |
| Secundário | `text-purple-500` | `text-violet-500` | #a855f7 |

---

## Tipografia

### Configuração Base

```css
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

### Escalas de Texto

```jsx
// Títulos
<h1 className="text-2xl font-bold text-foreground">Título Principal</h1>
<h2 className="text-xl font-semibold text-foreground">Subtítulo</h2>
<h3 className="text-lg font-medium text-foreground">Seção</h3>

// Corpo
<p className="text-sm text-foreground">Texto normal</p>
<p className="text-sm text-muted-foreground">Texto secundário</p>
<p className="text-xs text-muted-foreground">Texto pequeno/labels</p>

// Valores/Números
<span className="text-2xl font-bold">R$ 1.234,56</span>
<span className="text-3xl font-bold tracking-tight">1.234</span>
```

---

## Componentes Base

### Utilitário cn() - Merge de Classes

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### Button Variants

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

### Card Base

```tsx
const Card = ({ className, ...props }) => (
  <div
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
);
```

---

## Layout e Estrutura

### Layout Principal (Dashboard)

```tsx
<div className="min-h-screen bg-background flex relative overflow-x-hidden">
  {/* Sidebar - Fixed */}
  <div className="fixed top-0 left-0 h-screen w-64 bg-card border-r border-border">
    {/* Conteúdo da Sidebar */}
  </div>
  
  {/* Main Content */}
  <div className="flex-1 ml-64 transition-all duration-300">
    <div className="p-4 md:p-6 space-y-6">
      {/* Conteúdo */}
    </div>
  </div>
</div>
```

### Grid de Cards Estatísticos

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* Cards */}
</div>
```

### Grid de Conteúdo Principal

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* Coluna Principal (2/3) */}
  <div className="lg:col-span-2 space-y-4">
    {/* Cards principais */}
  </div>
  
  {/* Coluna Lateral (1/3) */}
  <div className="space-y-4">
    {/* Cards secundários/alertas */}
  </div>
</div>
```

---

## Padrões de Cards

### Stats Card com Gradiente

```tsx
// Cores disponíveis: green, red, blue, purple, orange
const GRADIENT_CLASSES = {
  green: {
    card: 'from-green-500/10 to-green-500/5',
    icon: 'bg-green-500/20 text-green-500',
  },
  red: {
    card: 'from-red-500/10 to-red-500/5',
    icon: 'bg-red-500/20 text-red-500',
  },
  blue: {
    card: 'from-blue-500/10 to-blue-500/5',
    icon: 'bg-blue-500/20 text-blue-500',
  },
  purple: {
    card: 'from-purple-500/10 to-purple-500/5',
    icon: 'bg-purple-500/20 text-purple-500',
  },
  orange: {
    card: 'from-orange-500/10 to-orange-500/5',
    icon: 'bg-orange-500/20 text-orange-500',
  },
};

// Exemplo de uso
<Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 to-green-500/5">
  <CardContent className="p-5">
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Receitas</p>
        <p className="text-2xl font-bold text-foreground">R$ 5.000,00</p>
      </div>
      <div className="p-3 rounded-xl bg-green-500/20">
        <ArrowUpRight className="w-5 h-5 text-green-500" />
      </div>
    </div>
  </CardContent>
</Card>
```

### Card de Lista com Header

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <div className="flex items-center gap-2">
      <Clock className="w-5 h-5 text-orange-500" />
      <CardTitle className="text-lg">Últimas Transações</CardTitle>
    </div>
    <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-600">
      Ver todas <ChevronRight className="w-4 h-4 ml-1" />
    </Button>
  </CardHeader>
  <CardContent>
    {/* Lista de itens */}
  </CardContent>
</Card>
```

### Card de Alerta (Dívidas/Estoque)

```tsx
// Card com borda colorida quando há alertas
<Card className={items.length > 0 ? "border-red-500/30 bg-red-500/5" : ""}>
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <div className="flex items-center gap-2">
      <div className={`p-2 rounded-lg ${items.length > 0 ? "bg-red-500/20" : "bg-muted"}`}>
        <CreditCard className={`w-4 h-4 ${items.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
      </div>
      <div>
        <CardTitle className="text-sm font-medium">Dívidas Vencidas</CardTitle>
        <p className="text-xs text-muted-foreground">{items.length} pendentes</p>
      </div>
    </div>
  </CardHeader>
</Card>
```

### Item de Lista

```tsx
<div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
  {/* Ícone */}
  <div className="p-2 rounded-lg bg-green-500/10">
    <DollarSign className="w-4 h-4 text-green-500" />
  </div>
  
  {/* Conteúdo */}
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium text-foreground truncate">Descrição</p>
    <div className="flex items-center gap-2 mt-0.5">
      <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0">
        Categoria
      </Badge>
      <span className="text-xs text-muted-foreground">01/01/2025</span>
    </div>
  </div>
  
  {/* Valor */}
  <span className="text-sm font-semibold text-green-500 whitespace-nowrap">
    +R$ 1.000,00
  </span>
</div>
```

---

## Sidebar e Navegação

### Estrutura da Sidebar

```tsx
<div className="fixed top-0 left-0 h-screen w-64 bg-card border-r border-border flex flex-col">
  {/* Logo */}
  <div className="p-6 border-b border-border">
    <div className="flex items-center space-x-3">
      <div className="bg-orange-500 rounded-lg p-2">
        <Wallet className="h-6 w-6 text-white" />
      </div>
      <span className="text-xl font-bold text-foreground">Wallet</span>
    </div>
  </div>
  
  {/* Navigation */}
  <nav className="flex-1 p-4 overflow-y-auto">
    <div className="space-y-1">
      {menuItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            "flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors space-x-3",
            isActive
              ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <item.icon className="w-5 h-5 flex-shrink-0" />
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  </nav>
  
  {/* Footer */}
  <div className="p-4 border-t border-border">
    {/* Botões de ação */}
  </div>
</div>
```

### Menu Item Ativo

```tsx
// Estado ativo
className="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"

// Estado normal
className="text-muted-foreground hover:bg-muted hover:text-foreground"
```

---

## Dark Mode

### Configuração Tailwind

```typescript
// tailwind.config.ts
export default {
  darkMode: ["class"],
  // ...
}
```

### ThemeProvider

```tsx
export function ThemeProvider({ children, defaultTheme = 'system' }) {
  const [theme, setTheme] = useState(defaultTheme);
  
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches 
        ? 'dark' 
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### Transição Suave

```css
.theme-transition {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .theme-transition {
    transition: none;
  }
}
```

---

## Animações e Transições

### Transições Padrão

```css
/* Hover em cards e botões */
transition-colors          /* Mudança de cor */
transition-all duration-300 /* Transições gerais */

/* Sidebar collapse */
transition-all duration-300
```

### Scrollbar Customizada

```css
/* Light Mode */
::-webkit-scrollbar {
  width: 12px;
}

::-webkit-scrollbar-track {
  background: linear-gradient(45deg, #f1f5f9, #e2e8f0);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #f97316, #ea580c, #dc2626);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
}

/* Dark Mode */
.dark ::-webkit-scrollbar-track {
  background: linear-gradient(45deg, #1e293b, #0f172a);
}

.dark ::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #f97316, #ea580c, #dc2626);
}
```

---

## Exemplos Práticos

### Header com Avatar e Período

```tsx
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
  <div className="flex items-center gap-4">
    {/* Avatar/Logo */}
    <div className="relative">
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-3 shadow-lg shadow-orange-500/20">
        <Wallet className="w-6 h-6 text-white" />
      </div>
      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
    </div>
    
    {/* Texto */}
    <div>
      <h1 className="text-2xl font-bold text-foreground">Olá, Usuário</h1>
      <p className="text-muted-foreground">Novembro de 2025</p>
    </div>
  </div>
  
  {/* Tabs de Período */}
  <Tabs value={selectedPeriod} onValueChange={setSelectedPeriod}>
    <TabsList className="grid grid-cols-4 bg-muted/50">
      <TabsTrigger 
        value="dia" 
        className="data-[state=active]:bg-orange-500 data-[state=active]:text-white"
      >
        Dia
      </TabsTrigger>
      {/* ... outros triggers */}
    </TabsList>
  </Tabs>
</div>
```

### Badge de Status

```tsx
// Saúde Financeira
const getSaudeFinanceira = (percentual) => {
  if (percentual < 70) return { label: "Excelente", color: "bg-green-500" };
  if (percentual < 85) return { label: "Bom", color: "bg-emerald-500" };
  if (percentual < 95) return { label: "Atenção", color: "bg-yellow-500" };
  return { label: "Crítico", color: "bg-red-500" };
};

<Badge className={`${saude.color} text-white border-0`}>
  {saude.label}
</Badge>
```

### Empty State

```tsx
<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
  <Wallet className="w-10 h-10 mb-2 opacity-20" />
  <p className="text-sm">Nenhuma transação no período</p>
</div>
```

### Loading Skeleton

```tsx
<div className="space-y-3">
  {[...Array(4)].map((_, i) => (
    <div key={i} className="flex items-center gap-4">
      <Skeleton className="w-10 h-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  ))}
</div>
```

---

## Checklist de Implementação

- [ ] Configurar Tailwind CSS com CSS Variables
- [ ] Instalar shadcn/ui e configurar components.json
- [ ] Copiar variáveis CSS para index.css
- [ ] Implementar ThemeProvider
- [ ] Criar utilitário cn()
- [ ] Configurar cores semânticas (green, red, blue, orange, purple)
- [ ] Implementar layout base com sidebar
- [ ] Criar componentes de Card com gradientes
- [ ] Adicionar scrollbar customizada
- [ ] Testar dark mode
- [ ] Verificar responsividade mobile

---

## Recursos Adicionais

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)
- [Radix UI](https://www.radix-ui.com/)
