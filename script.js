/* LoteriasPro — script.js v47 Integração Caixa estabilizada */
const PRIMES = new Set([2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97]);
const FIB = new Set([1,2,3,5,8,13,21,34,55,89]);
let removed = new Set(), fixed = new Set();
let _currentData = null, _latestData = null, _historyData = [];
let _historySlug = null, _historyFrom = null, _historyTo = null;
let _fullHistoryPromise = null;
function prepareHistoryFast(){
  if(!Array.isArray(_historyData)) return;
  _historyData.forEach(d=>{
    if(d._mask!==undefined) return;
    let mask=0n;
    (d.dezenas||[]).forEach(n=>{ mask |= (1n << BigInt(n)); });
    d._mask=mask;
  });
}
function comboMask(combo){ let mask=0n; combo.forEach(n=>{ mask |= (1n << BigInt(n)); }); return mask; }
function fastHits(maskA, maskB){
  let x = maskA & maskB;
  let c=0;
  while(x){ c++; x &= (x-1n); }
  return c;
}

let _statsLoadToken = 0;
let _lastGeneratedCombos = [];
let _generatedHistoryLoading = null;

const LOTTERY_CONFIG = {
  "lotofacil":{max:25,pick:15,min:1,color:"#8b3fb1",soft:"#f4e8ff",name:"Lotofácil"},
  "mega-sena":{max:60,pick:6,min:1,color:"#159447",soft:"#e9fff1",name:"Mega-Sena"},
  "quina":{max:80,pick:5,min:1,color:"#3f4bb1",soft:"#eef0ff",name:"Quina"},
  "lotomania":{max:100,pick:50,min:0,color:"#e8743b",soft:"#fff1e8",name:"Lotomania"},
  "dupla-sena":{max:50,pick:6,min:1,color:"#a83d5c",soft:"#ffeaf1",name:"Dupla Sena"},
  "dia-de-sorte":{max:31,pick:7,min:1,color:"#d7a83f",soft:"#fff7dc",name:"Dia de Sorte"},
  "timemania":{max:80,pick:10,min:1,color:"#00a859",soft:"#e8fff4",name:"Timemania"},
  "super-sete":{max:9,pick:7,min:0,color:"#95c93d",soft:"#f5ffe5",name:"Super Sete"},
  "mais-milionaria":{max:50,pick:6,min:1,color:"#7651c7",soft:"#f0eaff",name:"+Milionária"}
};

