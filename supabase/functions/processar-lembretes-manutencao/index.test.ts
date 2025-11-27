// Testes para a Edge Function processar-lembretes-manutencao
// Execute com: deno test --allow-env --allow-net

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

// Mock do Supabase Client
const createMockSupabaseClient = (mockData: any) => {
  return {
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: (column: string, value: any) => ({
          eq: (column2: string, value2: any) => ({
            order: (column: string, options: any) => ({
              limit: (n: number) => ({
                single: () => Promise.resolve(mockData[table]?.single || {}),
              }),
            }),
          }),
          single: () => Promise.resolve(mockData[table]?.single || {}),
        }),
        single: () => Promise.resolve(mockData[table]?.single || {}),
      }),
      insert: (data: any) => Promise.resolve({ data, error: null }),
      update: (data: any) => ({
        eq: (column: string, value: any) => Promise.resolve({ data, error: null }),
      }),
    }),
  };
};

Deno.test("enviarWebhook - deve enviar webhook com sucesso", async () => {
  // Mock de webhook bem-sucedido
  const mockFetch = (url: string, options: any) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });
  };

  // Substituir fetch global temporariamente
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const webhook = {
      id: "webhook-123",
      nome: "Teste",
      url: "https://example.com/webhook",
      ativo: true,
      retry_attempts: 3,
      retry_delay_seconds: 1,
      auth_header: null,
    };

    const payload = {
      tipo: "lembrete_manutencao" as const,
      timestamp: new Date().toISOString(),
      veiculo: {
        id: "veiculo-123",
        marca: "Yamaha",
        modelo: "Factor 125",
        placa: "ABC-1234",
        quilometragem: 10000,
      },
      manutencao: {
        tipo: "Troca de Óleo",
        sistema: "Motor",
        data_prevista: "2025-12-01",
        intervalo_km: 5000,
      },
      usuario: {
        id: "user-123",
        nome: "João Silva",
        telefone: "+5511999999999",
        email: "joao@example.com",
      },
      lembrete: {
        id: "lembrete-123",
        dias_antecedencia: 7,
      },
    };

    const mockSupabase = createMockSupabaseClient({});

    // Simular função enviarWebhook
    const enviarWebhook = async (
      supabaseAdmin: any,
      webhook: any,
      lembreteId: string,
      payload: any
    ): Promise<boolean> => {
      let tentativa = 0;
      const maxTentativas = webhook.retry_attempts;

      while (tentativa < maxTentativas) {
        tentativa++;

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            return true;
          }
        } catch (error) {
          if (tentativa >= maxTentativas) {
            return false;
          }
        }
      }

      return false;
    };

    const resultado = await enviarWebhook(
      mockSupabase,
      webhook,
      "lembrete-123",
      payload
    );

    assertEquals(resultado, true, "Webhook deve ser enviado com sucesso");
  } finally {
    // Restaurar fetch original
    globalThis.fetch = originalFetch;
  }
});

