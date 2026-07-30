"""Verifica se o token Divipay em cache no banco (usado pela edge function) ainda é válido."""
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
          method="POST",
          body={"query": "select access_token, token_expires_at, (token_expires_at > now()) as token_valido_prazo from divipay_config limit 1"},
          headers={"Authorization": f"Bearer {MGMT_TOKEN}"})[0]

print(f"token em cache existe: {bool(cfg.get('access_token'))}")
print(f"prazo ainda válido segundo o banco: {cfg.get('token_valido_prazo')} (expira em {cfg.get('token_expires_at')})")

if cfg.get("access_token"):
    url = ("https://api.divipay.com.br/api/movements?limit=1"
           "&initialDate=2026-07-29T00:00:00.000Z&finalDate=2026-07-30T23:59:59.999Z")
    try:
        data = req(url, headers={"Authorization": f"Bearer {cfg['access_token']}"})
        items = data if isinstance(data, list) else data.get("data") or data.get("items") or []
        print(f"TOKEN EM CACHE: VÁLIDO na API Divipay (retornou {len(items)} item)")
    except urllib.error.HTTPError as e:
        print(f"TOKEN EM CACHE: INVÁLIDO na API Divipay -> HTTP {e.code} - {e.read().decode()[:200]}")