function pad(n){ return String(n).padStart(2,"0"); }
function toggleMenu(){ document.getElementById("mainMenu")?.classList.toggle("open"); }
function currentSlug(){ return document.body.dataset.lottery || null; }
function cfg(slug=currentSlug()){ return LOTTERY_CONFIG[slug]; }
function count(arr, fn){ return arr.reduce((a,n)=>a+(fn(n)?1:0),0); }
function setText(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
function pct(part,total){ return total ? ((part/total)*100).toFixed(2).replace('.',',') : '0,00'; }
function statKeyClass(row){ if(row.delay > row.maxDelay) return 'danger'; if(row.delay > row.avgDelay) return 'warn'; return 'normal'; }
function distMaxDelay(row){ return Number(row.maxDelay || 0) - Number(row.delay || 0); }
function statsLegend(){ return `<div class="legend"><span class="normal">Normal / dentro da média</span><span class="warn">Azul: atraso acima da média</span><span class="danger">Vermelho: atraso acima do maior atraso já registrado</span></div>`; }
function showSuccessMessage(message){ let el=document.getElementById('lp-success-message'); if(!el){ el=document.createElement('div'); el.id='lp-success-message'; el.className='lp-success-message'; const target=document.querySelector('.combo-results') || document.body; target.parentNode.insertBefore(el,target); } el.textContent=message; el.style.display='block'; setTimeout(()=>{ el.style.display='none'; },5000); }
function staticFallback(slug){ const st = window.LOTERIAS?.[slug]; if(!st) return null; return {slug, concurso:st.contest, data:st.date, dataProximo:st.next, dezenas:st.result, dezenas2:st.result2||[], trevos:st.trevos||[], acumulou:true, ganhadores:0, premio:0, municipios:[], estimativa:0, rateios:[]}; }

async function init(){
  fixNavLabels();
  const slug = currentSlug();
  if(!slug && document.querySelector(".cards-grid")){ await initHomePage(); return; }
  if(!slug) return;
  addResultSelector();
  enhanceSimulatorUI();
  rewritePremiumBlock();
  applySmartDefaults();
  showLoading(true);
  try{ _latestData = await LotAPI.fetchResult(slug); _currentData = _latestData; }
  catch(e){ console.warn("API falhou, usando fallback", e); _currentData = _latestData = staticFallback(slug); }
  if(_currentData){
    renderResult(_currentData);
    fillStats(_currentData.dezenas);
    buildOptions(_currentData.dezenas.length);
    buildNumberGrids(slug);
    renderWinners(_currentData);
    renderAdvancedStatsShell();
  }
  showLoading(false);
  // Não carregamos mais milhares de concursos automaticamente ao abrir a página.
  // Isso estava sobrecarregando a API da Caixa e fazia resultados/premiações sumirem ao navegar.
}

function fixNavLabels(){ document.querySelectorAll('a[href="#premium"]').forEach(a=>a.textContent="Ferramentas"); enhanceFooter(); }
function enhanceFooter(){
  const f=document.querySelector('footer'); if(!f||f.dataset.enhanced==='1') return;
  f.dataset.enhanced='1';
  f.innerHTML=`<div class="footer-inner">
    <nav class="footer-links" aria-label="Links do rodapé">
      <a href="lotofacil.html">Lotofácil</a>
      <a href="mega-sena.html">Mega-Sena</a>
      <a href="quina.html">Quina</a>
      <a href="lotomania.html">Lotomania</a>
      <a href="dupla-sena.html">Dupla Sena</a>
      <a href="dia-de-sorte.html">Dia de Sorte</a>
      <a href="timemania.html">Timemania</a>
      <a href="super-sete.html">Super Sete</a>
      <a href="mais-milionaria.html">+Milionária</a>
    </nav>
    <div class="footer-partners" aria-label="Sites parceiros">
      <span>Sites parceiros:</span>
      <a href="https://gruposparatelegram.com.br" target="_blank" rel="noopener">Grupos Para Telegram</a>
      <a href="https://bananapdf.netlify.app" target="_blank" rel="noopener">BananaPDF</a>
    </div>
    <div class="footer-brand">
      <img src="assets/logo-loteriaspro.png" alt="LoteriasPro" class="footer-logo">
      <span class="footer-copy">© 2026 LoteriasPro — Plataforma independente, sem vínculo com a Caixa Econômica Federal.</span>
    </div>
  </div>`;
}


function trevosHTML(data, big=false){
  const trevos=(data.trevos||[]).filter(n=>n!==null&&n!==undefined);
  if(!trevos.length) return '';
  return `<div class="trevos-row ${big?'big':''}"><small>Trevos da sorte</small><div>${trevos.map(n=>`<span class="trevo-ball">${pad(n)}</span>`).join('')}</div></div>`;
}
function homeBallsHTML(slug,data){
  if(slug==='dupla-sena' && Array.isArray(data.dezenas2) && data.dezenas2.length){
    return `<div class="home-double-draw"><div><small>1º sorteio</small>${data.dezenas.map(n=>`<span>${pad(n)}</span>`).join('')}</div><div><small>2º sorteio</small>${data.dezenas2.map(n=>`<span>${pad(n)}</span>`).join('')}</div></div>`;
  }
  const nums=data.dezenas.slice(0,15).map(n=>`<span>${pad(n)}</span>`).join('');
  return nums + (slug==='mais-milionaria' ? trevosHTML(data,false) : '');
}
function resultBallsHTML(data){
  if(data.slug==='dupla-sena' && Array.isArray(data.dezenas2) && data.dezenas2.length){
    return `<div class="result-double-draw"><div><small>1º sorteio</small><div>${data.dezenas.map(n=>`<span>${pad(n)}</span>`).join('')}</div></div><div><small>2º sorteio</small><div>${data.dezenas2.map(n=>`<span>${pad(n)}</span>`).join('')}</div></div></div>`;
  }
  return data.dezenas.map(n=>`<span>${pad(n)}</span>`).join('') + (data.slug==='mais-milionaria' ? trevosHTML(data,true) : '');
}

async function initHomePage(){
  const grid=document.querySelector(".cards-grid"); if(!grid) return;
  const slugs=Object.keys(LotAPI.SLUG_MAP);
  grid.innerHTML='<div class="lp-loading-note">Carregando resultados atualizados da Caixa...</div>';
  const results=[];
  // Carrega em pequenos lotes para não derrubar/interromper chamadas da API.
  for(let i=0; i<slugs.length; i+=3){
    const batch=slugs.slice(i,i+3);
    const partial=await Promise.allSettled(batch.map(s=>LotAPI.fetchResult(s)));
    results.push(...partial);
    await new Promise(r=>setTimeout(r,120));
  }
  grid.innerHTML="";
  results.forEach((res,i)=>{
    const slug=slugs[i], c=cfg(slug); if(!c) return;
    const data=res.status==="fulfilled"?res.value:staticFallback(slug); if(!data) return;
    const balls=homeBallsHTML(slug,data);
    const status=data.acumulou?"ACUMULOU":`${data.ganhadores} ganhador${data.ganhadores>1?"es":""}`;
    const estimStr=data.estimativa?LotAPI.formatBRL(data.estimativa):(window.LOTERIAS?.[slug]?.estimate||"—");
    const municipioHtml=!data.acumulou && data.municipios?.length ? `<div class="home-winners-row"><small>Ganhador(es)</small><strong>${data.municipios.map(m=>`<span class="winner-city">${m.municipio} / ${m.uf} <em>(${m.ganhadores})</em></span>`).join("")}</strong></div>` : "";
    grid.innerHTML += `<article class="lottery-card" style="--c:${c.color}; --soft:${c.soft}"><div class="card-top"><span class="badge"><span class="clover">${cloverSVG()}</span><span>${c.name}</span></span><span class="contest">Concurso ${data.concurso}</span></div><p class="muted">Resultado de ${LotAPI.formatDate(data.data)}</p><div class="balls">${balls}</div><div class="card-info"><div><small>Status</small><strong>${status}</strong></div>${municipioHtml}<div><small>Próximo</small><strong>${LotAPI.formatDate(data.dataProximo)||"—"}</strong></div><div><small>Estimativa</small><strong>${estimStr}</strong></div></div><a class="btn" href="${slug}.html">Ver painel</a></article>`;
  });
}

function cloverSVG(){ return `<svg class="clover-icon" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="heartLeaf" d="M0 0 C-8 -9 -25 -19 -24 -35 C-23 -49 -7 -52 0 -38 C7 -52 23 -49 24 -35 C25 -19 8 -9 0 0Z"/></defs><use href="#heartLeaf" class="leaf light" transform="translate(50 50) rotate(-45) translate(0 -5)"/><use href="#heartLeaf" class="leaf dark" transform="translate(50 50) rotate(45) translate(0 -5)"/><use href="#heartLeaf" class="leaf dark" transform="translate(50 50) rotate(225) translate(0 -5)"/><use href="#heartLeaf" class="leaf light" transform="translate(50 50) rotate(135) translate(0 -5)"/></svg>`; }

function addResultSelector(){
  const result=document.getElementById("resultado"); if(!result || document.getElementById("resultTools")) return;
  const box=document.createElement("section"); box.id="resultTools"; box.className="result-tools";
  box.innerHTML=`<label>Escolher concurso <input id="contestInput" type="number" min="1" placeholder="Ex: 3677"></label><button type="button" onclick="loadContestFromInput()">Buscar concurso</button><button type="button" onclick="loadLatestContest()">Último resultado</button><span class="hint">Consulte desde o 1º concurso até o mais atual.</span>`;
  result.parentNode.insertBefore(box, result);
}
async function loadContestFromInput(){ const slug=currentSlug(), input=document.getElementById("contestInput"); const n=Number(input?.value); if(!slug||!n) return; showLoading(true); try{ const data=await LotAPI.fetchResult(slug,n); _currentData=data; renderResult(data); fillStats(data.dezenas); buildOptions(data.dezenas.length); renderWinners(data); } catch(e){ alert("Não consegui buscar esse concurso. Confira o número e tente de novo."); } showLoading(false); }
async function loadLatestContest(){ const slug=currentSlug(); if(!slug) return; showLoading(true); try{ const data=await LotAPI.fetchResult(slug); _latestData=data; _currentData=data; renderResult(data); fillStats(data.dezenas); buildOptions(data.dezenas.length); renderWinners(data); document.getElementById("contestInput").value=""; } catch(e){ alert("Não consegui buscar o último concurso agora."); } showLoading(false); }
async function navigateContest(step){
  const slug=currentSlug(); if(!slug) return;
  const current=Number(_currentData?.concurso || document.getElementById("contestInput")?.value || 0);
  if(!current) return;
  const latest=Number(_latestData?.concurso || current);
  const target=current + Number(step);
  if(target < 1) return;
  if(step > 0 && latest && target > latest) return;
  showLoading(true);
  try{
    const data=await LotAPI.fetchResult(slug,target);
    _currentData=data;
    renderResult(data); fillStats(data.dezenas); buildOptions(data.dezenas.length); renderWinners(data);
    const input=document.getElementById("contestInput"); if(input) input.value=data.concurso;
  }catch(e){ alert("Não consegui carregar esse concurso agora."); }
  showLoading(false);
}

function ensureResultContestNav(){
  const result=document.getElementById("resultado");
  if(!result || document.getElementById("resultContestNav")) return;
  const nav=document.createElement("div");
  nav.id="resultContestNav";
  nav.className="result-contest-nav";
  nav.setAttribute("aria-label","Navegar entre concursos");
  nav.innerHTML=`<button type="button" class="nav-contest-btn" onclick="navigateContest(-1)" title="Concurso anterior">‹</button><button type="button" class="nav-contest-btn" onclick="navigateContest(1)" title="Próximo concurso">›</button>`;
  result.appendChild(nav);
}

function renderResult(data){
  ensureResultContestNav();
  const heroChip=document.querySelector(".hero-chip"); if(heroChip) heroChip.textContent=`Concurso ${data.concurso}`;
  const h2=document.querySelector("#resultado h2"); if(h2) h2.textContent=`Resultado do concurso ${data.concurso}`;
  const muted=document.querySelector("#resultado .muted"); if(muted){ const prox=LotAPI.formatDate(data.dataProximo); muted.textContent=`Sorteio de ${LotAPI.formatDate(data.data)}${prox?` • Próximo em ${prox}`:""}`; }
  const ballsDiv=document.querySelector("#resultado .balls.big"); if(ballsDiv) ballsDiv.innerHTML=resultBallsHTML(data);
  const status=data.acumulou?"ACUMULOU":`${data.ganhadores} ganhador${data.ganhadores>1?"es":""}`;
  const miniStats=document.querySelectorAll("#resultado .mini-stat");
  if(miniStats.length>=2){ miniStats[0].querySelector("b").textContent=status; miniStats[1].querySelector("b").textContent=data.estimativa?LotAPI.formatBRL(data.estimativa):(window.LOTERIAS?.[data.slug]?.estimate||"—"); if(miniStats[2]) miniStats[2].querySelector("b").textContent=data.dezenas.length; }
}
function renderWinners(data){
  // A premiação detalhada precisa aparecer mesmo se algum card lateral falhar.
  renderRateios(data);
  const awardCard=document.querySelector(".award-card"); if(!awardCard) return;
  awardCard.querySelector(".winners-block")?.remove();
  if(!data.acumulou && data.municipios?.length){
    const block=document.createElement("div"); block.className="winners-block";
    block.innerHTML=`<div class="mini-stat" style="flex-direction:column;align-items:flex-start;gap:6px"><span>Ganhadores — cidade(s)</span><div style="display:flex;flex-direction:column;gap:4px;width:100%">${data.municipios.map(m=>`<b style="font-size:14px">${m.municipio} / ${m.uf} <span style="font-weight:700;color:var(--muted)">(${m.ganhadores})</span></b>`).join("")}</div></div>`;
    awardCard.appendChild(block);
  }
}
function renderRateios(data){
  let section=document.getElementById("rateios-section");
  const result=document.getElementById("resultado");
  if(!section){
    section=document.createElement("section");
    section.id="rateios-section";
    section.className="rateios-near-result";
  }
  section.style.cssText=`--c:${cfg(data.slug)?.color||"#333"}`;
  if(result && section.parentElement!==result) result.appendChild(section);
  else if(!result && !section.parentElement) document.querySelector("main")?.prepend(section);
  if(!data.rateios?.length){ section.style.display="none"; return; }
  section.style.display="block";
  const table = rows => `<div style="overflow-x:auto"><table class="rateio-table"><thead><tr><th>Faixa</th><th>Ganhadores</th><th>Prêmio</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.descricaoFaixa||r.faixa||r.descricao||"—"}</td><td>${r.numeroDeGanhadores??0}</td><td>${LotAPI.formatBRL(r.valorPremio)}</td></tr>`).join("")}</tbody></table></div>`;
  if(data.slug==='dupla-sena'){
    const label = r => String(r._sorteio || r.descricaoFaixa || r.faixa || r.descricao || '').toLowerCase();
    let first=data.rateios.filter(r=>label(r).includes('1º') || label(r).includes('1°') || label(r).includes('primeiro'));
    let second=data.rateios.filter(r=>label(r).includes('2º') || label(r).includes('2°') || label(r).includes('segundo'));
    // Algumas respostas da Caixa vêm só na ordem: 6/5/4/3 acertos do 1º sorteio e depois do 2º sorteio.
    if(!first.length && !second.length && data.rateios.length >= 8){
      first = data.rateios.slice(0, Math.ceil(data.rateios.length/2));
      second = data.rateios.slice(Math.ceil(data.rateios.length/2));
    }
    if(first.length || second.length){
      section.innerHTML=`<h2>Premiação detalhada — Concurso ${data.concurso}</h2><h3>1º sorteio</h3>${table(first.length?first:data.rateios)}${second.length?`<h3>2º sorteio</h3>${table(second)}`:''}`;
      return;
    }
  }
  section.innerHTML=`<h2>Premiação detalhada — Concurso ${data.concurso}</h2>${table(data.rateios)}`;
}
function fillStats(dezenas){ const sum=dezenas.reduce((a,b)=>a+b,0); setText("statEven",count(dezenas,n=>n%2===0)); setText("statOdd",count(dezenas,n=>n%2!==0)); setText("statPrime",count(dezenas,n=>PRIMES.has(n))); setText("statFib",count(dezenas,n=>FIB.has(n))); setText("statSum",sum); setText("statAvg",count(dezenas,n=>n%3===0)); }

function allNumbers(){ const c=cfg(); if(!c) return []; if(currentSlug()==='lotomania') return [...Array.from({length:99},(_,i)=>i+1),0]; return Array.from({length:c.max},(_,i)=>i+c.min); }
function candidateNumbers(type){ const nums=allNumbers(); if(type==="even") return nums.filter(n=>n%2===0); if(type==="odd") return nums.filter(n=>n%2!==0); if(type==="prime") return nums.filter(n=>PRIMES.has(n)); if(type==="fib") return nums.filter(n=>FIB.has(n)); if(type==="mult3") return nums.filter(n=>n%3===0); return nums; }
function renderAdvancedStatsShell(){
  const grid=document.querySelector(".stats-grid"); if(!grid||document.getElementById("advancedStats")) return;
  const c=cfg(); const panel=document.createElement("section"); panel.id="advancedStats"; panel.className="lp-advanced-panel"; panel.style.setProperty("--c",c.color);
  panel.innerHTML=`
    <div class="lp-advanced-head">
      <div class="lp-advanced-title">
        <h2>Estatísticas avançadas</h2>
        <p>HUB profissional com ciclos, padrões, atrasos e distribuições ordenadas da maior porcentagem para a menor.</p>
      </div>
      <div class="lp-period-box">
        <label>Período rápido
          <select id="statsRange">
            <option value="100">Últimos 100 concursos</option>
            <option value="50">Últimos 50 concursos</option>
            <option value="20">Últimos 20 concursos</option>
            <option value="all">Desde o primeiro</option>
          </select>
        </label>
        <div class="contest-range-inline">
          <label>Do concurso <input id="statsFrom" type="number" min="1" placeholder="Ex: 3000"></label>
          <label>Até <input id="statsTo" type="number" min="1" placeholder="Atual"></label>
        </div>
        <button type="button" onclick="loadAdvancedStats()">Carregar estatísticas</button>
        <span id="statsProgress" class="lp-loading-note"></span>
      </div>
    </div>
    <div class="stats-hub-tabs">
      <button class="active" data-hub="cycles" onclick="openStatsHub('cycles')">Ciclos</button>
      <button data-hub="numbers" onclick="openStatsHub('numbers')">Dezenas</button>
      <button data-hub="sequence" onclick="openStatsHub('sequence')">Sequências e atrasos</button>
      <button data-hub="evenodd" onclick="openStatsHub('evenodd')">Pares e ímpares</button>
      <button data-hub="repeat" onclick="openStatsHub('repeat')">Concurso anterior</button>
      <button data-hub="initialdigit" onclick="openStatsHub('initialdigit')">Dezena inicial</button>
      <button data-hub="finaldigit" onclick="openStatsHub('finaldigit')">Dezena final</button>
      <button data-hub="dozenmap" onclick="openStatsHub('dozenmap')">Mapa das dezenas</button>
      ${currentSlug()==='lotofacil' ? `<button data-hub="magic" onclick="openStatsHub('magic')">Números mágicos</button>` : ''}
      <button data-hub="startend" onclick="openStatsHub('startend')">Inicial e final</button>
      <button data-hub="prime" onclick="openStatsHub('prime')">Primos</button>
      <button data-hub="fib" onclick="openStatsHub('fib')">Fibonacci</button>
      <button data-hub="mult3" onclick="openStatsHub('mult3')">Múltiplos de 3</button>
      <button data-hub="sum" onclick="openStatsHub('sum')">Faixa das somas</button>
      ${currentSlug()!=='lotofacil' ? `
        <button data-hub="line" onclick="openStatsHub('line')">Linhas</button>
        <button data-hub="column" onclick="openStatsHub('column')">Colunas</button>
      ` : ''}
      ${smartSupportsQuadrants() ? `
        <button data-hub="quad1" onclick="openStatsHub('quad1')">Quadrante 1</button>
        <button data-hub="quad2" onclick="openStatsHub('quad2')">Quadrante 2</button>
        <button data-hub="quad3" onclick="openStatsHub('quad3')">Quadrante 3</button>
        <button data-hub="quad4" onclick="openStatsHub('quad4')">Quadrante 4</button>
      ` : ''}
      <button data-hub="frame" onclick="openStatsHub('frame')">Moldura e retrato</button>
    </div>
    <div id="statsOutput" class="lp-stat-output"><div class="lp-loading-note">Clique em carregar para analisar os concursos.</div></div>`;
  grid.parentNode.insertBefore(panel, grid.nextSibling);
  const rangeSelect = document.getElementById("statsRange");
  const fromInput = document.getElementById("statsFrom");
  const toInput = document.getElementById("statsTo");
  // Quando a pessoa troca o período rápido, limpamos o intervalo manual.
  // Assim, se ela carregou 400 concursos pelo campo manual e depois escolheu
  // "últimos 100" ou "últimos 20", o cálculo realmente troca de período.
  rangeSelect?.addEventListener("change", () => {
    if(fromInput) fromInput.value = "";
    if(toInput) toInput.value = "";
    const prog = document.getElementById("statsProgress");
    if(prog) prog.textContent = "";
  });
}

async function loadAdvancedStats(){
  const slug=currentSlug(); if(!slug) return;
  const token=++_statsLoadToken;
  const latest=_latestData||_currentData||await LotAPI.fetchResult(slug);
  if(token!==_statsLoadToken) return;
  const last=Number(latest.concurso);
  const range=document.getElementById("statsRange")?.value || "100";
  const fromEl=document.getElementById("statsFrom");
  const toEl=document.getElementById("statsTo");
  const customFrom=Number(fromEl?.value || 0);
  const customTo=Number(toEl?.value || 0);
  const hasManualRange=Boolean((fromEl?.value||"").trim() || (toEl?.value||"").trim());
  let to=hasManualRange ? (customTo || last) : last;
  let from=hasManualRange ? (customFrom || 1) : (range==="all" ? 1 : Math.max(1,last-Number(range)+1));
  if(from>to){ const tmp=from; from=to; to=tmp; }
  from=Math.max(1,from); to=Math.min(last,to);
  const total=to-from+1;
  const prog=document.getElementById("statsProgress"); const out=document.getElementById("statsOutput");
  _historyData=[];
  if(prog) prog.textContent=`Carregando ${from} até ${to}...`;
  if(out) out.innerHTML=`<div class="lp-loading-note">Carregando período (${from} até ${to})...</div>`;
  const loadedData=await fetchRangeFast(slug,from,to,(loaded,total,source)=>{
    if(token===_statsLoadToken && prog) prog.textContent=source==='json' ? `${loaded} concursos do JSON` : `${loaded}/${total} concursos`;
  });
  if(token!==_statsLoadToken) return;
  _historyData=loadedData.filter(d=>d && d.dezenas && d.dezenas.length);
  _historyData.sort((a,b)=>Number(a.concurso)-Number(b.concurso));
  if(prog) prog.textContent=`${_historyData.length} concursos analisados (${from} até ${to})`;
  openStatsHub(document.querySelector('.stats-hub-tabs button.active')?.dataset.hub || 'cycles');
}

function openStatsHub(hub){
  document.querySelectorAll('.stats-hub-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.hub===hub));
  if(!_historyData.length){ document.getElementById('statsOutput').innerHTML='<div class="lp-loading-note">Carregue o histórico primeiro.</div>'; return; }
  const map={cycles:renderCyclesHub,numbers:renderNumbersHub,sequence:renderSequenceDelayHub,evenodd:renderEvenOddHub,repeat:renderRepeatHub,initialdigit:renderInitialDigitHub,finaldigit:renderFinalDigitHub,dozenmap:renderDozenMapHub,magic:renderMagicHub,startend:renderStartEndHub,prime:()=>renderCountPatternHubWithInfo('Números primos', n=>PRIMES.has(n), 'prime'),fib:()=>renderCountPatternHubWithInfo('Fibonacci', n=>FIB.has(n), 'fib'),mult3:()=>renderCountPatternHub('Múltiplos de 3', n=>n%3===0),sum:renderSumHub,line:renderLineHub,column:renderColumnHub,quad1:()=>renderQuadrantHub(1),quad2:()=>renderQuadrantHub(2),quad3:()=>renderQuadrantHub(3),quad4:()=>renderQuadrantHub(4),frame:renderFrameHub};
  map[hub]?.();
}

function renderCyclesHub(){
  const out=document.getElementById('statsOutput'); const types=[['all','Todas as dezenas'],['even','Pares'],['odd','Ímpares'],['prime','Primos'],['fib','Fibonacci'],['mult3','Múltiplos de 3']];
  out.innerHTML=`<div class="cycle-layout"><div class="cycle-info"><h3>Ciclos das dezenas</h3><p>Agora a tabela retira as dezenas do concurso atual e mostra o que ainda falta <b>após o último sorteio analisado</b>.</p></div><div class="cycle-filter"><label>Tipo de ciclo <select id="cycleType" onchange="drawCyclesTable()">${types.map(t=>`<option value="${t[0]}">${t[1]}</option>`).join('')}</select></label></div><div id="cyclesTable"></div></div>`;
  drawCyclesTable();
}
function drawCyclesTable(){
  const type=document.getElementById('cycleType')?.value||'all'; const cand=candidateNumbers(type); let seen=new Set(), cycle=1; const rows=[];
  [..._historyData].forEach(d=>{
    d.dezenas.forEach(n=>{ if(cand.includes(n)) seen.add(n); });
    const after=cand.filter(n=>!seen.has(n));
    const closed=after.length===0;
    rows.push({contest:d.concurso,dezenas:d.dezenas,after,closed,cycle});
    if(closed){ cycle++; seen=new Set(); }
  });
  document.getElementById('cyclesTable').innerHTML=`<div class="table-wrap"><table class="pro-table cycles-pro"><thead><tr><th>Concurso</th><th>Dezenas sorteadas</th><th>Faltam após o sorteio</th><th>Qtd.</th><th>Ciclo</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${r.contest}</b></td><td>${r.dezenas.map(pad).join(' ')}</td><td>${r.closed?'<b class="tag-ok">Fim do ciclo</b>':(r.after.length?r.after.map(pad).join(' '):'—')}</td><td>${r.closed?0:r.after.length}</td><td>${r.cycle}</td></tr>`).join('')}</tbody></table></div>`;
}