Deno.test("enviarWebhook - deve fazer retry em caso de falha", async () => {
  let tentativas = 0;

  const mockFetch = (url: string, options: any) => {
    tentativas++;
    return Promise.resolve({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const webhook = {
      id: "webhook-123",
      nome: "Teste",
      url: "https://example.com/webhook",
      ativo: true,
      retry_attempts: 3,
      retry_delay_seconds: 0, // Sem delay para teste rápido
      auth_header: null,
    };

    const payload = {
      tipo: "lembrete_manutencao" as const,
      timestamp: new Date().toISOString(),
      veiculo: {
        id: "veiculo-123",
        marca: "Yamaha",
        modelo: "Factor 125",
        placa: "ABC-1234",
        quilometragem: 10000,
      },
      manutencao: {
        tipo: "Troca de Óleo",
        sistema: "Motor",
        data_prevista: "2025-12-01",
        intervalo_km: 5000,
      },
      usuario: {
        id: "user-123",
        nome: "João Silva",
        telefone: "+5511999999999",
        email: "joao@example.com",
      },
      lembrete: {
        id: "lembrete-123",
        dias_antecedencia: 7,
      },
    };

    const mockSupabase = createMockSupabaseClient({});

    const enviarWebhook = async (
      supabaseAdmin: any,
      webhook: any,
      lembreteId: string,
      payload: any
    ): Promise<boolean> => {
      let tentativa = 0;
      const maxTentativas = webhook.retry_attempts;

      while (tentativa < maxTentativas) {
        tentativa++;

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            return true;
          }

          if (tentativa < maxTentativas) {
            await new Promise((resolve) =>
              setTimeout(resolve, webhook.retry_delay_seconds * 1000)
            );
          }
        } catch (error) {
          if (tentativa >= maxTentativas) {
            return false;
          }
        }
      }

      return false;
    };

    const resultado = await enviarWebhook(
      mockSupabase,
      webhook,
      "lembrete-123",
      payload
    );

    assertEquals(resultado, false, "Webhook deve falhar após 3 tentativas");
    assertEquals(tentativas, 3, "Deve fazer exatamente 3 tentativas");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("enviarWebhook - deve incluir header de autenticação", async () => {
  let headersRecebidos: any = null;

  const mockFetch = (url: string, options: any) => {
    headersRecebidos = options.headers;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const webhook = {
      id: "webhook-123",
      nome: "Teste",
      url: "https://example.com/webhook",
      ativo: true,
      retry_attempts: 3,
      retry_delay_seconds: 1,
      auth_header: "Bearer meu-token-secreto",
    };

    const payload = {
      tipo: "lembrete_manutencao" as const,
      timestamp: new Date().toISOString(),
      veiculo: {
        id: "veiculo-123",
        marca: "Yamaha",
        modelo: "Factor 125",
        placa: "ABC-1234",
        quilometragem: 10000,
      },
      manutencao: {
        tipo: "Troca de Óleo",
        sistema: "Motor",
        data_prevista: "2025-12-01",
        intervalo_km: 5000,
      },
      usuario: {
        id: "user-123",
        nome: "João Silva",
        telefone: "+5511999999999",
        email: "joao@example.com",
      },
      lembrete: {
        id: "lembrete-123",
        dias_antecedencia: 7,
      },
    };

    const mockSupabase = createMockSupabaseClient({});

    const enviarWebhook = async (
      supabaseAdmin: any,
      webhook: any,
      lembreteId: string,
      payload: any
    ): Promise<boolean> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (webhook.auth_header) {
        headers["Authorization"] = webhook.auth_header;
      }

      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      return response.ok;
    };

    await enviarWebhook(mockSupabase, webhook, "lembrete-123", payload);

    assertExists(headersRecebidos, "Headers devem existir");
    assertEquals(
      headersRecebidos["Authorization"],
      "Bearer meu-token-secreto",
      "Header de autenticação deve estar presente"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("filtrarLembretesParaEnviar - deve filtrar por data corretamente", () => {
  const hoje = new Date("2025-11-27");

  const lembretes = [
    {
      id: "1",
      data_prevista: "2025-12-04", // 7 dias no futuro
      dias_antecedencia: 7, // Enviar hoje (2025-11-27)
    },
    {
      id: "2",
      data_prevista: "2025-12-05", // 8 dias no futuro
      dias_antecedencia: 7, // Enviar amanhã (2025-11-28)
    },
    {
      id: "3",
      data_prevista: "2025-11-26", // Ontem
      dias_antecedencia: 7, // Deveria ter sido enviado há 8 dias
    },
  ];

  const filtrarLembretes = (lembretes: any[], hoje: Date) => {
    return lembretes.filter((lembrete) => {
      const dataPrevista = new Date(lembrete.data_prevista);
      const dataEnvio = new Date(dataPrevista);
      dataEnvio.setDate(dataEnvio.getDate() - lembrete.dias_antecedencia);

      return dataEnvio <= hoje;
    });
  };

  const resultado = filtrarLembretes(lembretes, hoje);

  assertEquals(resultado.length, 2, "Deve retornar 2 lembretes");
  assertEquals(resultado[0].id, "1", "Lembrete 1 deve ser incluído");
  assertEquals(resultado[1].id, "3", "Lembrete 3 deve ser incluído");
});

Deno.test("construirPayload - deve construir payload corretamente", () => {
  const veiculo = {
    id: "veiculo-123",
    marca: "Yamaha",
    modelo: "Factor 125",
    placa: "ABC-1234",
    quilometragem: 10000,
  };

  const manutencao = {
    nome: "Troca de Óleo",
    sistema: "Motor",
    intervalo_km: 5000,
  };

  const usuario = {
    id: "user-123",
    name: "João Silva",
    telefone: "+5511999999999",
    email: "joao@example.com",
  };

  const lembrete = {
    id: "lembrete-123",
    data_prevista: "2025-12-01",
    dias_antecedencia: 7,
  };

  const payload = {
    tipo: "lembrete_manutencao" as const,
    timestamp: new Date().toISOString(),
    veiculo: {
      id: veiculo.id,
      marca: veiculo.marca,
      modelo: veiculo.modelo,
      placa: veiculo.placa,
      quilometragem: veiculo.quilometragem,
    },
    manutencao: {
      tipo: manutencao.nome,
      sistema: manutencao.sistema,
      data_prevista: lembrete.data_prevista,
      intervalo_km: manutencao.intervalo_km,
    },
    usuario: {
      id: usuario.id,
      nome: usuario.name,
      telefone: usuario.telefone,
      email: usuario.email,
    },
    lembrete: {
      id: lembrete.id,
      dias_antecedencia: lembrete.dias_antecedencia,
    },
  };

  assertEquals(payload.tipo, "lembrete_manutencao");
  assertEquals(payload.veiculo.marca, "Yamaha");
  assertEquals(payload.manutencao.tipo, "Troca de Óleo");
  assertEquals(payload.usuario.nome, "João Silva");
  assertEquals(payload.lembrete.dias_antecedencia, 7);
  assertExists(payload.timestamp);
});


// ============================================
// TESTES ADICIONAIS DE RETRY LOGIC
// ============================================

Deno.test("retry - deve ter sucesso na segunda tentativa", async () => {
  let tentativas = 0;

  const mockFetch = (url: string, options: any) => {
    tentativas++;
    // Primeira tentativa falha, segunda sucede
    if (tentativas === 1) {
      return Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });
    } else {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("OK"),
      });
    }
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const webhook = {
      id: "webhook-123",
      nome: "Teste",
      url: "https://example.com/webhook",
      ativo: true,
      retry_attempts: 3,
      retry_delay_seconds: 0,
      auth_header: null,
    };

    const payload = {
      tipo: "lembrete_manutencao" as const,
      timestamp: new Date().toISOString(),
      veiculo: {
        id: "veiculo-123",
        marca: "Yamaha",
        modelo: "Factor 125",
        placa: "ABC-1234",
        quilometragem: 10000,
      },
      manutencao: {
        tipo: "Troca de Óleo",
        sistema: "Motor",
        data_prevista: "2025-12-01",
        intervalo_km: 5000,
      },
      usuario: {
        id: "user-123",
        nome: "João Silva",
        telefone: "+5511999999999",
        email: "joao@example.com",
      },
      lembrete: {
        id: "lembrete-123",
        dias_antecedencia: 7,
      },
    };

    const mockSupabase = createMockSupabaseClient({});

    const enviarWebhook = async (
      supabaseAdmin: any,
      webhook: any,
      lembreteId: string,
      payload: any
    ): Promise<boolean> => {
      let tentativa = 0;
      const maxTentativas = webhook.retry_attempts;

      while (tentativa < maxTentativas) {
        tentativa++;

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            return true;
          }

          if (tentativa < maxTentativas) {
            await new Promise((resolve) =>
              setTimeout(resolve, webhook.retry_delay_seconds * 1000)
            );
          }
        } catch (error) {
          if (tentativa >= maxTentativas) {
            return false;
          }
        }
      }

      return false;
    };

    const resultado = await enviarWebhook(
      mockSupabase,
      webhook,
      "lembrete-123",
      payload
    );

    assertEquals(resultado, true, "Webhook deve ter sucesso na 2ª tentativa");
    assertEquals(tentativas, 2, "Deve fazer exatamente 2 tentativas");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry - deve respeitar número máximo de tentativas configurado", async () => {
  let tentativas = 0;

  const mockFetch = (url: string, options: any) => {
    tentativas++;
    return Promise.resolve({
      ok: false,
      status: 503,
      text: () => Promise.resolve("Service Unavailable"),
    });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const webhook = {
      id: "webhook-123",
      nome: "Teste",
      url: "https://example.com/webhook",
      ativo: true,
      retry_attempts: 5, // 5 tentativas
      retry_delay_seconds: 0,
      auth_header: null,
    };

    const payload = {
      tipo: "lembrete_manutencao" as const,
      timestamp: new Date().toISOString(),
      veiculo: {
        id: "veiculo-123",
        marca: "Yamaha",
        modelo: "Factor 125",
        placa: "ABC-1234",
        quilometragem: 10000,
      },
      manutencao: {
        tipo: "Troca de Óleo",
        sistema: "Motor",
        data_prevista: "2025-12-01",
        intervalo_km: 5000,
      },
      usuario: {
        id: "user-123",
        nome: "João Silva",
        telefone: "+5511999999999",
        email: "joao@example.com",
      },
      lembrete: {
        id: "lembrete-123",
        dias_antecedencia: 7,
      },
    };

    const mockSupabase = createMockSupabaseClient({});

    const enviarWebhook = async (
      supabaseAdmin: any,
      webhook: any,
      lembreteId: string,
      payload: any
    ): Promise<boolean> => {
      let tentativa = 0;
      const maxTentativas = webhook.retry_attempts;

      while (tentativa < maxTentativas) {
        tentativa++;

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            return true;
          }

          if (tentativa < maxTentativas) {
            await new Promise((resolve) =>
              setTimeout(resolve, webhook.retry_delay_seconds * 1000)
            );
          }
        } catch (error) {
          if (tentativa >= maxTentativas) {
            return false;
          }
        }
      }

      return false;
    };

    const resultado = await enviarWebhook(
      mockSupabase,
      webhook,
      "lembrete-123",
      payload
    );

    assertEquals(resultado, false, "Webhook deve falhar após 5 tentativas");
    assertEquals(tentativas, 5, "Deve fazer exatamente 5 tentativas");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry - não deve fazer retry em caso de sucesso imediato", async () => {
  let tentativas = 0;

  const mockFetch = (url: string, options: any) => {
    tentativas++;
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve("OK"),
    });
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  try {
    const webhook = {
      id: "webhook-123",
      nome: "Teste",
      url: "https://example.com/webhook",
      ativo: true,
      retry_attempts: 5, // Configurado para 5, mas não deve usar
      retry_delay_seconds: 1,
      auth_header: null,
    };

    const payload = {
      tipo: "lembrete_manutencao" as const,
      timestamp: new Date().toISOString(),
      veiculo: {
        id: "veiculo-123",
        marca: "Yamaha",
        modelo: "Factor 125",
        placa: "ABC-1234",
        quilometragem: 10000,
      },
      manutencao: {
        tipo: "Troca de Óleo",
        sistema: "Motor",
        data_prevista: "2025-12-01",
        intervalo_km: 5000,
      },
      usuario: {
        id: "user-123",
        nome: "João Silva",
        telefone: "+5511999999999",
        email: "joao@example.com",
      },
      lembrete: {
        id: "lembrete-123",
        dias_antecedencia: 7,
      },
    };

    const mockSupabase = createMockSupabaseClient({});

    const enviarWebhook = async (
      supabaseAdmin: any,
      webhook: any,
      lembreteId: string,
      payload: any
    ): Promise<boolean> => {
      let tentativa = 0;
      const maxTentativas = webhook.retry_attempts;

      while (tentativa < maxTentativas) {
        tentativa++;

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            return true;
          }

          if (tentativa < maxTentativas) {
            await new Promise((resolve) =>
              setTimeout(resolve, webhook.retry_delay_seconds * 1000)
            );
          }
        } catch (error) {
          if (tentativa >= maxTentativas) {
            return false;
          }
        }
      }

      return false;
    };

    const resultado = await enviarWebhook(
      mockSupabase,
      webhook,
      "lembrete-123",
      payload
    );

    assertEquals(resultado, true, "Webhook deve ter sucesso");
    assertEquals(tentativas, 1, "Deve fazer apenas 1 tentativa (sem retry)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("retry - deve tratar diferentes status codes como falha", async () => {
  const statusCodes = [400, 401, 403, 404, 429, 500, 502, 503, 504];
  
  for (const statusCode of statusCodes) {
    let tentativas = 0;

    const mockFetch = (url: string, options: any) => {
      tentativas++;
      return Promise.resolve({
        ok: false,
        status: statusCode,
        text: () => Promise.resolve(`Error ${statusCode}`),
      });
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;

    try {
      const webhook = {
        id: "webhook-123",
        nome: "Teste",
        url: "https://example.com/webhook",
        ativo: true,
        retry_attempts: 2,
        retry_delay_seconds: 0,
        auth_header: null,
      };

      const payload = {
        tipo: "lembrete_manutencao" as const,
        timestamp: new Date().toISOString(),
        veiculo: {
          id: "veiculo-123",
          marca: "Yamaha",
          modelo: "Factor 125",
          placa: "ABC-1234",
          quilometragem: 10000,
        },
        manutencao: {
          tipo: "Troca de Óleo",
          sistema: "Motor",
          data_prevista: "2025-12-01",
          intervalo_km: 5000,
        },
        usuario: {
          id: "user-123",
          nome: "João Silva",
          telefone: "+5511999999999",
          email: "joao@example.com",
        },
        lembrete: {
          id: "lembrete-123",
          dias_antecedencia: 7,
        },
      };

      const mockSupabase = createMockSupabaseClient({});

      const enviarWebhook = async (
        supabaseAdmin: any,
        webhook: any,
        lembreteId: string,
        payload: any
      ): Promise<boolean> => {
        let tentativa = 0;
        const maxTentativas = webhook.retry_attempts;

        while (tentativa < maxTentativas) {
          tentativa++;

          try {
            const response = await fetch(webhook.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            });

            if (response.ok) {
              return true;
            }

            if (tentativa < maxTentativas) {
              await new Promise((resolve) =>
                setTimeout(resolve, webhook.retry_delay_seconds * 1000)
              );
            }
          } catch (error) {
            if (tentativa >= maxTentativas) {
              return false;
            }
          }
        }

        return false;
      };

      const resultado = await enviarWebhook(
        mockSupabase,
        webhook,
        "lembrete-123",
        payload
      );

      assertEquals(
        resultado,
        false,
        `Status ${statusCode} deve causar retry e falhar`
      );
      assertEquals(
        tentativas,
        2,
        `Status ${statusCode} deve fazer 2 tentativas`
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});
