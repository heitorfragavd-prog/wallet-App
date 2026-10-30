/**
 * Regras e listas canônicas de permissão para a operação de Delivery e KDS
 */

export const RESTRICTED_FINANCIAL_ROUTES = [
  '/dre',
  '/fluxo-caixa',
  '/contas',
  '/dividas',
  '/relatorios',
  '/ceo',
  '/recibos',
  '/conciliacao',
  '/patrimonio',
  '/centros-custo',
  '/fornecedores',
];

/**
 * Verifica se um papel/cargo pertence estritamente ao time operacional de entrega/cozinha
 */
export function isDeliveryStaffRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  return (
    normalized === 'delivery_staff' ||
    normalized === 'delivery_operator' ||
    normalized === 'kds_staff' ||
    normalized === 'cozinha' ||
    normalized === 'expedicao'
  );
}

/**
 * Verifica se o usuário tem autorização para visualizar dados financeiros e DRE
 */
export function canAccessFinancials(role?: string | null): boolean {
  return !isDeliveryStaffRole(role);
}
