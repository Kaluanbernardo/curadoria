/* Revisar curadoria — PWA vanilla. Rotas: #/ (lista) e #/e/<ED> (revisão). */
(function(){
'use strict';
var RK='curadoria:reviewed', SK='curadoria:seeded', H72=72*3600e3;
var ID=/^(\d{4})-(\d{2})-(\d{2})-(06|16)h$/;
var $=function(s){return document.querySelector(s)};
var view=$('#view'), bar=$('#bar');
var cache={};          // ED -> itens parseados
var editions=null;     // [{id, href, publishedAt, items}]
var cur=null;          // estado da revisão aberta

/* ---------- armazenamento ---------- */
function load(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function reviewed(){var r=load(RK,{});return r&&typeof r=='object'?r:{}}
function markReviewed(ed){var r=reviewed();r[ed]=new Date().toISOString();store(RK,r)}
function selOf(ed){return load('curadoria:sel:'+ed,{})||{}}

/* ---------- regra de exposição ---------- */
function pubTime(ed){var m=ID.exec(ed);return m?Date.UTC(+m[1],m[2]-1,+m[3],+m[4]+3):NaN} // America/Sao_Paulo = UTC-3
function age(ed,now){return (now||Date.now())-pubTime(ed)}
function eligible(ed,rv,now){return !rv[ed]||age(ed,now)<H72}
window.__revisar={eligible:eligible,pubTime:pubTime};

/* ---------- formatação ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
var DF=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'numeric',month:'short',timeZone:'America/Sao_Paulo'});
function label(ed){var m=ID.exec(ed);return m?DF.format(new Date(pubTime(ed))).replace(/\./g,'')+' · '+m[4]+'h':ed}
function dur(ms){var h=Math.max(0,Math.floor(ms/3600e3));return h<1?'menos de 1 h':h<48?h+' h':Math.floor(h/24)+' d'}
function plural(n,a,b){return n+' '+(n==1?a:b)}

/* ---------- tema claro/escuro (mesma chave das páginas) ---------- */
function setTh(t){document.documentElement.dataset.theme=t;store('curadoria:theme',t);var b=$('#thm');b.textContent=t=='dark'?'☀':'☾';b.setAttribute('aria-label',t=='dark'?'Mudar para modo claro':'Mudar para modo escuro');
 var c=t=='dark'?'#121214':'#fbfaf7';document.querySelectorAll('meta[name=theme-color]').forEach(function(m){m.content=c})}
setTh(document.documentElement.dataset.theme||'light');
$('#thm').onclick=function(){setTh(document.documentElement.dataset.theme=='dark'?'light':'dark')};

/* ---------- toast ---------- */
var tt;function toast(s){var t=$('#toast');t.textContent=s;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2200)}

/* ---------- dados ---------- */
function getJSON(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()})}
function seed(){ // 1ª visita: marca como revisadas as edições já em feedback.json
 if(localStorage.getItem(SK))return Promise.resolve();
 return getJSON('SEED_REVIEWED.json').then(function(list){var r=reviewed(),t=new Date().toISOString();
  (list||[]).forEach(function(ed){if(!r[ed])r[ed]=t});store(RK,r);localStorage.setItem(SK,'1')}).catch(function(){});
}
function getEditions(){
 if(editions)return Promise.resolve(editions);
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
function renderList(){
 cur=null;bar.hidden=true;$('#back').hidden=true;$('#h1').textContent='Revisar';document.title='Revisar curadoria';
 Promise.all([seed(),getEditions()]).then(function(){
  var rv=reviewed(),now=Date.now(),eds=editions.filter(function(e){return eligible(e.id,rv,now)});
  var pend=eds.filter(function(e){return !rv[e.id]}).length;
  var h='<p class="lede">'+(pend?plural(pend,'edição pendente','edições pendentes'):'Tudo revisado')+' · revisadas somem da lista após 72 h.</p>';
  if(!eds.length)h+='<div class="empty"><b>Nada para revisar</b>Quando sair edição nova, ela aparece aqui.</div>';
  else h+='<ul class="eds">'+eds.map(function(e){
   var a=age(e.id,now),s=selOf(e.id),n=Object.keys(s).length,r=rv[e.id];
   var tags=r?'<span class="tag done">✓ Revisada · sai em '+dur(H72-a)+'</span>':'<span class="tag new">Pendente</span>';
   if(n)tags+='<span class="tag">'+plural(n,'guardado','guardados')+'</span>';
   return '<li><a class="ed'+(r?' rv':'')+'" href="#/e/'+esc(e.id)+'" data-ed="'+esc(e.id)+'"><h2>'+esc(label(e.id))+'</h2><p class="m">'+esc(e.id)+(e.items?' · '+e.items+' textos':'')+' · há '+dur(a)+'</p><div class="tags">'+tags+'</div></a></li>';
  }).join('')+'</ul>';
  h+='<p class="foot"><a href="../">Todas as edições no site ↗</a></p>';
  view.innerHTML=h;
 }).catch(function(e){view.innerHTML='<div class="empty"><b>Sem conexão</b>Não consegui carregar a lista de edições ('+esc(e.message)+').</div>'});
}

/* ---------- revisão ---------- */
function renderEdition(ed){
 $('#back').hidden=false;$('#h1').textContent=label(ed);document.title='Revisar '+ed;bar.hidden=true;
 view.innerHTML='<p class="mut load">Carregando edição…</p>';window.scrollTo(0,0);
 getEdition(ed).then(function(items){
  cur={ed:ed,items:items,sel:selOf(ed),tema:'',org:'',only:false};
  var temas=[];items.forEach(function(i){if(temas.indexOf(i.tema)<0)temas.push(i.tema)});cur.temas=temas;
  var cnt=function(f){return items.filter(f).length};
  var r=reviewed()[ed];
  var h=(r?'<p class="banner">✓ Revisada em '+esc(new Date(r).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}))+'. Copiar de novo atualiza a marcação.</p>':'')+
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

/* ---------- copiar = revisão concluída ---------- */
function fallback(s){var a=document.createElement('textarea');a.value=s;a.setAttribute('readonly','');a.style.position='fixed';a.style.top='-1000px';document.body.appendChild(a);a.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(a);return ok}
function finish(ed){markReviewed(ed);toast('Lista copiada — é só colar no chat');setTimeout(function(){if(location.hash!='#/')location.hash='#/';else route()},700)}
function done(ed,s,ok){window.__lastCopy={text:s,ok:ok};
 if(ok){finish(ed);return}
 toast('Não consegui copiar; copie o texto abaixo');$('#fb').hidden=false;var x=$('#fbt');x.value=s;x.focus();x.select();
 $('#fbok').onclick=function(){$('#fb').hidden=true;finish(ed)};
}
$('#fbx').onclick=function(){$('#fb').hidden=true};
$('#copy').onclick=function(){
 if(!cur)return;var ed=cur.ed,s=text(ed,cur.items,cur.sel);
 if(!Object.keys(cur.sel).length&&!confirm('Nenhum texto guardado. Copiar mesmo assim e marcar a edição como revisada?'))return;
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(s).then(function(){done(ed,s,true)},function(){done(ed,s,fallback(s))});
 else done(ed,s,fallback(s));
};
$('#clear').onclick=function(){if(cur&&confirm('Limpar a seleção desta edição?')){cur.sel={};store('curadoria:sel:'+cur.ed,cur.sel);paint()}};

/* ---------- rotas ---------- */
function route(){var m=/^#\/e\/([\w-]+)$/.exec(location.hash);$('#fb').hidden=true;if(m)renderEdition(m[1]);else renderList()}
addEventListener('hashchange',route);
addEventListener('pageshow',function(e){if(e.persisted&&!cur)renderList()});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&!cur&&editions){editions=null;renderList()}}); // reavalia a janela de 72 h e busca edições novas
route();

if('serviceWorker' in navigator&&location.protocol!='file:')navigator.serviceWorker.register('sw.js').catch(function(){});
})();
