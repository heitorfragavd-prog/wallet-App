import { describe, it, expect } from 'vitest';
import {
  parseOfx,
  parseCsv,
  parseExtratoBancario,
  sugerirCategoriaPorDescricao,
} from './ofxCsvParser';

describe('ofxCsvParser Service', () => {
  describe('sugerirCategoriaPorDescricao', () => {
    it('sugere categorias corretas para termos bancários comuns', () => {
      expect(sugerirCategoriaPorDescricao('Uber *Trip São Paulo')).toBe('Transporte');
      expect(sugerirCategoriaPorDescricao('Posto Shell Combustivel')).toBe('Transporte');
      expect(sugerirCategoriaPorDescricao('iFood *Pedido 1234')).toBe('Alimentação');
      expect(sugerirCategoriaPorDescricao('Restaurante Bom Sabor')).toBe('Alimentação');
      expect(sugerirCategoriaPorDescricao('Supermercado Carrefour')).toBe('Mercado');
      expect(sugerirCategoriaPorDescricao('Assai Atacadista')).toBe('Mercado');
      expect(sugerirCategoriaPorDescricao('Netflix.com')).toBe('Lazer');
      expect(sugerirCategoriaPorDescricao('Spotify AB')).toBe('Lazer');
      expect(sugerirCategoriaPorDescricao('Droga Raia Farmacia')).toBe('Saúde');
      expect(sugerirCategoriaPorDescricao('Enel Distribuicao SP')).toBe('Moradia');
      expect(sugerirCategoriaPorDescricao('Sabesp Agua')).toBe('Moradia');
      expect(sugerirCategoriaPorDescricao('Pix Recebido de João')).toBe('Salário');
      expect(sugerirCategoriaPorDescricao('Compra Desconhecida')).toBe('Outros');
    });

    it('trata valores nulos, vazios ou indefinidos sem quebrar', () => {
      expect(sugerirCategoriaPorDescricao('')).toBe('Outros');
      expect(sugerirCategoriaPorDescricao(null as unknown as string)).toBe('Outros');
      expect(sugerirCategoriaPorDescricao(undefined as unknown as string)).toBe('Outros');
    });
  });

  describe('parseOfx', () => {
    it('parseia extrato bancário OFX com receitas e despesas', () => {
      const ofxSample = `
        OFXHEADER:100
        <OFX>
          <BANKMSGSRSV1>
            <STMTTRNRS>
              <STMTRS>
                <BANKTRANLIST>
                  <STMTTRN>
                    <TRNTYPE>DEBIT</TRNTYPE>
                    <DTPOSTED>20260715120000[-3:BRT]</DTPOSTED>
                    <TRNAMT>-150.75</TRNAMT>
                    <FITID>NUB20260715001</FITID>
                    <NAME>Posto Ipiranga</NAME>
                  </STMTTRN>
                  <STMTTRN>
                    <TRNTYPE>CREDIT</TRNTYPE>
                    <DTPOSTED>20260720120000[-3:BRT]</DTPOSTED>
                    <TRNAMT>2500.00</TRNAMT>
                    <FITID>NUB20260720002</FITID>
                    <MEMO>Pix Recebido Salario</MEMO>
                  </STMTTRN>
                  <STMTTRN>
                    <TRNTYPE>OTHER</TRNTYPE>
                    <DTPOSTED>20260721120000[-3:BRT]</DTPOSTED>
                    <TRNAMT>0.00</TRNAMT>
                    <NAME>Operacao Zerada</NAME>
                  </STMTTRN>
                </BANKTRANLIST>
              </STMTRS>
            </STMTTRNRS>
          </BANKMSGSRSV1>
        </OFX>
      `;

      const result = parseOfx(ofxSample);

      expect(result).toHaveLength(2);

      // Despesa
      expect(result[0].fitid).toBe('NUB20260715001');
      expect(result[0].data).toBe('2026-07-15');
      expect(result[0].descricao).toBe('Posto Ipiranga');
      expect(result[0].valor).toBe(150.75);
      expect(result[0].tipo).toBe('despesa');
      expect(result[0].categoriaSugerida).toBe('Transporte');

      // Receita
      expect(result[1].fitid).toBe('NUB20260720002');
      expect(result[1].data).toBe('2026-07-20');
      expect(result[1].descricao).toBe('Pix Recebido Salario');
      expect(result[1].valor).toBe(2500.00);
      expect(result[1].tipo).toBe('receita');
      expect(result[1].categoriaSugerida).toBe('Salário');
    });

    it('corrige formato de data invertida YYYYDDMM em extratos de cooperativas', () => {
      const ofxInverted = `
        <STMTTRN>
          <DTPOSTED>20262508120000</DTPOSTED>
          <TRNAMT>-45.90</TRNAMT>
          <NAME>Padaria Estrela</NAME>
        </STMTTRN>
      `;

      const result = parseOfx(ofxInverted);
      expect(result).toHaveLength(1);
      expect(result[0].data).toBe('2026-08-25');
      expect(result[0].tipo).toBe('despesa');
      expect(result[0].categoriaSugerida).toBe('Alimentação');
    });

    it('retorna array vazio para conteúdo sem transações', () => {
      expect(parseOfx('')).toEqual([]);
      expect(parseOfx('<OFX><EMPTY/></OFX>')).toEqual([]);
    });
  });

  describe('parseCsv', () => {
    it('parseia CSV padrão com ponto e vírgula e formato brasileiro de moeda', () => {
      const csvContent = [
        'Data;Descricao;Valor',
        '10/08/2026;Supermercado Extra;-342,80',
        '12/08/2026;Pix Recebido Cliente;1.500,00',
        '15/08/2026;Farmacia Droga Raia;-89,90',
      ].join('\n');

      const result = parseCsv(csvContent);

      expect(result).toHaveLength(3);

      expect(result[0].data).toBe('2026-08-10');
      expect(result[0].descricao).toBe('Supermercado Extra');
      expect(result[0].valor).toBe(342.8);
      expect(result[0].tipo).toBe('despesa');
      expect(result[0].categoriaSugerida).toBe('Mercado');

      expect(result[1].data).toBe('2026-08-12');
      expect(result[1].descricao).toBe('Pix Recebido Cliente');
      expect(result[1].valor).toBe(1500.0);
      expect(result[1].tipo).toBe('receita');

      expect(result[2].data).toBe('2026-08-15');
      expect(result[2].descricao).toBe('Farmacia Droga Raia');
      expect(result[2].valor).toBe(89.9);
      expect(result[2].tipo).toBe('despesa');
      expect(result[2].categoriaSugerida).toBe('Saúde');
    });

    it('parseia CSV com vírgula e símbolos R$ em formato de exportação bancária', () => {
      const csvContent = [
        'date;title;amount',
        '2026-09-01;Uber Trip;R$ -35,50',
        '2026-09-02;Restaurante Paris;R$ -120,00',
      ].join('\n');

      const result = parseCsv(csvContent);

      expect(result).toHaveLength(2);
      expect(result[0].data).toBe('2026-09-01');
      expect(result[0].descricao).toBe('Uber Trip');
      expect(result[0].valor).toBe(35.5);
      expect(result[0].tipo).toBe('despesa');
      expect(result[0].categoriaSugerida).toBe('Transporte');
    });

    it('retorna array vazio para CSV sem linhas ou em branco', () => {
      expect(parseCsv('')).toEqual([]);
      expect(parseCsv('\n\n  \n')).toEqual([]);
    });
  });

  describe('parseExtratoBancario', () => {
    it('direciona para parseOfx quando nome termina em .ofx ou .qfx', () => {
      const ofxSample = `
        <STMTTRN>
          <DTPOSTED>20260710120000</DTPOSTED>
          <TRNAMT>-99.00</TRNAMT>
          <NAME>Netflix</NAME>
        </STMTTRN>
      `;

      const result = parseExtratoBancario(ofxSample, 'extrato_julho.ofx');
      expect(result).toHaveLength(1);
      expect(result[0].descricao).toBe('Netflix');
      expect(result[0].categoriaSugerida).toBe('Lazer');
    });

    it('direciona para parseOfx quando conteúdo tem tags OFX mesmo sem extensão .ofx', () => {
      const ofxSample = `
        <OFX>
          <STMTTRN>
            <DTPOSTED>20260710120000</DTPOSTED>
            <TRNAMT>500.00</TRNAMT>
            <NAME>Pix Recebido</NAME>
          </STMTTRN>
        </OFX>
      `;

      const result = parseExtratoBancario(ofxSample, 'documento_sem_extensao');
      expect(result).toHaveLength(1);
      expect(result[0].tipo).toBe('receita');
    });

    it('direciona para parseCsv quando o arquivo for .csv', () => {
      const csvSample = 'Data;Historico;Valor\n05/09/2026;Luz Cemig;-180,00';
      const result = parseExtratoBancario(csvSample, 'extrato.csv');
      expect(result).toHaveLength(1);
      expect(result[0].descricao).toBe('Luz Cemig');
      expect(result[0].categoriaSugerida).toBe('Moradia');
    });
  });
});
