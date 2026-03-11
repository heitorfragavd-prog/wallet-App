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
          transacao_tipo: string
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
          transacao_tipo: string
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
          transacao_tipo?: string
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
          created_at: string
          id: string
          nome: string
          saldo: number
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          saldo?: number
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          saldo?: number
          tipo?: string
          user_id?: string
        }
        Relationships: []
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
          recorrencia: string
          tipo_transacao: string
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
          recorrencia: string
          tipo_transacao: string
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
          recorrencia?: string
          tipo_transacao?: string
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
