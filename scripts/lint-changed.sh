#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Progressive Lint Runner (NUL-safe, space-safe, hyphen-safe)
# ─────────────────────────────────────────────────────────────────────────────

BASE_REF="${1:-${GITHUB_BASE_REF:-develop}}"
HEAD_REF="${2:-${GITHUB_HEAD_REF:-}}"

# 1. Bypass para promoção de Release (develop -> master)
if [ "${BASE_REF}" = "master" ] && [ "${HEAD_REF}" = "develop" ]; then
  echo "Release promotion develop → master."
  echo "Progressive lint incremental already enforced on PRs merged into develop."
  echo "Skipping historical accumulated diff."
  exit 0
fi

# 2. Resolução do ref de comparação
DIFF_TARGET=""
if git rev-parse --verify "origin/${BASE_REF}" >/dev/null 2>&1; then
  DIFF_TARGET="origin/${BASE_REF}...HEAD"
elif git rev-parse --verify "${BASE_REF}" >/dev/null 2>&1; then
  DIFF_TARGET="${BASE_REF}...HEAD"
else
  echo "Warning: Base ref '${BASE_REF}' not found. Falling back to HEAD~1...HEAD"
  DIFF_TARGET="HEAD~1...HEAD"
fi

echo "Computing diff against: ${DIFF_TARGET}"

# 3. Leitura e filtragem NUL-safe (-z) de arquivos adicionados/copiados/modificados/renomeados
files=()
while IFS= read -r -d '' file; do
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx)
      if [ -f "$file" ]; then
        files+=("$file")
      fi
      ;;
  esac
done < <(git diff --name-only -z --diff-filter=ACMR "${DIFF_TARGET}")

# 4. Tratamento de zero arquivos alterados
if [ ${#files[@]} -eq 0 ]; then
  echo "No JS/TS files changed. Skipping ESLint."
  exit 0
fi

# 5. Execução do ESLint com proteção de opções via '--'
echo "Linting ${#files[@]} changed file(s):"
for f in "${files[@]}"; do
  echo "  - $f"
done

npx eslint -- "${files[@]}"
