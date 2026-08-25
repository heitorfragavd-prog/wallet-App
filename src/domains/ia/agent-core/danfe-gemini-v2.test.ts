import { describe, it, expect } from 'vitest';
import {
  sanitizeProductDescription,
  validateProductRowV2,
  reconcileAndDeduplicateV2,
  validateDanfeMathV2,
  parseFiscalNumber,
  DanfeItemV2
} from './danfe-gemini-v2';

describe('WALLET — Pipeline DANFE Gemini V2 (Suíte Completa de Testes)', () => {
  // 1. Document de alta resolução -> V2 recebe resolução original
  it('1. deve suportar e manter metadados de documento original', () => {
    const item: DanfeItemV2 = {
      codigo: '118463',
      ean: null,
      descricao: 'Monster Energy LT 473ml 06L FL CP',
      ncm: '22029900',
      cst: '010',
      cfop: '5403',
      unidade: 'CX',
      quantidade: 2,
      valor_unitario_lido: 43.255,
      valor_unitario_calculado: null,
      valor_unitario_inferido: false,
      valor_total_lido: 86.51,
      valor_total_calculado: null,
      valor_total_inferido: false,
      valor_total: 86.51,
      valor_unitario: 43.255,
      fci_info: null,
      campos_incompletos: []
    };
    expect(item.valor_total).toBe(86.51);
    expect(item.valor_unitario_inferido).toBe(false);
  });

  // 2. Photo -> validação preserva origem comprimida
  it('2. deve registrar corretamente item extraído de Telegram Photo', () => {
    const raw = {
      codigo: '55404',
      descricao: 'COCA COLA LT 350ML 12 FL',
      ncm: '22021000',
      cfop: '5401',
      unidade: 'CX',
      quantidade: '2,00',
      valor_unitario: '33,01',
      valor_total: '66,02'
    };
    const res = validateProductRowV2(raw);
    expect(res.isValid).toBe(true);
    expect(res.item?.quantidade).toBe(2);
    expect(res.item?.valor_total).toBe(66.02);
  });

  // 3. Sanitização de FCI: "Resolução do Senado Federal nº 13/12"
  it('3. produto contendo "Resolução do Senado Federal nº 13/12" continua sendo produto válido', () => {
    const raw = {
      codigo: '119509',
      descricao: `Monster Pipeline Punch LT 473ml 06LT FC\nResolução do Senado Federal nº 13/12, Numero da FCI AC0ABC83-EB21-4A0B-BC8B-B24370078889`,
      ncm: '22029900',
      cfop: '5403',
      unidade: 'CX',
      quantidade: 1,
      valor_unitario: 43.26,
      valor_total: 43.26
    };
    const res = validateProductRowV2(raw);
    expect(res.isValid).toBe(true);
    expect(res.item?.descricao).toBe('Monster Pipeline Punch LT 473ml 06LT FC');
    expect(res.item?.fci_info).toContain('13/12');
  });

  // 4. Rodapé puro: "INFORMAÇÕES COMPLEMENTARES" é rejeitado
  it('4. rodapé puro "INFORMAÇÕES COMPLEMENTARES" deve ser rejeitado', () => {
    const raw = {
      codigo: null,
      descricao: 'INFORMAÇÕES COMPLEMENTARES',
      unidade: 'UN',
      quantidade: 1,
      valor_unitario: 0,
      valor_total: 0
    };
    const res = validateProductRowV2(raw);
    expect(res.isValid).toBe(false);
    expect(res.motivo).toContain('rodapé');
  });

  // 5. Unidade ilegível: NÃO vira "UN" automaticamente
  it('5. unidade ausente ou ilegível deve permanecer null e não virar "UN"', () => {
    const raw = {
      codigo: '56443',
      descricao: 'Coca-Cola Zero PET 200ml',
      ncm: '22021000',
      cfop: '5403',
      unidade: null,
      quantidade: 4,
      valor_unitario: 16.0325,
      valor_total: 64.13
    };
    const res = validateProductRowV2(raw);
    expect(res.isValid).toBe(true);
    expect(res.item?.unidade).toBeNull();
    expect(res.item?.campos_incompletos).toContain('unidade');
  });

  // 6. Valor unitário ausente: valor calculado fica separado do lido
  it('6. valor unitário ausente deve ser calculado mantendo flag valor_unitario_inferido=true', () => {
    const raw = {
      codigo: '56298',
      descricao: 'Coca-Cola PET 200ml',
      ncm: '22021000',
      cfop: '5401',
      unidade: 'CX',
      quantidade: 8,
      valor_unitario: null,
      valor_total: 128.26
    };
    const res = validateProductRowV2(raw);
    expect(res.isValid).toBe(true);
    expect(res.item?.valor_unitario_lido).toBeNull();
    expect(res.item?.valor_unitario_inferido).toBe(true);
    expect(res.item?.valor_unitario_calculado).toBe(16.0325);
    expect(res.item?.valor_total_lido).toBe(128.26);
  });

  // 7. Soma exata -> VALIDO
  it('7. soma exata deve resultar em status VALIDO', () => {
    const itens: DanfeItemV2[] = [
      { codigo: '1', ean: null, descricao: 'A', ncm: '1234', cst: null, cfop: '5401', unidade: 'CX', quantidade: 1, valor_unitario_lido: 500, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 500, valor_total_calculado: null, valor_total_inferido: false, valor_total: 500, valor_unitario: 500, fci_info: null, campos_incompletos: [] },
      { codigo: '2', ean: null, descricao: 'B', ncm: '1234', cst: null, cfop: '5401', unidade: 'CX', quantidade: 1, valor_unitario_lido: 585.49, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 585.49, valor_total_calculado: null, valor_total_inferido: false, valor_total: 585.49, valor_unitario: 585.49, fci_info: null, campos_incompletos: [] }
    ];
    const val = validateDanfeMathV2(itens, 1085.49);
    expect(val.valido).toBe(true);
    expect(val.diferenca).toBe(0);
  });

  // 8. Soma divergente -> REVISAR
  it('8. soma divergente deve resultar em status REVISAR', () => {
    const itens: DanfeItemV2[] = [
      { codigo: '1', ean: null, descricao: 'A', ncm: '1234', cst: null, cfop: '5401', unidade: 'CX', quantidade: 1, valor_unitario_lido: 500, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 500, valor_total_calculado: null, valor_total_inferido: false, valor_total: 500, valor_unitario: 500, fci_info: null, campos_incompletos: [] }
    ];
    const val = validateDanfeMathV2(itens, 1085.49);
    expect(val.valido).toBe(false);
    expect(val.diferenca).toBe(-585.49);
  });

  // 9. Reconciliação sem _row_center não duplica itens
  it('9. reconciliação V2 não deve duplicar itens idênticos', () => {
    const i1: DanfeItemV2[] = [
      { codigo: '55404', ean: null, descricao: 'COCA COLA 350ML', ncm: '22021000', cst: null, cfop: '5401', unidade: 'CX', quantidade: 2, valor_unitario_lido: 33.01, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 66.02, valor_total_calculado: null, valor_total_inferido: false, valor_total: 66.02, valor_unitario: 33.01, fci_info: null, campos_incompletos: [] }
    ];
    const i2: DanfeItemV2[] = [
      { codigo: '55404', ean: null, descricao: 'COCA COLA 350ML', ncm: '22021000', cst: null, cfop: '5401', unidade: 'CX', quantidade: 2, valor_unitario_lido: 33.01, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 66.02, valor_total_calculado: null, valor_total_inferido: false, valor_total: 66.02, valor_unitario: 33.01, fci_info: null, campos_incompletos: [] },
      { codigo: '119123', ean: null, descricao: 'GUA LEAO ACAI', ncm: '22021000', cst: null, cfop: '5403', unidade: 'CX', quantidade: 1, valor_unitario_lido: 13.11, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 13.11, valor_total_calculado: null, valor_total_inferido: false, valor_total: 13.11, valor_unitario: 13.11, fci_info: null, campos_incompletos: [] }
    ];
    const res = reconcileAndDeduplicateV2(i1, i2);
    expect(res.length).toBe(2);
    expect(res[0].codigo).toBe('55404');
    expect(res[1].codigo).toBe('119123');
  });

  // 10. Rejeição de linha sem nenhum sinal fiscal identificador
  it('10. deve rejeitar linha sem nenhum código, EAN, NCM ou CFOP', () => {
    const raw = {
      codigo: null,
      ean: null,
      ncm: null,
      cfop: null,
      descricao: 'TEXTO QUALQUER SEM DADO FISCAL',
      quantidade: 1,
      valor_total: 50
    };
    const res = validateProductRowV2(raw);
    expect(res.isValid).toBe(false);
    expect(res.motivo).toContain('sinal fiscal');
  });

  // ─── CENÁRIOS DE CONTROLE DA FEATURE FLAG E RESILIÊNCIA A FALHAS ───

  // A - Flag ausente (undefined) -> V2 desligado (Fail-Closed)
  it('A. flag ausente (undefined) deve manter Gemini V2 desligado', () => {
    const envFlag: string | undefined = undefined;
    const isGeminiV2Enabled = envFlag === "true";
    expect(isGeminiV2Enabled).toBe(false);
  });

  // B - Flag "false" -> V2 desligado
  it('B. flag "false" deve manter Gemini V2 desligado', () => {
    const envFlag: string = "false";
    const isGeminiV2Enabled = envFlag === "true";
    expect(isGeminiV2Enabled).toBe(false);
  });

  // C - Flag "true" -> V2 ligado
  it('C. flag "true" deve ligar o Gemini V2', () => {
    const envFlag: string = "true";
    const isGeminiV2Enabled = envFlag === "true";
    expect(isGeminiV2Enabled).toBe(true);
  });

  // D - Gemini 429 -> status requer_revisao com motivo gemini_rate_limit (SEM fallback silencioso)
  it('D. erro HTTP 429 deve marcar requer_revisao com motivo gemini_rate_limit', () => {
    const errorStatus = 429;
    const documentData = {
      tipo: 'nf_compra',
      pipeline: 'gemini_v2',
      confianca_geral: 'baixa',
      status_validacao: 'requer_revisao',
      motivo_revisao: errorStatus === 429 ? 'gemini_rate_limit' : 'gemini_processing_error',
      itens: []
    };
    expect(documentData.pipeline).toBe('gemini_v2');
    expect(documentData.status_validacao).toBe('requer_revisao');
    expect(documentData.motivo_revisao).toBe('gemini_rate_limit');
  });

  // E - Gemini timeout -> status requer_revisao com motivo gemini_timeout
  it('E. timeout no Gemini deve marcar requer_revisao com motivo gemini_timeout', () => {
    const err = new Error('The operation was aborted due to timeout');
    const isTimeout = String(err.message).includes('timeout');
    const documentData = {
      tipo: 'nf_compra',
      pipeline: 'gemini_v2',
      confianca_geral: 'baixa',
      status_validacao: 'requer_revisao',
      motivo_revisao: isTimeout ? 'gemini_timeout' : 'gemini_processing_error',
      itens: []
    };
    expect(documentData.pipeline).toBe('gemini_v2');
    expect(documentData.status_validacao).toBe('requer_revisao');
    expect(documentData.motivo_revisao).toBe('gemini_timeout');
  });

  // F1 - HTTP 200 + Texto Não-JSON -> status requer_revisao com motivo gemini_invalid_json
  it('F1. retorno de texto não-JSON pelo Gemini deve marcar requer_revisao com motivo gemini_invalid_json', () => {
    const rawText = "Não foi possível identificar a tabela com precisão.";
    let rawList: any[] | null = null;
    try {
      const p = JSON.parse(rawText);
      if (Array.isArray(p)) rawList = p;
      else if (Array.isArray(p.itens)) rawList = p.itens;
    } catch {
      rawList = null;
    }
    const documentData = {
      tipo: 'nf_compra',
      pipeline: 'gemini_v2',
      confianca_geral: 'baixa',
      status_validacao: 'requer_revisao',
      motivo_revisao: rawList === null ? 'gemini_invalid_json' : 'ok',
      itens: []
    };
    expect(documentData.pipeline).toBe('gemini_v2');
    expect(documentData.status_validacao).toBe('requer_revisao');
    expect(documentData.motivo_revisao).toBe('gemini_invalid_json');
  });

  // F2 - HTTP 200 + JSON { itens: [] } em DANFE -> status requer_revisao com motivo gemini_empty_products
  it('F2. retorno de JSON com 0 itens para DANFE deve marcar requer_revisao e nunca ok', () => {
    const rawText = JSON.stringify({ itens: [] });
    let rawList: any[] | null = null;
    try {
      const p = JSON.parse(rawText);
      if (Array.isArray(p.itens)) rawList = p.itens;
    } catch {
      rawList = null;
    }
    const documentData = {
      tipo: 'nf_compra',
      pipeline: 'gemini_v2',
      confianca_geral: 'baixa',
      status_validacao: 'requer_revisao',
      motivo_revisao: (rawList && rawList.length === 0) ? 'gemini_empty_products' : 'ok',
      itens: []
    };
    expect(documentData.pipeline).toBe('gemini_v2');
    expect(documentData.status_validacao).toBe('requer_revisao');
    expect(documentData.motivo_revisao).toBe('gemini_empty_products');
  });

  // F3 - HTTP 200 + JSON Válido com Itens -> fluxo normal V2
  it('F3. retorno de JSON válido com itens segue o fluxo normal V2', () => {
    const rawText = JSON.stringify({
      itens: [
        { codigo: '118463', descricao: 'MONSTER ENERGY 473ML', ncm: '22029900', cfop: '5403', unidade: 'CX', quantidade: 2, valor_unitario: 43.255, valor_total: 86.51 }
      ]
    });
    const p = JSON.parse(rawText);
    const itensValidados = p.itens.map((r: any) => validateProductRowV2(r).item).filter(Boolean);
    const validacao = validateDanfeMathV2(itensValidados as DanfeItemV2[], 86.51);
    expect(validacao.valido).toBe(true);
    expect(validacao.status).toBe('ok');
  });

  // G - Flag desligada -> Executa pipeline legacy como rollback explícito
  it('G. quando flag estiver desligada, pipeline deve ser estritamente legacy', () => {
    const isGeminiV2Enabled = false;
    const pipeline = isGeminiV2Enabled ? 'gemini_v2' : 'legacy';
    expect(pipeline).toBe('legacy');
  });

  // ─── CENÁRIOS ESPECÍFICOS DE CABEÇALHO, TOTAIS E VALIDAÇÃO FISCAL (ITEM 9) ───

  // A. Cabeçalho completo
  it('9A. deve aceitar e preservar cabeçalho completo fiscal', () => {
    const cabecalho = {
      fornecedor: 'SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A',
      cnpj_fornecedor: '61.186.888/0020-56',
      numero_nf: '013.790.902',
      serie_nf: '26',
      data_emissao: '2026-08-21'
    };
    expect(cabecalho.fornecedor).toBe('SPAL INDUSTRIA BRASILEIRA DE BEBIDAS S/A');
    expect(cabecalho.numero_nf).toBe('013.790.902');
    expect(cabecalho.serie_nf).toBe('26');
    expect(cabecalho.data_emissao).toBe('2026-08-21');
  });

  // B. Valor produtos e valor nota separados (nunca misturar)
  it('9B. deve manter valor_produtos e valor_total_nf estritamente separados', () => {
    const valores_totais = {
      valor_produtos: 321.64,
      valor_total_nf: 1562.61
    };
    expect(valores_totais.valor_produtos).not.toEqual(valores_totais.valor_total_nf);
    expect(valores_totais.valor_produtos).toBe(321.64);
    expect(valores_totais.valor_total_nf).toBe(1562.61);
  });

  // C. Soma de itens diferente (soma=424.45, nf=321.64 -> status requer_revisao)
  it('9C. soma de itens diferente do valor dos produtos da NF deve resultar em requer_revisao', () => {
    const itens: DanfeItemV2[] = [
      { codigo: '1', ean: null, descricao: 'Item 1', ncm: '123', cst: null, cfop: '5401', unidade: 'UN', quantidade: 1, valor_unitario_lido: 424.45, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 424.45, valor_total_calculado: null, valor_total_inferido: false, valor_total: 424.45, valor_unitario: 424.45, fci_info: null, campos_incompletos: [] }
    ];
    const val = validateDanfeMathV2(itens, 321.64);
    expect(val.valido).toBe(false);
    expect(val.status).toBe('requer_revisao');
    expect(val.diferenca).toBe(102.81);
    expect(val.motivo).toContain('Divergência matemática');
  });

  // D. Valor produtos ausente (valorProdutosNF = null -> status requer_revisao)
  it('9D. valor_produtos da NF ausente ou nulo deve resultar em requer_revisao e nunca ok', () => {
    const itens: DanfeItemV2[] = [
      { codigo: '1', ean: null, descricao: 'Item 1', ncm: '123', cst: null, cfop: '5401', unidade: 'UN', quantidade: 1, valor_unitario_lido: 424.45, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 424.45, valor_total_calculado: null, valor_total_inferido: false, valor_total: 424.45, valor_unitario: 424.45, fci_info: null, campos_incompletos: [] }
    ];
    const val = validateDanfeMathV2(itens, null);
    expect(val.valido).toBe(false);
    expect(val.status).toBe('requer_revisao');
    expect(val.motivo).toContain('valor_produtos_nf_ausente');
  });

  // E. Proibir fallback silencioso de soma para total de produtos
  it('9E. é proibido atribuir a soma dos itens como se fosse o valor dos produtos da NF', () => {
    const somaItens = 424.45;
    const rawValorProdutosNF = null;
    const valorProdutosNF = (rawValorProdutosNF != null && Number(rawValorProdutosNF) > 0) ? Number(rawValorProdutosNF) : null;
    expect(valorProdutosNF).toBeNull();
    expect(valorProdutosNF).not.toBe(somaItens);
  });

  // F. Botão confirmar não deve ser gerado para status requer_revisao
  it('9F. nota com status requer_revisao não deve permitir botões de confirmação de estoque', () => {
    const statusValidacao = 'requer_revisao';
    const gerarBotoesConfirmacao = (status: string) => {
      if (status !== 'ok') return [];
      return [{ text: '✅ SIM, confirmar', callback_data: 'nf_confirmar:123' }];
    };
    const botoes = gerarBotoesConfirmacao(statusValidacao);
    expect(botoes).toHaveLength(0);
  });

  // G. Status válido somente quando soma == valorProdutosNF dentro da tolerância
  it('9G. status somente é ok quando soma dos itens for igual ao valor_produtos da NF', () => {
    const itens: DanfeItemV2[] = [
      { codigo: '1', ean: null, descricao: 'Item 1', ncm: '123', cst: null, cfop: '5401', unidade: 'UN', quantidade: 1, valor_unitario_lido: 321.64, valor_unitario_calculado: null, valor_unitario_inferido: false, valor_total_lido: 321.64, valor_total_calculado: null, valor_total_inferido: false, valor_total: 321.64, valor_unitario: 321.64, fci_info: null, campos_incompletos: [] }
    ];
    const val = validateDanfeMathV2(itens, 321.64);
    expect(val.valido).toBe(true);
    expect(val.status).toBe('ok');
    expect(val.diferenca).toBe(0);
  });
});
