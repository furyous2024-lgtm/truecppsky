#!/usr/bin/env node
/*
  Baixa/gera o catálogo de estrelas fixas para o Truesky.

  Saída:
    json/fixedStars.json
    js/fixedStarsCatalog.js

  Uso sem internet/URL:
    npm run download:fixed-stars

  Uso com URL própria CSV/JSON:
    npm run download:fixed-stars -- --url=https://seu-site/catalogo.csv

  Também aceita .env na raiz:
    FIXED_STARS_URL=https://seu-site/catalogo.csv

  Campos aceitos no CSV/JSON:
    name, longitude, eclipticLatitude, magnitude
*/
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const JSON_OUT = path.join(ROOT, 'json', 'fixedStars.json');
const JS_OUT = path.join(ROOT, 'js', 'fixedStarsCatalog.js');

function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#') || !clean.includes('=')) continue;
    const i = clean.indexOf('=');
    const key = clean.slice(0, i).trim();
    const value = clean.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

function getArgUrl() {
  const arg = process.argv.find(a => a.startsWith('--url='));
  return arg ? arg.slice('--url='.length).trim() : '';
}

const dotEnv = loadDotEnv();
const SOURCE_URL =
  getArgUrl() ||
  process.env.FIXED_STARS_URL ||
  process.env.fixed_stars_url ||
  dotEnv.FIXED_STARS_URL ||
  dotEnv.fixed_stars_url ||
  '';

function readLocalCatalog() {
  if (fs.existsSync(JSON_OUT)) {
    return JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));
  }
  return [];
}

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(download(res.headers.location));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function splitCsvLine(line) {
  const cols = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCatalog(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);

  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines.shift()).map(h => h.trim());
  const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const nameI = idx('name');
  const lonI = idx('longitude');
  const latI = idx('eclipticLatitude');
  const magI = idx('magnitude');
  if (nameI < 0 || lonI < 0 || latI < 0 || magI < 0) {
    throw new Error('CSV precisa ter: name, longitude, eclipticLatitude, magnitude');
  }
  return lines.map(line => {
    const cols = splitCsvLine(line);
    return {
      name: cols[nameI],
      longitude: Number(cols[lonI]),
      eclipticLatitude: Number(cols[latI]),
      magnitude: Number(cols[magI]),
    };
  });
}

function normalizeCatalog(catalog) {
  return catalog
    .filter(s => s && s.name && Number.isFinite(Number(s.longitude)) && Number.isFinite(Number(s.magnitude)))
    .map(s => ({
      name: String(s.name),
      longitude: ((Number(s.longitude) % 360) + 360) % 360,
      eclipticLatitude: Number(s.eclipticLatitude || 0),
      magnitude: Number(s.magnitude),
    }))
    .sort((a, b) => a.magnitude - b.magnitude || a.name.localeCompare(b.name));
}

function saveCatalog(catalog) {
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(JS_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(catalog, null, 2));
  fs.writeFileSync(JS_OUT, `window.FIXED_STARS_CATALOG = ${JSON.stringify(catalog, null, 2)};\n`);
}

async function main() {
  let catalog;
  if (SOURCE_URL) {
    console.log(`Baixando catálogo: ${SOURCE_URL}`);
    catalog = parseCatalog(await download(SOURCE_URL));
  } else {
    console.log('Usando catálogo local incluído no projeto. Para baixar de uma URL, use --url=... ou FIXED_STARS_URL no .env.');
    catalog = readLocalCatalog();
  }

  catalog = normalizeCatalog(catalog);
  saveCatalog(catalog);
  console.log(`OK: ${catalog.length} estrelas salvas em json/fixedStars.json e js/fixedStarsCatalog.js`);
}

main().catch(err => {
  console.error('Erro ao baixar/gerar catálogo:', err.message);
  process.exit(1);
});
