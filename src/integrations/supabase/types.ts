export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_token_reservations: {
        Row: {
          action: string
          actual_tokens: number | null
          bucket_key: string
          created_at: string
          outcome: string | null
          reconciled_at: string | null
          reservation_id: string | null
          reserved_tokens: number
          status: string
          user_id: string
          window_start: string
          workspace_id: string | null
        }
        Insert: {
          action: string
          actual_tokens?: number | null
          bucket_key: string
          created_at?: string
          outcome?: string | null
          reconciled_at?: string | null
          reservation_id?: string | null
          reserved_tokens: number
          status: string
          user_id: string
          window_start: string
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actual_tokens?: number | null
          bucket_key?: string
          created_at?: string
          outcome?: string | null
          reconciled_at?: string | null
          reservation_id?: string | null
          reserved_tokens?: number
          status?: string
          user_id?: string
          window_start?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      alertas_preco_pendentes: {
        Row: {
          created_at: string | null
          custo_anterior: number | null
          custo_novo: number | null
          data_criacao: string | null
          data_resolucao: string | null
          id: string | null
          lembretes_enviados: number | null
          margem_real_percentual: number | null
          nf_id: string | null
          preco_definido_usuario: number | null
          preco_sugerido: number | null
          preco_venda_atual: number | null
          produto_codigo: string | null
          produto_descricao: string | null
          produto_eyemobile_id: string
          status: string | null
          ultimo_lembrete: string | null
          updated_at: string | null
          user_id: string | null
          variacao_custo_percentual: number | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          custo_anterior?: number | null
          custo_novo?: number | null
          data_criacao?: string | null
          data_resolucao?: string | null
          id?: string | null
          lembretes_enviados?: number | null
          margem_real_percentual?: number | null
          nf_id?: string | null
          preco_definido_usuario?: number | null
          preco_sugerido?: number | null
          preco_venda_atual?: number | null
          produto_codigo?: string | null
          produto_descricao?: string | null
          produto_eyemobile_id: string
          status?: string | null
          ultimo_lembrete?: string | null
          updated_at?: string | null
          user_id?: string | null
          variacao_custo_percentual?: number | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          custo_anterior?: number | null
          custo_novo?: number | null
          data_criacao?: string | null
          data_resolucao?: string | null
          id?: string | null
          lembretes_enviados?: number | null
          margem_real_percentual?: number | null
          nf_id?: string | null
          preco_definido_usuario?: number | null
          preco_sugerido?: number | null
          preco_venda_atual?: number | null
          produto_codigo?: string | null
          produto_descricao?: string | null
          produto_eyemobile_id?: string
          status?: string | null
          ultimo_lembrete?: string | null
          updated_at?: string | null
          user_id?: string | null
          variacao_custo_percentual?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      audio_transcricoes: {
        Row: {
          chat_id: number | null
          comando_detectado: string | null
          created_at: string | null
          duracao_segundos: number | null
          file_id: string | null
          id: string | null
          sucesso: boolean | null
          transcricao: string | null
          user_id: string | null
        }
        Insert: {
          chat_id?: number | null
          comando_detectado?: string | null
          created_at?: string | null
          duracao_segundos?: number | null
          file_id?: string | null
          id?: string | null
          sucesso?: boolean | null
          transcricao?: string | null
          user_id?: string | null
        }
        Update: {
          chat_id?: number | null
          comando_detectado?: string | null
          created_at?: string | null
          duracao_segundos?: number | null
          file_id?: string | null
          id?: string | null
          sucesso?: boolean | null
          transcricao?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      centros_custo: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string | null
          nome: string
          orcamento_mensal: number | null
          responsavel: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string | null
          nome: string
          orcamento_mensal?: number | null
          responsavel?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string | null
          nome?: string
          orcamento_mensal?: number | null
          responsavel?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      channel_mappings: {
        Row: {
          access_level: string
          channel_config: Json
          channel_id: string
          channel_type: string
          created_at: string
          id: string | null
          is_active: boolean
          nome_exibicao: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          access_level: string
          channel_config: Json
          channel_id: string
          channel_type: string
          created_at?: string
          id?: string | null
          is_active: boolean
          nome_exibicao?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          access_level?: string
          channel_config?: Json
          channel_id?: string
          channel_type?: string
          created_at?: string
          id?: string | null
          is_active?: boolean
          nome_exibicao?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      colaborador_acerto_itens: {
        Row: {
          acerto_id: string
          categoria_id: string | null
          created_at: string
          descricao: string
          escala_id: string | null
          id: string | null
          natureza: string
          valor: number
          workspace_id: string
        }
        Insert: {
          acerto_id: string
          categoria_id?: string | null
          created_at?: string
          descricao: string
          escala_id?: string | null
          id?: string | null
          natureza: string
          valor: number
          workspace_id: string
        }
        Update: {
          acerto_id?: string
          categoria_id?: string | null
          created_at?: string
          descricao?: string
          escala_id?: string | null
          id?: string | null
          natureza?: string
          valor?: number
          workspace_id?: string
        }
        Relationships: []
      }
      colaborador_acertos: {
        Row: {
          colaborador_id: string
          created_at: string
          despesa_id: string | null
          id: string | null
          periodo_fim: string
          periodo_inicio: string
          pix_chave_snapshot: string | null
          status: string
          tipo: string
          updated_at: string
          valor_total: number
          vencimento: string
          workspace_id: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          despesa_id?: string | null
          id?: string | null
          periodo_fim: string
          periodo_inicio: string
          pix_chave_snapshot?: string | null
          status: string
          tipo: string
          updated_at?: string
          valor_total: number
          vencimento: string
          workspace_id: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          despesa_id?: string | null
          id?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          pix_chave_snapshot?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number
          vencimento?: string
          workspace_id?: string
        }
        Relationships: []
      }
      colaborador_ajustes: {
        Row: {
          acerto_origem_id: string | null
          aplicado_em_acerto_id: string | null
          colaborador_id: string
          created_at: string
          id: string | null
          motivo: string
          updated_at: string
          valor: number
          workspace_id: string
        }
        Insert: {
          acerto_origem_id?: string | null
          aplicado_em_acerto_id?: string | null
          colaborador_id: string
          created_at?: string
          id?: string | null
          motivo: string
          updated_at?: string
          valor: number
          workspace_id: string
        }
        Update: {
          acerto_origem_id?: string | null
          aplicado_em_acerto_id?: string | null
          colaborador_id?: string
          created_at?: string
          id?: string | null
          motivo?: string
          updated_at?: string
          valor?: number
          workspace_id?: string
        }
        Relationships: []
      }
      colaborador_custos: {
        Row: {
          colaborador_id: string
          created_at: string | null
          data: string
          descricao: string | null
          id: string | null
          lancado_na_despesa: boolean | null
          tipo: string
          valor: number
          workspace_id: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string | null
          data: string
          descricao?: string | null
          id?: string | null
          lancado_na_despesa?: boolean | null
          tipo: string
          valor: number
          workspace_id?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string | null
          data?: string
          descricao?: string | null
          id?: string | null
          lancado_na_despesa?: boolean | null
          tipo?: string
          valor?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      colaborador_escalas: {
        Row: {
          bateu_meta: boolean | null
          colaborador_id: string
          created_at: string | null
          data: string
          id: string | null
          observacao: string | null
          turno: string | null
          valor_diaria: number
          valor_meta: number | null
          valor_total: number
          workspace_id: string
        }
        Insert: {
          bateu_meta?: boolean | null
          colaborador_id: string
          created_at?: string | null
          data: string
          id?: string | null
          observacao?: string | null
          turno?: string | null
          valor_diaria: number
          valor_meta?: number | null
          valor_total: number
          workspace_id: string
        }
        Update: {
          bateu_meta?: boolean | null
          colaborador_id?: string
          created_at?: string | null
          data?: string
          id?: string | null
          observacao?: string | null
          turno?: string | null
          valor_diaria?: number
          valor_meta?: number | null
          valor_total?: number
          workspace_id?: string
        }
        Relationships: []
      }
      colaborador_pagamentos: {
        Row: {
          acerto_id: string
          comprovante_url: string | null
          created_at: string
          divipay_external_id: string | null
          erro_codigo: string | null
          id: string | null
          idempotency_key: string
          origem: string
          paid_at: string | null
          status: string
          taxa: number
          updated_at: string
          valor: number
          workspace_id: string
        }
        Insert: {
          acerto_id: string
          comprovante_url?: string | null
          created_at?: string
          divipay_external_id?: string | null
          erro_codigo?: string | null
          id?: string | null
          idempotency_key: string
          origem: string
          paid_at?: string | null
          status: string
          taxa: number
          updated_at?: string
          valor: number
          workspace_id: string
        }
        Update: {
          acerto_id?: string
          comprovante_url?: string | null
          created_at?: string
          divipay_external_id?: string | null
          erro_codigo?: string | null
          id?: string | null
          idempotency_key?: string
          origem?: string
          paid_at?: string | null
          status?: string
          taxa?: number
          updated_at?: string
          valor?: number
          workspace_id?: string
        }
        Relationships: []
      }
      colaborador_presencas: {
        Row: {
          atraso_minutos: number | null
          colaborador_id: string
          data: string
          horas_trabalhadas: number | null
          id: string | null
          justificativa: string | null
          presente: boolean | null
        }
        Insert: {
          atraso_minutos?: number | null
          colaborador_id: string
          data: string
          horas_trabalhadas?: number | null
          id?: string | null
          justificativa?: string | null
          presente?: boolean | null
        }
        Update: {
          atraso_minutos?: number | null
          colaborador_id?: string
          data?: string
          horas_trabalhadas?: number | null
          id?: string | null
          justificativa?: string | null
          presente?: boolean | null
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          carga_horaria_semanal: number | null
          cargo: string | null
          contato_emergencia_1: string | null
          cpf: string | null
          created_at: string | null
          data_admissao: string | null
          data_demissao: string | null
          dias_experiencia: number | null
          foto_url: string | null
          id: string | null
          nome: string
          outros_beneficios: number | null
          salario_bruto: number | null
          status: string | null
          tipo: string
          updated_at: string | null
          user_id: string | null
          vale_refeicao: number | null
          vale_transporte: number | null
          vale_transporte_diario: number | null
          workspace_id: string
        }
        Insert: {
          carga_horaria_semanal?: number | null
          cargo?: string | null
          contato_emergencia_1?: string | null
          cpf?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_demissao?: string | null
          dias_experiencia?: number | null
          foto_url?: string | null
          id?: string | null
          nome: string
          outros_beneficios?: number | null
          salario_bruto?: number | null
          status?: string | null
          tipo: string
          updated_at?: string | null
          user_id?: string | null
          vale_refeicao?: number | null
          vale_transporte?: number | null
          vale_transporte_diario?: number | null
          workspace_id: string
        }
        Update: {
          carga_horaria_semanal?: number | null
          cargo?: string | null
          contato_emergencia_1?: string | null
          cpf?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_demissao?: string | null
          dias_experiencia?: number | null
          foto_url?: string | null
          id?: string | null
          nome?: string
          outros_beneficios?: number | null
          salario_bruto?: number | null
          status?: string | null
          tipo?: string
          updated_at?: string | null
          user_id?: string | null
          vale_refeicao?: number | null
          vale_transporte?: number | null
          vale_transporte_diario?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      compromissos: {
        Row: {
          created_at: string | null
          data: string
          hora: string | null
          id: string | null
          lembrete: boolean | null
          local: string | null
          repetir: string | null
          titulo: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          data: string
          hora?: string | null
          id?: string | null
          lembrete?: boolean | null
          local?: string | null
          repetir?: string | null
          titulo: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          data?: string
          hora?: string | null
          id?: string | null
          lembrete?: boolean | null
          local?: string | null
          repetir?: string | null
          titulo?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      configuracoes_investimentos: {
        Row: {
          alerta_desbalanceamento: number | null
          created_at: string | null
          id: string | null
          mostrar_liquido_ir: boolean | null
          mostrar_real_ipca: boolean | null
          sweep_caixa_minimo: number | null
          taxa_ipca_anual: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          alerta_desbalanceamento?: number | null
          created_at?: string | null
          id?: string | null
          mostrar_liquido_ir?: boolean | null
          mostrar_real_ipca?: boolean | null
          sweep_caixa_minimo?: number | null
          taxa_ipca_anual?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          alerta_desbalanceamento?: number | null
          created_at?: string | null
          id?: string | null
          mostrar_liquido_ir?: boolean | null
          mostrar_real_ipca?: boolean | null
          sweep_caixa_minimo?: number | null
          taxa_ipca_anual?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      contatos: {
        Row: {
          cnpj_cpf: string | null
          contato_nome: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string | null
          nome: string
          observacoes: string | null
          prazo_pagamento_dias: number | null
          telefone: string | null
          tipo: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string | null
          nome: string
          observacoes?: string | null
          prazo_pagamento_dias?: number | null
          telefone?: string | null
          tipo: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cnpj_cpf?: string | null
          contato_nome?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string | null
          nome?: string
          observacoes?: string | null
          prazo_pagamento_dias?: number | null
          telefone?: string | null
          tipo?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      cotacoes_diarias: {
        Row: {
          codigo: string
          created_at: string | null
          data: string
          fonte: string | null
          id: string | null
          preco: number
          tipo: string
        }
        Insert: {
          codigo: string
          created_at?: string | null
          data: string
          fonte?: string | null
          id?: string | null
          preco: number
          tipo: string
        }
        Update: {
          codigo?: string
          created_at?: string | null
          data?: string
          fonte?: string | null
          id?: string | null
          preco?: number
          tipo?: string
        }
        Relationships: []
      }
      depositos_investimentos: {
        Row: {
          comprovante_url: string | null
          created_at: string | null
          data: string
          id: string | null
          investimento_id: string
          observacoes: string | null
          preco_unitario: number | null
          quantidade: number | null
          user_id: string
          valor: number
          workspace_id: string | null
        }
        Insert: {
          comprovante_url?: string | null
          created_at?: string | null
          data: string
          id?: string | null
          investimento_id: string
          observacoes?: string | null
          preco_unitario?: number | null
          quantidade?: number | null
          user_id: string
          valor: number
          workspace_id?: string | null
        }
        Update: {
          comprovante_url?: string | null
          created_at?: string | null
          data?: string
          id?: string | null
          investimento_id?: string
          observacoes?: string | null
          preco_unitario?: number | null
          quantidade?: number | null
          user_id?: string
          valor?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      documento_sessoes: {
        Row: {
          chave_acesso: string | null
          conversation_id: string | null
          created_at: string
          dados_sessao: Json
          documento_tipo: string
          fornecedor: string | null
          id: string | null
          numero_nf: string | null
          paginas_recebidas: number
          status: string
          total_paginas: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          chave_acesso?: string | null
          conversation_id?: string | null
          created_at?: string
          dados_sessao: Json
          documento_tipo: string
          fornecedor?: string | null
          id?: string | null
          numero_nf?: string | null
          paginas_recebidas: number
          status: string
          total_paginas: number
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          chave_acesso?: string | null
          conversation_id?: string | null
          created_at?: string
          dados_sessao?: Json
          documento_tipo?: string
          fornecedor?: string | null
          id?: string | null
          numero_nf?: string | null
          paginas_recebidas?: number
          status?: string
          total_paginas?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      equipe_feriados: {
        Row: {
          created_at: string
          data: string
          id: string | null
          nome: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          data: string
          id?: string | null
          nome: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string | null
          nome?: string
          workspace_id?: string
        }
        Relationships: []
      }
      eyemobile_cache: {
        Row: {
          created_at: string | null
          data: Json
          key: string | null
        }
        Insert: {
          created_at?: string | null
          data: Json
          key?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json
          key?: string | null
        }
        Relationships: []
      }
      eyemobile_config: {
        Row: {
          last_synced_offset: number | null
          access_key: string
          auto_sync_sales: boolean
          auto_sync_stock: boolean
          created_at: string
          default_categoria_receita_id: string | null
          default_categoria_taxa_id: string | null
          default_conta_id: string | null
          environment: string
          id: string | null
          secret_key: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_synced_offset?: number | null
          access_key: string
          auto_sync_sales: boolean
          auto_sync_stock: boolean
          created_at?: string
          default_categoria_receita_id?: string | null
          default_categoria_taxa_id?: string | null
          default_conta_id?: string | null
          environment: string
          id?: string | null
          secret_key: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_synced_offset?: number | null
          access_key?: string
          auto_sync_sales?: boolean
          auto_sync_stock?: boolean
          created_at?: string
          default_categoria_receita_id?: string | null
          default_categoria_taxa_id?: string | null
          default_conta_id?: string | null
          environment?: string
          id?: string | null
          secret_key?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      eyemobile_sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string | null
          items_processed: number
          payload: Json | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string | null
          items_processed: number
          payload?: Json | null
          status: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string | null
          items_processed?: number
          payload?: Json | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      fatura_cartao_importacoes: {
        Row: {
          conta_id: string
          created_at: string | null
          hash_transacoes: string
          id: string | null
          mes_referencia: string
          total_fatura: number | null
          transacoes_criadas: number | null
          user_id: string
          vencimento: string | null
          workspace_id: string | null
        }
        Insert: {
          conta_id: string
          created_at?: string | null
          hash_transacoes: string
          id?: string | null
          mes_referencia: string
          total_fatura?: number | null
          transacoes_criadas?: number | null
          user_id: string
          vencimento?: string | null
          workspace_id?: string | null
        }
        Update: {
          conta_id?: string
          created_at?: string | null
          hash_transacoes?: string
          id?: string | null
          mes_referencia?: string
          total_fatura?: number | null
          transacoes_criadas?: number | null
          user_id?: string
          vencimento?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      faturas_cartao: {
        Row: {
          ano_fatura: number
          cartao_id: string
          created_at: string | null
          data_fechamento: string
          data_inicio: string
          data_vencimento: string
          divida_id: string | null
          id: string | null
          mes_fatura: number
          status: string
          updated_at: string | null
          user_id: string
          valor_pago: number
          valor_total: number
          workspace_id: string | null
        }
        Insert: {
          ano_fatura: number
          cartao_id: string
          created_at?: string | null
          data_fechamento: string
          data_inicio: string
          data_vencimento: string
          divida_id?: string | null
          id?: string | null
          mes_fatura: number
          status: string
          updated_at?: string | null
          user_id: string
          valor_pago: number
          valor_total: number
          workspace_id?: string | null
        }
        Update: {
          ano_fatura?: number
          cartao_id?: string
          created_at?: string | null
          data_fechamento?: string
          data_inicio?: string
          data_vencimento?: string
          divida_id?: string | null
          id?: string | null
          mes_fatura?: number
          status?: string
          updated_at?: string | null
          user_id?: string
          valor_pago?: number
          valor_total?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      fichas_tecnicas: {
        Row: {
          created_at: string
          custo_unitario: number
          id: string | null
          insumo_id: string | null
          insumo_nome: string
          produto_id: string
          quantidade: number
          unidade_medida: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          custo_unitario: number
          id?: string | null
          insumo_id?: string | null
          insumo_nome: string
          produto_id: string
          quantidade: number
          unidade_medida: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          custo_unitario?: number
          id?: string | null
          insumo_id?: string | null
          insumo_nome?: string
          produto_id?: string
          quantidade?: number
          unidade_medida?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          cnpj: string | null
          contato_nome: string | null
          created_at: string
          email: string | null
          id: string | null
          nome: string
          prazo_pagamento_dias: number | null
          telefone: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cnpj?: string | null
          contato_nome?: string | null
          created_at?: string
          email?: string | null
          id?: string | null
          nome: string
          prazo_pagamento_dias?: number | null
          telefone?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          cnpj?: string | null
          contato_nome?: string | null
          created_at?: string
          email?: string | null
          id?: string | null
          nome?: string
          prazo_pagamento_dias?: number | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      historico_custo_produto: {
        Row: {
          alerta_enviado: boolean | null
          created_at: string | null
          custo_unitario: number | null
          data_compra: string | null
          fornecedor: string | null
          id: string | null
          markup_aplicado: number | null
          nf_id: string | null
          produto_codigo: string | null
          produto_descricao: string | null
          produto_eyemobile_uuid: string | null
          quantidade: number | null
          sugestao_preco_venda: number | null
          user_id: string | null
          variacao_percentual: number | null
          workspace_id: string | null
        }
        Insert: {
          alerta_enviado?: boolean | null
          created_at?: string | null
          custo_unitario?: number | null
          data_compra?: string | null
          fornecedor?: string | null
          id?: string | null
          markup_aplicado?: number | null
          nf_id?: string | null
          produto_codigo?: string | null
          produto_descricao?: string | null
          produto_eyemobile_uuid?: string | null
          quantidade?: number | null
          sugestao_preco_venda?: number | null
          user_id?: string | null
          variacao_percentual?: number | null
          workspace_id?: string | null
        }
        Update: {
          alerta_enviado?: boolean | null
          created_at?: string | null
          custo_unitario?: number | null
          data_compra?: string | null
          fornecedor?: string | null
          id?: string | null
          markup_aplicado?: number | null
          nf_id?: string | null
          produto_codigo?: string | null
          produto_descricao?: string | null
          produto_eyemobile_uuid?: string | null
          quantidade?: number | null
          sugestao_preco_venda?: number | null
          user_id?: string | null
          variacao_percentual?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      historico_rendimentos: {
        Row: {
          ano: number
          id: string | null
          investimento_id: string
          mes: number
          rendimento_mes: number
          user_id: string
          valor_final: number
          valor_inicial: number
        }
        Insert: {
          ano: number
          id?: string | null
          investimento_id: string
          mes: number
          rendimento_mes: number
          user_id: string
          valor_final: number
          valor_inicial: number
        }
        Update: {
          ano?: number
          id?: string | null
          investimento_id?: string
          mes?: number
          rendimento_mes?: number
          user_id?: string
          valor_final?: number
          valor_inicial?: number
        }
        Relationships: []
      }
      ia_leitura_erros: {
        Row: {
          campos_suspeitos: string | null
          channel_type: string | null
          created_at: string
          id: string | null
          motivo: string
          raw_analysis: Json | null
          user_id: string | null
        }
        Insert: {
          campos_suspeitos?: string | null
          channel_type?: string | null
          created_at?: string
          id?: string | null
          motivo: string
          raw_analysis?: Json | null
          user_id?: string | null
        }
        Update: {
          campos_suspeitos?: string | null
          channel_type?: string | null
          created_at?: string
          id?: string | null
          motivo?: string
          raw_analysis?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      investimentos: {
        Row: {
          ativo: boolean | null
          cnpj_instituicao: string | null
          codigo_b3: string | null
          conta_id: string | null
          created_at: string | null
          data_inicio: string
          data_vencimento: string | null
          id: string | null
          instituicao: string | null
          meta_id: string | null
          nome: string
          taxa_referencia: string | null
          taxa_rendimento_anual: number
          tipo: string
          updated_at: string | null
          user_id: string
          valor_atual: number
          valor_investido: number
          workspace_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          cnpj_instituicao?: string | null
          codigo_b3?: string | null
          conta_id?: string | null
          created_at?: string | null
          data_inicio: string
          data_vencimento?: string | null
          id?: string | null
          instituicao?: string | null
          meta_id?: string | null
          nome: string
          taxa_referencia?: string | null
          taxa_rendimento_anual: number
          tipo: string
          updated_at?: string | null
          user_id: string
          valor_atual: number
          valor_investido: number
          workspace_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          cnpj_instituicao?: string | null
          codigo_b3?: string | null
          conta_id?: string | null
          created_at?: string | null
          data_inicio?: string
          data_vencimento?: string | null
          id?: string | null
          instituicao?: string | null
          meta_id?: string | null
          nome?: string
          taxa_referencia?: string | null
          taxa_rendimento_anual?: number
          tipo?: string
          updated_at?: string | null
          user_id?: string
          valor_atual?: number
          valor_investido?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      investimentos_sessions: {
        Row: {
          created_at: string
          expires_at: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lembretes: {
        Row: {
          created_at: string
          data: string
          descricao: string
          hora: string
          id: string | null
          notificado_em: string | null
          notificar_navegador: boolean
          notificar_telegram: boolean
          notificar_whatsapp: boolean
          origem_id: string | null
          origem_tabela: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: string
          descricao: string
          hora: string
          id?: string | null
          notificado_em?: string | null
          notificar_navegador: boolean
          notificar_telegram: boolean
          notificar_whatsapp: boolean
          origem_id?: string | null
          origem_tabela?: string | null
          status: string
          tipo: string
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string
          hora?: string
          id?: string | null
          notificado_em?: string | null
          notificar_navegador?: boolean
          notificar_telegram?: boolean
          notificar_whatsapp?: boolean
          origem_id?: string | null
          origem_tabela?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      metas_investimento: {
        Row: {
          alocacao_fixa: number | null
          alocacao_variavel: number | null
          ativo: boolean | null
          created_at: string | null
          data_objetivo: string | null
          descricao: string | null
          id: string | null
          imagem_url: string | null
          nome: string
          tipo: string
          user_id: string
          valor_atual: number
          valor_meta: number
          workspace_id: string | null
        }
        Insert: {
          alocacao_fixa?: number | null
          alocacao_variavel?: number | null
          ativo?: boolean | null
          created_at?: string | null
          data_objetivo?: string | null
          descricao?: string | null
          id?: string | null
          imagem_url?: string | null
          nome: string
          tipo: string
          user_id: string
          valor_atual: number
          valor_meta: number
          workspace_id?: string | null
        }
        Update: {
          alocacao_fixa?: number | null
          alocacao_variavel?: number | null
          ativo?: boolean | null
          created_at?: string | null
          data_objetivo?: string | null
          descricao?: string | null
          id?: string | null
          imagem_url?: string | null
          nome?: string
          tipo?: string
          user_id?: string
          valor_atual?: number
          valor_meta?: number
          workspace_id?: string | null
        }
        Relationships: []
      }
      nf_itens: {
        Row: {
          cfop: string | null
          codigo_produto: string | null
          cofins_aliquota: number | null
          created_at: string | null
          custo_unitario_liquido: number | null
          descricao: string | null
          icms_aliquota: number | null
          id: string | null
          ipi_aliquota: number | null
          ncm: string | null
          nf_id: string | null
          pis_aliquota: number | null
          produto_eyemobile_id: string | null
          quantidade: number | null
          status_estoque: string | null
          unidade: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          cfop?: string | null
          codigo_produto?: string | null
          cofins_aliquota?: number | null
          created_at?: string | null
          custo_unitario_liquido?: number | null
          descricao?: string | null
          icms_aliquota?: number | null
          id?: string | null
          ipi_aliquota?: number | null
          ncm?: string | null
          nf_id?: string | null
          pis_aliquota?: number | null
          produto_eyemobile_id?: string | null
          quantidade?: number | null
          status_estoque?: string | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          cfop?: string | null
          codigo_produto?: string | null
          cofins_aliquota?: number | null
          created_at?: string | null
          custo_unitario_liquido?: number | null
          descricao?: string | null
          icms_aliquota?: number | null
          id?: string | null
          ipi_aliquota?: number | null
          ncm?: string | null
          nf_id?: string | null
          pis_aliquota?: number | null
          produto_eyemobile_id?: string | null
          quantidade?: number | null
          status_estoque?: string | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: []
      }
      notas_fiscais_compra: {
        Row: {
          chat_id: number | null
          chave_acesso: string | null
          cnpj_fornecedor: string | null
          created_at: string | null
          data_emissao: string | null
          data_entrada: string | null
          fornecedor: string | null
          id: string | null
          imagem_base64: string | null
          numero_nf: string | null
          origem: string | null
          serie_nf: string | null
          status: string | null
          user_id: string | null
          valor_frete: number | null
          valor_icms: number | null
          valor_ipi: number | null
          valor_produtos: number | null
          valor_total: number | null
          workspace_id: string | null
        }
        Insert: {
          chat_id?: number | null
          chave_acesso?: string | null
          cnpj_fornecedor?: string | null
          created_at?: string | null
          data_emissao?: string | null
          data_entrada?: string | null
          fornecedor?: string | null
          id?: string | null
          imagem_base64?: string | null
          numero_nf?: string | null
          origem?: string | null
          serie_nf?: string | null
          status?: string | null
          user_id?: string | null
          valor_frete?: number | null
          valor_icms?: number | null
          valor_ipi?: number | null
          valor_produtos?: number | null
          valor_total?: number | null
          workspace_id?: string | null
        }
        Update: {
          chat_id?: number | null
          chave_acesso?: string | null
          cnpj_fornecedor?: string | null
          created_at?: string | null
          data_emissao?: string | null
          data_entrada?: string | null
          fornecedor?: string | null
          id?: string | null
          imagem_base64?: string | null
          numero_nf?: string | null
          origem?: string | null
          serie_nf?: string | null
          status?: string | null
          user_id?: string | null
          valor_frete?: number | null
          valor_icms?: number | null
          valor_ipi?: number | null
          valor_produtos?: number | null
          valor_total?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      notificacoes_log: {
        Row: {
          created_at: string | null
          enviado: boolean | null
          erro: string | null
          id: string | null
          mensagem: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enviado?: boolean | null
          erro?: string | null
          id?: string | null
          mensagem: string
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          enviado?: boolean | null
          erro?: string | null
          id?: string | null
          mensagem?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      orcamento_configuracoes: {
        Row: {
          created_at: string | null
          id: string | null
          temas: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          temas: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string | null
          temas?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      orcamentos_categorias: {
        Row: {
          categoria_id: string
          created_at: string | null
          id: string | null
          mes_referencia: string
          updated_at: string | null
          user_id: string
          valor_limite: number
        }
        Insert: {
          categoria_id: string
          created_at?: string | null
          id?: string | null
          mes_referencia: string
          updated_at?: string | null
          user_id: string
          valor_limite: number
        }
        Update: {
          categoria_id?: string
          created_at?: string | null
          id?: string | null
          mes_referencia?: string
          updated_at?: string | null
          user_id?: string
          valor_limite?: number
        }
        Relationships: []
      }
      pluggy_items: {
        Row: {
          client_user_id: string | null
          connector_id: number | null
          connector_name: string | null
          created_at: string
          id: string | null
          item_id: string
          status: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          client_user_id?: string | null
          connector_id?: number | null
          connector_name?: string | null
          created_at?: string
          id?: string | null
          item_id: string
          status?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          client_user_id?: string | null
          connector_id?: number | null
          connector_name?: string | null
          created_at?: string
          id?: string | null
          item_id?: string
          status?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      produto_equivalencias: {
        Row: {
          cnpj_fornecedor_normalizado: string
          codigo_produto_fornecedor: string
          confirmado_por_usuario: boolean
          created_at: string
          descricao_fornecedor: string | null
          fator_conversao: number
          fornecedor_nome: string | null
          id: string | null
          on: unknown | null
          origem_matching: string
          produto_eyemobile_uuid: string
          references: unknown | null
          unidade_fornecedor: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          cnpj_fornecedor_normalizado: string
          codigo_produto_fornecedor: string
          confirmado_por_usuario: boolean
          created_at?: string
          descricao_fornecedor?: string | null
          fator_conversao: number
          fornecedor_nome?: string | null
          id?: string | null
          on?: unknown | null
          origem_matching: string
          produto_eyemobile_uuid: string
          references?: unknown | null
          unidade_fornecedor?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          cnpj_fornecedor_normalizado?: string
          codigo_produto_fornecedor?: string
          confirmado_por_usuario?: boolean
          created_at?: string
          descricao_fornecedor?: string | null
          fator_conversao?: number
          fornecedor_nome?: string | null
          id?: string | null
          on?: unknown | null
          origem_matching?: string
          produto_eyemobile_uuid?: string
          references?: unknown | null
          unidade_fornecedor?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      produtos_cardapio: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          descricao: string | null
          eyemobile_product_id: string | null
          id: string | null
          imagem_url: string | null
          nome: string
          preco_venda: number
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ativo: boolean
          categoria: string
          created_at?: string
          descricao?: string | null
          eyemobile_product_id?: string | null
          id?: string | null
          imagem_url?: string | null
          nome: string
          preco_venda: number
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          descricao?: string | null
          eyemobile_product_id?: string | null
          id?: string | null
          imagem_url?: string | null
          nome?: string
          preco_venda?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      produtos_eyemobile: {
        Row: {
          alerta_aumento_10pct: boolean | null
          ativo: boolean | null
          categoria: string | null
          codigo: string | null
          created_at: string | null
          custo_atual: number | null
          descricao: string | null
          estoque_atual: number | null
          eyemobile_id: string | null
          id: string | null
          margem_real_percentual: number | null
          markup_padrao: number | null
          preco_venda: number | null
          ultima_atualizacao_custo: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          alerta_aumento_10pct?: boolean | null
          ativo?: boolean | null
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          custo_atual?: number | null
          descricao?: string | null
          estoque_atual?: number | null
          eyemobile_id?: string | null
          id?: string | null
          margem_real_percentual?: number | null
          markup_padrao?: number | null
          preco_venda?: number | null
          ultima_atualizacao_custo?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          alerta_aumento_10pct?: boolean | null
          ativo?: boolean | null
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          custo_atual?: number | null
          descricao?: string | null
          estoque_atual?: number | null
          eyemobile_id?: string | null
          id?: string | null
          margem_real_percentual?: number | null
          markup_padrao?: number | null
          preco_venda?: number | null
          ultima_atualizacao_custo?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      proventos_esperados: {
        Row: {
          created_at: string | null
          data_pagamento: string
          id: string | null
          investimento_id: string
          status: string | null
          tipo: string
          user_id: string
          valor_estimado: number
        }
        Insert: {
          created_at?: string | null
          data_pagamento: string
          id?: string | null
          investimento_id: string
          status?: string | null
          tipo: string
          user_id: string
          valor_estimado: number
        }
        Update: {
          created_at?: string | null
          data_pagamento?: string
          id?: string | null
          investimento_id?: string
          status?: string | null
          tipo?: string
          user_id?: string
          valor_estimado?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string | null
          p256dh: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string | null
          p256dh: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string | null
          p256dh?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket_key: string | null
          last_request: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key?: string | null
          last_request: string
          request_count: number
          window_start: string
        }
        Update: {
          bucket_key?: string | null
          last_request?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      sefaz_documentos_recebidos: {
        Row: {
          chave_acesso: string
          created_at: string
          data_emissao: string | null
          destinatario_cnpj: string | null
          emitente_cnpj: string | null
          emitente_nome: string | null
          id: string | null
          nf_compra_id: string | null
          nsu: string
          status_processamento: string
          tipo_documento: string
          user_id: string
          valor_total: number | null
          workspace_id: string | null
          xml_conteudo: string | null
        }
        Insert: {
          chave_acesso: string
          created_at?: string
          data_emissao?: string | null
          destinatario_cnpj?: string | null
          emitente_cnpj?: string | null
          emitente_nome?: string | null
          id?: string | null
          nf_compra_id?: string | null
          nsu: string
          status_processamento: string
          tipo_documento: string
          user_id: string
          valor_total?: number | null
          workspace_id?: string | null
          xml_conteudo?: string | null
        }
        Update: {
          chave_acesso?: string
          created_at?: string
          data_emissao?: string | null
          destinatario_cnpj?: string | null
          emitente_cnpj?: string | null
          emitente_nome?: string | null
          id?: string | null
          nf_compra_id?: string | null
          nsu?: string
          status_processamento?: string
          tipo_documento?: string
          user_id?: string
          valor_total?: number | null
          workspace_id?: string | null
          xml_conteudo?: string | null
        }
        Relationships: []
      }
      senha_investimentos: {
        Row: {
          bloqueado_ate: string | null
          created_at: string | null
          id: string | null
          senha_hash: string
          tentativas_falhas: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bloqueado_ate?: string | null
          created_at?: string | null
          id?: string | null
          senha_hash: string
          tentativas_falhas?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bloqueado_ate?: string | null
          created_at?: string | null
          id?: string | null
          senha_hash?: string
          tentativas_falhas?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subcategorias: {
        Row: {
          ativo: boolean | null
          categoria_id: string | null
          cor: string | null
          created_at: string | null
          id: string | null
          nome: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria_id?: string | null
          cor?: string | null
          created_at?: string | null
          id?: string | null
          nome: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria_id?: string | null
          cor?: string | null
          created_at?: string | null
          id?: string | null
          nome?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_conversas: {
        Row: {
          chat_id: string
          dados_documento: Json | null
          estado: string
          id: string | null
          proposta_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_id: string
          dados_documento?: Json | null
          estado: string
          id?: string | null
          proposta_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          dados_documento?: Json | null
          estado?: string
          id?: string | null
          proposta_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          created_at: string | null
          telegram_chat_id: string
          telegram_username: string | null
          token: string | null
          usado: boolean | null
        }
        Insert: {
          created_at?: string | null
          telegram_chat_id: string
          telegram_username?: string | null
          token?: string | null
          usado?: boolean | null
        }
        Update: {
          created_at?: string | null
          telegram_chat_id?: string
          telegram_username?: string | null
          token?: string | null
          usado?: boolean | null
        }
        Relationships: []
      }
      telegram_processed_updates: {
        Row: {
          bot_id: string
          chat_id: number | null
          expires_at: string
          processed_at: string
          update_id: number
        }
        Insert: {
          bot_id: string
          chat_id?: number | null
          expires_at: string
          processed_at: string
          update_id: number
        }
        Update: {
          bot_id?: string
          chat_id?: number | null
          expires_at?: string
          processed_at?: string
          update_id?: number
        }
        Relationships: []
      }
      telegram_propostas: {
        Row: {
          chat_id: string
          created_at: string
          dados: Json
          error_message: string | null
          executed_at: string | null
          expires_at: string
          id: string | null
          resumo: string
          status: string
          tipo: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          dados: Json
          error_message?: string | null
          executed_at?: string | null
          expires_at: string
          id?: string | null
          resumo: string
          status: string
          tipo: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          dados?: Json
          error_message?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string | null
          resumo?: string
          status?: string
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      transferencias: {
        Row: {
          conta_destino_id: string
          conta_origem_id: string
          created_at: string | null
          data: string
          descricao: string | null
          id: string | null
          observacoes: string | null
          user_id: string
          valor: number
          workspace_id: string | null
        }
        Insert: {
          conta_destino_id: string
          conta_origem_id: string
          created_at?: string | null
          data: string
          descricao?: string | null
          id?: string | null
          observacoes?: string | null
          user_id: string
          valor: number
          workspace_id?: string | null
        }
        Update: {
          conta_destino_id?: string
          conta_origem_id?: string
          created_at?: string | null
          data?: string
          descricao?: string | null
          id?: string | null
          observacoes?: string | null
          user_id?: string
          valor?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_conta_origem_id_fkey"
            columns: ["conta_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_conta_destino_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "contas_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_telegram: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string | null
          telegram_chat_id: string
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string | null
          telegram_chat_id: string
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string | null
          telegram_chat_id?: string
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wallet_ai_action_proposals: {
        Row: {
          action_type: string
          action_version: string
          confirmed_at: string | null
          conversation_id: string | null
          created_at: string
          executed_at: string | null
          expires_at: string
          id: string | null
          idempotency_hash: string
          payload: Json
          previous_state: Json | null
          risk_level: string | null
          status: string
          summary: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          action_type: string
          action_version: string
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at: string
          id?: string | null
          idempotency_hash: string
          payload: Json
          previous_state?: Json | null
          risk_level?: string | null
          status: string
          summary: string
          user_id: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          action_version?: string
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          executed_at?: string | null
          expires_at?: string
          id?: string | null
          idempotency_hash?: string
          payload?: Json
          previous_state?: Json | null
          risk_level?: string | null
          status?: string
          summary?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      wallet_ai_audit_events: {
        Row: {
          created_at: string
          duration_ms: number
          error_code: string | null
          execution_status: string
          id: string | null
          record_count: number
          request_id: string
          tool_name: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error_code?: string | null
          execution_status: string
          id?: string | null
          record_count: number
          request_id: string
          tool_name: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          execution_status?: string
          id?: string | null
          record_count?: number
          request_id?: string
          tool_name?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      wallet_ai_conversations: {
        Row: {
          created_at: string
          id: string | null
          is_archived: boolean
          summary: string | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string | null
          is_archived: boolean
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string | null
          is_archived?: boolean
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      wallet_ai_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string | null
          role: string
          sources: Json | null
          tokens_count: number | null
          tool_calls: Json | null
          tool_results: Json | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string | null
          role: string
          sources?: Json | null
          tokens_count?: number | null
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id: string
          workspace_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string | null
          role?: string
          sources?: Json | null
          tokens_count?: number | null
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_certificados_sefaz: {
        Row: {
          ambiente: string
          certificado_senha_criptografada: string | null
          certificado_storage_path: string | null
          cnpj: string
          created_at: string
          erro_mensagem: string | null
          id: string | null
          max_nsu: string | null
          razao_social: string | null
          sincronizacao_automatica: boolean | null
          status: string
          uf: string
          ultima_sincronizacao: string | null
          ultimo_nsu: string | null
          updated_at: string
          user_id: string
          validade_fim: string | null
          workspace_id: string | null
        }
        Insert: {
          ambiente: string
          certificado_senha_criptografada?: string | null
          certificado_storage_path?: string | null
          cnpj: string
          created_at?: string
          erro_mensagem?: string | null
          id?: string | null
          max_nsu?: string | null
          razao_social?: string | null
          sincronizacao_automatica?: boolean | null
          status: string
          uf: string
          ultima_sincronizacao?: string | null
          ultimo_nsu?: string | null
          updated_at?: string
          user_id: string
          validade_fim?: string | null
          workspace_id?: string | null
        }
        Update: {
          ambiente?: string
          certificado_senha_criptografada?: string | null
          certificado_storage_path?: string | null
          cnpj?: string
          created_at?: string
          erro_mensagem?: string | null
          id?: string | null
          max_nsu?: string | null
          razao_social?: string | null
          sincronizacao_automatica?: boolean | null
          status?: string
          uf?: string
          ultima_sincronizacao?: string | null
          ultimo_nsu?: string | null
          updated_at?: string
          user_id?: string
          validade_fim?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          active: boolean
          created_at: string
          role: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          active: boolean
          created_at?: string
          role: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          role?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          id: string
          user_id: string
          nome: string
          tipo: "PF" | "PJ"
          is_default: boolean
          regime_encargos: "mei" | "geral"
          piso_categoria: number | null
          piso_vigencia_inicio: string | null
          convencao_mte: string | null
          convencao_fonte_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nome: string
          tipo?: "PF" | "PJ"
          is_default?: boolean
          regime_encargos?: "mei" | "geral"
          piso_categoria?: number | null
          piso_vigencia_inicio?: string | null
          convencao_mte?: string | null
          convencao_fonte_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nome?: string
          tipo?: "PF" | "PJ"
          is_default?: boolean
          regime_encargos?: "mei" | "geral"
          piso_categoria?: number | null
          piso_vigencia_inicio?: string | null
          convencao_mte?: string | null
          convencao_fonte_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          id: string
          user_id: string
          titulo: string
          mensagem: string
          lida: boolean
          link_redirecionamento: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          titulo: string
          mensagem: string
          lida?: boolean
          link_redirecionamento?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          titulo?: string
          mensagem?: string
          lida?: boolean
          link_redirecionamento?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "user_profile_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "user_profile_complete"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      anexos_transacoes: {
        Row: {
          created_at: string
          id: string
          nome: string
          storage_path: string
          tamanho: number
          tipo_arquivo: string
          transacao_id: string
          transacao_tipo: "receita" | "despesa" | "divida"
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          storage_path: string
          tamanho: number
          tipo_arquivo: string
          transacao_id: string
          transacao_tipo: "receita" | "despesa" | "divida"
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          storage_path?: string
          tamanho?: number
          tipo_arquivo?: string
          transacao_id?: string
          transacao_tipo?: "receita" | "despesa" | "divida"
          user_id?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["categoria_tipo"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["categoria_tipo"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["categoria_tipo"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categorias_mercado: {
        Row: {
          ativa: boolean
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_conversas: {
        Row: {
          id: string
          user_id: string
          titulo: string
          openai_thread_id: string | null
          created_at: string
          updated_at: string
          ultima_mensagem_em: string | null
        }
        Insert: {
          id?: string
          user_id: string
          titulo?: string
          openai_thread_id?: string | null
          created_at?: string
          updated_at?: string
          ultima_mensagem_em?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          titulo?: string
          openai_thread_id?: string | null
          created_at?: string
          updated_at?: string
          ultima_mensagem_em?: string | null
        }
        Relationships: []
      }
      chat_mensagens: {
        Row: {
          id: string
          conversa_id: string
          user_id: string
          role: string
          conteudo: string
          imagem_base64: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          conversa_id: string
          user_id: string
          role: string
          conteudo: string
          imagem_base64?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          conversa_id?: string
          user_id?: string
          role?: string
          conteudo?: string
          imagem_base64?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chat_conversas"
            referencedColumns: ["id"]
          }
        ]
      }
      categorias_metas: {
        Row: {
          ativa: boolean
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contas_usuario: {
        Row: {
          saldo_inicial: number | null
          saldo_atual: number | null
          limite_credito: number | null
          dia_fechamento: number | null
          dia_vencimento: number | null
          cor: string | null
          pluggy_account_id: string | null
          data_vencimento: string | null
          data_fechamento: string | null
          workspace_id: string | null
          created_at: string
          id: string
          nome: string
          saldo: number
          tipo: string
          user_id: string
        }
        Insert: {
          saldo_inicial?: number | null
          saldo_atual?: number | null
          limite_credito?: number | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          cor?: string | null
          pluggy_account_id?: string | null
          data_vencimento?: string | null
          data_fechamento?: string | null
          workspace_id?: string | null
          created_at?: string
          id?: string
          nome: string
          saldo?: number
          tipo: string
          user_id: string
        }
        Update: {
          saldo_inicial?: number | null
          saldo_atual?: number | null
          limite_credito?: number | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          cor?: string | null
          pluggy_account_id?: string | null
          data_vencimento?: string | null
          data_fechamento?: string | null
          workspace_id?: string | null
          created_at?: string
          id?: string
          nome?: string
          saldo?: number
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_usuario_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_reminders: {
        Row: {
          created_at: string
          divida_id: string
          error_message: string | null
          id: string
          reminder_hours: number
          sent_at: string | null
          status: string
          trigger_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          divida_id: string
          error_message?: string | null
          id?: string
          reminder_hours: number
          sent_at?: string | null
          status?: string
          trigger_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          divida_id?: string
          error_message?: string | null
          id?: string
          reminder_hours?: number
          sent_at?: string | null
          status?: string
          trigger_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_reminders_divida_id_fkey"
            columns: ["divida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
        ]
      }
      despesa_tags: {
        Row: {
          despesa_id: string
          id: string
          tag_id: string
        }
        Insert: {
          despesa_id: string
          id?: string
          tag_id: string
        }
        Update: {
          despesa_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "despesa_tags_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "despesas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesa_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas: {
        Row: {
          workspace_id: string | null
          status: string | null
          deduplication_key: string | null
          fatura_id: string | null
          conciliado: boolean | null
          contato_id: string | null
          centro_custo_id: string | null
          subcategoria_id: string | null
          fornecedor_id: string | null
          categoria_id: string | null
          conta_id: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          metodo_pagamento: string | null
          observacoes: string | null
          recorrencia_id: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          workspace_id?: string | null
          status?: string | null
          deduplication_key?: string | null
          fatura_id?: string | null
          conciliado?: boolean | null
          contato_id?: string | null
          centro_custo_id?: string | null
          subcategoria_id?: string | null
          fornecedor_id?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          descricao: string
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          recorrencia_id?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          workspace_id?: string | null
          status?: string | null
          deduplication_key?: string | null
          fatura_id?: string | null
          conciliado?: boolean | null
          contato_id?: string | null
          centro_custo_id?: string | null
          subcategoria_id?: string | null
          fornecedor_id?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          recorrencia_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      dividas: {
        Row: {
          categoria_id: string | null
          created_at: string
          credor: string
          data_vencimento: string
          descricao: string
          documento_favorecido: string | null
          id: string
          parcelas: number
          parcelas_pagas: number
          status: string
          updated_at: string
          user_id: string
          valor_pago: number
          valor_restante: number
          valor_total: number
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          credor: string
          data_vencimento: string
          descricao: string
          documento_favorecido?: string | null
          id?: string
          parcelas?: number
          parcelas_pagas?: number
          status?: string
          updated_at?: string
          user_id: string
          valor_pago?: number
          valor_restante: number
          valor_total: number
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          credor?: string
          data_vencimento?: string
          descricao?: string
          documento_favorecido?: string | null
          id?: string
          parcelas?: number
          parcelas_pagas?: number
          status?: string
          updated_at?: string
          user_id?: string
          valor_pago?: number
          valor_restante?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "dividas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      divipay_conciliacoes: {
        Row: {
          created_at: string
          data_pagamento: string | null
          descricao: string | null
          despesa_id: string | null
          divida_id: string | null
          divida_sugerida_id: string | null
          divipay_external_id: string
          favorecido_documento: string | null
          favorecido_nome: string | null
          id: string
          status: string
          taxa: number
          tipo: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_pagamento?: string | null
          descricao?: string | null
          despesa_id?: string | null
          divida_id?: string | null
          divida_sugerida_id?: string | null
          divipay_external_id: string
          favorecido_documento?: string | null
          favorecido_nome?: string | null
          id?: string
          status?: string
          taxa?: number
          tipo?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string
          data_pagamento?: string | null
          descricao?: string | null
          despesa_id?: string | null
          divida_id?: string | null
          divida_sugerida_id?: string | null
          divipay_external_id?: string
          favorecido_documento?: string | null
          favorecido_nome?: string | null
          id?: string
          status?: string
          taxa?: number
          tipo?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "divipay_conciliacoes_divida_id_fkey"
            columns: ["divida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divipay_conciliacoes_divida_sugerida_id_fkey"
            columns: ["divida_sugerida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
        ]
      }
      divipay_config: {
        Row: {
          access_token: string | null
          client_id: string | null
          client_secret: string | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          token_expires_at: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      divipay_transacoes: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          external_id: string | null
          fee: number | null
          id: string
          metadata: Json
          pix_copy_paste: string | null
          pix_qr_code: string | null
          recipient_key: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          external_id?: string | null
          fee?: number | null
          id?: string
          metadata?: Json
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          recipient_key?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          external_id?: string | null
          fee?: number | null
          id?: string
          metadata?: Json
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          recipient_key?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      divipay_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          external_id: string | null
          id: string
          payload: Json
          processed: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          payload: Json
          processed?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      ia_analysis_results: {
        Row: {
          categoria: string
          categoria_id: string | null
          confianca: number
          created_at: string
          data: string
          descricao: string
          file_name: string
          id: string
          status: string
          tipo: string
          updated_at: string
          upload_id: string | null
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          categoria_id?: string | null
          confianca: number
          created_at?: string
          data: string
          descricao: string
          file_name: string
          id?: string
          status?: string
          tipo: string
          updated_at?: string
          upload_id?: string | null
          user_id: string
          valor: number
        }
        Update: {
          categoria?: string
          categoria_id?: string | null
          confianca?: number
          created_at?: string
          data?: string
          descricao?: string
          file_name?: string
          id?: string
          status?: string
          tipo?: string
          updated_at?: string
          upload_id?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ia_analysis_results_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_analysis_results_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "ia_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_configuracoes: {
        Row: {
          api_key: string
          created_at: string
          id: string
          modelo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          modelo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          modelo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_uploads: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invite_tokens: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          plan_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          plan_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          plan_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_tokens_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_mercado: {
        Row: {
          categoria_mercado_id: string | null
          created_at: string
          descricao: string
          id: string
          preco_atual: number | null
          quantidade_atual: number
          quantidade_ideal: number
          status: string
          unidade_medida: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria_mercado_id?: string | null
          created_at?: string
          descricao: string
          id?: string
          preco_atual?: number | null
          quantidade_atual?: number
          quantidade_ideal?: number
          status?: string
          unidade_medida?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria_mercado_id?: string | null
          created_at?: string
          descricao?: string
          id?: string
          preco_atual?: number | null
          quantidade_atual?: number
          quantidade_ideal?: number
          status?: string
          unidade_medida?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_mercado_categoria_mercado_id_fkey"
            columns: ["categoria_mercado_id"]
            isOneToOne: false
            referencedRelation: "categorias_mercado"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes_manutencao: {
        Row: {
          created_at: string
          data_prevista: string
          dias_antecedencia: number
          id: string
          manutencao_id: string
          status: string
          tipo_manutencao: string
          updated_at: string
          user_id: string
          veiculo_id: string
          webhook_enviado_em: string | null
          webhook_response: string | null
        }
        Insert: {
          created_at?: string
          data_prevista: string
          dias_antecedencia?: number
          id?: string
          manutencao_id: string
          status?: string
          tipo_manutencao: string
          updated_at?: string
          user_id: string
          veiculo_id: string
          webhook_enviado_em?: string | null
          webhook_response?: string | null
        }
        Update: {
          created_at?: string
          data_prevista?: string
          dias_antecedencia?: number
          id?: string
          manutencao_id?: string
          status?: string
          tipo_manutencao?: string
          updated_at?: string
          user_id?: string
          veiculo_id?: string
          webhook_enviado_em?: string | null
          webhook_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_manutencao_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_webhooks_manutencao: {
        Row: {
          created_at: string
          erro: string | null
          id: string
          lembrete_id: string
          payload: Json
          response: string | null
          status_code: number | null
          tentativa: number
          webhook_id: string
        }
        Insert: {
          created_at?: string
          erro?: string | null
          id?: string
          lembrete_id: string
          payload: Json
          response?: string | null
          status_code?: number | null
          tentativa?: number
          webhook_id: string
        }
        Update: {
          created_at?: string
          erro?: string | null
          id?: string
          lembrete_id?: string
          payload?: Json
          response?: string | null
          status_code?: number | null
          tentativa?: number
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_webhooks_manutencao_lembrete_id_fkey"
            columns: ["lembrete_id"]
            isOneToOne: false
            referencedRelation: "lembretes_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_webhooks_manutencao_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks_manutencao"
            referencedColumns: ["id"]
          },
        ]
      }
      manutencoes: {
        Row: {
          created_at: string
          data_proxima: string | null
          data_realizada: string | null
          id: string
          migrado_para_novo_sistema: boolean | null
          observacoes: string | null
          quilometragem_proxima: number | null
          quilometragem_realizada: number | null
          status: string
          tipo_manutencao_id: string
          updated_at: string
          user_id: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          data_proxima?: string | null
          data_realizada?: string | null
          id?: string
          migrado_para_novo_sistema?: boolean | null
          observacoes?: string | null
          quilometragem_proxima?: number | null
          quilometragem_realizada?: number | null
          status?: string
          tipo_manutencao_id: string
          updated_at?: string
          user_id: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          data_proxima?: string | null
          data_realizada?: string | null
          id?: string
          migrado_para_novo_sistema?: boolean | null
          observacoes?: string | null
          quilometragem_proxima?: number | null
          quilometragem_realizada?: number | null
          status?: string
          tipo_manutencao_id?: string
          updated_at?: string
          user_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_tipo_manutencao_id_fkey"
            columns: ["tipo_manutencao_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      manutencoes_customizadas: {
        Row: {
          ativo: boolean
          created_at: string
          data_prevista: string | null
          id: string
          intervalo_km: number | null
          nome: string
          sistema: string | null
          updated_at: string
          user_id: string
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_prevista?: string | null
          id?: string
          intervalo_km?: number | null
          nome: string
          sistema?: string | null
          updated_at?: string
          user_id: string
          veiculo_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_prevista?: string | null
          id?: string
          intervalo_km?: number | null
          nome?: string
          sistema?: string | null
          updated_at?: string
          user_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_customizadas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          categoria_meta_id: string | null
          created_at: string
          data_inicio: string
          data_limite: string
          descricao: string | null
          id: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
          valor_alvo: number
          valor_atual: number
        }
        Insert: {
          categoria_meta_id?: string | null
          created_at?: string
          data_inicio?: string
          data_limite: string
          descricao?: string | null
          id?: string
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
          user_id: string
          valor_alvo: number
          valor_atual?: number
        }
        Update: {
          categoria_meta_id?: string | null
          created_at?: string
          data_inicio?: string
          data_limite?: string
          descricao?: string | null
          id?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          valor_alvo?: number
          valor_atual?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_categoria_meta_id_fkey"
            columns: ["categoria_meta_id"]
            isOneToOne: false
            referencedRelation: "categorias_metas"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos_mercado: {
        Row: {
          ativo: boolean
          categoria_despesa: string
          created_at: string
          estimativa_gastos: number
          id: string
          mes_referencia: string
          updated_at: string
          user_id: string
          valor_orcamento: number
        }
        Insert: {
          ativo?: boolean
          categoria_despesa?: string
          created_at?: string
          estimativa_gastos?: number
          id?: string
          mes_referencia?: string
          updated_at?: string
          user_id: string
          valor_orcamento?: number
        }
        Update: {
          ativo?: boolean
          categoria_despesa?: string
          created_at?: string
          estimativa_gastos?: number
          id?: string
          mes_referencia?: string
          updated_at?: string
          user_id?: string
          valor_orcamento?: number
        }
        Relationships: []
      }
      pagamentos_dividas: {
        Row: {
          conta_id: string | null
          created_at: string
          data_pagamento: string
          divida_id: string
          divipay_external_id: string | null
          id: string
          metodo_pagamento: string
          observacoes: string | null
          user_id: string
          valor: number
        }
        Insert: {
          conta_id?: string | null
          created_at?: string
          data_pagamento?: string
          divida_id: string
          divipay_external_id?: string | null
          id?: string
          metodo_pagamento: string
          observacoes?: string | null
          user_id: string
          valor: number
        }
        Update: {
          conta_id?: string | null
          created_at?: string
          data_pagamento?: string
          divida_id?: string
          divipay_external_id?: string | null
          id?: string
          metodo_pagamento?: string
          observacoes?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_dividas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_dividas_divida_id_fkey"
            columns: ["divida_id"]
            isOneToOne: false
            referencedRelation: "dividas"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          created_at: string | null
          gateway_name: string
          id: string
          is_active: boolean | null
          payment_link: string
          plan_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          gateway_name?: string
          id?: string
          is_active?: boolean | null
          payment_link: string
          plan_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          gateway_name?: string
          id?: string
          is_active?: boolean | null
          payment_link?: string
          plan_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          created_at: string | null
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_limits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_manutencao_veiculo: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          intervalo_km: number
          tipo_manutencao_id: string
          updated_at: string
          user_id: string
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          intervalo_km: number
          tipo_manutencao_id: string
          updated_at?: string
          user_id: string
          veiculo_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          intervalo_km?: number
          tipo_manutencao_id?: string
          updated_at?: string
          user_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planos_manutencao_veiculo_tipo_manutencao_id_fkey"
            columns: ["tipo_manutencao_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planos_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          checkout_link: string | null
          created_at: string | null
          features: Json | null
          id: string
          name: string
          price: number | null
        }
        Insert: {
          checkout_link?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          name: string
          price?: number | null
        }
        Update: {
          checkout_link?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          name?: string
          price?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          name: string
          organization_name: string | null
          role: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          name: string
          organization_name?: string | null
          role?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          name?: string
          organization_name?: string | null
          role?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receita_tags: {
        Row: {
          id: string
          receita_id: string
          tag_id: string
        }
        Insert: {
          id?: string
          receita_id: string
          tag_id: string
        }
        Update: {
          id?: string
          receita_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receita_tags_receita_id_fkey"
            columns: ["receita_id"]
            isOneToOne: false
            referencedRelation: "receitas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receita_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      receitas: {
        Row: {
          workspace_id: string | null
          status: string | null
          deduplication_key: string | null
          conciliado: boolean | null
          contato_id: string | null
          centro_custo_id: string | null
          subcategoria_id: string | null
          categoria_id: string | null
          conta_id: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          metodo_pagamento: string | null
          observacoes: string | null
          recorrencia_id: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          workspace_id?: string | null
          status?: string | null
          deduplication_key?: string | null
          conciliado?: boolean | null
          contato_id?: string | null
          centro_custo_id?: string | null
          subcategoria_id?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          descricao: string
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          recorrencia_id?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          workspace_id?: string | null
          status?: string | null
          deduplication_key?: string | null
          conciliado?: boolean | null
          contato_id?: string | null
          centro_custo_id?: string | null
          subcategoria_id?: string | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          recorrencia_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "receitas_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          payment_date: string | null
          plan_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          payment_date?: string | null
          plan_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          payment_date?: string | null
          plan_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          plan_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          cor: string | null
          created_at: string
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      tipos_manutencao: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          intervalo_km: number
          nome: string
          sistema: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          intervalo_km: number
          nome: string
          sistema: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          intervalo_km?: number
          nome?: string
          sistema?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transacoes: {
        Row: {
          numero_linha: number | null
          mes_referencia: string | null
          cartao_id: string | null
          parcela_atual: number | null
          workspace_id: string | null
          parcela_total: number | null
          parcela_numero: number | null
          pluggy_bill_id: string | null
          status_transacao: string | null
          pluggy_transaction_id: string | null
          numero_linha_importacao: number | null
          hash_importacao: string | null
          importacao_id: string | null
          deduplication_key: string | null
          itens: string | null
          conciliado: boolean | null
          categoria_id: string | null
          conta_id: string | null
          created_at: string
          data: string
          descricao: string
          id: string
          metodo_pagamento: string | null
          observacoes: string | null
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          numero_linha?: number | null
          mes_referencia?: string | null
          cartao_id?: string | null
          parcela_atual?: number | null
          workspace_id?: string | null
          parcela_total?: number | null
          parcela_numero?: number | null
          pluggy_bill_id?: string | null
          status_transacao?: string | null
          pluggy_transaction_id?: string | null
          numero_linha_importacao?: number | null
          hash_importacao?: string | null
          importacao_id?: string | null
          deduplication_key?: string | null
          itens?: string | null
          conciliado?: boolean | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          descricao: string
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          tipo: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          numero_linha?: number | null
          mes_referencia?: string | null
          cartao_id?: string | null
          parcela_atual?: number | null
          workspace_id?: string | null
          parcela_total?: number | null
          parcela_numero?: number | null
          pluggy_bill_id?: string | null
          status_transacao?: string | null
          pluggy_transaction_id?: string | null
          numero_linha_importacao?: number | null
          hash_importacao?: string | null
          importacao_id?: string | null
          deduplication_key?: string | null
          itens?: string | null
          conciliado?: boolean | null
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      transacoes_recorrentes: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          conta_id: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          descricao: string
          dia_execucao: number | null
          dia_semana: number | null
          id: string
          metodo_pagamento: string | null
          recorrencia: "diaria" | "semanal" | "mensal" | "anual"
          tipo_transacao: "receita" | "despesa"
          ultima_execucao: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          descricao: string
          dia_execucao?: number | null
          dia_semana?: number | null
          id?: string
          metodo_pagamento?: string | null
          recorrencia: "diaria" | "semanal" | "mensal" | "anual"
          tipo_transacao: "receita" | "despesa"
          ultima_execucao?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          conta_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          dia_execucao?: number | null
          dia_semana?: number | null
          id?: string
          metodo_pagamento?: string | null
          recorrencia?: "diaria" | "semanal" | "mensal" | "anual"
          tipo_transacao?: "receita" | "despesa"
          ultima_execucao?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_recorrentes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transacoes_recorrentes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          ano: string
          combustivel: string | null
          cor: string | null
          created_at: string
          data_aquisicao: string | null
          id: string
          marca: string
          modelo: string
          placa: string | null
          quilometragem: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ano: string
          combustivel?: string | null
          cor?: string | null
          created_at?: string
          data_aquisicao?: string | null
          id?: string
          marca: string
          modelo: string
          placa?: string | null
          quilometragem?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ano?: string
          combustivel?: string | null
          cor?: string | null
          created_at?: string
          data_aquisicao?: string | null
          id?: string
          marca?: string
          modelo?: string
          placa?: string | null
          quilometragem?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      webhooks_manutencao: {
        Row: {
          ativo: boolean
          auth_header: string | null
          created_at: string
          dias_antecedencia_padrao: number
          id: string
          nome: string
          retry_attempts: number
          retry_delay_seconds: number
          updated_at: string
          url: string
        }
        Insert: {
          ativo?: boolean
          auth_header?: string | null
          created_at?: string
          dias_antecedencia_padrao?: number
          id?: string
          nome: string
          retry_attempts?: number
          retry_delay_seconds?: number
          updated_at?: string
          url: string
        }
        Update: {
          ativo?: boolean
          auth_header?: string | null
          created_at?: string
          dias_antecedencia_padrao?: number
          id?: string
          nome?: string
          retry_attempts?: number
          retry_delay_seconds?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      historico_manutencoes_completo: {
        Row: {
          data: string | null
          id: string | null
          marca: string | null
          modelo: string | null
          observacoes: string | null
          origem: string | null
          placa: string | null
          quilometragem: number | null
          sistema: string | null
          status: string | null
          tipo_manutencao: string | null
          tipo_manutencao_id: string | null
          user_id: string | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_tipo_manutencao_id_fkey"
            columns: ["tipo_manutencao_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_complete: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          days_until_expiration: number | null
          email: string | null
          endereco: string | null
          id: string | null
          limit_ai_analysis: number | null
          limit_categories: number | null
          limit_file_uploads: number | null
          limit_goals: number | null
          limit_market_items: number | null
          limit_transactions: number | null
          limit_vehicles: number | null
          name: string | null
          organization_name: string | null
          plan_features: Json | null
          plan_id: string | null
          plan_name: string | null
          plan_price: number | null
          profile_created_at: string | null
          profile_id: string | null
          role: string | null
          subscription_created_at: string | null
          subscription_expired: boolean | null
          subscription_expires_at: string | null
          subscription_id: string | null
          subscription_status: string | null
          telefone: string | null
          total_despesas_mes: number | null
          total_dividas_pendentes: number | null
          total_receitas_mes: number | null
          updated_at: string | null
          usage_ai_analysis: number | null
          usage_categories: number | null
          usage_file_uploads: number | null
          usage_goals: number | null
          usage_market_items: number | null
          usage_transactions: number | null
          usage_vehicles: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      update_updated_at_column: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      handle_new_user: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      invoke_process_reminders: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      atualizar_status_validade: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_faturas_cartao_updated_at: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      normalizar_chave_pix: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      sincronizar_proprietario_workspace: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      equipe_atualizar_updated_at: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      validar_workspace_equipe: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      validar_transicao_acerto: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      validar_transicao_pagamento: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      gerar_acerto_semanal: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      iniciar_pagamento_acerto: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      registrar_falha_pagamento: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      registrar_escala_folguista: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      confirmar_pagamento_acerto: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      cancelar_escala_e_recalcular_acerto: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      equipe_quinto_dia_util: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      gerar_obrigacoes_mensais_equipe: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      criar_lembrete_divida: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      importar_fatura_atomica: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      merge_nf_multipage_page: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      get_ia_config_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      merge_documento_sessao_page: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      get_divipay_config_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      has_senha_investimentos: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      registrar_falha_senha_investimentos: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      protect_profiles_role: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      enforce_profiles_role_insert: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      check_rate_limit: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      reserve_ai_tokens: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      reconcile_ai_tokens: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      reconcile_rate_limit: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      desbloquear_sessao_investimentos: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      is_investimentos_unlocked: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      aplicar_preco_alerta_eyemobile: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      validar_produto_equivalencia_tenant: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      validar_historico_custo_produto_tenant: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      aplicar_item_nf_estoque_custo: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_divida_after_payment: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      revert_divida_after_payment_deletion: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_valor_restante: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_payment_links_updated_at: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_meta_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_item_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      calcular_proxima_manutencao: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      log_admin_action: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ensure_user_default_workspaces: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      sync_pagamento_divida_to_despesa: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      preencher_workspace_id_custo: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      get_eyemobile_config_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          has_config: boolean
          environment: string
          has_secret: boolean
          store_id: string | null
          default_conta_id: string | null
          default_categoria_receita_id: string | null
          default_categoria_taxa_id: string | null
          auto_sync_sales: boolean
          auto_sync_stock: boolean
          last_synced_offset: number
        }[]
      }
      tem_acesso_workspace: {
        Args: {
          p_workspace_id: string
        }
        Returns: boolean
      }
      cleanup_expired_tokens: { Args: never; Returns: undefined }
      create_default_categories: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      delete_user_account: { Args: { user_id: string }; Returns: boolean }
      get_user_profile_by_phone: {
        Args: { phone_number: string }
        Returns: Json
      }
      verificar_manutencoes_nao_migradas: {
        Args: never
        Returns: {
          marca: string
          modelo: string
          tipo_manutencao_id: string
          tipo_nome: string
          total_manutencoes: number
          veiculo_id: string
        }[]
      }
    }
    Enums: {
      categoria_tipo: "receita" | "despesa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categoria_tipo: ["receita", "despesa"],
    },
  },
} as const
