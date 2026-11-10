/* Revisar curadoria — PWA vanilla. Rotas: #/ (pendentes), #/arquivo, #/salvos e #/e/<ED>. */
(function(){
'use strict';
var CK='curadoria:copied', H72=72*3600e3;
var ID=/^(\d{4})-(\d{2})-(\d{2})-(06|16)h$/;
var $=function(s){return document.querySelector(s)};
var view=$('#view'), bar=$('#bar');
var cache={};          // ED -> itens parseados
var editions=null;     // [{id, href, publishedAt, items}]
var rvMap=null;        // fonte da verdade: reviewed.json do servidor
var salvos=null;       // {items:[...]} de salvos.json
var cur=null;          // estado da revisão aberta
var listTab='pendentes';
var sv={q:'',tema:'',idioma:'',origem:'',periodo:'',grupo:'data',fonte:''};

/* ---------- armazenamento ---------- */
function load(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function selOf(ed){return load('curadoria:sel:'+ed,{})||{}}
function copied(){var r=load(CK,{});return r&&typeof r=='object'?r:{}}
function markCopied(ed){var r=copied();r[ed]=new Date().toISOString();store(CK,r)}
function isReviewed(ed){return !!(rvMap&&rvMap[ed])}

/* ---------- regra de exposição ---------- */
function pubTime(ed){var m=ID.exec(ed);return m?Date.UTC(+m[1],m[2]-1,+m[3],+m[4]+3):NaN} // America/Sao_Paulo = UTC-3
function age(ed,now){return (now||Date.now())-pubTime(ed)}
function isRecent(ed,now){return age(ed,now)<H72}
window.__revisar={pubTime:pubTime,isReviewed:isReviewed,isRecent:isRecent};

/* ---------- formatação ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var DF=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'numeric',month:'short',timeZone:'America/Sao_Paulo'});
function label(ed){var m=ID.exec(ed);return m?DF.format(new Date(pubTime(ed))).replace(/\./g,'')+' · '+m[4]+'h':ed}
function dur(ms){var h=Math.max(0,Math.floor(ms/3600e3));return h<1?'menos de 1 h':h<48?h+' h':Math.floor(h/24)+' d'}
function plural(n,a,b){return n+' '+(n==1?a:b)}
function slug(t){return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function reviewedWhen(v){
  if(v==null||v==='')return '';
  var s=String(v);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    var p=s.split('-');
    return ' em '+new Date(Date.UTC(+p[0],+p[1]-1,+p[2],15)).toLocaleDateString('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'});
  }
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){
    var d=new Date(s);if(!isNaN(d.getTime()))return ' em '+d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  }
  return '';
}

/* ---------- tema claro/escuro (mesma chave das páginas) ---------- */
function setTh(t){document.documentElement.dataset.theme=t;store('curadoria:theme',t);var b=$('#thm');b.textContent=t=='dark'?'☀':'☾';b.setAttribute('aria-label',t=='dark'?'Mudar para modo claro':'Mudar para modo escuro');
 var c=t=='dark'?'#121214':'#fbfaf7';document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.content=c})}
setTh(document.documentElement.dataset.theme||'light');
$('#thm').onclick=function(){setTh(document.documentElement.dataset.theme=='dark'?'light':'dark')};

/* ---------- toast ---------- */
var tt;function toast(s){var t=$('#toast');t.textContent=s;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2800)}

