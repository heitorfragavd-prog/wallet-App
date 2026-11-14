import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseNfeXml } from '../../supabase/functions/_shared/ai/nfe-xml-parser';
import { findGlobalFinancialDuplicate } from '../../supabase/functions/_shared/ai/financial-deduplication';

describe('👑 WALLET CEO 3.0 — Etapa 11 (Gates 4, 5 e 6): Inteligência Documental e Deduplicação Global', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Extrator Determinístico de NF-e XML (Gate 4)', () => {
    const mockValidNfeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35261112345678000199550010000012341234567890" versao="4.00">
      <ide>
        <nNF>1234</nNF>
        <serie>1</serie>
        <dhEmi>2026-11-14T09:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>DISTRIBUIDORA DE CAFE MINEIRO LTDA</xNome>
        <xFant>CAFE MINEIRO</xFant>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>RODO POINT CAFE LTDA</xNome>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>PROD-01</cProd>
          <xProd>Graos de Cafe Especial 1kg</xProd>
          <NCM>09012100</NCM>
          <CFOP>5102</CFOP>
          <uCom>KG</uCom>
          <qCom>10.0000</qCom>
          <vUnCom>45.0000</vUnCom>
          <vProd>450.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>PROD-02</cProd>
          <xProd>Filtro de Papel Industrial</xProd>
          <NCM>48232000</NCM>
          <CFOP>5102</CFOP>
          <uCom>CX</uCom>
          <qCom>2.0000</qCom>
          <vUnCom>25.0000</vUnCom>
          <vProd>50.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>500.00</vProd>
          <vFrete>0.00</vFrete>
          <vDesc>0.00</vDesc>
          <vNF>500.00</vNF>
        </ICMSTot>
      </total>
      <cobr>
        <dup>
          <nDup>001</nDup>
          <dVenc>2026-11-30</dVenc>
          <vDup>500.00</vDup>
        </dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>`;

    it('extrai com 100% de fidelidade fiscal os dados de cabeçalho, emitente e valores', () => {
      const res = parseNfeXml(mockValidNfeXml);

      expect(res.valido).toBe(true);
      expect(res.chaveAcesso).toBe('35261112345678000199550010000012341234567890');
      expect(res.numeroNota).toBe('1234');
      expect(res.dataEmissao).toBe('2026-11-14');
      expect(res.emitente.cnpj).toBe('12345678000199');
      expect(res.emitente.razaoSocial).toBe('DISTRIBUIDORA DE CAFE MINEIRO LTDA');
      expect(res.emitente.nomeFantasia).toBe('CAFE MINEIRO');
      expect(res.valores.valorTotal).toBe(500.00);
      expect(res.valores.valorProdutos).toBe(500.00);
    });

    it('extrai itens individuais e realiza validação matemática determinística', () => {
      const res = parseNfeXml(mockValidNfeXml);

      expect(res.itens.length).toBe(2);
      expect(res.itens[0].descricao).toBe('Graos de Cafe Especial 1kg');
      expect(res.itens[0].quantidade).toBe(10);
      expect(res.itens[0].valorUnitario).toBe(45);
      expect(res.itens[0].valorTotal).toBe(450);

      expect(res.itens[1].descricao).toBe('Filtro de Papel Industrial');
      expect(res.itens[1].quantidade).toBe(2);
      expect(res.itens[1].valorUnitario).toBe(25);
      expect(res.itens[1].valorTotal).toBe(50);

      // 450 + 50 = 500
      expect(res.validacaoMatematica.valido).toBe(true);
      expect(res.validacaoMatematica.somaItens).toBe(500.00);
      expect(res.validacaoMatematica.diferenca).toBe(0);
    });

    it('extrai duplicatas e vencimentos para contas a pagar', () => {
      const res = parseNfeXml(mockValidNfeXml);

      expect(res.duplicatas.length).toBe(1);
      expect(res.duplicatas[0].numero).toBe('001');
      expect(res.duplicatas[0].vencimento).toBe('2026-11-30');
      expect(res.duplicatas[0].valor).toBe(500.00);
    });

    it('rejeita xml corrompido ou sem infNFe', () => {
      const res = parseNfeXml('<xml><outro>documento</outro></xml>');
      expect(res.valido).toBe(false);
      expect(res.erro).toContain('não contém estrutura reconhecível');
    });
  });

  describe('Deduplicação Global Trilateral (Gate 6)', () => {
    it('detecta duplicidade de documento já cadastrado em dividas por linha digitavel', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'dividas') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'divida-existente-1', descricao: 'Boleto Cafe Mineiro', status: 'pendente', valor_total: 500 }],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }),
      };

      const res = await findGlobalFinancialDuplicate(mockSupabase as unknown as import('@supabase/supabase-js').SupabaseClient, {
        workspaceId: 'ws-123',
        linhaDigitavel: '34191090080000012345678901234567890123456789',
      });

      expect(res.isDuplicate).toBe(true);
      expect(res.source).toBe('dividas');
      expect(res.existingRecordId).toBe('divida-existente-1');
    });

    it('detecta duplicidade de NF-e por chave de acesso em wallet_ai_action_proposals', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'dividas') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
          if (table === 'wallet_ai_action_proposals') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              neq: vi.fn().mockReturnThis(),
              contains: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'prop-danfe-99', status: 'prepared', summary: 'Nota Fiscal 1234' }],
                error: null,
              }),
            };
          }
          return { select: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }),
      };

      const res = await findGlobalFinancialDuplicate(mockSupabase as unknown as import('@supabase/supabase-js').SupabaseClient, {
        workspaceId: 'ws-123',
        chaveAcesso: '35261112345678000199550010000012341234567890',
      });

      expect(res.isDuplicate).toBe(true);
      expect(res.source).toBe('proposal');
      expect(res.matchedField).toBe('chave_acesso');
      expect(res.existingRecordId).toBe('prop-danfe-99');
    });

    it('retorna isDuplicate false quando documento for inédito', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          neq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          contains: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };

      const res = await findGlobalFinancialDuplicate(mockSupabase as unknown as import('@supabase/supabase-js').SupabaseClient, {
        workspaceId: 'ws-123',
        linhaDigitavel: '11111111111111111111111111111111111111111111',
        chaveAcesso: '99999999999999999999999999999999999999999999',
      });

      expect(res.isDuplicate).toBe(false);
    });
  });
});
