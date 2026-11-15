import fs from 'node:fs/promises';
import path from 'node:path';

const API_BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
// Origem configurada no params.txt do Portal Loterias CAIXA.
const PORTAL_API = 'https://servicebus3.caixa.gov.br/portaldeloterias/api';
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
const RULES = {
  lotofacil:[15,1,25], megasena:[6,1,60], quina:[5,1,80], lotomania:[20,0,99],
  duplasena:[6,1,50], diadesorte:[7,1,31], timemania:[7,1,80],
  supersete:[7,0,9], maismilionaria:[6,1,50]
};
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'historico');
const SNAPSHOT_FILE = path.join(ROOT, 'resultados-caixa.json');
const CONCURRENCY = Number(process.env.HISTORICO_CONCURRENCY || 8);
const DELAY_MS = Number(process.env.HISTORICO_DELAY_MS || 80);

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, attempts = 2){
  let lastError;
  for(let i = 0; i < attempts; i++){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try{
      const res = await fetch(url, { signal: controller.signal });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }catch(err){
      lastError = err;
      if(i + 1 < attempts) await sleep(400);
    }finally{
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function readExisting(slug){
  const file = path.join(OUT_DIR, `${slug}.json`);
  try{
    const txt = await fs.readFile(file, 'utf8');
    const json = JSON.parse(txt);
    const concursos = Array.isArray(json) ? json : json?.concursos;
    if(!Array.isArray(concursos)) throw new Error('Formato do histórico existente inválido');
    return { file, concursos };
  }catch(error){
    if(error.code !== 'ENOENT') throw error;
    return { file, concursos: [] };
  }
}

function contestNumber(item){
  return Number(item?.numero || item?.numeroConcurso || item?.concurso || 0);
}

function validContest(endpoint, row, expected){
  const number = contestNumber(row);
  if(!Number.isSafeInteger(number) || number < 1 || (expected && number !== expected)) return false;
  const [size,min,max] = RULES[endpoint];
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.dataApuracao);
  if(!date) return false;
  const [,day,month,year] = date;
  const drawn = new Date(`${year}-${month}-${day}T00:00:00-03:00`);
  return Number.isFinite(+drawn) && +drawn <= Date.now()
    && drawn.toISOString().slice(0,10) === `${year}-${month}-${day}`
    && Array.isArray(row.listaDezenas) && row.listaDezenas.length === size
    && row.listaDezenas.every(digit => /^\d{1,2}$/.test(String(digit)) && Number(digit) >= min && Number(digit) <= max)
    && (endpoint === 'supersete' || new Set(row.listaDezenas.map(Number)).size === size);
}

async function fetchOfficial(endpoint, n){
  const origins = [PORTAL_API, API_BASE];
  const failures = [];
  let best;
  for(const base of origins){
    const url = `${base}/${endpoint}/${n ?? ''}`;
    try{
      const result = await fetchJson(url);
      if(!validContest(endpoint,result,n)) throw new Error('Resultado inválido ou concurso divergente');
      if(n) return result;
      if(!result.listaRateioPremio?.length) throw new Error('Rateio ainda indisponível');
      if(!best || contestNumber(result) > contestNumber(best)) best = result;
    }catch(error){
      failures.push(`${url}: ${error.message}`);
    }
  }
  if(!best) throw new Error(failures.join(' | '));
  const next = Number(best.numeroConcursoProximo);
  if(next > contestNumber(best) && best.dataProximoConcurso?.split('/').reverse().join('-') <= today){
    const candidate = await fetchOfficial(endpoint,next).catch(()=>null);
    if(candidate?.listaRateioPremio?.length) best = candidate;
  }
  return best;
}

async function fetchContest(endpoint, n){
  try{
    return await fetchOfficial(endpoint, n);
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

  const { file, concursos } = await readExisting(slug);
  const latest = await fetchOfficial(endpoint);
  const latestNumber = contestNumber(latest);
  if(!latestNumber) throw new Error(`Não consegui detectar o último concurso de ${slug}`);

  const map = new Map();
  for(const c of concursos){
    const n = contestNumber(c);
    if(n) map.set(n, c);
  }
  const previousLatest = Math.max(0, ...map.keys());
  if(latestNumber < previousLatest) throw new Error(`Fonte atrasada: ${latestNumber} < ${previousLatest}`);
  if(latest.dataProximoConcurso?.split('/').reverse().join('-') < today){
    console.warn(`::warning title=Resultado pendente (${slug})::Próximo sorteio informado: ${latest.dataProximoConcurso}`);
  }

  const missing = [];
  for(let n = 1; n <= latestNumber; n++){
    if(n !== latestNumber && !map.has(n)) missing.push(n);
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
  const existing = map.get(latestNumber);
  if(existing && (existing.dataApuracao !== latest.dataApuracao ||
    JSON.stringify(existing.listaDezenas?.map(Number)) !== JSON.stringify(latest.listaDezenas.map(Number)))){
    throw new Error(`Resultado divergente do histórico salvo para ${latestNumber}`);
  }
  map.set(latestNumber, {...existing, ...latest});

  const ordered = [...map.values()].sort((a,b)=>contestNumber(a)-contestNumber(b));
  if(endpoint === 'supersete' && (ordered.length !== latestNumber ||
    !ordered.every((row,index)=>validContest(endpoint,row,index+1)))){
    throw new Error('Histórico da Super Sete incompleto ou inválido');
  }
  if(JSON.stringify(ordered) === JSON.stringify(concursos)){
    console.log(`↔️ ${slug}: histórico já confirmado até o concurso ${latestNumber}`);
    return latest;
  }
  const output = {
    slug,
    endpoint,
    atualizadoEm: new Date().toISOString(),
    ultimoConcurso: latestNumber,
    totalConcursos: ordered.length,
    concursos: ordered
  };
  const temp = `${file}.${process.pid}.tmp`;
  try{
    await fs.writeFile(temp, JSON.stringify(output), 'utf8');
    await fs.rename(temp,file);
  }finally{
    await fs.rm(temp,{force:true});
  }
  console.log(`✅ ${slug}: ${ordered.length} concursos salvos em ${path.relative(ROOT, file)}`);
  return latest;
}

const only = process.argv.slice(2);
const entries = only.length
  ? Object.entries(LOTERIAS).filter(([slug]) => only.includes(slug))
  : Object.entries(LOTERIAS);

let successful = 0;
let snapshotChanged = false;
let snapshot = {};
try {
  snapshot = JSON.parse(await fs.readFile(SNAPSHOT_FILE, 'utf8'));
} catch (error) {
  if(error.code !== 'ENOENT') throw error;
}
for(const [slug, endpoint] of entries){
  try{
    const cached = snapshot[slug];
    const next = cached?.resultado?.dataProximoConcurso?.split('/').reverse().join('-');
    if(process.env.GITHUB_EVENT_NAME === 'schedule' && cached?.status === 'ok' &&
        next > today && Date.now()/1000 - cached.verificadoEm < 24*60){
      successful++;
      continue;
    }
    const result = await updateLottery(slug, endpoint);
    snapshot[slug] = {resultado: result, verificadoEm: Math.floor(Date.now()/1000),
      status: result.dataProximoConcurso?.split('/').reverse().join('-') < today ? 'atrasado' : 'ok'};
    snapshotChanged = true;
    successful++;
  }catch(error){
    console.warn(`::warning title=Histórico preservado (${slug})::${error.message}`);
  }
}
if(snapshotChanged){
  const temp = `${SNAPSHOT_FILE}.${process.pid}.tmp`;
  try{
    await fs.writeFile(temp, JSON.stringify(snapshot), 'utf8');
    await fs.rename(temp, SNAPSHOT_FILE);
  }finally{
    await fs.rm(temp,{force:true});
  }
}

console.log(`\n${successful}/${entries.length} modalidades verificadas. As demais mantiveram os arquivos anteriores.`);
if(successful !== entries.length) process.exitCode = 1;
