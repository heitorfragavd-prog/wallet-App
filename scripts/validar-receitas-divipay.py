"""Simula a consolidação de receitas do Wallet (fetchReceitas) end-to-end.

1. Lê credenciais Divipay do Supabase (Management API, token via env SUPABASE_MGMT_TOKEN).
2. Autentica na Divipay e pagina /api/movements no período.
3. Aplica a mesma regra do useReceitas.ts: exclui saques, exclui não-liquidados,
   valor = amountLiquid (fallback amount).
4. Imprime apenas agregados (nenhum segredo).
"""
import json
import os
import urllib.request

MGMT_TOKEN = os.environ["SUPABASE_MGMT_TOKEN"]
PROJECT_REF = "hdeguzxkdvebdrrutbnx"
BASE = {"sandbox": "https://pay-sandbox.hge.app", "production": "https://api.divipay.com.br"}

NON_SETTLED = ["PENDING", "PROCESSING", "FAILED", "ERROR", "REJECTED",
               "CANCELED", "CANCELLED", "EXPIRED", "REFUNDED", "CHARGEBACK"]
CASH_OUT = ["CASH_OUT", "CASHOUT", "WITHDRAW", "SAQUE", "TRANSFER_OUT"]


def req(url, method="GET", body=None, headers=None, timeout=30):
    r = urllib.request.Request(url, method=method)
    r.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) wallet-validator")
    r.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    data = None
    if body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    with urllib.request.urlopen(r, data=data, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def sql(query):
    return req(f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
               method="POST", body={"query": query},
               headers={"Authorization": f"Bearer {MGMT_TOKEN}"})


def main():
    cfg = sql("select client_id, client_secret, environment, access_token, token_expires_at from divipay_config limit 1")[0]
    base = BASE[cfg["environment"]]

    # Auth (mesmo payload do edge function)
    auth = req(f"{base}/api/auth", method="POST", body={
        "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
        "clientId": cfg["client_id"], "clientSecret": cfg["client_secret"],
    })
    token = auth.get("token") or auth.get("access_token") or auth.get("accessToken")
    print(f"[auth] ok={bool(token)} env={cfg['environment']}")

    def fetch_page(initial, final, cursor=None, limit=1000):
        q = f"limit={limit}&initialDate={initial}&finalDate={final}"
        if cursor:
            q += f"&cursor={cursor}"
        return req(f"{base}/api/movements?{q}", headers={"Authorization": f"Bearer {token}"})

    def collect(initial, final, max_pages=60):
        """Espelha fetchDivipayReceitas: janelas de 89 dias, limit=1000, dedupe por id."""
        import time
        from datetime import date as dt_date, timedelta
        start = dt_date.fromisoformat(initial[:10])
        end = dt_date.fromisoformat(final[:10])
        items, pages, seen = [], 0, set()
        chunk_start = start
        while chunk_start <= end:
            chunk_end = min(chunk_start + timedelta(days=88), end)
            cursor = None
            chunk_pages = 0
            while chunk_pages < max_pages:
                data = None
                for attempt in range(3):
                    try:
                        data = fetch_page(
                            f"{chunk_start.isoformat()}T00:00:00",
                            f"{chunk_end.isoformat()}T23:59:59",
                            cursor)
                        break
                    except Exception as e:
                        if attempt == 2:
                            raise
                        print(f"  [retry] {chunk_start} pág {chunk_pages + 1} falhou ({e}); tentando de novo...")
                        time.sleep(2)
                raw = data if isinstance(data, list) else data.get("data") or data.get("items") or []
                for m in raw:
                    key = str(m.get("id") or m.get("transactionCode") or m.get("transaction_code") or "")
                    if key and key in seen:
                        continue
                    if key:
                        seen.add(key)
                    items.append(m)
                chunk_pages += 1
                pages += 1
                cursor = data.get("nextCursor") or data.get("next_cursor") if isinstance(data, dict) else None
                has_more = bool(data.get("hasMore") or data.get("has_more")) if isinstance(data, dict) else False
                if not (has_more and cursor):
                    break
            chunk_start = chunk_end + timedelta(days=1)
        return items, pages

    def summarize(label, initial, final):
        items, pages = collect(initial, final)
        receitas, excl_out, excl_status = [], 0, 0
        status_set, type_set = {}, {}
        for m in items:
            tp = str(m.get("type") or "").upper()
            st = str(m.get("status") or "").upper()
            type_set[tp] = type_set.get(tp, 0) + 1
            status_set[st] = status_set.get(st, 0) + 1
            if any(k in tp for k in CASH_OUT):
                excl_out += 1
                continue
            if st and any(s in st for s in NON_SETTLED):
                excl_status += 1
                continue
            receitas.append(m)

        def metodo(m):
            tp = str(m.get("type") or "").upper()
            desc = str(m.get("description") or "").upper()
            if "CREDIT" in tp or "CREDIT" in desc or "CRÉDITO" in desc: return "cartao_credito"
            if "DEBIT" in tp or "DEBIT" in desc or "DÉBITO" in desc: return "cartao_debito"
            if "BOLETO" in tp or "TICKET" in tp or "BOLETO" in desc: return "boleto"
            return "pix"

        por_metodo = {}
        total = 0.0
        for m in receitas:
            liq = float(m.get("amountLiquid") or m.get("amount_liquid") or 0)
            bruto = float(m.get("amount") or 0)
            valor = liq if liq > 0 else bruto
            total += valor
            md = metodo(m)
            por_metodo[md] = round(por_metodo.get(md, 0) + valor, 2)

        print(f"\n=== {label} ===")
        print(f"movimentos retornados: {len(items)} em {pages} página(s)")
        print(f"excluídos (saque/transferência): {excl_out}")
        print(f"excluídos (não liquidado): {excl_status}")
        print(f"RECEITAS VÁLIDAS: {len(receitas)}  |  TOTAL LÍQUIDO: R$ {total:,.2f}")
        print(f"por método: {json.dumps(por_metodo, ensure_ascii=False)}")
        print(f"types vistos: {json.dumps(type_set)}")
        print(f"status vistos: {json.dumps(status_set)}")
        return len(items), pages

    # Julho/2026 (mês atual)
    n_jul, p_jul = summarize("Julho/2026", "2026-07-01T00:00:00.000Z", "2026-07-30T23:59:59.999Z")
    # Ano todo (default do app sem filtro)
    n_ytd, p_ytd = summarize("Ano 2026 (default do app)", "2026-01-01T00:00:00.000Z", "2026-07-30T23:59:59.999Z")
    print(f"\n[cap] app usa máx 60 páginas x 1000 = 60.000 movimentos. YTD precisou de {p_ytd} página(s) ({n_ytd} itens) -> {'OK, sem truncamento' if n_ytd < 60000 else 'TRUNCA no app!'}")


if __name__ == "__main__":
    main()