/* ---------- dados ---------- */
function getJSON(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})}
function loadReviewed(force){
  if(rvMap&&!force)return Promise.resolve(rvMap);
  return getJSON('reviewed.json').then(function(map){
    rvMap=(map&&typeof map=='object'&&!Array.isArray(map))?map:{};
    return rvMap;
  }).catch(function(){if(!rvMap)rvMap={};return rvMap});
}
function loadSalvos(force){
  if(salvos&&!force)return Promise.resolve(salvos);
  return getJSON('salvos.json').then(function(d){
    salvos=(d&&Array.isArray(d.items))?d:{items:[]};
    return salvos;
  }).catch(function(){if(!salvos)salvos={items:[]};return salvos});
}
function getEditions(force){
  if(editions&&!force)return Promise.resolve(editions);
  return getJSON('editions.json').catch(function(){return getJSON('../editions.json')}).then(function(d){
    editions=(d.editions||[]).filter(function(e){return ID.test(e.id)}).sort(function(a,b){return a.id<b.id?1:-1});return editions});
}
function edHref(ed){var e=(editions||[]).filter(function(x){return x.id==ed})[0];return new URL('../'+(e?e.href:'e/'+ed+'.html'),location.href).href}
function parse(html){
  var doc=new DOMParser().parseFromString(html,'text/html');
  return [].map.call(doc.querySelectorAll('article[data-id]'),function(a){
    var L=[];try{L=JSON.parse(a.dataset.links||'[]')}catch(e){}
    var org=a.querySelector('.org'),meta=a.querySelector('.meta'),r=a.querySelector('p.r');
    return {id:a.dataset.id,title:a.dataset.title,url:a.dataset.url,links:L,tema:a.dataset.tema||'Outros',org:(a.dataset.org||'').split(/\s+/).filter(Boolean),
     orgLabel:org?org.textContent.trim():'',orgCls:org&&org.classList.contains('nl')?'nl':'bu',meta:meta?meta.textContent.trim():'',resumo:r?r.textContent.trim():''};
  });
}
function getEdition(ed){
  if(cache[ed])return Promise.resolve(cache[ed]);
  return getEditions().catch(function(){}).then(function(){return fetch(edHref(ed),{cache:'no-cache'})})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(h){return cache[ed]=parse(h)});
}

/* ---------- texto copiado (mesmo formato das páginas de edição) ---------- */
function lines(it){var L=it.links&&it.links.length?it.links:[{t:it.title,u:it.url}];return L.map(function(l){return it.id+' | '+l.t+' | '+l.u})}
function text(ed,items,sel){return 'Curadoria '+ed+' — selecionados:\n'+items.filter(function(i){return sel[i.id]}).map(function(i){return lines(i).join('\n')}).join('\n')}

/* ---------- lista ---------- */
function edCard(e,now,mode){
  var a=age(e.id,now),s=selOf(e.id),n=Object.keys(s).length,r=isReviewed(e.id),c=copied()[e.id];
  var tags='';
  if(r)tags+='<span class="tag done">✓ Revisada'+esc(reviewedWhen(rvMap[e.id]))+'</span>';
  else if(c)tags+='<span class="tag wait">Copiada, aguardando registro</span>';
  else if(mode==='pendentes')tags+='<span class="tag new">Pendente</span>';
  if(n)tags+='<span class="tag">'+plural(n,'guardado','guardados')+'</span>';
  return '<li><a class="ed'+(r?' rv':'')+'" href="#/e/'+esc(e.id)+'" data-ed="'+esc(e.id)+'"><h2>'+esc(label(e.id))+'</h2><p class="m">'+esc(e.id)+(e.items?' · '+e.items+' textos':'')+' · há '+dur(a)+'</p><div class="tags">'+tags+'</div></a></li>';
}
function tabsHtml(pend,arch,salv){
  return '<nav class="tabs" role="tablist" aria-label="Listas de edições e biblioteca">'+
    '<a class="tab" role="tab" id="tab-p" href="#/" aria-selected="'+(listTab==='pendentes')+'">Pendentes<span>'+pend+'</span></a>'+
    '<a class="tab" role="tab" id="tab-a" href="#/arquivo" aria-selected="'+(listTab==='arquivo')+'">Arquivo<span>'+arch+'</span></a>'+
    '<a class="tab" role="tab" id="tab-s" href="#/salvos" aria-selected="'+(listTab==='salvos')+'">Salvos<span>'+(salv||0)+'</span></a>'+
    '</nav>';
}
function renderList(){
  cur=null;bar.hidden=true;$('#back').hidden=true;$('#h1').textContent=listTab==='arquivo'?'Arquivo':'Revisar';document.title=listTab==='arquivo'?'Arquivo · Revisar curadoria':'Revisar curadoria';
  Promise.all([loadReviewed(),getEditions(),loadSalvos()]).then(function(){
    var now=Date.now();
    var pend=editions.filter(function(e){return !isReviewed(e.id)});
    var arch=editions.filter(function(e){return isReviewed(e.id)});
    var recent=pend.filter(function(e){return isRecent(e.id,now)});
    var old=pend.filter(function(e){return !isRecent(e.id,now)});
    var h=tabsHtml(pend.length,arch.length,(salvos.items||[]).length);
    if(listTab==='arquivo'){
      h+='<p class="lede">'+(arch.length?plural(arch.length,'edição revisada','edições revisadas')+' · mais recentes primeiro.':'Nenhuma edição revisada ainda.')+' Só entram aqui depois que a seleção é enviada no chat.</p>';
      if(!arch.length)h+='<div class="empty"><b>Arquivo vazio</b>Quando a seleção for registrada, a edição aparece aqui.</div>';
      else h+='<ul class="eds">'+arch.map(function(e){return edCard(e,now,'arquivo')}).join('')+'</ul>';
    }else{
      h+='<p class="lede">'+(pend.length?plural(pend.length,'edição pendente','edições pendentes')+'.':'Tudo revisado.')+(old.length?' As de mais de 72 h ficam em Pendentes antigas.':'')+' Uma edição só conta como revisada depois que a seleção chega no chat.</p>';
      if(!pend.length)h+='<div class="empty"><b>Nada para revisar</b>Quando sair edição nova, ela aparece aqui.</div>';
      else{
        if(recent.length)h+='<ul class="eds">'+recent.map(function(e){return edCard(e,now,'pendentes')}).join('')+'</ul>';
        else if(!old.length)h+='<div class="empty"><b>Nada para revisar</b>Quando sair edição nova, ela aparece aqui.</div>';
        if(old.length)h+='<h2 class="h-sec">Pendentes antigas</h2><p class="lede sub">Mais de 72 h, ainda sem seleção registrada.</p><ul class="eds">'+old.map(function(e){return edCard(e,now,'pendentes')}).join('')+'</ul>';
      }
    }
    view.innerHTML=h;
  }).catch(function(e){view.innerHTML='<div class="empty"><b>Sem conexão</b>Não consegui carregar a lista de edições ('+esc(e.message)+').</div>'});
}


