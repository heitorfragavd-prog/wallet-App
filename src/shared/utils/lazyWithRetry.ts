import { lazy, ComponentType } from "react";

/**
 * Utilitário para carregamento dinâmico de módulos (lazy loading) com suporte a auto-retry.
 * Evita o erro 'Failed to fetch dynamically imported module' quando o Vite atualiza os chunks ou
 * quando ocorre uma instabilidade temporária na rede/cache do navegador.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const pageHasBeenReloaded = window.sessionStorage.getItem("vite_chunk_reloaded");

    try {
      const component = await factory();
      window.sessionStorage.removeItem("vite_chunk_reloaded");
      return component;
    } catch (error) {
      if (!pageHasBeenReloaded) {
        window.sessionStorage.setItem("vite_chunk_reloaded", "true");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
