/**
 * Regras e listas canônicas de permissão para a operação de Delivery e KDS
 */

export const ALLOWED_DELIVERY_STAFF_ROUTES = [
  '/delivery/kds',
  '/delivery',
  '/perfil',
  '/login',
];

export const RESTRICTED_FINANCIAL_ROUTES = [
  '/dashboard',
  '/receitas',
  '/despesas',
  '/transacoes',
  '/dividas',
  '/categorias',
  '/subcategorias',
  '/relatorios',
  '/metas',
  '/mercado',
  '/veiculos',
  '/ia',
  '/ia-v2',
  '/ia-chat',
  '/ia-legacy',
  '/lembretes',
  '/eyemobile-pdv',
  '/divipay',
  '/dre',
  '/fluxo-caixa',
  '/contas',
  '/investimento',
  '/meta-investimento',
  '/cardapio',
  '/validades',
  '/comparativo',
  '/patrimonio',
  '/transferencias',
  '/agenda',
  '/centros-custo',
  '/fornecedores',
  '/equipe',
  '/conciliacao',
  '/recibos',
  '/ia-metrics',
  '/configuracoes',
  '/pdv',
  '/ceo',
  '/admin',
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
 * Verifica se o usuário tem autorização para visualizar dados financeiros, DRE e configurações
 */
export function canAccessFinancials(role?: string | null): boolean {
  return !isDeliveryStaffRole(role);
}

/**
 * Verifica se uma rota específica é permitida para o perfil de delivery staff
 */
export function isRouteAllowedForDeliveryStaff(pathname: string): boolean {
  return ALLOWED_DELIVERY_STAFF_ROUTES.some((allowed) =>
    pathname === allowed || pathname.startsWith(`${allowed}/`)
  );
}