function numberDelayStats(){
  const nums=allNumbers(); const rows=[];
  nums.forEach(n=>{
    let freq=0, gap=0, gaps=[], lastContest='—', seen=false;
    _historyData.forEach(d=>{
      if(d.dezenas.includes(n)){
        freq++;
        if(seen) gaps.push(gap);
        gap=0; lastContest=d.concurso; seen=true;
      }else if(seen){ gap++; }
    });
    const rev=[..._historyData].reverse();
    let delay=rev.findIndex(d=>d.dezenas.includes(n)); if(delay<0) delay=_historyData.length;
    const maxDelay=gaps.length?Math.max(...gaps):0;
    const avgDelay=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:delay;
    rows.push({n,freq,percent:pct(freq,_historyData.length),delay,maxDelay,avgDelay,lastContest});
  });
  return rows;
}
function renderNumbersHub(){
  const rows=numberDelayStats().sort((a,b)=>b.freq-a.freq || b.delay-a.delay);
  document.getElementById('statsOutput').innerHTML=`${statsLegend()}<div class="table-wrap"><table class="pro-table"><thead><tr><th>Dezena</th><th>Freq.</th><th>%</th><th>Atraso atual</th><th>Maior atraso anterior</th><th>Dist. maior atraso</th><th>Atraso médio</th><th>Últ. concurso</th></tr></thead><tbody>${rows.map(r=>`<tr class="${statKeyClass(r)}"><td><b>${pad(r.n)}</b></td><td>${r.freq}</td><td>${r.percent}</td><td>${r.delay}</td><td>${r.maxDelay}</td><td>${distMaxDelay(r)}</td><td>${r.avgDelay.toFixed(2).replace('.',',')}</td><td>${r.lastContest}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderSequenceDelayHub(){
  const rows=allNumbers().map(n=>{
    let freq=0, currentSeq=0, maxSeq=0, seqRuns=[], run=0;
    let delay=0, delayGaps=[], gap=0, seen=false, lastContest='—';
    _historyData.forEach(d=>{
      const hit=d.dezenas.includes(n);
      if(hit){
        freq++; lastContest=d.concurso; run++; currentSeq=run; maxSeq=Math.max(maxSeq,run);
        if(seen) delayGaps.push(gap);
        gap=0; seen=true;
      }else{
        if(run>0) seqRuns.push(run);
        run=0; currentSeq=0;
        if(seen){ gap++; }
      }
    });
    if(run>0) seqRuns.push(run);
    const rev=[..._historyData].reverse();
    delay=rev.findIndex(d=>d.dezenas.includes(n)); if(delay<0) delay=_historyData.length;
    const maxDelay=delayGaps.length?Math.max(...delayGaps):0;
    const avgSeq=seqRuns.length?seqRuns.reduce((a,b)=>a+b,0)/seqRuns.length:0;
    const avgDelay=delayGaps.length?delayGaps.reduce((a,b)=>a+b,0)/delayGaps.length:delay;
    return {n,freq,currentSeq,maxSeq,avgSeq,delay,maxDelay,avgDelay,lastContest,percent:pct(freq,_historyData.length)};
  }).sort((a,b)=>b.currentSeq-a.currentSeq || b.delay-a.delay || a.n-b.n);
  document.getElementById('statsOutput').innerHTML=`${statsLegend()}<div class="table-wrap"><table class="pro-table"><thead><tr><th>Dezena</th><th>Freq.</th><th>%</th><th>Sequência atual</th><th>Maior sequência</th><th>Média sequência</th><th>Atraso atual</th><th>Maior atraso anterior</th><th>Dist. maior atraso</th><th>Atraso médio</th><th>Últ. concurso</th></tr></thead><tbody>${rows.map(r=>`<tr class="${statKeyClass(r)}"><td><b>${pad(r.n)}</b></td><td>${r.freq}</td><td>${r.percent}</td><td>${r.currentSeq}</td><td>${r.maxSeq}</td><td>${r.avgSeq.toFixed(2).replace('.',',')}</td><td>${r.delay}</td><td>${r.maxDelay}</td><td>${distMaxDelay(r)}</td><td>${r.avgDelay.toFixed(2).replace('.',',')}</td><td>${r.lastContest}</td></tr>`).join('')}</tbody></table></div>`;
}

function occurrenceRows(keys, classifier, totalBase=_historyData.length){
  const combos={}; keys.forEach(k=>combos[k]={key:k,freq:0,lastIdx:-1,gaps:[],gap:0});
  _historyData.forEach((d,idx)=>{ Object.values(combos).forEach(o=>o.gap++); const key=classifier(d,idx); if(!combos[key]) combos[key]={key,freq:0,lastIdx:-1,gaps:[],gap:0}; const o=combos[key]; o.freq++; if(o.lastIdx>=0) o.gaps.push(idx-o.lastIdx-1); o.lastIdx=idx; o.gap=0; });
  return Object.values(combos).filter(o=>o.freq>0).map(o=>({key:o.key,freq:o.freq,percent:pct(o.freq,totalBase),delay:_historyData.length-1-o.lastIdx,maxDelay:o.gaps.length?Math.max(...o.gaps):0,avgDelay:o.gaps.length?o.gaps.reduce((a,b)=>a+b,0)/o.gaps.length:(_historyData.length-1-o.lastIdx)})).sort((a,b)=>b.freq-a.freq || String(a.key).localeCompare(String(b.key),'pt-BR'));
}
function occurrenceRowsMulti(keys, classifier, totalBase=_historyData.length){
  const combos={}; keys.forEach(k=>combos[k]={key:k,freq:0,lastIdx:-1,gaps:[],gap:0});
  _historyData.forEach((d,idx)=>{
    Object.values(combos).forEach(o=>o.gap++);
    const hits=classifier(d,idx) || [];
    hits.forEach(key=>{
      if(!combos[key]) combos[key]={key,freq:0,lastIdx:-1,gaps:[],gap:0};
      const o=combos[key];
      o.freq++;
      if(o.lastIdx>=0) o.gaps.push(idx-o.lastIdx-1);
      o.lastIdx=idx;
      o.gap=0;
    });
  });
  return Object.values(combos).filter(o=>o.freq>0).map(o=>({key:o.key,freq:o.freq,percent:pct(o.freq,totalBase),delay:o.lastIdx>=0?_historyData.length-1-o.lastIdx:_historyData.length,maxDelay:o.gaps.length?Math.max(...o.gaps):0,avgDelay:o.gaps.length?o.gaps.reduce((a,b)=>a+b,0)/o.gaps.length:(o.lastIdx>=0?_historyData.length-1-o.lastIdx:_historyData.length)})).sort((a,b)=>b.freq-a.freq || Number(a.key)-Number(b.key));
}
function renderPatternTable(title, rows, firstCol='Padrão'){
  document.getElementById('statsOutput').innerHTML=`${statsLegend()}<div class="table-wrap"><table class="pro-table"><thead><tr><th>${firstCol}</th><th>Freq.</th><th>%</th><th>Atraso</th><th>Maior atraso anterior</th><th>Dist. maior atraso</th><th>Atraso médio</th><th>Média ocorrências</th></tr></thead><tbody>${rows.map(r=>`<tr class="${statKeyClass(r)}"><td><b>${r.key}</b></td><td>${r.freq}</td><td>${r.percent}</td><td>${r.delay}</td><td>${r.maxDelay}</td><td>${distMaxDelay(r)}</td><td>${r.avgDelay.toFixed(2).replace('.',',')}</td><td>1 a cada ${(_historyData.length/r.freq).toFixed(2).replace('.',',')}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderEvenOddHub(){ const c=cfg(); const keys=[]; for(let e=0;e<=c.pick;e++) keys.push(`${e}-${c.pick-e}`); renderPatternTable('Pares e ímpares', occurrenceRows(keys,d=>{const ev=count(d.dezenas,n=>n%2===0); return `${ev}-${d.dezenas.length-ev}`;}), 'Pares-Ímpares'); }
function renderRepeatHub(){ const c=cfg(); const keys=[]; for(let r=0;r<=c.pick;r++) keys.push(String(r)); const rows={}; keys.forEach(k=>rows[k]={key:k,freq:0,lastIdx:-1,gaps:[],gap:0}); for(let i=1;i<_historyData.length;i++){ Object.values(rows).forEach(o=>o.gap++); const prev=_historyData[i-1].dezenas, cur=_historyData[i].dezenas; const rep=String(cur.filter(n=>prev.includes(n)).length); const o=rows[rep]||(rows[rep]={key:rep,freq:0,lastIdx:-1,gaps:[],gap:0}); o.freq++; if(o.lastIdx>=0) o.gaps.push(i-o.lastIdx-1); o.lastIdx=i; o.gap=0; } const out=Object.values(rows).filter(o=>o.freq>0).map(o=>({key:o.key,freq:o.freq,percent:pct(o.freq,_historyData.length-1),delay:_historyData.length-1-o.lastIdx,maxDelay:o.gaps.length?Math.max(...o.gaps):0,avgDelay:o.gaps.length?o.gaps.reduce((a,b)=>a+b,0)/o.gaps.length:(_historyData.length-1-o.lastIdx)})).sort((a,b)=>b.freq-a.freq); renderPatternTable('Repetidas do anterior', out, 'Repetidas'); }

function renderInitialDigitHub(){
  const nums=allNumbers().map(n=>String(n));
  const rows=occurrenceRows(nums,d=>String(Math.min(...d.dezenas))).sort((a,b)=>b.freq-a.freq || Number(a.key)-Number(b.key));
  renderPatternTable('Dezena inicial do resultado', rows, 'Dezena inicial');
}
function renderFinalDigitHub(){
  const nums=allNumbers().map(n=>String(n));
  const rows=occurrenceRows(nums,d=>String(Math.max(...d.dezenas))).sort((a,b)=>b.freq-a.freq || Number(b.key)-Number(a.key));
  renderPatternTable('Dezena final do resultado', rows, 'Dezena final');
}
function gridPerRow(){ const c=cfg(); if(c.max<=31) return 5; if(c.max<=60) return 10; return 10; }
function dozenColor(n){
  const palette=['#ef4444','#fde047','#16a34a','#7f1d1d','#1d4ed8','#f000ff','#111827','#9ca3af','#f97316','#ffffff'];
  return palette[Math.abs(Number(n))%10];
}
function dozenTextColor(n){ const c=dozenColor(n); return c==='#ffffff'||c==='#fde047'?'#111827':'#ffffff'; }
function renderDozenMapHub(){
  const nums=allNumbers();
  const rows=[..._historyData].map((d,idx)=>{
    const prev=idx>0?_historyData[idx-1].dezenas:[];
    const set=new Set(d.dezenas);
    const sum=d.dezenas.reduce((a,b)=>a+b,0), ev=count(d.dezenas,n=>n%2===0), odd=d.dezenas.length-ev;
    const ant=d.dezenas.filter(n=>prev.includes(n)).length;
    return `<tr><td><b>${d.concurso}</b></td>${nums.map(n=>set.has(n)?`<td class="map-hit" style="background:${dozenColor(n)};color:${dozenTextColor(n)}">${pad(n)}</td>`:`<td></td>`).join('')}<td>${ant}</td><td>${sum}</td><td>${ev}</td><td>${odd}</td><td>${count(d.dezenas,n=>PRIMES.has(n))}</td><td>${count(d.dezenas,n=>FIB.has(n))}</td><td>${count(d.dezenas,n=>n%3===0)}</td></tr>`;
  }).join('');
  document.getElementById('statsOutput').innerHTML=`<div class="table-wrap dozen-map-wrap"><table class="pro-table dozen-map"><thead><tr><th>Concurso</th>${nums.map(n=>`<th>${pad(n)}</th>`).join('')}<th>ANT</th><th>SOMA</th><th>PAR</th><th>ÍMP</th><th>PRIM</th><th>FIBO</th><th>M3</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
const LOTOFACIL_MAGIC = new Set([5,6,7,12,13,14,19,20,21]);
function magicNumbersForCurrent(){ return currentSlug()==='lotofacil' ? LOTOFACIL_MAGIC : new Set([...PRIMES,...FIB]); }
function isMagicNumber(n){ return magicNumbersForCurrent().has(n); }
function patternInfoHtml(kind){
  const nums = kind==='magic' ? [...magicNumbersForCurrent()] : kind==='prime' ? allNumbers().filter(n=>PRIMES.has(n)) : kind==='fib' ? allNumbers().filter(n=>FIB.has(n)) : [];
  const title = kind==='magic' ? 'Números mágicos' : kind==='prime' ? 'Números primos' : 'Números Fibonacci';
  return `<div class="pattern-note"><b>${title}:</b> ${nums.map(pad).join(' - ')}</div>`;
}
function renderMagicHub(){
  const note=patternInfoHtml('magic');
  const maxMagic=currentSlug()==='lotofacil' ? LOTOFACIL_MAGIC.size : cfg().pick;
  const rows=occurrenceRows(Array.from({length:maxMagic+1},(_,i)=>String(i)), d=>String(count(d.dezenas,n=>isMagicNumber(n))));
  renderPatternTable('Números mágicos', rows, 'Mágicos');
  document.getElementById('statsOutput').insertAdjacentHTML('afterbegin', note);
}
function renderStartEndHub(){
  const pairs=[]; allNumbers().forEach(a=>allNumbers().forEach(b=>{ if(a<b) pairs.push(`${pad(a)} - ${pad(b)}`); }));
  const rows=occurrenceRows(pairs,d=>`${pad(Math.min(...d.dezenas))} - ${pad(Math.max(...d.dezenas))}`);
  renderPatternTable('Dezena inicial e final', rows, 'Inicial - Final');
}
function renderCountPatternHub(title, predicate){ const c=cfg(); const keys=Array.from({length:c.pick+1},(_,i)=>String(i)); const rows=occurrenceRows(keys,d=>String(count(d.dezenas,predicate))); renderPatternTable(title, rows, title); }
function renderCountPatternHubWithInfo(title, predicate, infoKind){ const c=cfg(); const keys=Array.from({length:c.pick+1},(_,i)=>String(i)); const rows=occurrenceRows(keys,d=>String(count(d.dezenas,predicate))); document.getElementById('statsOutput').innerHTML=patternInfoHtml(infoKind); const note=document.getElementById('statsOutput').innerHTML; renderPatternTable(title, rows, title); document.getElementById('statsOutput').insertAdjacentHTML('afterbegin', note); }
function renderSumHub(){
  let ranges=[];
  if(currentSlug()==='lotofacil'){
    ranges=[[120,134],[135,149],[150,164],[165,179],[180,194],[195,210],[211,225],[226,240],[241,255],[256,270]];
  }else if(currentSlug()==='mega-sena'){
    // Faixas corrigidas conforme referência do Dez na Sorte / layout solicitado.
    ranges=[[184,216],[151,183],[118,150],[217,249],[85,117],[250,281],[53,84],[282,313],[314,345]];
  }else if(currentSlug()==='quina'){
    // Faixas da Quina conforme referência enviada.
    ranges=[[165,202],[203,240],[127,164],[241,278],[279,316],[89,126],[52,88],[317,353],[15,51],[354,390]];
  }else{
    const sums=_historyData.map(d=>d.dezenas.reduce((a,b)=>a+b,0)); const min=Math.min(...sums), max=Math.max(...sums); const step=cfg().pick>=15?10:5;
    for(let a=Math.floor(min/step)*step;a<=max;a+=step) ranges.push([a,a+step-1]);
  }
  const keys=ranges.map(r=>`${r[0]}-${r[1]}`);
  const rows=occurrenceRows(keys,d=>{ const s=d.dezenas.reduce((a,b)=>a+b,0); const r=ranges.find(([a,b])=>s>=a&&s<=b); return r?`${r[0]}-${r[1]}`:`Fora da faixa`; });
  renderPatternTable('Faixa das somas', rows, 'Soma');
}

function lineColumnInfo(){
  const nums=allNumbers(), per=gridPerRow(), rows=Math.ceil(nums.length/per);
  return {nums, per, rows};
}
function lineIndexFor(n){ const info=lineColumnInfo(); const idx=info.nums.indexOf(n); return idx<0 ? 0 : Math.floor(idx/info.per)+1; }
function columnIndexFor(n){ const info=lineColumnInfo(); const idx=info.nums.indexOf(n); return idx<0 ? 0 : (idx%info.per)+1; }
function lineRangeLabel(line){
  const info=lineColumnInfo();
  const nums=info.nums.slice((line-1)*info.per, line*info.per);
  if(!nums.length) return '';
  return `${pad(nums[0])} a ${pad(nums[nums.length-1])}`;
}
function columnRangeLabel(col){
  const info=lineColumnInfo();
  const nums=[];
  for(let i=col-1;i<info.nums.length;i+=info.per) nums.push(info.nums[i]);
  return nums.map(pad).join(', ');
}
function renderLineHub(){
  const info=lineColumnInfo();
  const keys=Array.from({length:info.rows},(_,i)=>String(i+1));
  const rows=occurrenceRowsMulti(keys,d=>{
    const present=new Set(d.dezenas.map(lineIndexFor));
    return keys.filter(k=>!present.has(Number(k)));
  }).sort((a,b)=>b.delay-a.delay || Number(a.key)-Number(b.key));
  renderPatternTable('Linhas sem dezena sorteada', rows, 'Linha vazia');
  const desc=keys.map(k=>`Linha ${k} = ${lineRangeLabel(Number(k))}`).join(' • ');
  document.getElementById('statsOutput').insertAdjacentHTML('afterbegin', `<div class="pattern-note"><b>Leitura:</b> mostra há quantos concursos não sai nenhuma dezena daquela linha. ${desc}</div>`);
}
function renderColumnHub(){
  const info=lineColumnInfo();
  const keys=Array.from({length:info.per},(_,i)=>String(i+1));
  const rows=occurrenceRowsMulti(keys,d=>{
    const present=new Set(d.dezenas.map(columnIndexFor));
    return keys.filter(k=>!present.has(Number(k)));
  }).sort((a,b)=>b.delay-a.delay || Number(a.key)-Number(b.key));
  renderPatternTable('Colunas sem dezena sorteada', rows, 'Coluna vazia');
  const sample=keys.slice(0,Math.min(3,keys.length)).map(k=>`Coluna ${k} = ${columnRangeLabel(Number(k))}`).join(' • ');
  document.getElementById('statsOutput').insertAdjacentHTML('afterbegin', `<div class="pattern-note"><b>Leitura:</b> mostra há quantos concursos não sai nenhuma dezena daquela coluna. ${sample}${keys.length>3?' • ...':''}</div>`);
}
function quadrantSetsForCurrent(){
  const nums=allNumbers(), per=gridPerRow(), rows=Math.ceil(nums.length/per);
  const midRow=Math.ceil(rows/2), midCol=Math.ceil(per/2);
  const q={1:new Set(),2:new Set(),3:new Set(),4:new Set()};
  nums.forEach((n,pos)=>{
    const r=Math.floor(pos/per)+1, col=(pos%per)+1;
    if(r<=midRow && col<=midCol) q[1].add(n);
    else if(r<=midRow && col>midCol) q[2].add(n);
    else if(r>midRow && col<=midCol) q[3].add(n);
    else q[4].add(n);
  });
  return q;
}
function renderQuadrantHub(num){
  const quad=quadrantSetsForCurrent()[num] || new Set();
  const keys=Array.from({length:cfg().pick+1},(_,i)=>String(i));
  const rows=occurrenceRows(keys,d=>String(count(d.dezenas,n=>quad.has(n))));
  renderPatternTable(`Quadrante ${num}`, rows, 'Dezenas no quadrante');
  const nums=[...quad].sort((a,b)=>a-b).map(pad).join(' - ');
  document.getElementById('statsOutput').insertAdjacentHTML('afterbegin', `<div class="pattern-note"><b>Quadrante ${num}:</b> ${nums}</div>`);
}

function frameSet(){ const nums=allNumbers(), per=gridPerRow(), rows=Math.ceil(nums.length/per), set=new Set(); nums.forEach((n,pos)=>{ const r=Math.floor(pos/per)+1, col=(pos%per)+1; if(r===1||r===rows||col===1||col===per) set.add(n); }); return set; }
function renderFrameHub(){ const frame=frameSet(), c=cfg(); const keys=[]; for(let m=0;m<=c.pick;m++) keys.push(`${m}-${c.pick-m}`); const rows=occurrenceRows(keys,d=>{ const m=count(d.dezenas,n=>frame.has(n)); return `${m}-${d.dezenas.length-m}`; }); renderPatternTable('Moldura e retrato', rows, 'Moldura-Retrato'); }

function enhanceSimulatorUI(){
  const filters=document.querySelector(".filters"); if(!filters||document.getElementById("filterMult3")) return;
  const repeat=document.getElementById("filterRepeat")?.closest("label"); if(repeat){ const label=document.createElement("label"); label.innerHTML=`Múltiplos de 3<select id="filterMult3"><option value="any">Qualquer</option></select>`; repeat.parentNode.insertBefore(label, repeat.nextSibling); }
  const sumMin=document.getElementById("sumMin")?.closest("label"), sumMax=document.getElementById("sumMax")?.closest("label"); if(sumMin&&sumMax){ const wrap=document.createElement("div"); wrap.className="sum-inline"; sumMin.parentNode.insertBefore(wrap,sumMin); wrap.appendChild(sumMin); wrap.appendChild(sumMax); }
}
function buildOptions(pickSize){ ["filterEven","filterOdd","filterPrime","filterFib","filterRepeat","filterMult3"].forEach(id=>{ const sel=document.getElementById(id); if(!sel) return; while(sel.options.length>1) sel.remove(1); for(let i=0;i<=Math.min(pickSize,30);i++){ const op=document.createElement("option"); op.value=i; op.textContent=i; sel.appendChild(op); } }); }
function arrangeSimulatorGrids(){
  const wrap=document.querySelector('#simulador .selector-wrap');
  const fix=document.getElementById('fixGrid')?.parentElement;
  const rem=document.getElementById('removeGrid')?.parentElement;
  if(wrap&&fix&&rem&&wrap.firstElementChild!==fix){ wrap.insertBefore(fix, rem); }
}
function buildNumberGrids(slug){ const c=cfg(slug); if(!c) return; const nums=allNumbers(); drawGrid("fixGrid",nums,"fix"); drawGrid("removeGrid",nums,"remove"); arrangeSimulatorGrids(); }
function drawGrid(id,nums,type){ const grid=document.getElementById(id); if(!grid) return; grid.style.setProperty("--cols", Math.min(gridPerRow(),10)); grid.innerHTML=""; nums.forEach(n=>{ const btn=document.createElement("button"); btn.className="num-btn"; btn.textContent=pad(n); btn.onclick=()=>toggleNumber(n,type); grid.appendChild(btn); }); refreshButtons(); }
function toggleNumber(n,type){ const a=type==="remove"?removed:fixed, b=type==="remove"?fixed:removed; if(b.has(n)) return; a.has(n)?a.delete(n):a.add(n); refreshButtons(); }
function refreshButtons(){ document.querySelectorAll("#removeGrid .num-btn").forEach(btn=>{ const n=Number(btn.textContent); btn.classList.toggle("active",removed.has(n)); btn.classList.toggle("disabled",fixed.has(n)); }); document.querySelectorAll("#fixGrid .num-btn").forEach(btn=>{ const n=Number(btn.textContent); btn.classList.toggle("active",fixed.has(n)); btn.classList.toggle("disabled",removed.has(n)); }); }
function randomCombo(pool,size){ const copy=[...pool],out=[]; while(copy.length&&out.length<size){ const idx=Math.floor(Math.random()*copy.length); out.push(copy.splice(idx,1)[0]); } return out.sort((a,b)=>a-b); }
function passes(combo){ const data=_currentData; if(!data) return true; const evens=count(combo,n=>n%2===0), odds=combo.length-evens, primes=count(combo,n=>PRIMES.has(n)), fibs=count(combo,n=>FIB.has(n)), mult3=count(combo,n=>n%3===0), sum=combo.reduce((a,b)=>a+b,0), repeat=combo.filter(n=>data.dezenas.includes(n)).length; const f=id=>document.getElementById(id)?.value??"any"; if(f("filterEven")!=="any"&&evens!==Number(f("filterEven"))) return false; if(f("filterOdd")!=="any"&&odds!==Number(f("filterOdd"))) return false; if(f("filterPrime")!=="any"&&primes!==Number(f("filterPrime"))) return false; if(f("filterFib")!=="any"&&fibs!==Number(f("filterFib"))) return false; if(f("filterMult3")!=="any"&&mult3!==Number(f("filterMult3"))) return false; if(f("filterRepeat")!=="any"&&repeat>Number(f("filterRepeat"))) return false; if(f("sumMin")&&sum<Number(f("sumMin"))) return false; if(f("sumMax")&&sum>Number(f("sumMax"))) return false; return true; }
function processCombinations(){ const slug=currentSlug(), c=cfg(slug); if(!c) return; const all=allNumbers(); const pool=all.filter(n=>!removed.has(n)&&!fixed.has(n)); const needed=c.pick-fixed.size; const qty=Math.min(Number(document.getElementById("qty")?.value)||8,30); const out=document.getElementById("comboResults"); if(needed<0){ out.textContent="Você fixou mais dezenas do que o jogo permite."; return; } if(pool.length<needed){ out.textContent="Não há dezenas disponíveis suficientes após remoções."; return; } const results=[]; let attempts=0; const maxAttempts=50000; while(results.length<qty&&attempts<maxAttempts){ attempts++; const combo=[...fixed,...randomCombo(pool,needed)].sort((a,b)=>a-b); const key=combo.join("-"); if(!results.some(r=>r.join("-")===key)&&passes(combo)) results.push(combo); } _lastGeneratedCombos=results; setText("attempts",`${results.length} encontradas • ${attempts.toLocaleString("pt-BR")} tentativas`); if(!results.length){ out.textContent="Nenhuma combinação encontrada. Afrouxe algum filtro e tente novamente."; return; } out.innerHTML=results.map((combo,i)=>`<div class="combo-row"><div><div class="balls">${combo.map(n=>`<span>${pad(n)}</span>`).join("")}</div><div class="hit-summary">${historyCheckText(combo)}</div></div><strong>#${i+1}</strong></div>`).join(""); if(!_historyData.length){ out.innerHTML += `<div class="history-hint">Para ver se o jogo já pontuou, carregue as estatísticas avançadas primeiro.</div>`; } showSuccessMessage('✅ Jogos gerados com sucesso!'); setTimeout(()=>{ out.scrollIntoView({behavior:'smooth', block:'start'}); },120); }
function historyCheckText(combo){ if(!_historyData.length) return ''; const counts={}; const mask=comboMask(combo); _historyData.forEach(d=>{ const hits=fastHits(mask,d._mask); counts[hits]=(counts[hits]||0)+1; }); const minPrize=cfg().pick>=15?11:Math.max(3,cfg().pick-2); const lines=Object.keys(counts).map(Number).filter(k=>k>=minPrize).sort((a,b)=>b-a); if(!lines.length) return 'Histórico: nunca pontuou nas faixas analisadas.'; return 'Histórico: '+lines.map(k=>`${k} acertos: ${counts[k]}x`).join(' • '); }


function smartExamples(){
  const map={
    "lotofacil":{evenMin:6,evenMax:9,sumMin:170,sumMax:220},
    "mega-sena":{evenMin:2,evenMax:4,sumMin:150,sumMax:210},
    "quina":{evenMin:2,evenMax:3,sumMin:160,sumMax:245},
    "lotomania":{evenMin:24,evenMax:26,sumMin:2300,sumMax:2700},
    "dupla-sena":{evenMin:2,evenMax:4,sumMin:120,sumMax:190},
    "dia-de-sorte":{evenMin:3,evenMax:4,sumMin:85,sumMax:140},
    "timemania":{evenMin:4,evenMax:6,sumMin:330,sumMax:480},
    "super-sete":{evenMin:3,evenMax:4,sumMin:22,sumMax:42},
    "mais-milionaria":{evenMin:2,evenMax:4,sumMin:120,sumMax:190}
  };
  return map[currentSlug()] || map["lotofacil"];
}
function smartPH(key){
  const ex=smartExamples();
  return ex && ex[key]!==undefined ? ` placeholder="Ex: ${ex[key]}"` : '';
}

function smartSupportsQuadrants(){
  return ['mega-sena','quina','lotomania','timemania'].includes(currentSlug());
}
function smartQuadrantFiltersHTML(){
  if(!smartSupportsQuadrants()) return '';
  return `
            <label>Quadrante 1 min.<input id="smartQuad1Min" type="number" min="0"></label>
            <label>Quadrante 1 máx.<input id="smartQuad1Max" type="number" min="0"></label>
            <label>Quadrante 2 min.<input id="smartQuad2Min" type="number" min="0"></label>
            <label>Quadrante 2 máx.<input id="smartQuad2Max" type="number" min="0"></label>
            <label>Quadrante 3 min.<input id="smartQuad3Min" type="number" min="0"></label>
            <label>Quadrante 3 máx.<input id="smartQuad3Max" type="number" min="0"></label>
            <label>Quadrante 4 min.<input id="smartQuad4Min" type="number" min="0"></label>
            <label>Quadrante 4 máx.<input id="smartQuad4Max" type="number" min="0"></label>`;
}
function smartLegacyGridFiltersHTML(){
  if(currentSlug()!=='lotofacil') return '';
  return `
            <label>Linhas vazias<input id="smartEmptyRows" type="number" min="0" placeholder="Ex: 0"></label>
            <label>Colunas vazias<input id="smartEmptyCols" type="number" min="0" placeholder="Ex: 0"></label>
            <label>Maior sequência min.<input id="smartSeqMin" type="number" min="1" placeholder="Ex: 3"></label>
            <label>Maior sequência máx.<input id="smartSeqMax" type="number" min="1" placeholder="Ex: 6"></label>
            <label>Maior intervalo min.<input id="smartGapMin" type="number" min="1" placeholder="Ex: 2"></label>
            <label>Maior intervalo máx.<input id="smartGapMax" type="number" min="1" placeholder="Ex: 4"></label>`;
}

function topScoreTargetsForCurrent(){
  const c=cfg(); if(!c) return [0,0];
  const map={
    'lotofacil':[15,14],
    'mega-sena':[6,5],
    'quina':[5,4],
    'lotomania':[20,19],
    'timemania':[7,6],
    'dupla-sena':[6,5],
    'dia-de-sorte':[7,6],
    'mais-milionaria':[6,5],
    'super-sete':[7,6]
  };
  return map[currentSlug()] || [c.pick, Math.max(1,c.pick-1)];
}
function topScoreButtonsHTML(){
  const [a,b]=topScoreTargetsForCurrent();
  return `
            <button type="button" onclick="findTopScoringGames(${a})">Mais pontuaram com ${a}</button>
            <button type="button" class="ghost" onclick="findTopScoringGames(${b})">Mais pontuaram com ${b}</button>`;
}
function topScoreInitialText(){
  const [a,b]=topScoreTargetsForCurrent();
  return `Escolha ${a} ou ${b} pontos para buscar.`;
}

function rewritePremiumBlock(){
  const sec=document.getElementById("premium");
  if(!sec) return;
  sec.className="tools-hub";
  sec.innerHTML=`
    <div class="tools-head">
      <div>
        <span class="tools-kicker">Área de ferramentas</span>
        <h2>Ferramentas de estudo lotérico</h2>
        <p>Monte, gere e analise jogos usando histórico completo e padrões estatísticos.</p>
      </div>
      <div class="tools-status">
        <span>⚡ Histórico completo automático</span>
        <span>🧠 Motor estatístico otimizado</span>
      </div>
    </div>

    <div class="tools-tabs">
      <button type="button" class="active" data-tool="manual" onclick="showToolTab('manual')"><span class="tab-title">🎯 Montar e testar</span><small>teste seu jogo</small></button>
      <button type="button" data-tool="simulator" onclick="showToolTab('simulator')"><span class="tab-title">🧪 Simulador</span><small>combinações por filtros</small></button>
      <button type="button" data-tool="prob" onclick="showToolTab('prob')"><span class="tab-title">📊 Probabilidades</span><small>chance matemática</small></button>
      <button type="button" class="is-featured" data-tool="smart" onclick="showToolTab('smart')"><span class="tab-title">✨ Gerador inteligente</span><small>mais usado</small></button>
      <button type="button" data-tool="quick" onclick="showToolTab('quick')"><span class="tab-title">⚡ Gerador rápido</span><small>jogos instantâneos</small></button>
      <button type="button" data-tool="topscore" onclick="showToolTab('topscore')"><span class="tab-title">🏆 Mais pontuaram</span><small>ranking histórico</small></button>
    </div>

    <div id="toolSimulator" class="tool-pane">
      <div class="tool-intro"><strong>Simulador</strong><span>Use filtros básicos para montar combinações e comparar padrões rapidamente.</span></div>
      <div id="simulatorToolMount" class="tool-card"></div>
    </div>

    <div id="toolManual" class="tool-pane active">
      <div class="tool-intro"><strong>Montar e testar</strong><span>Escolha suas dezenas e veja, no histórico completo, quando elas teriam pontuado.</span></div>
      <div class="tool-grid three">
        <div class="tool-card">
          <h3>Escolha suas dezenas</h3>
          <p class="muted small">Clique nas dezenas para montar o jogo. O sistema usa o modelo da loteria atual.</p>
          <div class="tool-period-box manual-period-box">
            <label class="period-quick">Período rápido<select id="manualRange"><option value="all" selected>Desde o primeiro</option><option value="100">Últimos 100</option><option value="50">Últimos 50</option><option value="20">Últimos 20</option></select></label>
            <div class="manual-custom-range">
              <label>Do concurso<input id="manualFrom" type="number" placeholder="Ex: 3000"></label>
              <label>Até<input id="manualTo" type="number" placeholder="Atual"></label>
            </div>
            <button type="button" class="ghost manual-load-btn" onclick="loadToolHistory('manual')">Carregar período</button>
            <span id="manualProgress" class="tool-progress"></span>
          </div>
          <div id="manualGameGrid" class="manual-game-grid"></div>
          <div id="manualGameStats" class="manual-game-stats">Selecione as dezenas.</div>
          <div class="tool-actions">
            <button type="button" onclick="testManualGame()">Testar no histórico</button>
            <button type="button" class="ghost" onclick="clearManualGame()">Limpar</button>
          </div>
        </div>
        <div class="tool-card wide-result">
          <h3>Resultados com pontuação</h3>
          <div id="manualResults" class="tool-results">Selecione as dezenas e clique em Testar no histórico. O histórico completo é preparado automaticamente.</div>
        </div>
        <div class="tool-card">
          <h3>Resumo</h3>
          <div id="manualSummary" class="score-summary">Aguardando jogo.</div>
        </div>
      </div>
    </div>

    <div id="toolProb" class="tool-pane">
      <div class="tool-intro"><strong>Probabilidades</strong><span>Calcule as chances matemáticas de acertar faixas específicas da loteria.</span></div>
      <div class="tool-grid two">
        <div class="tool-card">
          <h3>Calculadora de probabilidades</h3>
          <div class="calc-form">
            <label>Total de dezenas<input id="probTotal" type="number"></label>
            <label>Dezenas sorteadas<input id="probDraw" type="number"></label>
            <label>Dezenas apostadas<input id="probBet" type="number"></label>
            <label>Dezenas a acertar<input id="probHit" type="number"></label>
          </div>
          <button type="button" onclick="calculateProbability()">Calcular</button>
        </div>
        <div class="tool-card prob-output" id="probOutput">
          <h3>Resultado</h3>
          <p>Preencha os campos e clique em calcular.</p>
        </div>
      </div>
    </div>

    <div id="toolSmart" class="tool-pane">
      <div class="tool-intro featured"><strong>Gerador inteligente <em>Mais usado</em></strong><span>Gere jogos usando filtros avançados e padrões históricos reais da loteria.</span></div>
      <div class="tool-grid two">
        <div class="tool-card">
          <h3>Gerador inteligente <span class="feature-badge">Premium visual</span></h3>
          <p class="muted small">O sistema testa combinações até encontrar jogos que encaixem nos filtros escolhidos. A análise histórica usa o histórico completo preparado automaticamente.</p>
          <div class="smart-helper">${currentSlug()==="lotofacil" ? "Dica: deixe campos vazios para não limitar aquele padrão. Na Lotofácil, linhas/colunas vazias em <b>0</b> ajuda a seguir o comportamento mais comum do volante." : "Dica: deixe campos vazios para não limitar aquele padrão. Use os quadrantes para distribuir melhor as dezenas no volante."}</div>
          <div class="smart-form">
            <label class="full-line">Fixar dezenas<input id="smartFixedNums" type="text" inputmode="numeric" placeholder="Ex: 01, 07, 22"></label>
            <label class="full-line">Remover dezenas<input id="smartRemovedNums" type="text" inputmode="numeric" placeholder="Ex: 03, 14, 55"></label>
            <label>Pares min.<input id="smartEvenMin" type="number"${smartPH('evenMin')}></label>
            <label>Pares máx.<input id="smartEvenMax" type="number"${smartPH('evenMax')}></label>
            <label>Soma min.<input id="smartSumMin" type="number"${smartPH('sumMin')}></label>
            <label>Soma máx.<input id="smartSumMax" type="number"${smartPH('sumMax')}></label>
            <label>Múltiplos de 3 min.<input id="smartM3Min" type="number"></label>
            <label>Múltiplos de 3 máx.<input id="smartM3Max" type="number"></label>
            <label>Primos min.<input id="smartPrimeMin" type="number"></label>
            <label>Primos máx.<input id="smartPrimeMax" type="number"></label>
            <label>Fibonacci min.<input id="smartFibMin" type="number"></label>
            <label>Fibonacci máx.<input id="smartFibMax" type="number"></label>
            <label>Dezena inicial<select id="smartStart"><option value="any">Qualquer</option></select></label>
            <label>Dezena final<select id="smartEnd"><option value="any">Qualquer</option></select></label>
            <label>Moldura min.<input id="smartFrameMin" type="number"></label>
            <label>Moldura máx.<input id="smartFrameMax" type="number"></label>
            <label>Repetidas do último min.<input id="smartRepeatMin" type="number"></label>
            <label>Repetidas do último máx.<input id="smartRepeatMax" type="number"></label>
${smartLegacyGridFiltersHTML()}${smartQuadrantFiltersHTML()}
            <label>Qtd. jogos<input id="smartQty" type="number" value="5" min="1" max="30"></label>
            <label>Tentativas máx.<input id="smartAttempts" type="number" value="300000" min="1000"></label>
            <label class="full-line"><input id="smartNeverHigh" type="checkbox"> Evitar jogos que já fizeram pontuação alta no histórico</label>
          </div>
          <button type="button" onclick="generateSmartGames()">Gerar jogos inteligentes</button>
        </div>
        <div class="tool-card wide-result">
          <h3>Jogos encontrados</h3>
          <div id="smartResults" class="tool-results">Configure os filtros e gere.</div>
        </div>
      </div>
    </div>

    <div id="toolTopscore" class="tool-pane">
      <div class="tool-intro"><strong>Mais pontuaram</strong><span>Encontre jogos antigos que mais repetiram pontuações altas no período escolhido.</span></div>
      <div class="tool-grid two">
        <div class="tool-card">
          <h3>Jogos que mais pontuaram</h3>
          <p class="muted small">Busca no histórico e ranqueia os próprios resultados antigos que mais repetiram pontuação alta no período carregado.</p>
          <div class="smart-form">
            <label>Qtd. jogos<input id="topScoreQty" type="number" value="10" min="1" max="50"></label>
            <label>Período<select id="topscoreRange"><option value="all" selected>Desde o primeiro</option><option value="100">Últimos 100</option><option value="50">Últimos 50</option><option value="20">Últimos 20</option></select></label>
            <label>Do concurso<input id="topscoreFrom" type="number" placeholder="Ex: 3000"></label>
            <label>Até<input id="topscoreTo" type="number" placeholder="Atual"></label>
          </div>
          <div class="tool-actions">
${topScoreButtonsHTML()}
          </div>
          <span id="topscoreProgress" class="tool-progress"></span>
        </div>
        <div class="tool-card wide-result">
          <h3>Ranking encontrado</h3>
          <div id="topScoreResults" class="tool-results">${topScoreInitialText()}</div>
        </div>
      </div>
    </div>

    <div id="toolQuick" class="tool-pane">
      <div class="tool-intro"><strong>Gerador rápido</strong><span>Gere jogos rapidamente e veja um resumo histórico sem mexer em muitos filtros.</span></div>
      <div class="tool-grid two">
        <div class="tool-card">
          <h3>Gerador rápido</h3>
          <p class="muted small">Para dias de pressa: gere jogos rapidamente e veja o histórico resumido.</p>
          <div class="smart-form">
            <label>Qtd. jogos<input id="quickQty" type="number" value="5" min="1" max="30"></label>
            <label>Faixa mínima desejada<select id="quickPrize"><option value="0">Qualquer</option><option value="11">11+</option><option value="12">12+</option><option value="13">13+</option><option value="14">14+</option><option value="15">15</option></select></label>
            <label>Situação do atraso<select id="quickDelay"><option value="any">Qualquer</option><option value="normal">Normal</option><option value="warn">Acima da média</option><option value="danger">Acima do recorde</option></select></label>
            <label>Período<select id="quickRange"><option value="all" selected>Desde o primeiro</option><option value="100">Últimos 100</option><option value="50">Últimos 50</option><option value="20">Últimos 20</option></select></label>
          </div>
          <button type="button" onclick="generateQuickGames()">Gerar rápido</button>
        </div>
        <div class="tool-card wide-result">
          <h3>Jogos rápidos</h3>
          <div id="quickResults" class="tool-results">Clique em gerar rápido.</div>
        </div>
      </div>
    </div>`;
  initToolsHub();
}

let _manualSelected = new Set();

function initToolsHub(){
  moveSimulatorIntoTools();
  buildManualGameGrid();
  fillProbabilityDefaults();
  fillSmartSelects();
}

function moveSimulatorIntoTools(){
  const mount=document.getElementById('simulatorToolMount');
  const sim=document.getElementById('simulador');
  const results=document.querySelector('.combo-results');
  if(!mount||!sim||mount.contains(sim)) return;
  mount.innerHTML='';
  sim.classList.add('simulator-inside-tools');
  mount.appendChild(sim);
  if(results){ results.classList.add('simulator-results-inside-tools'); mount.appendChild(results); }
  arrangeSimulatorGrids();
}


function markPremiumPreparedAreas(){ /* removido no modo teste */ }

function fillSmartSelects(){
  const c=cfg(); if(!c) return;
  const start=document.getElementById('smartStart'), end=document.getElementById('smartEnd');
  [start,end].forEach(sel=>{
    if(!sel) return;
    while(sel.options.length>1) sel.remove(1);
    allNumbers().forEach(n=>{ const op=document.createElement('option'); op.value=n; op.textContent=pad(n); sel.appendChild(op); });
  });
}

async function fetchRangeFast(slug, from, to, onProgress){
  // v52: ferramentas históricas usam JSON pré-gerado em /historico.
  // Isso transforma milhares de chamadas individuais em 1 download por loteria.
  if(LotAPI.fetchHistoryRange){
    return LotAPI.fetchHistoryRange(slug, from, to, onProgress);
  }
  return LotAPI.fetchRange(slug, from, to, onProgress);
}

function historyIsLoaded(slug, from, to){
  return _historyData.length && _historySlug===slug && Number(_historyFrom)<=Number(from) && Number(_historyTo)>=Number(to);
}

async function ensureFullHistory(panel=null){
  const slug=currentSlug();
  if(!slug) return false;
  const latest=_latestData||_currentData||await LotAPI.fetchResult(slug);
  const last=Number(latest.concurso);
  if(historyIsLoaded(slug,1,last)) return true;
  if(_fullHistoryPromise) return _fullHistoryPromise;
  _fullHistoryPromise=(async()=>{
    try{
      if(panel) panel.innerHTML='<div class="history-hint">Carregando histórico completo pronto...</div>';
      const data=await fetchRangeFast(slug,1,last,(loaded,total,source)=>{
        if(panel) panel.innerHTML=source==='json' ? `<div class="history-hint">Histórico pronto: ${loaded} concursos carregados do JSON.</div>` : `<div class="history-hint">Preparando histórico completo: ${loaded}/${total} concursos...</div>`;
      });
      _historyData=data.filter(d=>d&&d.dezenas&&d.dezenas.length).sort((a,b)=>Number(a.concurso)-Number(b.concurso));
      _historySlug=slug; _historyFrom=1; _historyTo=last;
      prepareHistoryFast();
      return _historyData.length>0;
    }catch(e){
      console.warn('Falha ao preparar histórico completo', e);
      if(panel) panel.innerHTML='<div class="history-hint">Não consegui preparar o histórico completo agora. Tente novamente em alguns segundos.</div>';
      return false;
    }finally{
      _fullHistoryPromise=null;
    }
  })();
  return _fullHistoryPromise;
}

function preloadFullHistorySilent(){
  // Desativado na v47: o histórico completo só é carregado quando o usuário clica em uma ferramenta que precisa dele.
}

async function loadToolHistory(prefix='manual'){
  const slug=currentSlug(); if(!slug) return;
  const latest=_latestData||_currentData||await LotAPI.fetchResult(slug);
  const last=Number(latest.concurso);
  const range=document.getElementById(prefix+'Range')?.value || 'all';
  const customFrom=Number(document.getElementById(prefix+'From')?.value || 0);
  const customTo=Number(document.getElementById(prefix+'To')?.value || 0);
  let to=customTo || last;
  let from=customFrom || (range==='all'?1:Math.max(1,last-Number(range)+1));
  if(from>to){ const t=from; from=to; to=t; }
  const prog=document.getElementById(prefix+'Progress');
  if(prog) prog.textContent=`Carregando ${from} até ${to}...`;
  if(from===1 && to===last){
    const ok=await ensureFullHistory(null);
    if(prog) prog.textContent=ok?`${_historyData.length} concursos carregados`:'Falha ao carregar';
    if(ok) showSuccessMessage('✅ Histórico completo carregado com sucesso!');
    return;
  }
  _historyData=await fetchRangeFast(slug,from,to,(loaded,total)=>{ if(prog) prog.textContent=`${loaded}/${total}`; });
  _historyData=_historyData.filter(d=>d&&d.dezenas&&d.dezenas.length).sort((a,b)=>Number(a.concurso)-Number(b.concurso));
  _historySlug=slug; _historyFrom=from; _historyTo=to;
  prepareHistoryFast();
  if(prog) prog.textContent=`${_historyData.length} concursos carregados`;
  showSuccessMessage('✅ Período carregado com sucesso!');
}

function showToolTab(name){
  document.querySelectorAll('.tools-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tool===name));
  document.querySelectorAll('.tool-pane').forEach(p=>p.classList.remove('active'));
  const pane=document.getElementById('tool'+name.charAt(0).toUpperCase()+name.slice(1));
  if(pane) pane.classList.add('active');
}

function buildManualGameGrid(){
  const el=document.getElementById('manualGameGrid');
  const c=cfg();
  if(!el||!c) return;
  el.style.setProperty('--cols', Math.min(gridPerRow(), 10));
  el.innerHTML='';
  _manualSelected=new Set();
  allNumbers().forEach(n=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='manual-ball';
    btn.textContent=pad(n);
    btn.onclick=()=>{
      if(_manualSelected.has(n)) _manualSelected.delete(n);
      else _manualSelected.add(n);
      btn.classList.toggle('active', _manualSelected.has(n));
      updateManualGameStats();
    };
    el.appendChild(btn);
  });
  updateManualGameStats();
}

function updateManualGameStats(){
  const el=document.getElementById('manualGameStats');
  if(!el) return;
  const nums=[..._manualSelected].sort((a,b)=>a-b);
  const ev=count(nums,n=>n%2===0), odd=nums.length-ev, sum=nums.reduce((a,b)=>a+b,0);
  el.innerHTML=`<span>Dezenas: <b>${nums.length}</b></span><span>Pares: <b>${ev}</b></span><span>Ímpares: <b>${odd}</b></span><span>Soma: <b>${sum}</b></span>`;
}

function clearManualGame(){
  _manualSelected.clear();
  document.querySelectorAll('.manual-ball').forEach(b=>b.classList.remove('active'));
  updateManualGameStats();
  const r=document.getElementById('manualResults'); if(r) r.textContent='Jogo limpo. Selecione novas dezenas.';
  const s=document.getElementById('manualSummary'); if(s) s.textContent='Aguardando jogo.';
}

function prizeMinForCurrent(){
  const c=cfg();
  if(!c) return 0;
  if(c.pick>=15) return 11;
  if(c.pick===10) return 7;
  if(c.pick===7) return 4;
  if(c.pick===6) return 4;
  if(c.pick===5) return 2;
  return Math.max(1,c.pick-2);
}

async function testManualGame(){
  const resultsEl=document.getElementById('manualResults'), summaryEl=document.getElementById('manualSummary');
  const combo=[..._manualSelected].sort((a,b)=>a-b);
  if(!combo.length){ resultsEl.textContent='Selecione algumas dezenas primeiro.'; return; }
  const ok=await ensureFullHistory(resultsEl);
  if(!ok) return;
  const minPrize=prizeMinForCurrent();
  const rows=[]; const counts={}; let lastHit=null;
  const mask=comboMask(combo);
  _historyData.forEach(d=>{
    const hits=fastHits(mask,d._mask);
    counts[hits]=(counts[hits]||0)+1;
    if(hits>=minPrize){ rows.push({contest:d.concurso,date:d.data,hits}); lastHit=d.concurso; }
  });
  rows.sort((a,b)=>Number(b.contest)-Number(a.contest));
  resultsEl.innerHTML = rows.length ? `<div class="tool-scroll"><table class="pro-table"><thead><tr><th>Concurso</th><th>Data</th><th>Total acertos</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.hits>=minPrize?'tool-prized':''}"><td>${r.contest}</td><td>${LotAPI.formatDate(r.date)}</td><td><b>${r.hits}</b></td></tr>`).join('')}</tbody></table></div>` : 'Esse jogo não pontuou nas faixas analisadas.';
  const maxHits=Math.max(...Object.keys(counts).map(Number));
  const lines=[]; for(let i=cfg().pick;i>=0;i--){ if(counts[i]) lines.push(`<div><span>${i} acertos</span><b>${counts[i]}</b></div>`); }
  const ago=lastHit && _latestData ? Number(_latestData.concurso)-Number(lastHit) : null;
  summaryEl.innerHTML=`<div class="summary-total"><b>${rows.length}</b><span>concursos premiados</span></div><div class="summary-total"><b>${maxHits}</b><span>maior acerto</span></div>${ago!==null?`<p>Última premiação há <b>${ago}</b> concursos.</p>`:''}<div class="score-lines">${lines.join('')}</div>`;
}

function fillProbabilityDefaults(){
  const c=cfg(); if(!c) return;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  set('probTotal', c.max);
  set('probDraw', c.pick);
  set('probBet', c.pick);
  set('probHit', c.pick);
}

function comb(n,k){
  n=Number(n); k=Number(k);
  if(k<0||k>n) return 0;
  k=Math.min(k,n-k);
  let r=1;
  for(let i=1;i<=k;i++) r=r*(n-k+i)/i;
  return r;
}
function formatBig(n){ return Math.round(n).toLocaleString('pt-BR'); }
function calculateProbability(){
  const N=Number(document.getElementById('probTotal')?.value), D=Number(document.getElementById('probDraw')?.value), B=Number(document.getElementById('probBet')?.value), H=Number(document.getElementById('probHit')?.value);
  const out=document.getElementById('probOutput');
  if(!N||!D||!B||!H||H>D||H>B){ out.innerHTML='<h3>Resultado</h3><p>Confira os valores informados.</p>'; return; }
  const favorable=comb(D,H)*comb(N-D,B-H);
  const total=comb(N,B);
  const chance=favorable/total;
  const oneIn=chance?1/chance:0;
  out.innerHTML=`<h3>Resultado</h3><div class="prob-big">1 em ${formatBig(oneIn)}</div><div class="prob-percent">${(chance*100).toFixed(10).replace('.',',')}%</div><p class="muted small">Cálculo combinatório para acertar exatamente ${H} dezena(s).</p>`;
}

function readMinMax(prefix){
  const val=id=>document.getElementById(prefix+id)?.value;
  const num=id=>val(id)===''||val(id)==null?null:Number(val(id));
  return {
    evenMin:num('EvenMin'), evenMax:num('EvenMax'),
    sumMin:num('SumMin'), sumMax:num('SumMax'),
    m3Min:num('M3Min'), m3Max:num('M3Max'),
    primeMin:num('PrimeMin'), primeMax:num('PrimeMax'),
    fibMin:num('FibMin'), fibMax:num('FibMax'),
    frameMin:num('FrameMin'), frameMax:num('FrameMax'),
    repeatMin:num('RepeatMin'), repeatMax:num('RepeatMax'),
    emptyRows:num('EmptyRows'),
    emptyCols:num('EmptyCols'),
    seqMin:num('SeqMin'), seqMax:num('SeqMax'),
    gapMin:num('GapMin'), gapMax:num('GapMax'),
    quad1Min:num('Quad1Min'), quad1Max:num('Quad1Max'),
    quad2Min:num('Quad2Min'), quad2Max:num('Quad2Max'),
    quad3Min:num('Quad3Min'), quad3Max:num('Quad3Max'),
    quad4Min:num('Quad4Min'), quad4Max:num('Quad4Max'),
    start: document.getElementById(prefix+'Start')?.value || 'any',
    end: document.getElementById(prefix+'End')?.value || 'any',
    fixedNums: parseSmartNumberList(prefix+'FixedNums'),
    removedNums: parseSmartNumberList(prefix+'RemovedNums')
  };
}
function parseSmartNumberList(id){
  const raw=(document.getElementById(id)?.value || '').trim();
  if(!raw) return [];
  const allowed=new Set(allNumbers());
  const nums=raw.split(/[ ,;|]+/).map(v=>Number(String(v).replace(/\D/g,''))).filter(n=>Number.isFinite(n));
  return [...new Set(nums)].filter(n=>allowed.has(n)).sort((a,b)=>a-b);
}

function applySmartDefaults(){
  // Na Lotofácil, é muito raro sair uma linha ou coluna totalmente vazia.
  // Por isso deixamos o Gerador Inteligente já configurado para evitar linhas/colunas vazias nela.
  if(currentSlug()!=='lotofacil') return;
  const setDefault=(id,value)=>{ const el=document.getElementById(id); if(el && el.value==='') el.value=String(value); };
  setDefault('smartEmptyRows',0);
  setDefault('smartEmptyCols',0);
}
function comboGridDistribution(combo){
  const nums=allNumbers(), per=gridPerRow(), rows=Math.ceil(nums.length/per);
  const rowHits=Array(rows).fill(0), colHits=Array(per).fill(0);
  combo.forEach(n=>{
    const pos=nums.indexOf(n);
    if(pos<0) return;
    const r=Math.floor(pos/per), col=pos%per;
    if(rowHits[r]!==undefined) rowHits[r]++;
    if(colHits[col]!==undefined) colHits[col]++;
  });
  return {emptyRows:rowHits.filter(v=>v===0).length, emptyCols:colHits.filter(v=>v===0).length};
}
function longestConsecutiveRun(combo){
  const arr=[...combo].sort((a,b)=>a-b);
  let best=arr.length?1:0, cur=best;
  for(let i=1;i<arr.length;i++){
    if(arr[i]===arr[i-1]+1){ cur++; best=Math.max(best,cur); }
    else cur=1;
  }
  return best;
}
function comboGapStats(combo){
  const arr=[...combo].sort((a,b)=>a-b), gaps=[];
  for(let i=1;i<arr.length;i++) gaps.push(arr[i]-arr[i-1]);
  return {minGap:gaps.length?Math.min(...gaps):0, maxGap:gaps.length?Math.max(...gaps):0, gaps};
}

function comboQuadrantDistribution(combo){
  if(!smartSupportsQuadrants()) return {q1:0,q2:0,q3:0,q4:0};
  const nums=allNumbers(), per=gridPerRow();
  const rows=Math.ceil(nums.length/per);
  const midRow=Math.ceil(rows/2);
  const midCol=Math.ceil(per/2);
  const q={q1:0,q2:0,q3:0,q4:0};
  combo.forEach(n=>{
    const pos=nums.indexOf(n);
    if(pos<0) return;
    const r=Math.floor(pos/per)+1, col=(pos%per)+1;
    if(r<=midRow && col<=midCol) q.q1++;
    else if(r<=midRow && col>midCol) q.q2++;
    else if(r>midRow && col<=midCol) q.q3++;
    else q.q4++;
  });
  return q;
}
function quadrantMetaHTML(s){
  if(!smartSupportsQuadrants()) return '';
  return `<span title="Dezenas no quadrante 1">Q1 ${s.q1}</span><span title="Dezenas no quadrante 2">Q2 ${s.q2}</span><span title="Dezenas no quadrante 3">Q3 ${s.q3}</span><span title="Dezenas no quadrante 4">Q4 ${s.q4}</span>`;
}

function comboStats(combo){
  const frame=frameSet();
  const ev=count(combo,n=>n%2===0), odd=combo.length-ev, sum=combo.reduce((a,b)=>a+b,0), m3=count(combo,n=>n%3===0);
  const prime=count(combo,n=>PRIMES.has(n)), fib=count(combo,n=>FIB.has(n)), mold=count(combo,n=>frame.has(n));
  const repeat=_currentData?combo.filter(n=>_currentData.dezenas.includes(n)).length:0;
  const grid=comboGridDistribution(combo), seq=longestConsecutiveRun(combo), gaps=comboGapStats(combo), quad=comboQuadrantDistribution(combo);
  return {ev, odd, sum, m3, prime, fib, mold, repeat, emptyRows:grid.emptyRows, emptyCols:grid.emptyCols, seq, minGap:gaps.minGap, maxGap:gaps.maxGap, q1:quad.q1, q2:quad.q2, q3:quad.q3, q4:quad.q4, start:Math.min(...combo), end:Math.max(...combo)};
}
function comboPassesSmart(combo,rules){
  const s=comboStats(combo);
  if(rules.evenMin!==null && s.ev<rules.evenMin) return false;
  if(rules.evenMax!==null && s.ev>rules.evenMax) return false;
  if(rules.sumMin!==null && s.sum<rules.sumMin) return false;
  if(rules.sumMax!==null && s.sum>rules.sumMax) return false;
  if(rules.m3Min!==null && s.m3<rules.m3Min) return false;
  if(rules.m3Max!==null && s.m3>rules.m3Max) return false;
  if(rules.primeMin!==null && s.prime<rules.primeMin) return false;
  if(rules.primeMax!==null && s.prime>rules.primeMax) return false;
  if(rules.fibMin!==null && s.fib<rules.fibMin) return false;
  if(rules.fibMax!==null && s.fib>rules.fibMax) return false;
  if(rules.frameMin!==null && s.mold<rules.frameMin) return false;
  if(rules.frameMax!==null && s.mold>rules.frameMax) return false;
  if(rules.repeatMin!==null && s.repeat<rules.repeatMin) return false;
  if(rules.repeatMax!==null && s.repeat>rules.repeatMax) return false;
  if(rules.emptyRows!==null && s.emptyRows!==rules.emptyRows) return false;
  if(rules.emptyCols!==null && s.emptyCols!==rules.emptyCols) return false;
  if(rules.seqMin!==null && s.seq<rules.seqMin) return false;
  if(rules.seqMax!==null && s.seq>rules.seqMax) return false;
  // Intervalo: usa o MAIOR intervalo entre dezenas do jogo.
  // Ex.: na Lotofácil, filtros 2 a 4 aceitam jogos cujo maior salto entre dezenas é de 2, 3 ou 4.
  // Antes isso comparava o menor intervalo e bloqueava jogos com sequências.
  if(rules.gapMin!==null && s.maxGap<rules.gapMin) return false;
  if(rules.gapMax!==null && s.maxGap>rules.gapMax) return false;
  if(rules.quad1Min!==null && s.q1<rules.quad1Min) return false;
  if(rules.quad1Max!==null && s.q1>rules.quad1Max) return false;
  if(rules.quad2Min!==null && s.q2<rules.quad2Min) return false;
  if(rules.quad2Max!==null && s.q2>rules.quad2Max) return false;
  if(rules.quad3Min!==null && s.q3<rules.quad3Min) return false;
  if(rules.quad3Max!==null && s.q3>rules.quad3Max) return false;
  if(rules.quad4Min!==null && s.q4<rules.quad4Min) return false;
  if(rules.quad4Max!==null && s.q4>rules.quad4Max) return false;
  if(rules.start!=='any' && s.start!==Number(rules.start)) return false;
  if(rules.end!=='any' && s.end!==Number(rules.end)) return false;
  return true;
}
function comboHasHighHistoricalPrize(combo){
  if(!_historyData.length) return false;
  const high=cfg().pick>=15?13:Math.max(prizeMinForCurrent()+1, cfg().pick-1);
  const mask=comboMask(combo);
  return _historyData.some(d=>fastHits(mask,d._mask)>=high);
}
function renderGeneratedToolGames(id,games,attempts){
  const out=document.getElementById(id);
  if(!out) return;
  if(!games.length){ out.innerHTML='<div class="history-hint">Nenhum jogo encontrado com os filtros selecionados.</div>'; return; }
  _lastGeneratedCombos=games.map(g=>[...g]);
  out.innerHTML=`<p class="muted small">${games.length} jogo(s) encontrados em ${attempts.toLocaleString('pt-BR')} tentativas.</p>`+games.map((combo,i)=>{
    const s=comboStats(combo);
    return `<div class="generated-game" id="generatedGame${i}">
      <div class="generated-game-top">
        <div class="balls">${combo.map(n=>`<span>${pad(n)}</span>`).join('')}</div>
        <button type="button" class="generated-analyze-btn" onclick="analyzeGeneratedGame(${i})">Analisar histórico</button>
      </div>
      <div class="generated-meta"><b>#${i+1}</b><span title="Soma total das dezenas do jogo">Soma ${s.sum}</span><span title="Quantidade de dezenas pares">${s.ev} pares</span><span title="Quantidade de dezenas ímpares">${s.odd} ímpares</span><span title="Múltiplos de 3 presentes no jogo">${s.m3} M3</span><span title="Dezenas primas presentes no jogo">${s.prime} primos</span><span title="Dezenas que pertencem à sequência de Fibonacci">${s.fib} fibo</span><span title="Dezenas localizadas na borda do volante">${s.mold} moldura</span><span title="Dezenas repetidas do último concurso">${s.repeat} repet.</span><span title="Linhas do volante sem nenhuma dezena marcada">${s.emptyRows} linhas vazias</span><span title="Colunas do volante sem nenhuma dezena marcada">${s.emptyCols} col. vazias</span><span title="Maior bloco de dezenas consecutivas no jogo">seq. ${s.seq}</span><span title="Maior distância entre duas dezenas consecutivas do jogo">maior int. ${s.maxGap}</span>${quadrantMetaHTML(s)}</div>
      <div class="hit-summary">${historyCheckText(combo) || 'Clique em Testar histórico para ver concursos, faixas e últimas pontuações.'}</div>
      <div id="generatedAnalysis${i}" class="generated-analysis" hidden></div>
    </div>`;
  }).join('');
}

async function ensureGeneratedHistory(panel){
  // v40: o Gerador Inteligente sempre usa o histórico completo desde o 1º concurso.
  // Não depende mais do período manual e não limita aos últimos 100.
  return ensureFullHistory(panel);
}

function buildGeneratedAnalysisHTML(combo){
  const minPrize=prizeMinForCurrent();
  const counts={};
  const rows=[];
  let best=0, lastPrize=null;
  const mask=comboMask(combo);
  _historyData.forEach(d=>{
    const hits=fastHits(mask,d._mask);
    counts[hits]=(counts[hits]||0)+1;
    if(hits>best) best=hits;
    if(hits>=minPrize){ rows.push({contest:d.concurso,date:d.data,hits,draw:d.dezenas}); lastPrize=d; }
  });
  rows.sort((a,b)=>Number(b.contest)-Number(a.contest));
  const totalPrized=rows.length;
  const lastContest=lastPrize?Number(lastPrize.concurso):null;
  const latestContest=Number((_latestData||_historyData.at(-1)||{}).concurso || _historyData.at(-1)?.concurso || 0);
  const ago=lastContest&&latestContest ? latestContest-lastContest : null;
  const faixas=[];
  for(let h=cfg().pick; h>=minPrize; h--){ faixas.push(`<span>${h} acertos <b>${counts[h]||0}x</b></span>`); }
  const recentRows=rows.slice(0,15);
  const period=`${_historyData[0]?.concurso || '—'} até ${_historyData.at(-1)?.concurso || '—'}`;
  return `<div class="generated-analysis-inner">
    <div class="generated-analysis-head">
      <strong>Análise do histórico</strong>
      <button type="button" onclick="this.closest('.generated-analysis').hidden=true">Fechar</button>
    </div>
    <div class="analysis-summary">
      <div><b>${totalPrized}</b><span>pontuações no período</span></div>
      <div><b>${best}</b><span>maior acerto</span></div>
      <div><b>${ago===null?'—':ago}</b><span>concursos desde a última</span></div>
      <div><b>${period}</b><span>período analisado</span></div>
    </div>
    <div class="score-lines generated-score-lines">${faixas.join('')}</div>
    ${recentRows.length ? `<div class="tool-scroll generated-table"><table class="pro-table"><thead><tr><th>Concurso</th><th>Data</th><th>Acertos</th><th>Dezenas sorteadas</th></tr></thead><tbody>${recentRows.map(r=>`<tr class="tool-prized"><td>${r.contest}</td><td>${LotAPI.formatDate(r.date)}</td><td><b>${r.hits}</b></td><td>${r.draw.map(n=>pad(n)).join(' ')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="history-hint">Esse jogo nunca pontuou nas faixas analisadas.</div>'}
  </div>`;
}

async function analyzeGeneratedGame(index){
  const combo=_lastGeneratedCombos[index];
  const panel=document.getElementById(`generatedAnalysis${index}`);
  if(!combo||!panel) return;
  panel.hidden=false;
  panel.innerHTML='<div class="history-hint">Analisando jogo no histórico...</div>';
  const ok=await ensureGeneratedHistory(panel);
  if(!ok) return;
  panel.innerHTML=buildGeneratedAnalysisHTML(combo);
}
async function generateSmartGames(){
  const c=cfg(); if(!c) return;
  const rules=readMinMax('smart');
  const qty=Math.min(Number(document.getElementById('smartQty')?.value)||5,30);
  const maxAttempts=Math.min(Number(document.getElementById('smartAttempts')?.value)||300000,1000000);
  const avoidHigh=document.getElementById('smartNeverHigh')?.checked;
  if(avoidHigh && !_historyData.length){ await ensureFullHistory(document.getElementById('smartResults')); }
  const fixedSmart=[...new Set(rules.fixedNums || [])];
  const removedSmart=[...new Set(rules.removedNums || [])].filter(n=>!fixedSmart.includes(n));
  const nums=allNumbers().filter(n=>!removedSmart.includes(n) && !fixedSmart.includes(n));
  const needed=c.pick-fixedSmart.length;
  const out=document.getElementById('smartResults');
  if(needed<0){ out.innerHTML='<div class="history-hint">Você fixou mais dezenas do que essa loteria permite.</div>'; return; }
  if(nums.length<needed){ out.innerHTML='<div class="history-hint">Não há dezenas disponíveis suficientes depois das dezenas removidas.</div>'; return; }
  const games=[]; let attempts=0;
  while(games.length<qty && attempts<maxAttempts){
    attempts++;
    const combo=[...fixedSmart, ...randomCombo(nums,needed)].sort((a,b)=>a-b);
    const key=combo.join('-');
    if(games.some(g=>g.join('-')===key)) continue;
    if(!comboPassesSmart(combo,rules)) continue;
    if(avoidHigh && comboHasHighHistoricalPrize(combo)) continue;
    games.push(combo);
  }
  renderGeneratedToolGames('smartResults',games,attempts);
  if(games.length) showSuccessMessage('✅ Jogos inteligentes gerados com sucesso!');
}

function quickPrizeSummary(combo, minHit){
  if(!_historyData.length || !minHit) return '';
  let last=null, total=0, best=0;
  const mask=comboMask(combo);
  _historyData.forEach(d=>{
    const hits=fastHits(mask,d._mask);
    if(hits>=minHit){ total++; best=Math.max(best,hits); last=d; }
  });
  if(!last) return `Nunca pontuou com ${minHit}+ no período analisado.`;
  const ago=(_latestData?Number(_latestData.concurso):Number(_historyData.at(-1).concurso))-Number(last.concurso);
  return `Última vez com ${minHit}+: concurso ${last.concurso} (${ago} concursos atrás) • melhor acerto: ${best} • total: ${total}`;
}

function generatedDelayClass(combo){
  if(!_historyData.length) return 'normal';
  const minPrize=prizeMinForCurrent();
  const mask=comboMask(combo);
  let delay=0, delays=[];
  for(let i=_historyData.length-1;i>=0;i--){
    const hits=fastHits(mask, _historyData[i]._mask);
    if(hits>=minPrize){ delays.push(delay); delay=0; } else delay++;
  }
  const avg=delays.length?delays.reduce((a,b)=>a+b,0)/delays.length:999;
  const max=delays.length?Math.max(...delays):999;
  if(delay>max) return 'danger';
  if(delay>avg) return 'warn';
  return 'normal';
}

function renderQuickToolGames(games,attempts,prize){
  const out=document.getElementById('quickResults'); if(!out) return;
  if(!games.length){ out.innerHTML='<div class="history-hint">Nenhum jogo encontrado com os filtros selecionados.</div>'; return; }
  out.innerHTML=`<p class="muted small">${games.length} jogo(s) encontrados em ${attempts.toLocaleString('pt-BR')} tentativas.</p>`+games.map((combo,i)=>{ const s=comboStats(combo); return `<div class="generated-game"><div class="balls">${combo.map(n=>`<span>${pad(n)}</span>`).join('')}</div><div class="generated-meta"><b>#${i+1}</b><span>Soma ${s.sum}</span><span>${s.ev} pares</span><span>${s.odd} ímpares</span></div><div class="hit-summary">${quickPrizeSummary(combo,prize) || historyCheckText(combo)}</div></div>`; }).join('');
}

async function generateQuickGames(){
  const c=cfg(); if(!c) return;
  if(!_historyData.length){ await ensureFullHistory(document.getElementById('quickResults')); }
  const qty=Math.min(Number(document.getElementById('quickQty')?.value)||5,30);
  const prize=Number(document.getElementById('quickPrize')?.value)||0;
  const delayWanted=document.getElementById('quickDelay')?.value||'any';
  const nums=allNumbers(), games=[]; let attempts=0, maxAttempts=80000;
  while(games.length<qty && attempts<maxAttempts){
    attempts++;
    const combo=randomCombo(nums,c.pick), key=combo.join('-');
    if(games.some(g=>g.join('-')===key)) continue;
    if(prize && _historyData.length && !_historyData.some(d=>combo.filter(n=>d.dezenas.includes(n)).length>=prize)) continue;
    if(delayWanted!=='any' && generatedDelayClass(combo)!==delayWanted) continue;
    games.push(combo);
  }
  renderQuickToolGames(games,attempts,prize);
  if(games.length) showSuccessMessage('✅ Jogos rápidos gerados com sucesso!');
}

async function findTopScoringGames(hitTarget){
  const c=cfg(); if(!c) return;
  await ensureFullHistory(document.getElementById('topScoreResults'));
  const out=document.getElementById('topScoreResults');
  const qty=Math.min(Number(document.getElementById('topScoreQty')?.value)||10,50);
  if(!_historyData.length){ out.innerHTML='<div class="history-hint">Não foi possível carregar o histórico.</div>'; return; }
  const target=Math.min(hitTarget,c.pick);
  const ranking=_historyData.map(candidate=>{
    let total=0,best=0,last=null;
    _historyData.forEach(d=>{
      const hits=candidate.dezenas.filter(n=>d.dezenas.includes(n)).length;
      if(hits>=target){ total++; best=Math.max(best,hits); last=d.concurso; }
    });
    return {contest:candidate.concurso,date:candidate.data,combo:candidate.dezenas,total,best,last};
  }).sort((a,b)=>b.total-a.total || b.best-a.best || Number(b.contest)-Number(a.contest)).slice(0,qty);
  out.innerHTML=`<p class="muted small">Top ${ranking.length} jogos históricos por ocorrências com ${target}+ acertos no período analisado.</p>`+ranking.map((r,i)=>`<div class="generated-game"><div class="balls">${r.combo.map(n=>`<span>${pad(n)}</span>`).join('')}</div><div class="generated-meta"><b>#${i+1} • Concurso ${r.contest}</b><span>${LotAPI.formatDate(r.date)}</span><span>${r.total} vez(es) com ${target}+</span><span>Melhor: ${r.best}</span><span>Últ.: ${r.last||'—'}</span></div></div>`).join('');
  showSuccessMessage('✅ Ranking calculado com sucesso!');
}

function showLoading(show){ let el=document.getElementById("lp-loading"); if(!el&&show){ el=document.createElement("div"); el.id="lp-loading"; el.innerHTML=`<div class="lp-spinner"></div><p>Buscando dados…</p>`; el.style.cssText="position:fixed;inset:0;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;font-weight:800;color:#475569;gap:16px"; document.body.appendChild(el); } if(el) el.style.display=show?"flex":"none"; }
document.addEventListener("DOMContentLoaded", init);
