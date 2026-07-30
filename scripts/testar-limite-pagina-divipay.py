"""Testa se a API Divipay aceita limit > 100 por página."""
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
          method="POST", body={"query": "select client_id, client_secret, environment from divipay_config limit 1"},
          headers={"Authorization": f"Bearer {MGMT_TOKEN}"})[0]
auth = req("https://api.divipay.com.br/api/auth", method="POST", body={
    "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
    "clientId": cfg["client_id"], "clientSecret": cfg["client_secret"]})
token = auth.get("token") or auth.get("access_token")

for limit in (100, 500, 1000):
    url = f"https://api.divipay.com.br/api/movements?limit={limit}&initialDate=2026-07-01T00:00:00.000Z&finalDate=2026-07-02T23:59:59.999Z"
    try:
        data = req(url, headers={"Authorization": f"Bearer {token}"})
        items = data if isinstance(data, list) else data.get("data") or data.get("items") or []
        has_more = data.get("hasMore") or data.get("has_more") if isinstance(data, dict) else None
        print(f"limit={limit}: retornou {len(items)} itens | hasMore={has_more}")
    except urllib.error.HTTPError as e:
        print(f"limit={limit}: HTTP {e.code} - {e.read().decode()[:200]}")
