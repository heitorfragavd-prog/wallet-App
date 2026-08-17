export type ComparativosViewMode = "completa" | "diaria" | "mensal";

const VALID_VIEWS = new Set<ComparativosViewMode>(["completa", "diaria", "mensal"]);

export function parseComparativosView(params: URLSearchParams): ComparativosViewMode {
  const value = params.get("visao") as ComparativosViewMode | null;
  return value && VALID_VIEWS.has(value) ? value : "completa";
}

export function getComparativosLocation(current: URLSearchParams, view: ComparativosViewMode): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set("aba", "comparativos");
  next.set("visao", view);
  return next;
}
