import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '../..');

describe('SPEC-0004: Prontidão de Release e Deploy em Produção na Hostinger', () => {
  // SPECSFY:AC-001
  it('SPECSFY:AC-001 deve garantir que o script deploy-multiarch.sh resolva a versão do package.json dinamicamente', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const deployScriptPath = path.join(ROOT_DIR, 'deploy-multiarch.sh');

    expect(fs.existsSync(pkgPath)).toBe(true);
    expect(fs.existsSync(deployScriptPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deployScript = fs.readFileSync(deployScriptPath, 'utf8');

    // Não deve conter a versão hardcoded legada 1.0.21
    expect(deployScript).not.toMatch(/VERSION="1\.0\.21"/);

    // Deve resolver dinamicamente a versão a partir do package.json ou usar a versão 1.0.49
    const resolvesDynamicVersion = 
      deployScript.includes('package.json') || 
      deployScript.includes(`VERSION="${pkg.version}"`) ||
      deployScript.includes(`VERSION:-"${pkg.version}"`) ||
      deployScript.includes(`VERSION:-$(node -p "require('./package.json').version")`);

    expect(resolvesDynamicVersion).toBe(true);
  });

  // SPECSFY:AC-002
  it('SPECSFY:AC-002 deve permitir override de versão via variável de ambiente ou argumento', () => {
    const deployScriptPath = path.join(ROOT_DIR, 'deploy-multiarch.sh');
    const deployScript = fs.readFileSync(deployScriptPath, 'utf8');

    // Deve permitir override através de ${VERSION:-...} ou checagem de argumento
    const allowsOverride = 
      deployScript.includes('${VERSION:-') || 
      deployScript.includes('${1:-') ||
      deployScript.includes('if [ -z "$VERSION" ]');

    expect(allowsOverride).toBe(true);
  });

  // SPECSFY:AC-003
  it('SPECSFY:AC-003 deve configurar plataformas multi-arquitetura linux/amd64 e linux/arm64 no buildx', () => {
    const deployScriptPath = path.join(ROOT_DIR, 'deploy-multiarch.sh');
    const deployScript = fs.readFileSync(deployScriptPath, 'utf8');

    expect(deployScript).toMatch(/linux\/amd64/);
    expect(deployScript).toMatch(/linux\/arm64/);
    expect(deployScript).toMatch(/docker buildx build/);
    expect(deployScript).toMatch(/multiarch-builder/);
  });

  // SPECSFY:AC-004
  it('SPECSFY:AC-004 deve conter labels Traefik para wallet.cortexx.online com TLS no docker-stack.yml', () => {
    const stackPath = path.join(ROOT_DIR, 'docker-stack.yml');
    expect(fs.existsSync(stackPath)).toBe(true);

    const stackContent = fs.readFileSync(stackPath, 'utf8');
    expect(stackContent).toMatch(/traefik\.enable=true/);
    expect(stackContent).toMatch(/traefik\.http\.routers\.wallet-app-secure\.rule=Host\(`wallet\.cortexx\.online`\)/);
    expect(stackContent).toMatch(/traefik\.http\.routers\.wallet-app-secure\.tls=true/);
    expect(stackContent).toMatch(/traefik\.http\.routers\.wallet-app-secure\.entrypoints=websecure/);
  });

  // SPECSFY:AC-005
  it('SPECSFY:AC-005 deve conter middleware Traefik de redirecionamento HTTP para HTTPS no docker-stack.yml', () => {
    const stackPath = path.join(ROOT_DIR, 'docker-stack.yml');
    const stackContent = fs.readFileSync(stackPath, 'utf8');

    expect(stackContent).toMatch(/traefik\.http\.routers\.wallet-app-insecure\.entrypoints=web/);
    expect(stackContent).toMatch(/traefik\.http\.middlewares\.wallet-redirect-https\.redirectscheme\.scheme=https/);
    expect(stackContent).toMatch(/traefik\.http\.middlewares\.wallet-redirect-https\.redirectscheme\.permanent=true/);
  });

  // SPECSFY:AC-006
  it('SPECSFY:AC-006 deve definir política de atualização start-first com rollback automático no docker-stack.yml', () => {
    const stackPath = path.join(ROOT_DIR, 'docker-stack.yml');
    const stackContent = fs.readFileSync(stackPath, 'utf8');

    expect(stackContent).toMatch(/order:\s*start-first/);
    expect(stackContent).toMatch(/failure_action:\s*rollback/);
    expect(stackContent).toMatch(/rollback_config:/);
  });

  // SPECSFY:AC-007
  it('SPECSFY:AC-007 deve possuir endpoint de healthcheck /health com status 200 no nginx.conf', () => {
    const nginxPath = path.join(ROOT_DIR, 'nginx.conf');
    expect(fs.existsSync(nginxPath)).toBe(true);

    const nginxContent = fs.readFileSync(nginxPath, 'utf8');
    expect(nginxContent).toMatch(/location\s*=\s*\/health/);
    expect(nginxContent).toMatch(/return 200 'ok'/);
    expect(nginxContent).toMatch(/access_log off/);
  });

  // SPECSFY:AC-008
  it('SPECSFY:AC-008 deve possuir regras de roteamento SPA e cabeçalhos de cache estático no nginx.conf', () => {
    const nginxPath = path.join(ROOT_DIR, 'nginx.conf');
    const nginxContent = fs.readFileSync(nginxPath, 'utf8');

    expect(nginxContent).toMatch(/try_files \$uri \$uri\/ \/index\.html/);
    expect(nginxContent).toMatch(/gzip on/);
    expect(nginxContent).toMatch(/expires 1y/);
    expect(nginxContent).toMatch(/Cache-Control/);
  });

  // SPECSFY:AC-009
  it('SPECSFY:AC-009 deve conter diretiva HEALTHCHECK no Dockerfile conectando a /health', () => {
    const dockerfilePath = path.join(ROOT_DIR, 'Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    expect(dockerfileContent).toMatch(/HEALTHCHECK/);
    expect(dockerfileContent).toMatch(/http:\/\/127\.0\.0\.1\/health/);
    expect(dockerfileContent).toMatch(/--interval=/);
    expect(dockerfileContent).toMatch(/--timeout=/);
  });

  // SPECSFY:AC-010
  it('SPECSFY:AC-010 deve validar a integridade dos artefatos estáticos de produção na pasta dist/', () => {
    const distPath = path.join(ROOT_DIR, 'dist');
    const indexPath = path.join(distPath, 'index.html');

    if (!fs.existsSync(indexPath)) {
      execSync('npm run build', { cwd: ROOT_DIR, encoding: 'utf8' });
    }

    expect(fs.existsSync(distPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);

    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    expect(indexHtml).toMatch(/<div id="root">/);
    expect(indexHtml).toMatch(/<script type="module"/);
  });

  // SPECSFY:AC-011
  it('SPECSFY:AC-011 deve garantir que nenhuma chave confidencial ou service_role seja embutida no Dockerfile ou scripts', () => {
    const dockerfilePath = path.join(ROOT_DIR, 'Dockerfile');
    const deployScriptPath = path.join(ROOT_DIR, 'deploy-multiarch.sh');

    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
    const deployScript = fs.readFileSync(deployScriptPath, 'utf8');

    // Nenhum segredo ou chave privada deve estar presente
    expect(dockerfileContent).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(dockerfileContent).not.toMatch(/PRIVATE_KEY/i);
    expect(deployScript).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/i);
    expect(deployScript).not.toMatch(/PRIVATE_KEY/i);
  });

  // SPECSFY:AC-012
  it('SPECSFY:AC-012 deve fornecer comando de atualização de serviço com a tag correta para o Docker Swarm', () => {
    const deployScriptPath = path.join(ROOT_DIR, 'deploy-multiarch.sh');
    const deployScript = fs.readFileSync(deployScriptPath, 'utf8');

    expect(deployScript).toMatch(/docker service update/);
    expect(deployScript).toMatch(/wallet-app/);
  });
});
