import { describe, expect, it } from 'vitest';

import {
  maskBankAccount,
  maskCpf,
  maskPixKey,
  normalizePixKey,
} from './equipePrivacy';

describe('equipePrivacy', () => {
  it('normaliza documentos, telefone, email e chave aleatoria como o banco', () => {
    expect(normalizePixKey('123.456.789-00')).toBe('12345678900');
    expect(normalizePixKey('+55 (11) 99999-0000')).toBe('5511999990000');
    expect(normalizePixKey(' Heitor.Fraga+loja@Email.COM ')).toBe('heitor.fraga+loja@email.com');
    expect(normalizePixKey('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567e89b12d3a456426614174000');
  });

  it('mascara CPF preservando somente a identificacao parcial necessaria', () => {
    expect(maskCpf('12345678900')).toBe('***.456.789-**');
    expect(maskCpf('123.456.789-00')).toBe('***.456.789-**');
  });

  it('mascara Pix por tipo sem expor a chave completa', () => {
    expect(maskPixKey('heitor@email.com', 'email')).toBe('h***@email.com');
    expect(maskPixKey('123.456.789-00', 'cpf')).toBe('***.456.789-**');
    expect(maskPixKey('+55 (11) 99999-0000', 'telefone')).toBe('*********0000');
    expect(maskPixKey('123e4567-e89b-12d3-a456-426614174000', 'aleatoria')).toBe('123e************************4000');
  });

  it('mascara conta bancaria mantendo apenas o sufixo de conferencia', () => {
    expect(maskBankAccount('123456-7')).toBe('***456-7');
    expect(maskBankAccount('')).toBe('Nao informado');
  });
});
