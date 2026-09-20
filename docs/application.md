# Aplicação e implementações

<!-- specsfy:documentator:start -->
## Superfícies

Categorias: Serviços, Rotas e APIs, Páginas, Componentes, Testes e Outras fontes.

Relação: relaciona cada arquivo observado à sua superfície.

| Categoria | Arquivo | Símbolos |
| --- | --- | --- |
| Outras fontes | .worktrees/architecture-ai-scalability/eslint.config.js | — |
| Outras fontes | .worktrees/architecture-ai-scalability/postcss.config.js | — |
| Outras fontes | .worktrees/architecture-ai-scalability/public/sw.js | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/App.css | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/App.tsx | PageLoader, LandingPage, Login, NotFound, Dashboard, Receitas, Despesas, Transacoes |
| Componentes | .worktrees/architecture-ai-scalability/src/components/DemoVideoModal.tsx | DemoVideoModalProps, DemoVideoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/components/EditarResultadoIAModal.tsx | EditarResultadoIAModalProps, EditarResultadoIAModal |
| Componentes | .worktrees/architecture-ai-scalability/src/components/FAQ.tsx | FAQ |
| Componentes | .worktrees/architecture-ai-scalability/src/components/FeatureCard.tsx | FeatureCardProps, FeatureCard |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Features.tsx | Features |
| Componentes | .worktrees/architecture-ai-scalability/src/components/FloatingButtons.tsx | FloatingButtons |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Footer.tsx | Footer |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Header.tsx | Header |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Hero.tsx | Hero |
| Componentes | .worktrees/architecture-ai-scalability/src/components/HowItWorks.tsx | HowItWorks |
| Componentes | .worktrees/architecture-ai-scalability/src/components/ia/ConversasSidebar.tsx | ConversasSidebarProps, ConversasSidebar |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/AnimatedCounter.tsx | AnimatedCounterProps, AnimatedCounter |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/FeatureShowcase.tsx | FeatureItem, FeatureShowcaseProps, FeatureShowcase, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/FinalCTA.tsx | FinalCTAProps, FinalCTA |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/GlassmorphicCard.tsx | GlassmorphicCardProps, GlassmorphicCard |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/HeaderPremium.tsx | HeaderPremiumProps, HeaderPremium |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/HeroPremium.tsx | TrustBadge, CTAConfig, HeroPremiumProps, HeroPremium |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/index.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/ParticleCanvas.tsx | Particle, ParticleCanvasProps, DEFAULT_COLORS, MOBILE_BREAKPOINT, ParticleCanvas |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/PricingPremium.tsx | Plan, PlanLimit, PaymentLink, PlanDisplay, PricingPremiumProps, PricingPremium |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/StatsPremium.tsx | StatItem, StatsPremiumProps, StatsPremium, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/TestimonialCarousel.tsx | Testimonial, TestimonialCarouselProps, TestimonialCarousel |
| Componentes | .worktrees/architecture-ai-scalability/src/components/premium/__tests__/properties/darkMode.property.test.tsx | hexToRgb, rgbaToRgb, getLuminance, getContrastRatio |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Pricing.tsx | Plan, PaymentLink, PlanConfig, PlanDisplay, Pricing |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Stats.tsx | Stats |
| Componentes | .worktrees/architecture-ai-scalability/src/components/Testimonials.tsx | Testimonials |
| Componentes | .worktrees/architecture-ai-scalability/src/components/ui/button.tsx | ButtonProps, Button, Comp |
| Componentes | .worktrees/architecture-ai-scalability/src/components/ui/calendar.tsx | Calendar, CalendarDayButton |
| Componentes | .worktrees/architecture-ai-scalability/src/components/ui/popover.tsx | Popover, PopoverTrigger, PopoverContent |
| Outras fontes | .worktrees/architecture-ai-scalability/src/config/env.ts | EnvironmentConfig, ValidationError, validateConfig, getConfig, getConfigInstance |
| Testes | .worktrees/architecture-ai-scalability/src/contexts/PrivacyContext.test.tsx | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/contexts/PrivacyContext.tsx | PRIVACY_STORAGE_KEY, PrivacyContextType, PrivacyContext, PrivacyProvider |
| Outras fontes | .worktrees/architecture-ai-scalability/src/contexts/WorkspaceContext.tsx | Workspace, WorkspaceContextType, WorkspaceContext, WORKSPACE_STORAGE_KEY, WorkspaceProvider |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/errors/ErrorBoundary.tsx | ErrorBoundaryProps, ErrorBoundaryState, ErrorBoundary |
| Testes | .worktrees/architecture-ai-scalability/src/core/errors/ErrorService.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/errors/ErrorService.ts | USER_MESSAGES, ErrorService |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/errors/types.ts | ErrorCategory, AppError, ErrorHandleOptions |
| Testes | .worktrees/architecture-ai-scalability/src/core/logging/backendObservability.test.ts | — |
| Testes | .worktrees/architecture-ai-scalability/src/core/logging/correlationId.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/logging/correlationId.ts | CORRELATION_ID_REGEX, CORRELATION_HEADER, isValidCorrelationId, generateCorrelationId, ensureCorrelationId, getCorrelationId, withCorrelationHeader |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/logging/index.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/logging/logger.ts | — |
| Testes | .worktrees/architecture-ai-scalability/src/core/logging/LoggerService.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/logging/LoggerService.ts | LoggerService |
| Testes | .worktrees/architecture-ai-scalability/src/core/logging/sanitizer.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/logging/sanitizer.ts | REDACTED_MARKER, SENSITIVE_KEY_PATTERNS, SENSITIVE_VALUE_PATTERNS, isSensitiveKey, sanitizeString, sanitizeData |
| Outras fontes | .worktrees/architecture-ai-scalability/src/core/logging/types.ts | LogLevel, LogEntry, LogOptions |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/AdminDashboardLayout.tsx | AdminDashboardLayoutProps, AdminDashboardLayout |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/AdminLayoutModern.tsx | AdminLayoutModernProps, AdminLayoutModern |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/AdminPageHeader.tsx | BreadcrumbItem, AdminPageHeaderProps, like, AdminPageHeader |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/AdminSidebarModern.tsx | MenuItem, MenuGroup, AdminSidebarModernProps, ADMIN_MENU_GROUPS, AdminSidebarModern |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/AdminStatsCard.tsx | AdminStatsCardProps, GRADIENT_CLASSES, AdminStatsCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/EditarWebhookManutencaoModal.tsx | EditarWebhookManutencaoModalProps, EditarWebhookManutencaoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/EyemobileSettingsCard.tsx | EyemobileSettingsCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/LogsWebhooksTable.tsx | LogsWebhooksTableProps, LogsWebhooksTable |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/NovoWebhookManutencaoModal.tsx | NovoWebhookManutencaoModalProps, NovoWebhookManutencaoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/RecentActivityCard.tsx | AdminLogEntry, ActivityItem, RecentActivityCardProps, RESOURCE_TYPE_CONFIG, RecentActivityCard, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/TestarWebhookModal.tsx | TestarWebhookModalProps, TestarWebhookModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/admin/components/WebhookManutencaoCard.tsx | WebhookManutencao, WebhookManutencaoCardProps, WebhookManutencaoCard |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useAuditLog.ts | LogDetails |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useContactSettings.ts | ContactSettings |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useEyemobileConfig.ts | EyemobileConfig, EyemobileSyncLog, SyncProgress |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useLogsWebhooksManutencao.ts | LogWebhookManutencao, FiltrosLogs |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/usePlanLimits.ts | PlanLimit, UsageStats |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useWebhookSettings.ts | WebhookSettings |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useWebhooksManutencao.ts | WebhookManutencao, CriarWebhookInput, AtualizarWebhookInput |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/hooks/useWhatsAppSettings.ts | WhatsAppSettings |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/types.ts | Plan, PlanLimits, Subscription, AuditLog |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/admin/utils/validation.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/auth/ChangePasswordModal.tsx | ChangePasswordModalProps, ChangePasswordModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/auth/DeleteAccountModal.tsx | DeleteAccountModalProps, DeleteAccountModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/auth/ForgotPasswordForm.tsx | ForgotPasswordFormProps, ForgotPasswordForm |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/auth/LoginForm.tsx | LoginFormProps, LoginForm |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/auth/RegisterForm.tsx | RegisterFormProps, RegisterForm |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/auth/ResetPasswordForm.tsx | ResetPasswordFormProps, ResetPasswordForm |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/profile/index.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/profile/PlanInfoCard.tsx | PlanInfoCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/profile/UpgradePlanModal.tsx | PaymentLink, UpgradePlanModalProps, UpgradePlanModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/profile/UsageLimitsCard.tsx | FEATURE_LABELS, UsageLimitsCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/profile/UsageProgressBar.tsx | UsageProgressBarProps, UsageProgressBar |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/ProtectedRoute.test.tsx | setupAuth, renderProtectedRoute |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/auth/components/ProtectedRoute.tsx | ProtectedRouteProps, ProtectedRoute |
| Testes | .worktrees/architecture-ai-scalability/src/domains/auth/hooks/useAuth.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/auth/hooks/useAuth.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/auth/hooks/useProfile.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/auth/hooks/useUserSubscription.ts | UserSubscription, UseUserSubscriptionReturn |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/auth/services/AuthService.test.ts | — |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/auth/services/AuthService.ts | SignUpParams, SignInParams, AuthResult, AuthService |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/auth/types.ts | AuthUser, UserProfile, AuthState |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/ConciliacoesPendentesCard.tsx | ConciliacoesPendentesCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/DivipayCobrancasView.tsx | DivipayCobrancasView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/DivipayConfiguracoesView.tsx | DivipayConfiguracoesView, WebhookLogsTable |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/DivipayDashboardView.tsx | DivipayDashboardViewProps, DivipayDashboardView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/DivipayExtratoView.tsx | DivipayExtratoView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/DivipaySidebar.tsx | DivipaySidebarProps, DivipaySidebar, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/DivipayTransferenciasView.tsx | DivipayTransferenciasView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/NovaCobrancaPixModal.tsx | NovaCobrancaPixModalProps, NovaCobrancaPixModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/NovaTransferenciaModal.tsx | NovaTransferenciaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/PagarDividaDivipayModal.tsx | PagarDividaDivipayModalProps, PagarDividaDivipayModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/SaquesFiltrosSheet.tsx | SaquesFilterValues, SaquesFiltrosSheetProps, SaquesFiltrosSheet |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/divipay/components/VerificarSaqueModal.tsx | SaqueDetails, VerificarSaqueModalProps, VerificarSaqueModal |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/hooks/useDivipayCobrancas.ts | DIVIPAY_COBRANCAS_QUERY_KEY, fetchCobrancas, useDivipayCobrancas |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/hooks/useDivipayConciliacao.ts | DIVIPAY_CONCILIACOES_QUERY_KEY, invalidarTudo, useDivipayConciliacoes, useDivipayConciliacao, useDivipayConciliacaoAuto |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/hooks/useDivipayConfig.ts | DIVIPAY_CONFIG_QUERY_KEY, useDivipayConfig |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/hooks/useDivipayDashboard.ts | DIVIPAY_DASHBOARD_QUERY_KEY, DivipayDashboardFilters, DivipayDailyChartPoint, DivipayDashboardResult, getDefaultDateRange, useDivipayDashboard |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/hooks/useDivipayExtrato.ts | DIVIPAY_EXTRATO_QUERY_KEY, DivipayExtratoFilters, useDivipayExtrato |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/hooks/useDivipayTransferencias.ts | DIVIPAY_TRANSFERENCIAS_QUERY_KEY, fetchTransferencias, PAGE, MAX_PAGES, useDivipayTransferencias |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/divipay/services/ConciliacaoDivipayService.ts | COMPONENT, ResumoConciliacao, CATEGORIA_SAQUES, CATEGORIA_TAXAS, requireUserId, findOrCreateCategoria, findContaDivipay, resolveWorkspaceId |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/divipay/services/conciliacaoMatcher.test.ts | — |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/divipay/services/conciliacaoMatcher.ts | SaqueParaConciliar, DividaCandidata, TOLERANCIA_VALOR, JANELA_DIAS, STATUS_CONCLUIDOS, isSaqueConcluido, normalizarDocumento, normalizarNome |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/divipay/services/DivipayService.test.ts | — |
| Serviços | .worktrees/architecture-ai-scalability/src/domains/divipay/services/DivipayService.ts | COMPONENT, DivipayService |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/types.ts | DivipayBalance, DivipayMovement, CreatePixChargeParams, CreatePixChargeResult, CreateWithdrawParams, PixKeyValidationResult, ListMovementsParams, ListMovementsResult |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/divipay/utils.ts | resolveBeneficiary, getDueDateFromBoleto |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/eyemobile/hooks/useEyemobileDashboard.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/AccountSelector.tsx | AccountSelectorProps, AccountSelector, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/AttachmentUploader.tsx | AttachmentUploaderProps, AttachmentUploader |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/ComparativoDiarioView.tsx | ComparativoDiarioView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/ComparativoKpiCard.tsx | ComparativoKpiCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/ComparativoMensalView.tsx | ComparativoMensalView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/comparativoMetrics.test.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/comparativoMetrics.ts | buildMonthlyPresentation, summarizeMonthly |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/comparativosNavigation.test.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/comparativosNavigation.ts | VALID_VIEWS, parseComparativosView, getComparativosLocation |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/ComparativosView.tsx | ComparativosView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/ComparativoTooltip.tsx | ComparativoTooltip |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/comparativos/workspaceScopeRegression.test.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ContasCartoesDashboardWidget.tsx | ContasCartoesDashboardWidget |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ControleOrcamentoCard.tsx | PALETA_CORES, ControleOrcamentoCardProps, ControleOrcamentoCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/DRETable.tsx | DRETable |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarCategoriaModal.tsx | EditarCategoriaModalProps, EditarCategoriaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarDespesaModal.tsx | Despesa, EditarDespesaModalProps, EditarDespesaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarDividaModal.tsx | Divida, EditarDividaModalProps, EditarDividaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarMetaModal.tsx | Meta, EditarMetaModalProps, EditarMetaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarOrcamentoModal.tsx | EditarOrcamentoModalProps, EditarOrcamentoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarReceitaModal.tsx | Receita, EditarReceitaModalProps, EditarReceitaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EditarTransacaoModal.tsx | Transacao, EditarTransacaoModalProps, EditarTransacaoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/AcertoPaymentDialog.test.tsx | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/AcertoPaymentDialog.tsx | formatDate, inferPixType, AcertoPaymentDialog |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/AcertoSemanalFolguista.test.tsx | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/AcertoSemanalFolguista.tsx | AcertoSemanalFolguista |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/AcertoSemanalFuncionario.test.tsx | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/AcertoSemanalFuncionario.tsx | AcertoSemanalFuncionario |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/ColaboradorCard.tsx | colaboradorMonthlyCost, experienceMessage, ColaboradorCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EmployeeCostBreakdown.test.tsx | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EmployeeCostBreakdown.tsx | EmployeeCostBreakdown |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EquipeForm.test.tsx | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EquipeForm.tsx | EquipeFormValues, normalizePixKey, validateEquipeForm, buildColaboradorPayload, Props, EquipeForm |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EquipeReport.test.ts | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EquipeReport.tsx | Item, Pagamento, aggregateEquipeReport, EquipeReport |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/EquipeSummaryCards.tsx | formatDate, EquipeSummaryCards |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/SensitiveValue.tsx | SensitiveValue |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/SettlementStatusBadge.tsx | SettlementStatusBadge |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/SettlementSummary.tsx | SettlementSummary |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/TerminationSimulator.test.tsx | — |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/TerminationSimulator.tsx | formatDate, TerminationSimulator |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/WeekGrid.tsx | WeekGrid |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/equipe/weeklyUtils.ts | DAY_NAMES, isoDate, currentMonday, buildWeek, formatShortDate |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/EyemobileDashboardView.tsx | DashboardSkeleton, EyemobileDashboardViewProps, EyemobileDashboardView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/FaturaCartaoModal.tsx | CategoryIconInfo, getLucideCategoryInfo, FaturaCartaoModalProps, FaturaCartaoModal, IconComponent |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/FluxoCaixaChart.tsx | FluxoCaixaChart |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/HistoricoPagamentos.tsx | HistoricoPagamentosProps, HistoricoPagamentos, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ImportadorExtratoModal.tsx | ItemExtratoComMatch, ImportadorExtratoModalProps, ImportadorExtratoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ImportarFaturaModal.tsx | ImportarFaturaModalProps, ImportarFaturaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/InvestimentoSenhaModal.tsx | InvestimentoSenhaModalProps, InvestimentoSenhaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/InvestimentosView.tsx | COLORS, InvestimentosViewProps, InvestimentosView |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/NovaCategoriaModal.tsx | NovaCategoriaModalProps, NovaCategoriaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/NovaDespesaModal.tsx | NovaDespesaModalProps, NovaDespesaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/NovaMetaModal.tsx | MetaForm, CategoriaMeta, NovaMetaModalProps, NovaMetaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/NovaReceitaModal.tsx | NovaReceitaModalProps, NovaReceitaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/NovoDepositoIAModal.tsx | NovoDepositoIAModalProps, NovoDepositoIAModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ObservationsField.tsx | ObservationsFieldProps, ObservationsField |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/PaymentMethodBreakdown.tsx | Transaction, PaymentMethodBreakdownProps, PaymentMethodStat, PaymentMethodBreakdown, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/PaymentMethodSelector.tsx | PaymentMethodSelectorProps, PaymentMethodSelector |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/PluggyConnectModal.tsx | PluggyConnectModalProps, PluggyConnectModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/RecurrenceSelector.tsx | RecurrenceConfig, RecurrenceSelectorProps, RecurrenceSelector |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/RegistrarPagamentoModal.tsx | RegistrarPagamentoModalProps, RegistrarPagamentoModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ReminderSelector.tsx | ReminderSelectorProps, REMINDER_OPTIONS, ReminderSelector |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/ReminderStatusBadge.tsx | ReminderStatusBadgeProps, ReminderStatusBadge, Icon |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/SimuladorJurosCompostosCard.tsx | formatCurrency, SimuladorJurosCompostosCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/SimuladorRentabilidadeCard.tsx | PERIODOS, SimuladorRentabilidadeCardProps, SimuladorRentabilidadeCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/TagFilter.tsx | TagFilterProps, TagFilter |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/TagsInput.tsx | TagsInputProps, TagsInput |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/TetoGastosCard.tsx | TetoGastosCard |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/TransferenciaModal.tsx | TransferenciaModalProps, TransferenciaModal |
| Componentes | .worktrees/architecture-ai-scalability/src/domains/finance/components/useDREData.ts | DRELineItem, DRESummary |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useAttachments.ts | BUCKET_NAME, MAX_FILE_SIZE, ALLOWED_TYPES |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useBurnRate.ts | useBurnRate |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useCategorias.ts | Categoria |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useCategoriasMetas.ts | CategoriaMeta |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useCategorizacaoIA.ts | useCategorizacaoIA |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useCentrosCusto.ts | CentroCusto, CENTROS_CUSTO_QUERY_KEY, fetchCentrosCusto |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useColaboradorCalculos.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useColaboradorCalculos.ts | CalculosColaborador, EMPTY_CALCULATIONS, TRANSPORT_COST_TYPES, workDaysInMonth, useColaboradorCalculos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useColaboradorCustos.ts | ColaboradorCusto, useColaboradorCustos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useColaboradores.ts | Colaborador, useColaboradores |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useColaboradorPresencas.ts | ColaboradorPresenca, useColaboradorPresencas |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useComparativoDiario.test.ts | calculateDailyComparative |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useComparativoDiario.ts | DailyPoint, ComparativoDiarioCards, ComparativoDiarioInsight, UseComparativoDiarioParams, RawFinancialItem, PAGE_SIZE, fetchAllQueryRows, useComparativoDiario |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useComparativoPeriodos.ts | ComparativoMes, PAGE_SIZE, fetchSomaValores, useComparativoPeriodos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useComprasFatura.ts | ComprasFaturaResult |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useCompromissos.ts | CompromissoManual, COMPROMISSOS_QUERY_KEY |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useConciliacao.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useConciliacao.ts | LancamentoConciliacao, CONCILIACAO_QUERY_KEY, fetchLancamentos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useConfiguracoesInvestimentos.ts | ConfiguracaoInvestimento, CONFIGS_QUERY_KEY, useConfiguracoesInvestimentos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useContasUsuario.ts | ContaUsuario, CONTAS_QUERY_KEY, fetchContas |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useContatos.ts | Contato, CONTATOS_QUERY_KEY, fetchContatos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDebtReminders.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDepositosInvestimento.ts | DepositoInvestimento, DEPOSITOS_QUERY_KEY, useDepositosInvestimento |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDespesas.test.ts | createWrapper, Wrapper, createMockQuery |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDespesas.ts | Despesa, DESPESAS_QUERY_KEY, DespesasQueryParams, DIVIPAY_NON_SETTLED_STATUSES, fetchDivipayDespesas, PAGE, MAX_PAGES, fetchDespesas |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDividas.ts | DebtReminderInfo, Divida, DIVIDAS_QUERY_KEY, DividasQueryParams, resolveDividaStatus, fetchDividas |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDRE.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useDRE.ts | DRE_QUERY_KEY, ALIQUOTA_ICMS_SIMPLES, ALIQUOTA_PIS_COFINS, ALIQUOTA_ISS, ALIQUOTA_CMV_ESTIMADO, ALIQUOTA_IR, DIVIPAY_NON_SETTLED_STATUSES, DIVIPAY_CASH_OUT_TYPES |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useEquipeAcertos.test.tsx | createWrapper, Wrapper, mockEmptyQuery |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useEquipeAcertos.ts | callRpc, useEquipeAcertos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useEquipeObrigacoesMensais.ts | currentCompetence, useEquipeObrigacoesMensais |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useEquipeResumo.ts | EMPTY_SUMMARY, useEquipeResumo |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useExportarRelatorios.ts | useExportarRelatorios |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useEyemobileDashboard.test.ts | mockTransacoes |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useEyemobileDashboard.ts | toISODate, EyemobileStore, DashboardFilters, EyemobileDashboardResult, EyemobileSyncResponse, fetchLiveProducts, buildLocalFallbackDashboard, fetchLiveDashboard |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFaturaCartao.ts | FaturaImportacaoInfo, FaturaCartaoTransacao, UseFaturaCartaoProps, useFaturaCartao |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFaturasCartao.test.ts | — |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFaturasCartao.ts | FaturaCartao, PeriodoFaturaInfo, calcularPeriodoFatura, determinarFaturaParaData, FATURAS_QUERY_KEY |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFichaTecnica.ts | FICHAS_TECNICAS_QUERY_KEY, fetchFichasDoProduto, useFichaTecnica |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFluxoCaixaData.ts | FluxoCaixaBucket, FluxoCaixaData, MESES_CURTOS, fmtLocal, ultimoDiaDoMes, recorrenteOcorreEm, useFluxoCaixaData |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFluxoCaixaProjetado.ts | FluxoCaixaPoint |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFolguistaEscalas.atomic.test.tsx | wrapper |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFolguistaEscalas.ts | ColaboradorEscala, useFolguistaEscalas |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useFoodCost.ts | FOOD_COST_QUERY_KEY, fetchFoodCost, useFoodCost |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useImportarFatura.ts | TransacaoParseada, KEYWORD_CATEGORIES, sugerirCategoria, calcularHashArrayBuffer, calcularHashStringSHA256, hashString, hashTransacoes, extrairTextoDoPDF |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useInvestimentos.ts | Investimento, INVESTIMENTOS_QUERY_KEY, calcularPrecoMedio, calcularIR, calcularRentabilidadeReal, useInvestimentos |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useMediaMensalDespesas.ts | useMediaMensalDespesas |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useMediaMensalReceitas.ts | useMediaMensalReceitas |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useMetas.ts | Meta |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useMetasInvestimento.ts | MetaInvestimento, METAS_INVESTIMENTO_QUERY_KEY, calcularTempoAteMeta, useMetasInvestimento |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useOrcamentoControle.ts | TemaOrcamento, TEMAS_PADRAO, ORCAMENTO_QUERY_KEY, fetchOrcamentoConfig |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useOrcamentosCategorias.ts | OrcamentoCategoria, ORCAMENTOS_CATEGORIAS_QUERY_KEY, fetchOrcamentosCategorias |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useOrcamentosMercado.ts | OrcamentoMercado |
| Testes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/usePagamentosDivida.test.tsx | MOCK_USER |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/usePagamentosDivida.ts | PagamentoDividaComDivida |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/usePatrimonio.ts | PatrimonioData, usePatrimonio |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/usePontoEquilibrio.ts | DESPESAS_FIXAS, usePontoEquilibrio |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useProdutosCardapio.ts | PRODUTOS_CARDAPIO_QUERY_KEY, fetchProdutos, useProdutosCardapio |
| Outras fontes | .worktrees/architecture-ai-scalability/src/domains/finance/hooks/useProjecaoInvestimentos.ts | ProjecaoItem, projetar, obterTaxaRealAnual, projetarPatrimonioTotal, useProjecaoInvestimentos |
<!-- specsfy:documentator:end -->
