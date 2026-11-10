/* Revisar curadoria — PWA vanilla. Rotas: #/ (pendentes), #/arquivo e #/e/<ED>. */
(function(){
'use strict';
var CK='curadoria:copied', H72=72*3600e3;
var ID=/^(\d{4})-(\d{2})-(\d{2})-(06|16)h$/;
var $=function(s){return document.querySelector(s)};
var view=$('#view'), bar=$('#bar');
var cache={};          // ED -> itens parseados
var editions=null;     // [{id, href, publishedAt, items}]
var rvMap=null;        // fonte da verdade: reviewed.json do servidor
var cur=null;          // estado da revisão aberta
var listTab='pendentes';

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
function tabsHtml(pend,arch){
  var on=listTab==='arquivo';
  return '<nav class="tabs" role="tablist" aria-label="Listas de edições">'+
    '<a class="tab" role="tab" id="tab-p" href="#/" aria-selected="'+(!on)+'">Pendentes<span>'+pend+'</span></a>'+
    '<a class="tab" role="tab" id="tab-a" href="#/arquivo" aria-selected="'+on+'">Arquivo<span>'+arch+'</span></a>'+
    '</nav>';
}
function renderList(){
  cur=null;bar.hidden=true;$('#back').hidden=true;$('#h1').textContent=listTab==='arquivo'?'Arquivo':'Revisar';document.title=listTab==='arquivo'?'Arquivo · Revisar curadoria':'Revisar curadoria';
  Promise.all([loadReviewed(),getEditions()]).then(function(){
    var now=Date.now();
    var pend=editions.filter(function(e){return !isReviewed(e.id)});
    var arch=editions.filter(function(e){return isReviewed(e.id)});
    var recent=pend.filter(function(e){return isRecent(e.id,now)});
    var old=pend.filter(function(e){return !isRecent(e.id,now)});
    var h=tabsHtml(pend.length,arch.length);
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
    h+='<p class="foot"><a href="../">Todas as edições no site ↗</a></p>';
    view.innerHTML=h;
  }).catch(function(e){view.innerHTML='<div class="empty"><b>Sem conexão</b>Não consegui carregar a lista de edições ('+esc(e.message)+').</div>'});
}

/* ---------- revisão ---------- */
function renderEdition(ed){
  $('#back').hidden=false;$('#back').href=listTab==='arquivo'?'#/arquivo':'#/';$('#h1').textContent=label(ed);document.title='Revisar '+ed;bar.hidden=true;
  view.innerHTML='<p class="mut load">Carregando edição…</p>';window.scrollTo(0,0);
  Promise.all([getEdition(ed),loadReviewed()]).then(function(res){
    var items=res[0];
    cur={ed:ed,items:items,sel:selOf(ed),tema:'',org:'',only:false};
    var temas=[];items.forEach(function(i){if(temas.indexOf(i.tema)<0)temas.push(i.tema)});cur.temas=temas;
    var cnt=function(f){return items.filter(f).length};
    var r=isReviewed(ed),c=copied()[ed];
    var banner=r?'<p class="banner">✓ Revisada'+esc(reviewedWhen(rvMap[ed]))+'. Você pode copiar de novo.</p>':
      (c?'<p class="banner wait">Copiada, aguardando registro. Cole a lista no chat para marcar como revisada.</p>':'');
    var h=banner+
     '<div class="filters"><div class="chips" role="group" aria-label="Temas"><button type="button" data-tema="" aria-pressed="true">Todos<span>'+items.length+'</span></button>'+
     temas.map(function(t){return '<button type="button" data-tema="'+esc(t)+'" aria-pressed="false">'+esc(t)+'<span>'+cnt(function(i){return i.tema==t})+'</span></button>'}).join('')+'</div>'+
     '<div class="chips" role="group" aria-label="Origem"><button type="button" data-org="" aria-pressed="true">Todas origens</button><button type="button" data-org="newsletter" aria-pressed="false">Newsletters<span>'+cnt(function(i){return i.org.indexOf('newsletter')>=0})+'</span></button>'+
     '<button type="button" data-org="busca" aria-pressed="false">Busca<span>'+cnt(function(i){return i.org.indexOf('busca')>=0})+'</span></button><button type="button" id="only" aria-pressed="false">Só guardados<span id="onlyn">0</span></button></div></div>'+
     temas.map(function(t){var its=items.filter(function(i){return i.tema==t});
      return '<section data-t="'+esc(t)+'"><h2 class="tm">'+esc(t)+'<small><span class="sc">'+its.length+'</span> textos</small></h2>'+its.map(card).join('')+'</section>'}).join('')+
     '<p class="foot"><a href="'+esc(edHref(ed))+'">Abrir a página original da edição ↗</a></p>';
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
  $('#cnt').textContent=plural(n,'guardado','guardados');$('#onlyn').textContent=n;filt();
}
function filt(){
  var byId={};cur.items.forEach(function(i){byId[i.id]=i});
  view.querySelectorAll('article[data-id]').forEach(function(a){var i=byId[a.dataset.id];
    a.hidden=(cur.tema&&i.tema!=cur.tema)||(cur.org&&i.org.indexOf(cur.org)<0)||(cur.only&&!cur.sel[i.id])});
  view.querySelectorAll('section[data-t]').forEach(function(s){var v=s.querySelectorAll('article:not([hidden])').length;s.hidden=!v;s.querySelector('.sc').textContent=v});
}
view.addEventListener('click',function(e){
  if(!cur)return;var b=e.target.closest('button');if(!b)return;
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
  $('#fb').hidden=true;
  if(m){renderEdition(m[1]);return}
  listTab=ar?'arquivo':'pendentes';
  renderList();
}
addEventListener('hashchange',route);
addEventListener('pageshow',function(e){if(e.persisted&&!cur){rvMap=null;editions=null;renderList()}});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&!cur){rvMap=null;editions=null;renderList()}}); // rebusca reviewed.json e edições novas
route();

if('serviceWorker' in navigator&&location.protocol!='file:')navigator.serviceWorker.register('sw.js').catch(function(){});
})();
