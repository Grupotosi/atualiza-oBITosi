(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TosiRankings=api;})(globalThis,function(){
 const D=typeof module==='object'&&module.exports?require('./deadline-calculator'):globalThis.TosiDeadlines;
 const norm=v=>String(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
 function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
 function weekdays(a,b){return D.weekdays(a,b);}
 const phases={
  advanceDeadlineScOrder:['Emissão SC → emissão do pedido',5,'data_sc','data_pedido','prazo_time_antecipado'],
  advanceDeadlineReportPayment:['Primeiro relatório → Vencto. Titulo',5,'data_relatorio','data_vencimento','prazo_time_antecipado'],
  advanceDeadlinePaymentPrenote:['Vencto. Titulo → pré-nota',7,'data_vencimento','data_pre_nota','prazo_time_antecipado'],
  advanceDeadlineScPrenote:['Emissão SC → pré-nota',15,'data_sc','data_pre_nota','prazo_time_antecipado'],
  termDeadlineScOrder:['Emissão SC → emissão do pedido',5,'data_sc','data_pedido','prazo_time_faturado'],
  termDeadlineOrderPrenote:['Emissão do pedido → pré-nota',7,'data_pedido','data_pre_nota','prazo_time_faturado'],
  termDeadlineScPrenote:['Emissão SC → pré-nota',7,'data_sc','data_pre_nota','prazo_time_faturado'],
  deadlineScOrder:['Emissão SC → emissão do pedido',5,'data_sc','data_pedido','prazo_sc_pedido'],
  deadlineOrderPayment:['Emissão do pedido → vencimento',5,'data_pedido','data_vencimento','prazo_pedido_pagamento'],
  deadlinePaymentPrenote:['Vencto. Titulo → pré-nota',7,'data_vencimento','data_pre_nota','prazo_pagamento_pre_nota'],
  deadlineScPrenote:['Emissão SC → pré-nota',15,'data_sc','data_pre_nota','prazo_total']
 };
 function config(criterion){const p=phases[criterion]||(/^buyerGoal/.test(criterion)?phases.deadlineScOrder:null);return p?{label:D.definitions[criterion]?.label||p[0],limit:p[1],from:p[2],to:p[3],field:p[4],timing:true}:{label:'Valor dos itens desta consulta',limit:null,timing:false};}
 const average=a=>a.length?a.reduce((n,v)=>n+v,0)/a.length:null;
 const orderKey=r=>JSON.stringify([r.filial,r.num_pc||r.chave]);
 const productKey=r=>JSON.stringify([norm(r.grupo_codigo||r.grupo_nome),norm(r.descricao)||r.chave]);
 function events(rows,c){const unique=new Map();for(const r of rows){const duration=weekdays(r[c.from],r[c.to]);if(duration==null)continue;const key=JSON.stringify([r.filial,r.num_pc||r.chave,c.to==='data_pre_nota'?productKey(r):r.numero_sc||'',r[c.from],r[c.to]]);if(!unique.has(key))unique.set(key,{row:r,from:r[c.from],to:r[c.to],days:duration});}return [...unique.values()].sort((a,b)=>b.to.localeCompare(a.to)||b.days-a.days);}
 function rank(rows,criterion,mode='suppliers',asOf=D.today()){
  const c={...config(criterion),...(D.definitions[criterion]?{label:D.definitions[criterion].label}:{})},effectiveCriterion=D.definitions[criterion]?criterion:'deadlineScOrder',groups=new Map(),arrival=c.to==='data_pre_nota'?c:{label:'Emissão do pedido → pré-nota',from:'data_pedido',to:'data_pre_nota'};
  for(const r of rows){let key,label;
   if(mode==='products'){key=productKey(r);label=r.descricao||'Material não informado';}
   else if(mode==='buyers'){key=norm(r.comprador)||'unassigned';label=r.comprador||'Não atribuído';}
   else if(mode==='orders'){key=orderKey(r);label='PC '+(r.num_pc||'Não informado');}
   else {key=JSON.stringify([r.fornecedor_codigo||norm(r.fornecedor)]);label=r.fornecedor||'Fornecedor não informado';}
   if(!groups.has(key))groups.set(key,{key,label,rows:[]});groups.get(key).rows.push(r);
  }
  const entries=[...groups.values()].map(g=>{
   const byOrder=new Map();for(const r of g.rows){const d=c.timing?D.resolve(r,effectiveCriterion,r.prazo_data_referencia||asOf).displayDays:null;if(d==null)continue;const key=JSON.stringify([orderKey(r),c.from==='data_sc'?r.numero_sc:r[c.from],r[c.to]]);byOrder.set(key,Math.max(d,byOrder.get(key)??0));}
   const durations=[...byOrder.values()],deliveries=events(g.rows,arrival),outsideValues=c.timing?g.rows.map(r=>D.resolve(r,effectiveCriterion,r.prazo_data_referencia||asOf)).filter(d=>d.outside&&d.displayDays!=null).map(d=>d.displayDays):[],max=outsideValues.length?Math.max(...outsideValues):durations.length?Math.max(...durations):null;
   const value=g.rows.reduce((n,r)=>n+Number(r.valor_total||0),0);
   return {...g,value,orders:new Set(g.rows.map(orderKey)).size,evaluated:durations.length,mean:average(durations),max,deliveries,arrivalMean:average(deliveries.map(e=>e.days)),arrivalMax:deliveries.length?Math.max(...deliveries.map(e=>e.days)):null,lastArrival:deliveries[0]||null,
    outside:c.timing&&g.rows.some(r=>D.resolve(r,effectiveCriterion,r.prazo_data_referencia||asOf).outside),score:c.timing?max:mode==='products'?average(deliveries.map(e=>e.days)):value};
  }).sort((a,b)=>(c.timing?Number(b.outside)-Number(a.outside):0)||(b.score??-Infinity)-(a.score??-Infinity)||a.label.localeCompare(b.label,'pt-BR'));
  const totalValue=rows.reduce((n,r)=>n+Number(r.valor_total||0),0);
  return {config:c,arrival,entries,totalValue};
 }
 return {config,rank,weekdays,events,validDate,deadline:(row,criterion,asOf)=>D.resolve(row,criterion,asOf||row.prazo_data_referencia||D.today())};
});
