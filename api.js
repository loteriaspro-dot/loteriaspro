/**
 * LoteriasPro — Camada de API
 * Fonte: endpoint público usado pelo Portal de Loterias da Caixa.
 * v47: integração estabilizada: URL final igual à v43, retry, timeout e cache só em memória.
 */
const API_BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
const SLUG_MAP = {
  "lotofacil":"lotofacil", "mega-sena":"megasena", "quina":"quina",
  "lotomania":"lotomania", "dupla-sena":"duplasena", "dia-de-sorte":"diadesorte",
  "timemania":"timemania", "super-sete":"supersete", "mais-milionaria":"maismilionaria"
};
const CACHE_TTL = 10 * 60 * 1000;
const _cache = {};

function cacheKey(slug, concurso){ return `${slug}:${concurso || 'latest'}`; }
function getMemCache(key){
  const item = _cache[key];
  if(item && Date.now() - item.ts < CACHE_TTL) return item.data;
  return null;
}
function setMemCache(key, data){ _cache[key] = {ts:Date.now(), data}; }

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, attempts=3){
  let lastError = null;
  for(let i=0; i<attempts; i++){
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try{
      // Mantém a chamada simples, sem cabeçalhos customizados, para não gerar preflight/CORS extra.
      const resp = await fetch(url, { signal: controller.signal, cache: "default" });
      clearTimeout(timeout);
      if(!resp.ok) throw new Error(`HTTP ${resp.status} para ${url}`);
      return await resp.json();
    }catch(err){
      clearTimeout(timeout);
      lastError = err;
      if(i < attempts - 1) await sleep(450 * (i + 1));
    }
  }
  throw lastError || new Error(`Falha ao buscar ${url}`);
}

async function fetchResult(slug, concurso=""){
  const endpoint = SLUG_MAP[slug];
  if(!endpoint) throw new Error(`Loteria desconhecida: ${slug}`);

  const key = cacheKey(slug, concurso);
  const cached = getMemCache(key);
  if(cached) return cached;

  // Importante: o último resultado precisa manter a barra final, como na v43: /api/lotofacil/
  // Em alguns ambientes o endpoint sem essa barra falha/intermitência ao navegar.
  const url = `${API_BASE}/${endpoint}/${concurso || ""}`;
  const raw = await fetchJson(url);
  const data = normalize(slug, raw);

  setMemCache(key, data);
  if(data?.concurso) setMemCache(cacheKey(slug, data.concurso), data);
  return data;
}

async function fetchRange(slug, from, to, onProgress){
  const results = [];
  const total = Math.max(0, to - from + 1);
  for(let n=from; n<=to; n++){
    try{ results.push(await fetchResult(slug, n)); }catch(e){ console.warn('Falha ao buscar concurso', slug, n, e); }
    if(onProgress) onProgress(n - from + 1, total);
  }
  return results;
}


async function fetchHistoryFile(slug){
  const url = `historico/${slug}.json?ts=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if(!resp.ok) throw new Error(`Histórico JSON não encontrado: ${url}`);
  const json = await resp.json();
  const list = Array.isArray(json) ? json : (json.concursos || json.results || []);
  return list.map(item => item && item.raw ? item : normalize(slug, item)).filter(Boolean);
}

async function fetchHistoryRange(slug, from=1, to=Infinity, onProgress){
  try{
    const all = await fetchHistoryFile(slug);
    const filtered = all
      .filter(d => Number(d.concurso) >= Number(from) && Number(d.concurso) <= Number(to))
      .sort((a,b)=>Number(a.concurso)-Number(b.concurso));
    if(onProgress) onProgress(filtered.length, filtered.length, 'json');
    return filtered;
  }catch(err){
    console.warn('Histórico JSON indisponível, usando API concurso a concurso como fallback:', err);
    return fetchRange(slug, from, to, onProgress);
  }
}

function asNumberList(value){
  if(!value) return [];
  if(Array.isArray(value)) return value.map(Number).filter(n=>!Number.isNaN(n));
  if(typeof value === 'string') return value.split(/\D+/).filter(Boolean).map(Number).filter(n=>!Number.isNaN(n));
  return [];
}
function firstList(...values){
  for(const v of values){
    const list = asNumberList(v);
    if(list.length) return list;
  }
  return [];
}
function normalizeRateioList(value){ return Array.isArray(value) ? value : []; }

function normalize(slug, r){
  const dezenas = firstList(r.listaDezenas, r.dezenasSorteadasOrdemSorteio, r.listaDezenasSorteio, r.dezenas);
  const dezenas2 = firstList(
    r.listaDezenasSegundoSorteio,
    r.dezenasSegundoSorteio,
    r.listaDezenas2,
    r.segundoSorteio?.listaDezenas,
    r.listaDezenasSorteio2
  );
  const trevos = firstList(
    r.listaTrevos,
    r.trevosSorteados,
    r.listaTrevosSorteados,
    r.listaTrevo,
    r.listaTrevosResultado,
    r.trevos
  );

  let rateios = normalizeRateioList(r.listaRateioPremio || r.rateios || r.listaRateio);
  const rateio1 = normalizeRateioList(r.listaRateioPremioPrimeiroSorteio || r.listaRateioPremio1);
  const rateio2 = normalizeRateioList(r.listaRateioPremioSegundoSorteio || r.listaRateioPremio2);
  if(slug === 'dupla-sena' && (rateio1.length || rateio2.length)){
    rateios = [
      ...rateio1.map(x=>({...x, _sorteio:'1º sorteio'})),
      ...rateio2.map(x=>({...x, _sorteio:'2º sorteio'}))
    ];
  }

  // A faixa principal NÃO é a primeira faixa que teve ganhadores.
  // Ela é sempre a primeira faixa da tabela de rateio, que representa o prêmio máximo
  // da loteria atual: 15 acertos, 6 acertos, 5 acertos, 20 acertos etc.
  // Antes usávamos a primeira faixa com ganhadores > 0; por isso Mega-Sena acumulada
  // aparecia como "136 ganhadores" da quina, em vez de "ACUMULOU".
  const principal = rateios[0] || {};
  const ganhadores = Number(principal.numeroDeGanhadores || 0);
  const municipios = (r.listaMunicipioUFGanhadores || []).map(m=>({
    municipio: m.municipio || m.nomeMunicipio || "",
    uf: m.uf || m.nomeUF || "",
    ganhadores: m.ganhadores || m.numeroGanhadores || m.quantidadeGanhadores || 0
  }));

  return {
    slug,
    concurso: r.numero || r.numeroConcurso,
    data: r.dataApuracao || r.dataSorteio || "",
    dataProximo: r.dataProximoConcurso || "",
    dezenas,
    dezenas2,
    trevos,
    acumulou: ganhadores === 0,
    ganhadores,
    premio: principal.valorPremio || 0,
    municipios,
    estimativa: r.valorEstimadoProximoConcurso || 0,
    acumuladoProximo: r.valorAcumuladoProximoConcurso || 0,
    rateios,
    raw:r
  };
}

function formatBRL(val){
  if(!val && val !== 0) return "—";
  return Number(val).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
}
function formatDate(str){
  if(!str) return "";
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const d = new Date(str);
  if(isNaN(d)) return str;
  return d.toLocaleDateString("pt-BR");
}
window.LotAPI = {fetchResult, fetchRange, fetchHistoryFile, fetchHistoryRange, formatBRL, formatDate, SLUG_MAP};
