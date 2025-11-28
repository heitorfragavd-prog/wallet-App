# Design Document: Mobile List UX Improvements

## Overview

Este documento descreve o design para melhorar a experiência do usuário nas listas mobile do sistema. O foco principal é resolver problemas de espaçamento, sobreposição de elementos e inconsistência de layout nas páginas de Receitas, Despesas, Transações e Veículos.

## Architecture

A solução utiliza a arquitetura existente do projeto, modificando apenas os componentes de apresentação nas páginas afetadas. Não há mudanças na camada de dados ou serviços.

```
┌─────────────────────────────────────────────────────────┐
│                    Pages (Presentation)                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│
│  │  Receitas   │ │  Despesas   │ │     Transações      ││
│  └─────────────┘ └─────────────┘ └─────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │                    Veículos                          ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Mobile List Components (New)                │
│  ┌─────────────────────┐ ┌─────────────────────────────┐│
│  │ MobileTransactionCard│ │    MobileVehicleCard       ││
│  └─────────────────────┘ └─────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. MobileTransactionCard

Componente reutilizável para exibir transações (receitas/despesas) em mobile.

```typescript
interface MobileTransactionCardProps {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  categoria?: string;
  data: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}
```

**Layout Structure:**
```
┌────────────────────────────────────────────────┐
│ ┌────┐  Descrição                    ┌──────┐ │
│ │Icon│  ┌─────────┐                  │+R$XX │ │
│ └────┘  │Categoria│  DD/MM/YYYY      └──────┘ │
│         └─────────┘                  ┌──┐┌──┐ │
│                                      │✎ ││🗑│ │
│                                      └──┘└──┘ │
└────────────────────────────────────────────────┘
```

### 2. MobileVehicleCard

Componente para exibir veículos em mobile com layout otimizado.

```typescript
interface MobileVehicleCardProps {
  id: string;
  marca: string;
  modelo: string;
  ano: number;
  placa: string;
  combustivel?: string;
  quilometragem: number;
  onDetails: (id: string) => void;
  onEdit: (id: string) => void;
}
```

**Layout Structure:**
```
┌────────────────────────────────────────────────┐
│ ┌────┐  Marca Modelo                           │
│ │ 🚗 │  Ano • Placa • Combustível              │
│ └────┘  ┌──────────────┐                       │
│         │ XX.XXX km    │                       │
│         └──────────────┘                       │
│ ┌──────────────┐ ┌──────────────┐              │
│ │  ⚙ Detalhes  │ │  ✎ Editar    │              │
│ └──────────────┘ └──────────────┘              │
└────────────────────────────────────────────────┘
```

## Data Models

Não há alterações nos modelos de dados existentes. Os componentes utilizam as interfaces já definidas:

- `Receita` / `Despesa` de `@/domains/finance/types`
- `Veiculo` de `@/domains/vehicles/hooks/useVeiculos`

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Analysis

Após análise dos critérios de aceitação, a maioria dos requisitos são relacionados a layout visual e CSS, que não são facilmente testáveis como propriedades formais. No entanto, identificamos uma propriedade testável:

**Property 1: Date formatting consistency**
*For any* valid date string input, the date formatting function SHALL produce output in the format DD/MM/YYYY consistently across all pages.
**Validates: Requirements 3.3**

### Non-Testable Requirements

Os demais requisitos (1.1-1.4, 2.1-2.4, 3.1-3.2, 3.4, 4.1-4.4) são requisitos de layout visual que serão validados através de:
- Revisão visual manual
- Testes de snapshot (opcional)
- Verificação de classes CSS aplicadas

## Error Handling

- Se dados obrigatórios estiverem ausentes (ex: descrição vazia), exibir placeholder "—"
- Se valor for inválido, exibir "R$ 0,00"
- Se data for inválida, exibir "Data inválida"

## Testing Strategy

### Unit Tests
- Testar função `formatarData` com diferentes inputs
- Testar renderização dos componentes com props válidas
- Testar comportamento dos callbacks (onEdit, onDelete)

### Property-Based Tests
- **Framework**: Vitest com fast-check
- **Property 1**: Testar que `formatarData` sempre produz output no formato DD/MM/YYYY para qualquer data válida
- Configurar mínimo de 100 iterações por teste
- Cada teste deve referenciar a propriedade do design: `**Feature: mobile-list-ux-improvements, Property 1: Date formatting consistency**`

### Visual Testing
- Verificação manual em diferentes tamanhos de tela
- Screenshots comparativos antes/depois das mudanças
