import fs from 'fs';
import https from 'https';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const agent = new https.Agent({ rejectUnauthorized: false });
const cfg = JSON.parse(fs.readFileSync('C:/Users/Heitor/.gemini/config/skills/portainer-ops/config.json', 'utf8'));

async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${cfg.url}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // @ts-ignore
    dispatcher: undefined
  });
  return res.json();
}

async function getJson(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${cfg.url}${path}`, {
    method: 'GET',
    headers
  });
  return res.json();
}

async function main() {
  console.log('1. Autenticando no Portainer...');
  const authRes = await postJson('/api/auth', { username: cfg.username, password: cfg.password });
  const jwt = authRes.jwt;
  if (!jwt) throw new Error('Falha na autenticacao: ' + JSON.stringify(authRes));
  console.log('   Autenticado com sucesso!');

  console.log('2. Consultando serviços do Swarm no Endpoint 1...');
  const services = await getJson(`/api/endpoints/${cfg.endpointId}/docker/services`, jwt);
  const walletService = services.find(s => s.Spec?.Name === 'wallet_wallet-app');
  if (!walletService) throw new Error('Serviço wallet_wallet-app não encontrado!');

  console.log(`   Serviço encontrado: ${walletService.Spec.Name} (ID: ${walletService.ID}, Version: ${walletService.Version?.Index})`);
  console.log(`   Imagem atual: ${walletService.Spec?.TaskTemplate?.ContainerSpec?.Image}`);

  const targetImage = process.argv[2] || 'heitor84/wallet:develop-8358632';
  console.log(`\n3. Atualizando serviço para nova imagem: ${targetImage}...`);

  const spec = walletService.Spec;
  spec.TaskTemplate.ContainerSpec.Image = targetImage;
  // Forçar atualização do swarm service
  spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate || 0) + 1;

  const version = walletService.Version.Index;
  const updateRes = await fetch(`${cfg.url}/api/endpoints/${cfg.endpointId}/docker/services/${walletService.ID}/update?version=${version}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(spec)
  });

  const updateText = await updateRes.text();
  console.log(`   Status do update: ${updateRes.status}`);
  console.log(`   Resposta: ${updateText || 'OK'}`);

  console.log('\n4. Aguardando 10s para inicialização da task...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('5. Verificando status do serviço após deploy...');
  const updatedServices = await getJson(`/api/endpoints/${cfg.endpointId}/docker/services`, jwt);
  const updatedWallet = updatedServices.find(s => s.Spec?.Name === 'wallet_wallet-app');
  console.log(`   Nova imagem configurada: ${updatedWallet?.Spec?.TaskTemplate?.ContainerSpec?.Image}`);
}

main().catch(console.error);
