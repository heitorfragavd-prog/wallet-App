// Ponto de entrada do domínio Eyemobile. A implementação compartilhada permanece
// no módulo financeiro porque transforma os dados comerciais recebidos da API.
export { useEyemobileDashboard, fetchLiveDashboard } from "@/domains/finance/hooks/useEyemobileDashboard";
export type { EyemobileDashboardResult, EyemobileStore, DashboardFilters } from "@/domains/finance/hooks/useEyemobileDashboard";
