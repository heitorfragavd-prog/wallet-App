export type PixKeyType = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria' | string;

export function normalizePixKey(value: string | null | undefined): string {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed) return '';
  if (trimmed.includes('@')) return trimmed;
  return trimmed.replace(/[^a-z0-9]/g, '');
}

export function maskCpf(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return 'CPF invalido';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function maskPixKey(value: string | null | undefined, type: PixKeyType): string {
  const normalized = normalizePixKey(value);
  if (!normalized) return 'Nao informado';

  if (type === 'email' || normalized.includes('@')) {
    const [local, domain] = normalized.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 1) || '*'}***@${domain}`;
  }

  if (type === 'cpf') return maskCpf(normalized);

  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  if (type === 'aleatoria') {
    return `${normalized.slice(0, 4)}${'*'.repeat(normalized.length - 8)}${normalized.slice(-4)}`;
  }

  return `${'*'.repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

export function maskBankAccount(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return 'Nao informado';
  if (trimmed.length <= 5) return `***${trimmed.slice(-2)}`;
  return `${'*'.repeat(Math.max(3, trimmed.length - 5))}${trimmed.slice(-5)}`;
}
