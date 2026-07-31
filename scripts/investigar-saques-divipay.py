"""Investiga como saques/pagamentos aparecem na API Divipay /api/movements."""
import json, os, urllib.request, urllib.error

MGMT_TOKEN = os.environ["SUPABASE_MGMT_TOKEN"]
PROJECT_REF = "hdeguzxkdvebdrrutbnx"

def req(url, method="GET", body=None, headers=None, timeout=30):
    r = urllib.request.Request(url, method=method)
    r.add_header("User-Agent", "Mozilla/5.0 wallet-validator")
    r.add_header("Accept", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    data = None
    if body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    with urllib.request.urlopen(r, data=data, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

cfg = req(f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
          method="POST", body={"query": "select client_id, client_secret from divipay_config limit 1"},
          headers={"Authorization": f"Bearer {MGMT_TOKEN}"})[0]
auth = req("https://api.divipay.com.br/api/auth", method="POST", body={
    "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
    "clientId": cfg["client_id"], "clientSecret": cfg["client_secret"]})
token = auth.get("token") or auth.get("access_token")

# 1) Sem filtro: últimos 30 dias — quais types existem e quais são saídas?
url = ("https://api.divipay.com.br/api/movements?limit=1000"
       "&initialDate=2026-07-01T00:00:00.000Z&finalDate=2026-07-30T23:59:59.999Z")
data = req(url, headers={"Authorization": f"Bearer {token}"})
items = data if isinstance(data, list) else data.get("data") or data.get("items") or []
types = {}
saidas = []
for m in items:
    tp = str(m.get("type") or "?")
    types[tp] = types.get(tp, 0) + 1
    if any(k in tp.upper() for k in ("OUT", "WITHDRAW", "SAQUE", "PAYMENT", "BOLETO", "BILL", "TRANSFER")):
        saidas.append(m)
print("types na página:", json.dumps(types))
print(f"\npossíveis SAÍDAS encontradas: {len(saidas)}")
for m in saidas[:12]:
    print(f"  type={m.get('type')} status={m.get('status')} amount={m.get('amount')} desc={str(m.get('description'))[:45]} payer={m.get('payerName') or m.get('payer_name')}")

# 2) Com filtro type=CASH_OUT (como o app faz hoje) — retorna o quê?
url2 = url + "&type=CASH_OUT"
try:
    data2 = req(url2, headers={"Authorization": f"Bearer {token}"})
    items2 = data2 if isinstance(data2, list) else data2.get("data") or data2.get("items") or []
    print(f"\ncom type=CASH_OUT: {len(items2)} itens")
    for m in items2[:8]:
        print(f"  type={m.get('type')} status={m.get('status')} amount={m.get('amount')} desc={str(m.get('description'))[:45]}")
except urllib.error.HTTPError as e:
    print(f"\ncom type=CASH_OUT: HTTP {e.code} - {e.read().decode()[:200]}")

# 3) Endpoint /api/withdraws — inclui boletos?
try:
    data3 = req("https://api.divipay.com.br/api/withdraws?limit=50&offset=0", headers={"Authorization": f"Bearer {token}"})
    items3 = data3 if isinstance(data3, list) else data3.get("data") or data3.get("items") or []
    print(f"\n/api/withdraws: {len(items3)} itens")
    for m in items3[:10]:
        print(f"  type={m.get('type')} status={m.get('status')} amount={m.get('amount')} name={m.get('name')} desc={str(m.get('description'))[:40]}")
except urllib.error.HTTPError as e:
    print(f"\n/api/withdraws: HTTP {e.code} - {e.read().decode()[:200]}")
