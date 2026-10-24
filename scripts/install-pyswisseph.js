const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requirements = path.join(root, 'requirements.txt');

function run(cmd, args) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  return spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function verify(cmd) {
  const out = spawnSync(cmd, ['-c', 'import swisseph as swe; print(swe.version)'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (out.status === 0) {
    console.log(`pyswisseph OK em ${cmd}: ${(out.stdout || '').trim()}`);
    return true;
  }
  console.log(`pyswisseph ainda não disponível em ${cmd}: ${(out.stderr || out.stdout || '').trim()}`);
  return false;
}

if (!fs.existsSync(requirements)) {
  console.error('requirements.txt não encontrado; não dá para instalar pyswisseph.');
  process.exit(1);
}

const pythonCommands = process.platform === 'win32'
  ? [['py', ['-3.11']], ['python', []]]
  : [['python3', []], ['python', []]];

for (const [cmd, baseArgs] of pythonCommands) {
  const version = spawnSync(cmd, [...baseArgs, '--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (version.status !== 0) continue;

  const installArgs = [
    ...baseArgs,
    '-m', 'pip', 'install', '--user', '--upgrade', '-r', 'requirements.txt',
  ];
  const installed = run(cmd, installArgs);
  if (installed.status === 0 && verify(cmd)) process.exit(0);

  // Fallback sem --user, útil em Docker/venv.
  const installGlobalArgs = [
    ...baseArgs,
    '-m', 'pip', 'install', '--upgrade', '-r', 'requirements.txt',
  ];
  const installedGlobal = run(cmd, installGlobalArgs);
  if (installedGlobal.status === 0 && verify(cmd)) process.exit(0);
}

console.error('\nFalha ao instalar/verificar pyswisseph. No Render, use uma destas opções:');
console.error('1) Environment/Language: Node com Build Command: npm install');
console.error('2) Se continuar falhando, troque Environment/Language para Docker; este pacote inclui Dockerfile.');
process.exit(1);
