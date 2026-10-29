(function(root){
 'use strict';
 const M=root.TosiSharedModel,R=root.TosiRankings;
 const mean=a=>a.length?a.reduce((n,v)=>n+v,0)/a.length:null;
 const key=r=>JSON.stringify([r.filial,r.num_pc]);
 const group=(rows,field)=>{const result=new Map();for(const r of rows){const k=r[field]||'Não informado';if(!result.has(k))result.set(k,[]);result.get(k).push(r);}return [...result].map(([label,rows])=>({label,rows}));};
 function paymentDeliveryGroups(orders,f,today){
  const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+14);const horizon=end.toISOString().slice(0,10),groups=new Map();
  for(const r of M.filtered(orders,{...f,mes:'all'}).filter(r=>/antecip/i.test(r.cond_pagto||'')&&R.validDate(r.data_vencimento)&&r.data_vencimento>='2026-09-01'&&r.data_vencimento<=horizon)){
   const k=JSON.stringify([r.num_pc,r.fornecedor_codigo,r.fornecedor,r.filial,r.comprador]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);
  }
  const norm=v=>String(v||'').trim().toLowerCase();
  return [...groups.values()].map(rows=>({rows,num_pc:rows[0].num_pc,due:rows.map(r=>r.data_vencimento).sort().at(-1),status_entrega:rows.some(r=>norm(r.status_pedido)==='pedido atendido'&&r.data_pre_nota)?'Atendido':rows.some(r=>norm(r.status_pedido).includes('parcialmente atendido')&&r.data_pre_nota)?'Parcialmente atendido':rows.some(r=>norm(r.status_pedido)==='pendente')?'Não chegou':'Sem confirmação'})).sort((a,b)=>a.due.localeCompare(b.due)||String(a.num_pc).localeCompare(String(b.num_pc))).slice(0,1000);
 }
 function apiFilters(f){if(!f.ano||f.ano==='all')return f;return {...f,from:f.from&&f.from>`${f.ano}-01-01`?f.from:`${f.ano}-01-01`,to:f.to&&f.to<`${f.ano}-12-31`?f.to:`${f.ano}-12-31`};}
 function render(ctx){
  const {data,items,cards,filters:f,money,number,days,date,esc,detail,rank,table}=ctx;
  const pending=r=>String(r.status_pedido||'').trim().toLowerCase()==='pendente';
  const anticipated=r=>/antecip/i.test(r.cond_pagto||'');
  const pct=(v,total)=>`${(total?v/total*100:0).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
  const total=M.sum(items),today=data.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const financial=cards.filter(c=>!c.limit),timing=cards.filter(c=>c.limit);
  const lookup=Object.fromEntries(cards.map(c=>[c.criterion,c]));
  const metric=c=>`<button class="executive-metric ${c.state||''}" data-detail="${c.criterion}"><span>${esc(c.title)}</span><strong>${money(c.value)}</strong><small>${pct(c.value,total)} do total · ${new Set(c.rows.map(key)).size} pedidos · ${c.rows.length} itens</small></button>`;
  const timingCard=c=>`<button class="executive-metric timing ${c.state}" data-detail="${c.criterion}"><span>${esc(c.title)}</span><strong>${days(c.days)}</strong><small>${c.displayBasis==='overdue'?'Atraso desde '+(c.overdueSource==='programacao'?'programação':'vencimento')+' · ':''}${!c.evaluated?'Sem datas suficientes':c.outside?`${c.outside} itens fora da meta`:c.missing?'Dados parciais · maior prazo conhecido':'Maior prazo observado'}${c.missing?` · ${c.missing} itens sem datas da etapa`:''} · Meta: ${c.limit} dias úteis</small></button>`;
  const section=(title,subtitle='')=>`<div class="metric-section-title"><p>${esc(title)}</p><span>${esc(subtitle)}</span></div>`;
  const panel=(title,body,subtitle='')=>`<article class="panel modern-chart-panel"><div class="panel-title"><div><p>${esc(subtitle)}</p><h2>${esc(title)}</h2></div></div>${body}</article>`;
  const empty='<p class="empty">Sem dados nos filtros selecionados.</p>';
  let selection=0;const selections=new Map();
  const rowsButton=(label,rows,body,cls='analytic-row')=>{const id=String(++selection);selections.set(id,{title:label,criterion:'all',rows});return `<button class="${cls}" data-selection="${id}">${body}</button>`;};
  const bars=(groups,format=money,score=g=>M.sum(g.rows))=>{
   const ranked=groups.map(g=>({...g,score:score(g)})).sort((a,b)=>(b.score||0)-(a.score||0)),max=Math.max(1,...ranked.map(g=>g.score||0));
   return ranked.length?ranked.map((g,i)=>rowsButton(g.label,g.rows,`<b>${i+1}</b><span>${esc(g.label)}<i><u style="width:${Math.max(0,(g.score||0)/max*100)}%"></u></i><small>${new Set(g.rows.map(key)).size} pedidos · ${g.rows.length} itens</small></span><strong>${format(g.score)}<small>${format===money?pct(g.score,total):''}</small></strong>`)).join(''):empty;
  };
  // Identical emission-date scope to the desktop monthly charts; month selection
  // changes headline metrics while the evolution retains the other filters.
  const base=M.filtered(data.orders,{...f,mes:'all'}),months=group(base.filter(r=>/^\d{4}-\d{2}/.test(r.data_pedido||'')).map(r=>({...r,period:r.data_pedido.slice(0,7)})),'period').sort((a,b)=>a.label.localeCompare(b.label)).slice(-12);
  function columns(count=false){const values=months.map(g=>count?new Set(g.rows.map(r=>r.num_pc)).size:M.sum(g.rows)),max=Math.max(1,...values);return months.length?`<div class="shared-columns">${months.map((g,i)=>rowsButton(g.label,g.rows,`<strong>${count?number(values[i]):money(values[i])}</strong><i style="height:${Math.max(2,values[i]/max*140)}px"></i><span>${esc(new Date(g.label+'-02T12:00:00Z').toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'}))}</span><small>${count?money(M.sum(g.rows)):`${new Set(g.rows.map(r=>r.num_pc)).size} pedidos`}</small>`,'shared-column')).join('')}</div>`:empty;}
  const a=lookup.anticipated.value,b=lookup.invoiced.value;
  const composition=`<div class="shared-composition"><div class="shared-donut" style="background:conic-gradient(#168cf4 0 ${total?a/total*100:0}%,#12c3cb 0 100%)"><div><small>Total consolidado</small><strong>${money(total)}</strong></div></div><div>${['anticipated','invoiced'].map(k=>metric(lookup[k])).join('')}</div></div>`;
  const deliveryGroups=paymentDeliveryGroups(data.orders,f,today),deliveryColors={'Atendido':'#29c983','Parcialmente atendido':'#ff9d2e','Não chegou':'#ef4967','Sem confirmação':'#91a4b8'};
  let offset=0;const segments=Object.entries(deliveryColors).map(([label,color])=>{const matches=deliveryGroups.filter(g=>g.status_entrega===label),start=offset;offset+=deliveryGroups.length?matches.length/deliveryGroups.length*100:0;return {label,color,matches,start,end:offset};});
  const delivery=`<div class="shared-composition"><div class="shared-donut" style="background:conic-gradient(${segments.map(s=>`${s.color} ${s.start}% ${s.end}%`).join(',')})"><div><small>Pedidos antecipados</small><strong>${number(deliveryGroups.length)}</strong></div></div><div>${segments.map(s=>rowsButton(s.label,s.matches.flatMap(g=>g.rows),`<span>${esc(s.label)}</span><strong>${s.matches.length}</strong>`,'delivery-legend')).join('')}</div></div>`;
  const deliveryCards=financial.slice(4).map(c=>{const ages=new Map();for(const r of c.rows){const k=JSON.stringify([r.filial,r.num_pc]),v=R.weekdays(c.criterion==='paidPending'?r.data_vencimento:r.data_pedido,today);if(!ages.has(k))ages.set(k,null);if(v!=null)ages.set(k,Math.max(v,ages.get(k)??0));}const values=[...ages.values()].filter(v=>v!=null);return metric({...c,title:c.title})+`<p class="delivery-age">Espera média: ${days(mean(values))} ${c.criterion==='paidPending'?'desde Vencto. Titulo':'desde o pedido'}</p>`;});
  const buyers=group(items.filter(r=>!TosiDeadlines.cancelled(r)),'comprador');
  const buyerGoals=buyers.map(g=>{const unique=new Map();for(const r of g.rows){const d=R.weekdays(r.data_sc,r.data_pedido);if(d!=null){const k=JSON.stringify([r.filial,r.num_pc]);unique.set(k,Math.max(d,unique.get(k)??0));}}const v=[...unique.values()],inside=v.filter(d=>d<=5).length;return v.length?rowsButton(g.label,g.rows,`<span>${esc(g.label)}</span><strong>${v.length} pedidos</strong><small>${inside} dentro · ${v.length-inside} fora · média ${days(mean(v))}</small>`,'executive-metric'):'';}).join('')||empty;
  const calendarDays=r=>TosiDeadlines.delivered(r)&&!TosiDeadlines.cancelled(r)&&r.data_pre_nota<=TosiDeadlines.today()?R.weekdays(r.data_pedido,r.data_pre_nota):null;
  const groupDelivery=bars(group(items.filter(r=>Number.isFinite(calendarDays(r))&&calendarDays(r)>=0),'grupo_nome').sort((a,b)=>mean(b.rows.map(calendarDays))-mean(a.rows.map(calendarDays))).slice(0,20),v=>`${number(v)} dias úteis`,g=>mean(g.rows.map(calendarDays)));
  const emission=M.sum(items),deliveryRows=base.filter(r=>r.data_entrega&&(!f.mes||f.mes==='all'||r.data_entrega.slice(5,7)===f.mes));
  document.querySelector('#content').innerHTML=`<section id="dashboard" class="shared-dashboard">
   <section class="executive-hero"><div class="hero-copy"><p>GESTÃO ESTRATÉGICA DE COMPRAS</p><h2>Decisões rápidas, compras sob controle.</h2><span>Acompanhe pagamentos, fornecedores, prazos e entregas em uma única visão corporativa.</span></div><div class="hero-status"><span><i></i> Base central compartilhada</span><strong>${date(today)}</strong><small>Consulta somente leitura</small></div></section>
   <section class="period-bar"><div><p>PERÍODO DA ANÁLISE</p><strong>Indicadores calculados por emissão e entrega</strong></div><div class="period-total"><span>Total por emissão</span><b>${money(emission)}</b><small>${items.length} itens emitidos</small></div><div class="period-total"><span>Total por entrega prevista</span><b>${money(M.sum(deliveryRows))}</b><small>${deliveryRows.length} itens · mesma base de emissão filtrada</small></div></section>
   ${section('RESUMO GERAL','Visão financeira dos pedidos')}<section class="shared-metrics four">${financial.slice(0,4).map(metric).join('')}</section>
   <section class="shared-grid">${panel('Participação no valor total',composition,'COMPOSIÇÃO')}${panel('Valor emitido por mês',columns(),'EVOLUÇÃO MENSAL')}</section>
   <section class="shared-grid">${panel('Total de pedidos por mês',columns(true),'PEDIDOS EMITIDOS')}${panel('Chegada dos pedidos',delivery,'STATUS DE ENTREGA')}</section>
   ${section('PENDÊNCIAS DE ENTREGA','Pedidos pendentes na base selecionada')}<section class="shared-metrics two">${deliveryCards.map(s=>`<div>${s}</div>`).join('')}</section>
   ${section('Prazo pagamento antecipado','Condições antecipadas das três filiais · exclui saldo a prazo')}<section class="shared-metrics four">${timing.slice(0,4).map(timingCard).join('')}</section>
   ${section('Prazo pagamento faturado a prazo','Somente compras a prazo das três filiais · exclui 100% antecipados')}<section class="shared-metrics three">${timing.slice(4).map(timingCard).join('')}</section>
   <section class="shared-grid">${panel('Top 10 e participação no faturado',bars(group(items.filter(r=>!anticipated(r)),'fornecedor').sort((x,y)=>M.sum(y.rows)-M.sum(x.rows)).slice(0,10)),'FORNECEDORES FATURADOS')}${panel('Top 10 e participação à vista',bars(group(items.filter(anticipated),'fornecedor').sort((x,y)=>M.sum(y.rows)-M.sum(x.rows)).slice(0,10)),'FORNECEDORES À VISTA')}</section>
   <section class="shared-grid">${panel('Prazo por comprador',`<div class="shared-metrics two">${buyerGoals}</div>`,'META SC → PEDIDO · ATÉ 5 DIAS ÚTEIS')}${panel('Valor total e participação',bars(group(items,'comprador')),'VALOR POR COMPRADOR')}</section>
   <section class="shared-grid">${panel('Prazo médio de entrega por grupo',groupDelivery,'PRAZO DE ENTREGA · TOP 20')}${panel('Valor total por grupo',bars(group(items,'grupo_nome').sort((a,b)=>M.sum(b.rows)-M.sum(a.rows)).slice(0,15))+rowsButton('Todos os grupos',items,'Ver todos os itens e rankings','all-items-link'),'GRUPOS DE MATERIAIS · TOP 15')}</section>
   ${panel('Solicitações com pedidos pendentes',bars(group(items.filter(pending),'numero_sc').slice(0,8))+rowsButton('Todas as solicitações com pedidos pendentes',items.filter(pending),'Ver todos os pedidos pendentes','all-items-link'),'PENDÊNCIAS POR SC')}
  </section>`;
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(lookup[b.dataset.detail]));
  document.querySelectorAll('[data-selection]').forEach(b=>b.onclick=()=>detail(selections.get(b.dataset.selection)));
 }
 root.TosiExecutive={render,apiFilters,paymentDeliveryGroups};
})(globalThis);