/* ---------- biblioteca de salvos ---------- */
function monLabel(ym){
  if(!ym)return '';
  var p=ym.split('-');
  return new Date(Date.UTC(+p[0],+p[1]-1,1,15)).toLocaleDateString('pt-BR',{month:'short',year:'numeric',timeZone:'America/Sao_Paulo'}).replace(/\./g,'');
}
function inPeriod(it,now){
  if(!sv.periodo)return true;
  var t=it.publishedAt?Date.parse(it.publishedAt):NaN;
  if(sv.periodo==='7')return !isNaN(t)&&now-t<=7*864e5;
  if(sv.periodo==='30')return !isNaN(t)&&now-t<=30*864e5;
  if(/^\d{4}-\d{2}$/.test(sv.periodo))return (it.publishedAt||'').slice(0,7)===sv.periodo;
  return true;
}
function matchSalvo(it,now){
  if(sv.tema&&it.tema!==sv.tema)return false;
  if(sv.idioma&&it.idioma!==sv.idioma)return false;
  if(sv.origem&&it.origem!==sv.origem)return false;
  if(sv.fonte&&it.dominio!==sv.fonte&&it.fonte!==sv.fonte)return false;
  if(!inPeriod(it,now))return false;
  if(sv.q){
    var q=sv.q.toLowerCase();
    var blob=(it.title+' '+(it.resumo||'')+' '+(it.fonte||'')+' '+(it.dominio||'')+' '+(it.subtema||'')+' '+(it.edicao||'')+' '+(it.tema||'')).toLowerCase();
    if(blob.indexOf(q)<0)return false;
  }
  return true;
}
function chip(attr,val,label,n,on){
  return '<button type="button" '+attr+'="'+esc(val)+'" aria-pressed="'+!!on+'">'+label+(n!=null?'<span>'+n+'</span>':'')+'</button>';
}
function renderSalvos(){
  cur=null;bar.hidden=true;$('#back').hidden=true;$('#h1').textContent='Salvos';document.title='Salvos · Revisar curadoria';
  view.innerHTML='<p class="mut load">Carregando salvos…</p>';
  Promise.all([loadReviewed(),getEditions(),loadSalvos()]).then(function(){
    var now=Date.now();
    var all=salvos.items||[];
    var pend=editions.filter(function(e){return !isReviewed(e.id)});
    var arch=editions.filter(function(e){return isReviewed(e.id)});
    var vis=all.filter(function(it){return matchSalvo(it,now)});
    // contagens nos filtros (sobre o conjunto já filtrado pelos OUTROS critérios)
    function countBy(key,except){
      var map={};
      all.forEach(function(it){
        var hold=sv[except]; sv[except]='';
        var ok=matchSalvo(it,now);
        sv[except]=hold;
        if(!ok)return;
        var k=it[key]||'';
        map[k]=(map[k]||0)+1;
      });
      return map;
    }
    var byTema=countBy('tema','tema');
    var byIdioma=countBy('idioma','idioma');
    var byOrig=countBy('origem','origem');
    var byFonte=countBy('dominio','fonte');
    var temas=['IA','Tecnologia','Educação','Cultura','Games','Ciências sociais','Produto','Psicologia e filosofia','Ciência da vida','Saúde e corpo','Fora da bolha'];
    Object.keys(byTema).forEach(function(t){if(temas.indexOf(t)<0)temas.push(t)});
    temas=temas.filter(function(t){return byTema[t]||t===sv.tema});
    var meses=[];
    all.forEach(function(it){var ym=(it.publishedAt||'').slice(0,7);if(ym&&meses.indexOf(ym)<0)meses.push(ym)});
    meses.sort().reverse();
    var fontes=Object.keys(byFonte).filter(Boolean).sort(function(a,b){return (byFonte[b]-byFonte[a])||a.localeCompare(b)});
    var h=tabsHtml(pend.length,arch.length,all.length);
    h+='<p class="lede">'+(all.length?plural(all.length,'link salvo','links salvos')+' das edições que você já selecionou.':'Nenhum link salvo ainda.')+' Filtre por editoria, período, fonte ou idioma. Cada texto abre o original.</p>';
    h+='<div class="sv-layout">';
    h+='<aside class="sv-nav ed-nav" aria-label="Filtros da biblioteca">';
    h+='<label class="sv-q-lab" for="sv-q">Buscar</label>';
    h+='<input id="sv-q" class="sv-q" type="search" placeholder="Título, resumo, fonte…" value="'+esc(sv.q)+'" autocomplete="off">';
    h+='<p class="ofl">Editoria</p><div class="chips of" role="group">'+chip('data-sv-tema','','Todas',null,!sv.tema)+temas.map(function(t){return chip('data-sv-tema',t,t,byTema[t]||0,sv.tema===t)}).join('')+'</div>';
    h+='<p class="ofl">Período</p><div class="chips of" role="group">'+chip('data-sv-periodo','','Tudo',null,!sv.periodo)+chip('data-sv-periodo','7','7 dias',null,sv.periodo==='7')+chip('data-sv-periodo','30','30 dias',null,sv.periodo==='30')+meses.map(function(ym){return chip('data-sv-periodo',ym,monLabel(ym),null,sv.periodo===ym)}).join('')+'</div>';
    h+='<p class="ofl">Origem</p><div class="chips of" role="group">'+chip('data-sv-origem','','Todas',null,!sv.origem)+chip('data-sv-origem','newsletter','Newsletters',byOrig.newsletter||0,sv.origem==='newsletter')+chip('data-sv-origem','busca','Busca',byOrig.busca||0,sv.origem==='busca')+'</div>';
    h+='<p class="ofl">Idioma</p><div class="chips of" role="group">'+chip('data-sv-idioma','','Todos',null,!sv.idioma)+[{k:'pt',l:'Português'},{k:'en',l:'Inglês'},{k:'es',l:'Espanhol'}].filter(function(x){return byIdioma[x.k]||sv.idioma===x.k}).map(function(x){return chip('data-sv-idioma',x.k,x.l,byIdioma[x.k]||0,sv.idioma===x.k)}).join('')+'</div>';
    if(fontes.length){
      h+='<p class="ofl" for="sv-fonte">Fonte</p><select id="sv-fonte" class="sv-sel" aria-label="Fonte">';
      h+='<option value="">Todas as fontes</option>';
      fontes.forEach(function(f){h+='<option value="'+esc(f)+'"'+(sv.fonte===f?' selected':'')+'>'+esc(f)+' ('+byFonte[f]+')</option>'});
      h+='</select>';
    }
    h+='<p class="ofl">Agrupar</p><div class="chips of" role="group">'+chip('data-sv-grupo','data','Por data',null,sv.grupo==='data')+chip('data-sv-grupo','tema','Por editoria',null,sv.grupo==='tema')+'</div>';
    h+='</aside><div class="sv-main">';
    h+='<p class="sv-count">'+plural(vis.length,'resultado','resultados')+(vis.length!==all.length?' de '+all.length:'')+'</p>';
    if(!vis.length){
      h+='<div class="empty"><b>Nada com esses filtros</b>Limpe a busca ou escolha outra editoria.</div>';
    }else{
      var groups=[], gi={};
      vis.forEach(function(it){
        var k=sv.grupo==='tema'?(it.tema||'Outros'):label(it.edicao);
        if(!gi[k]){gi[k]=[];groups.push(k)}
        gi[k].push(it);
      });
      groups.forEach(function(k){
        h+='<section class="sv-sec"><h2 class="tm">'+esc(k)+'<small>'+plural(gi[k].length,'link','links')+'</small></h2>';
        gi[k].forEach(function(it){
          var meta=[it.fonte||it.dominio, it.origem==='newsletter'?'newsletter':(it.origem==='busca'?'busca':''), it.idioma&&it.idioma.toUpperCase(), it.subtema].filter(Boolean).join(' · ');
          h+='<article class="sv-item">';
          h+='<p class="meta"><a href="#/e/'+esc(it.edicao)+'">'+esc(label(it.edicao))+'</a>'+(it.tema?' · '+esc(it.tema):'')+'</p>';
          h+='<h3><a href="'+esc(it.url)+'" target="_blank" rel="noopener">'+esc(it.title)+'</a></h3>';
          if(it.resumo)h+='<p class="r">'+esc(it.resumo)+'</p>';
          if(meta)h+='<p class="meta">'+esc(meta)+'</p>';
          if(it.also&&it.also.length)h+='<p class="also">Também em: '+it.also.map(function(l){return '<a href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.title||l.url)+' ↗</a>'}).join(' · ')+'</p>';
          h+='<div class="act"><a href="'+esc(it.url)+'" target="_blank" rel="noopener">Ler ↗</a></div>';
          h+='</article>';
        });
        h+='</section>';
      });
    }
    h+='</div></div>';
    view.innerHTML=h;
    var q=$('#sv-q');if(q){q.addEventListener('input',function(){sv.q=q.value;renderSalvos()});if(sv.q)try{q.focus();q.setSelectionRange(sv.q.length,sv.q.length)}catch(e){}}
    var sel=$('#sv-fonte');if(sel)sel.addEventListener('change',function(){sv.fonte=sel.value;renderSalvos()});
  }).catch(function(e){view.innerHTML='<div class="empty"><b>Sem conexão</b>Não consegui carregar os salvos ('+esc(e.message)+').</div>'});
}
/* ---------- revisão ---------- */
function renderEdition(ed){
  $('#back').hidden=false;$('#back').href=listTab==='arquivo'?'#/arquivo':(listTab==='salvos'?'#/salvos':'#/');$('#h1').textContent=label(ed);document.title='Revisar '+ed;bar.hidden=true;
  view.innerHTML='<p class="mut load">Carregando edição…</p>';window.scrollTo(0,0);
  Promise.all([getEdition(ed),loadReviewed()]).then(function(res){
    var items=res[0];
    cur={ed:ed,items:items,sel:selOf(ed),tema:'',org:'',only:false};
    var temas=[];items.forEach(function(i){if(temas.indexOf(i.tema)<0)temas.push(i.tema)});cur.temas=temas;
    var cnt=function(f){return items.filter(f).length};
    var r=isReviewed(ed),c=copied()[ed];
    var banner=r?'<p class="banner">✓ Revisada'+esc(reviewedWhen(rvMap[ed]))+'. Você pode copiar de novo.</p>':
      (c?'<p class="banner wait">Copiada, aguardando registro. Cole a lista no chat para marcar como revisada.</p>':'');
    var idx=temas.map(function(t){return '<a href="#s-'+esc(slug(t))+'" data-t="'+esc(t)+'">'+esc(t)+'<span><b></b><i class="ic" style="font-style:normal">'+cnt(function(i){return i.tema==t})+'</i></span></a>'}).join('');
    var h=banner+
     '<div class="ed-layout">'+
     '<aside class="ed-nav" aria-label="Filtros e índice de temas">'+
      '<p class="ofl" id="ofl">Origem</p>'+
      '<div class="of chips" role="group" aria-labelledby="ofl">'+
       '<button type="button" data-org="" aria-pressed="true">Todas origens</button>'+
       '<button type="button" data-org="newsletter" aria-pressed="false">Newsletters<span>'+cnt(function(i){return i.org.indexOf('newsletter')>=0})+'</span></button>'+
       '<button type="button" data-org="busca" aria-pressed="false">Busca<span>'+cnt(function(i){return i.org.indexOf('busca')>=0})+'</span></button>'+
       '<button type="button" id="only" aria-pressed="false">Só guardados<span id="onlyn">0</span></button>'+
      '</div>'+
      '<nav class="idx" aria-label="Índice de temas">'+idx+'</nav>'+
     '</aside>'+
     '<div class="ed-main">'+
      temas.map(function(t){var its=items.filter(function(i){return i.tema==t});
        return '<section id="s-'+esc(slug(t))+'" data-t="'+esc(t)+'"><h2 class="tm">'+esc(t)+'<small><span class="sc">'+its.length+'</span> textos</small></h2>'+its.map(card).join('')+'</section>'}).join('')+
      '<p class="foot"><a href="'+esc(edHref(ed))+'">Abrir a página original da edição ↗</a></p>'+
     '</div></div>';
    view.innerHTML=h;bar.hidden=false;paint();
  }).catch(function(e){view.innerHTML='<div class="empty"><b>Não consegui abrir '+esc(ed)+'</b>'+esc(e.message)+'</div><p class="foot"><a href="#/">← Voltar às edições</a></p>'});
}
function card(i){
  var also=i.links.slice(1);
  return '<article data-id="'+esc(i.id)+'">'+(i.orgLabel?'<p class="org '+i.orgCls+'">'+(i.orgCls=='nl'?'✉':'⌕')+' '+esc(i.orgLabel)+'</p>':'')+
    (i.meta?'<p class="meta">'+esc(i.meta)+'</p>':'')+'<h3><a href="'+esc(i.url)+'" target="_blank" rel="noopener">'+esc(i.title)+'</a></h3>'+
    (i.resumo?'<p class="r">'+esc(i.resumo)+'</p>':'')+
    (also.length?'<p class="also">Também em: '+also.map(function(l){return '<a href="'+esc(l.u)+'" target="_blank" rel="noopener" title="'+esc(l.t)+'">'+esc(l.f||l.t)+' ↗</a>'}).join(' · ')+'</p>':'')+
    '<div class="act"><a href="'+esc(i.url)+'" target="_blank" rel="noopener">Ler ↗</a><button type="button" data-sel aria-pressed="false">Guardar</button></div></article>';
}
function paint(){
  if(!cur)return;var n=0;
  view.querySelectorAll('article[data-id]').forEach(function(a){var on=!!cur.sel[a.dataset.id],b=a.querySelector('[data-sel]');if(on)n++;
    a.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.textContent=on?'✓ Guardado':'Guardar'});
  $('#cnt').textContent=plural(n,'guardado','guardados');$('#onlyn').textContent=n;
  view.querySelectorAll('nav.idx a').forEach(function(l){
    var k=cur.items.filter(function(i){return i.tema==l.dataset.t&&cur.sel[i.id]}).length;
    var b=l.querySelector('b');if(b)b.textContent=k?k+' ✓ · ':'';
  });
  filt();
}
function filt(){
  var byId={};cur.items.forEach(function(i){byId[i.id]=i});
  view.querySelectorAll('article[data-id]').forEach(function(a){var i=byId[a.dataset.id];
    a.hidden=(cur.tema&&i.tema!=cur.tema)||(cur.org&&i.org.indexOf(cur.org)<0)||(cur.only&&!cur.sel[i.id])});
  view.querySelectorAll('section[data-t]').forEach(function(s){var v=s.querySelectorAll('article:not([hidden])').length;s.hidden=!v;s.querySelector('.sc').textContent=v});
  view.querySelectorAll('nav.idx a').forEach(function(l){
    var v=cur.items.filter(function(i){return i.tema==l.dataset.t&&!(cur.tema&&i.tema!=cur.tema)&&!(cur.org&&i.org.indexOf(cur.org)<0)&&!(cur.only&&!cur.sel[i.id])}).length;
    var ic=l.querySelector('.ic');if(ic)ic.textContent=v;
    l.hidden=!v;
  });
}
view.addEventListener('click',function(e){
  var sb=e.target.closest('button');
  if(sb&&(sb.hasAttribute('data-sv-tema')||sb.hasAttribute('data-sv-periodo')||sb.hasAttribute('data-sv-origem')||sb.hasAttribute('data-sv-idioma')||sb.hasAttribute('data-sv-grupo'))){
    if(sb.hasAttribute('data-sv-tema'))sv.tema=sb.getAttribute('data-sv-tema');
    if(sb.hasAttribute('data-sv-periodo'))sv.periodo=sb.getAttribute('data-sv-periodo');
    if(sb.hasAttribute('data-sv-origem'))sv.origem=sb.getAttribute('data-sv-origem');
    if(sb.hasAttribute('data-sv-idioma'))sv.idioma=sb.getAttribute('data-sv-idioma');
    if(sb.hasAttribute('data-sv-grupo'))sv.grupo=sb.getAttribute('data-sv-grupo')||'data';
    renderSalvos();return;
  }
  if(!cur)return;
  var link=e.target.closest('nav.idx a');
  if(link){
    e.preventDefault();
    var sec=view.querySelector('section[data-t="'+link.dataset.t+'"]')||view.querySelector('#s-'+slug(link.dataset.t));
    if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  var b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-sel')){var id=b.closest('article').dataset.id;if(cur.sel[id])delete cur.sel[id];else cur.sel[id]=1;store('curadoria:sel:'+cur.ed,cur.sel);paint();return}
  if(b.hasAttribute('data-tema')){cur.tema=b.dataset.tema;b.parentNode.querySelectorAll('[data-tema]').forEach(function(x){x.setAttribute('aria-pressed',x==b)});filt();return}
  if(b.hasAttribute('data-org')){cur.org=b.dataset.org;b.parentNode.querySelectorAll('[data-org]').forEach(function(x){x.setAttribute('aria-pressed',x==b)});filt();return}
  if(b.id=='only'){cur.only=!cur.only;b.setAttribute('aria-pressed',cur.only);filt()}
});

/* ---------- copiar: gera a lista; NÃO marca como revisada ---------- */
function fallback(s){var a=document.createElement('textarea');a.value=s;a.setAttribute('readonly','');a.style.position='fixed';a.style.top='-1000px';document.body.appendChild(a);a.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(a);return ok}
function copiedOk(ed){
  markCopied(ed);
  toast(isReviewed(ed)?'Lista copiada':'Copiada, aguardando registro — cole no chat');
  var b=view.querySelector('.banner');
  if(!isReviewed(ed)){
    var html='<p class="banner wait">Copiada, aguardando registro. Cole a lista no chat para marcar como revisada.</p>';
    if(b)b.outerHTML=html;else view.insertAdjacentHTML('afterbegin',html);
  }
}
function done(ed,s,ok){window.__lastCopy={text:s,ok:ok};
  if(ok){copiedOk(ed);return}
  toast('Não consegui copiar; copie o texto abaixo');$('#fb').hidden=false;var x=$('#fbt');x.value=s;x.focus();x.select();
  $('#fbok').onclick=function(){$('#fb').hidden=true;copiedOk(ed)};
}
$('#fbx').onclick=function(){$('#fb').hidden=true};
$('#copy').onclick=function(){
  if(!cur)return;var ed=cur.ed,s=text(ed,cur.items,cur.sel);
  if(!Object.keys(cur.sel).length&&!confirm('Nenhum texto guardado. Copiar mesmo assim?'))return;
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(s).then(function(){done(ed,s,true)},function(){done(ed,s,fallback(s))});
  else done(ed,s,fallback(s));
};
$('#clear').onclick=function(){if(cur&&confirm('Limpar a seleção desta edição?')){cur.sel={};store('curadoria:sel:'+cur.ed,cur.sel);paint()}};

/* ---------- rotas ---------- */
function route(){
  var m=/^#\/e\/([\w-]+)$/.exec(location.hash);
  var ar=/^#\/arquivo\/?$/.exec(location.hash);
  var svh=/^#\/salvos\/?$/.exec(location.hash);
  $('#fb').hidden=true;
  if(m){renderEdition(m[1]);return}
  if(svh){listTab='salvos';renderSalvos();return}
  listTab=ar?'arquivo':'pendentes';
  renderList();
}
addEventListener('hashchange',route);
addEventListener('pageshow',function(e){if(e.persisted&&!cur){rvMap=null;editions=null;salvos=null;route()}});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&!cur){rvMap=null;editions=null;salvos=null;route()}});
route();

if('serviceWorker' in navigator&&location.protocol!='file:')navigator.serviceWorker.register('sw.js').catch(function(){});
})();
