import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
const LOTERIAS = {
  'lotofacil': 'lotofacil',
  'mega-sena': 'megasena',
  'quina': 'quina',
  'lotomania': 'lotomania',
  'dupla-sena': 'duplasena',
  'dia-de-sorte': 'diadesorte',
  'timemania': 'timemania',
  'super-sete': 'supersete',
  'mais-milionaria': 'maismilionaria'
};

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'historico');
const CONCURRENCY = Number(process.env.HISTORICO_CONCURRENCY || 8);
const DELAY_MS = Number(process.env.HISTORICO_DELAY_MS || 80);

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, attempts = 4){
  let lastError;
  for(let i = 0; i < attempts; i++){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try{
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }catch(err){
      clearTimeout(timeout);
      lastError = err;
      await sleep(500 * (i + 1));
    }
  }
  throw lastError;
}

async function readExisting(slug){
  const file = path.join(OUT_DIR, `${slug}.json`);
  try{
    const txt = await fs.readFile(file, 'utf8');
    const json = JSON.parse(txt);
    const concursos = Array.isArray(json) ? json : (json.concursos || []);
    return { file, concursos };
  }catch{
    return { file, concursos: [] };
  }
}

function contestNumber(item){
  return Number(item?.numero || item?.numeroConcurso || item?.concurso || 0);
}

async function fetchContest(endpoint, n){
  const url = `${API_BASE}/${endpoint}/${n}`;
  try{
    const data = await fetchJson(url);
    return contestNumber(data) ? data : null;
  }catch(err){
    console.warn(`⚠️ Falha no concurso ${endpoint}/${n}: ${err.message}`);
    return null;
  }
}

async function fetchMissing(endpoint, missingNumbers){
  const results = [];
  for(let i = 0; i < missingNumbers.length; i += CONCURRENCY){
    const batch = missingNumbers.slice(i, i + CONCURRENCY);
    const data = await Promise.all(batch.map(n => fetchContest(endpoint, n)));
    results.push(...data.filter(Boolean));
    console.log(`   ${Math.min(i + CONCURRENCY, missingNumbers.length)}/${missingNumbers.length} concursos novos verificados`);
    await sleep(DELAY_MS);
  }
  return results;
}

async function updateLottery(slug, endpoint){
  console.log(`\n🎯 Atualizando ${slug}...`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const latest = await fetchJson(`${API_BASE}/${endpoint}/`);
  const latestNumber = contestNumber(latest);
  if(!latestNumber) throw new Error(`Não consegui detectar o último concurso de ${slug}`);

  const { file, concursos } = await readExisting(slug);
  const map = new Map();
  for(const c of concursos){
    const n = contestNumber(c);
    if(n) map.set(n, c);
  }

  const missing = [];
  for(let n = 1; n <= latestNumber; n++){
    if(!map.has(n)) missing.push(n);
  }

  console.log(`   Último concurso: ${latestNumber}`);
  console.log(`   Já salvos: ${map.size}`);
  console.log(`   Faltando: ${missing.length}`);

  if(missing.length){
    const fetched = await fetchMissing(endpoint, missing);
    for(const c of fetched){
      const n = contestNumber(c);
      if(n) map.set(n, c);
    }
  }

  // Garante que o último resultado sempre esteja atualizado, mesmo se já existia no arquivo.
  map.set(latestNumber, latest);

  const ordered = [...map.values()].sort((a,b)=>contestNumber(a)-contestNumber(b));
  const output = {
    slug,
    endpoint,
    atualizadoEm: new Date().toISOString(),
    ultimoConcurso: latestNumber,
    totalConcursos: ordered.length,
    concursos: ordered
  };
  await fs.writeFile(file, JSON.stringify(output), 'utf8');
  console.log(`✅ ${slug}: ${ordered.length} concursos salvos em ${path.relative(ROOT, file)}`);
}

const only = process.argv.slice(2);
const entries = only.length
  ? Object.entries(LOTERIAS).filter(([slug]) => only.includes(slug))
  : Object.entries(LOTERIAS);

for(const [slug, endpoint] of entries){
  await updateLottery(slug, endpoint);
}

console.log('\n✅ Histórico atualizado.');
