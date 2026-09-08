# Arquitetura do Wallet App

Este documento estabelece as diretrizes canônicas de organização arquitetural, fronteiras entre camadas e convenções para inclusão de novo código na aplicação.

---

## 1. Visão Geral das Camadas

```text
src/
├── core/            # Infraestrutura transversal e fundações (logging, erros, telemetria)
├── shared/          # Código agnóstico compartilhado entre múltiplos domínios (UI, layouts, utils)
├── integrations/    # Clientes de serviços externos e tipos de codegen (Supabase, SDKs)
├── domains/         # Módulos de negócio autocontidos (finance, ia, vehicles, etc.)
│   └── <domain>/
│       ├── components/  # Componentes visuais específicos do domínio
│       ├── hooks/       # Hooks de estado e dados específicos do domínio
│       ├── services/    # Regras de negócio, cálculos e integrações locais
│       ├── types/       # DTOs, schemas e tipagens de domínio
│       └── utils/       # Helpers exclusivos do domínio
├── pages/           # Composição e orquestração de rotas/telas do React Router
├── contexts/        # Contextos globais da aplicação (Workspace, Privacidade)
└── lib/             # Utilitários globais puros (formatação, classes cn)
```

---

## 2. Responsabilidades por Camada

### 2.1 `src/core/` (Infraestrutura Transversal)
* **Responsabilidade**: Serviços centrais de runtime, observabilidade, monitoramento de exceções e telemetria da aplicação.
* **Componentes**: `LoggerService`, `ErrorService`, `correlationId`, `sanitizer`.
* **Regra Estrita**: O `core` **NUNCA** deve importar nada de `src/domains/` ou `src/pages/`. Ele é 100% agnóstico a regras de negócio financeiras ou operacionais.

### 2.2 `src/shared/` (Componentes e Utilitários Compartilhados)
* **Responsabilidade**: Biblioteca de componentes de UI reutilizáveis (design system / shadcn), layouts base de aplicação, hooks de infraestrutura de interface e helpers genéricos.
* **Componentes**: `src/shared/components/ui/`, `src/shared/components/layouts/DashboardLayout.tsx`, `src/shared/hooks/use-toast.ts`.
* **Regra Estrita**: `shared` não deve acoplar regras de negócio de domínios específicos. Caso um layout precise orquestrar dados de domínio no cabeçalho ou menu, deve fazê-lo por injeção de dependência ou composição em nível de rota.

### 2.3 `src/domains/<domain>/` (Módulos de Negócio Autocontidos)
* **Responsabilidade**: Regras de negócio, chamadas de API de domínio, componentes visuais especializados, hooks de mutação/leitura e tipos de dados específicos.
* **Domínios Oficiais**:
  * `finance`: Contas, cartões, despesas, receitas, transações, investimentos, metas, DRE, conciliação e Pluggy.
  * `ia`: Wallet Agent, chat financeiro, assistente operacional, vision e telemetria LLM.
  * `vehicles`: Gestão de frota, planos de manutenção preventiva e manutenções customizadas.
  * `divipay`: Integração financeira com o gateway Divipay, conciliação e saques.
  * `admin`: Gestão de planos, limites, usuários, webhooks e painel administrativo.
  * `notifications`: Gestão de notificações push, logs de envio e canais de mensageria.
  * `pdv`: Integrações de ponto de venda e catálogo rápido.
* **Regras**: Cada domínio deve encapsular sua complexidade. Domínios podem consumir `core`, `shared` e `integrations`. Dependências entre domínios devem ser minimizadas e ocorrer apenas por contratos públicos documentados.

### 2.4 `src/integrations/` (Clientes Externos e SDKs)
* **Responsabilidade**: Clientes de infraestrutura e conexões de terceiros compartilhadas.
* **Componentes**: Cliente oficial do Supabase (`client.ts`), tipos gerados do banco de dados (`types.ts`).
* **Regra Estrita**: Não deve conter lógica de apresentação ou regras monetárias da aplicação.

### 2.5 `src/pages/` (Composição e Roteamento)
* **Responsabilidade**: Pontos de entrada das rotas registradas em `App.tsx`.
* **Regra Estrita**: Páginas devem atuar prioritariamente como orquestradoras e compositoras de componentes de domínio e layouts, evitando concentrar milhares de linhas de regras de cálculo imperativo diretamente no componente de tela.

---

## 3. Matriz de Dependências Permitidas

| Camada de Origem | Pode Importar de: | NUNCA Pode Importar de: |
| :--- | :--- | :--- |
| **`core`** | Bibliotecas externas | `domains`, `pages`, `shared`, `contexts` |
| **`shared`** | `core`, `lib`, bibliotecas externas | Detalhes internos de `domains` específicos |
| **`integrations`** | Bibliotecas externas, types Supabase | `domains`, `pages` |
| **`domains/<A>`** | `core`, `shared`, `integrations`, `lib`, `contexts` | Código privado de outro `domains/<B>` |
| **`pages`** | `domains`, `shared`, `core`, `contexts`, `lib` | — |

---

## 4. Guia para Adição de Novo Código

Ao implementar uma nova funcionalidade ou refatoração, siga a árvore de decisão:

1. **É infraestrutura transversal (logging, erros, telemetria, storage)?**
   👉 Coloque em `src/core/`.
2. **É um componente puramente visual, genérico ou reutilizável por 2+ domínios?**
   👉 Coloque em `src/shared/components/` ou `src/shared/utils/`.
3. **Pertence a uma regra de negócio, módulo ou entidade específica (ex: investimentos, dívidas, faturas, veículos)?**
   👉 Coloque dentro do respectivo domínio em `src/domains/<domain>/` (subpastas: `components/`, `hooks/`, `services/`, `types/`).
4. **É uma rota navegável associada a uma URL no browser?**
   👉 Registre o arquivo em `src/pages/` e adicione a rota em `src/App.tsx` com lazy loading (`lazyWithRetry`).
