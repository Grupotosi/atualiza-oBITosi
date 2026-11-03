(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TosiDeadlines=api;})(globalThis,function(){
 'use strict';
 const Calendar=typeof module==='object'&&module.exports?require('./business-calendar'):globalThis.TosiBusinessCalendar;
 const norm=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
 function weekdays(a,b){return Calendar.weekdays(a,b);}
 const definitions={
  advanceDeadlineScOrder:{phase:'scOrder',limit:5,label:"Emissao Solic. → Emissao"},
  advanceDeadlineReportPayment:{phase:'reportPayment',limit:5,label:"Data de geração do relatório → Vencto. Titulo"},
  advanceDeadlinePaymentPrenote:{phase:'paymentPrenote',limit:7,label:"Vencto. Titulo → Dt. Pre-Nota"},
  advanceDeadlineScPrenote:{phase:'scPrenote',limit:15,label:"Emissao Solic. → Dt. Pre-Nota"},
  termDeadlineScOrder:{phase:'scOrder',limit:5,label:"Emissao Solic. → Emissao"},
  termDeadlineOrderPrenote:{phase:'orderPrenote',limit:7,label:"Emissao → Dt. Pre-Nota"},
  termDeadlineScPrenote:{phase:'scPrenote',limit:7,label:"Emissao Solic. → Dt. Pre-Nota"},
  deadlineScOrder:{phase:'scOrder',limit:5,label:"Emissao Solic. → Emissao"},
  deadlineOrderPayment:{phase:'orderPayment',limit:5,label:"Emissao → Vencto. Titulo"},
  deadlinePaymentPrenote:{phase:'paymentPrenote',limit:7,label:"Vencto. Titulo → Dt. Pre-Nota"},
  deadlineScPrenote:{phase:'scPrenote',limit:15,label:"Emissao Solic. → Dt. Pre-Nota"}
 };
 const cancelled=r=>/cancel|eliminad/.test(norm(r.status_pedido));
 const partial=r=>/parcial/.test(norm(r.status_pedido));
 const isPaid=r=>norm(r.status_titulo)==='pago'||validDate(r.data_pagamento_real);
 function delivered(r){const s=norm(r.status_pedido);if(partial(r)||/pendente/.test(s))return false;return /atendido|usado em pre.nota/.test(s)||validDate(r.data_pre_nota);}
 function resolve(row,criterion,asOf=today()){
  const config=definitions[criterion];if(!config)throw Error('Indicador desconhecido: '+criterion);
  const r=row||{},result={criterion,limit:config.limit,days:null,displayDays:null,from:null,to:null,displayFrom:null,displayTo:null,pending:false,overdueDays:null,paymentOverdue:false,displayBasis:'elapsed',reason:'',excluded:false,calendar:Calendar.location};
  if(cancelled(r)){result.excluded=true;result.reason='Pedido cancelado ou eliminado';return result;}
  const fields={scOrder:['data_sc','data_pedido'],reportPayment:['data_relatorio','data_vencimento'],orderPayment:['data_pedido','data_vencimento'],paymentPrenote:['data_vencimento','data_pre_nota'],orderPrenote:['data_pedido','data_pre_nota'],scPrenote:['data_sc','data_pre_nota']}[config.phase];
  const from=r[fields[0]],to=r[fields[1]];
  Object.assign(result,{from:validDate(from)?from:null,to:validDate(to)?to:null,displayFrom:validDate(from)?from:null,displayTo:validDate(to)?to:null});
  if(!validDate(from))result.reason=fields[0]==='data_relatorio'?'Data de geração do relatório não registrada':'Campo inicial ausente ou inválido: '+fields[0];
  else if(!validDate(to))result.reason='Campo final ausente ou inválido: '+fields[1];
  else if(to<from)result.reason='Datas invertidas: conferir campos de origem';
  else result.days=weekdays(from,to);
  result.displayDays=result.days;result.outside=result.days!=null&&result.days>config.limit;
  return result;
 }
 function summarize(rows,criterion,asOf=today()){
  const groups=new Map();let itemCount=0;rows.forEach((row,index)=>{const d=resolve(row,criterion,asOf);if(d.excluded)return;itemCount++;const key=JSON.stringify([row.filial,row.num_pc||row.chave||'missing-'+index]);if(!groups.has(key))groups.set(key,{durations:new Map(),missing:false});const g=groups.get(key);if(d.days==null)g.missing=true;else g.durations.set(JSON.stringify([d.from,d.to]),d.days);});
  const orders=[...groups.values()].map(g=>({...g,mean:g.durations.size?[...g.durations.values()].reduce((a,b)=>a+b,0)/g.durations.size:null})),valid=orders.filter(g=>g.mean!=null),mean=valid.length?valid.reduce((a,b)=>a+b.mean,0)/valid.length:null,days=mean==null?null:Math.ceil(mean),limit=definitions[criterion].limit,missing=orders.filter(g=>g.mean==null).length,partial=valid.filter(g=>g.missing).length;
  return {limit,days,mean,aggregation:'mean_per_order',displayBasis:'elapsed',overdueSource:null,items:itemCount,orders:orders.length,evaluated:valid.length,outside:valid.filter(g=>g.mean>limit).length,inside:valid.filter(g=>g.mean<=limit).length,maxInside:null,pending:0,missing,partial,overduePayments:0,state:days==null?'neutral':days>limit?'bad':'ok',asOf};
 }
 function detail(row,criterion,asOf=today()){
  const d=resolve(row,criterion,asOf);return {...row,prazo_inicio:d.displayFrom,prazo_fim:d.displayTo,prazo_em_andamento:d.pending,prazo_base:d.displayBasis==='overdue'?d.overdueSource==='programacao'?'Atraso desde pagamento programado':'Atraso desde vencimento':'Duração da etapa',prazo_motivo:d.reason,dias_atraso_pagamento:d.overdueDays,prazo_calculado:d.displayDays,prazo_fora_meta:d.outside,prazo_data_referencia:asOf};
 }
 function enrich(row,asOf=today()){
  return {...row,prazo_sc_pedido:resolve(row,'deadlineScOrder',asOf).days,prazo_pedido_pagamento:resolve(row,'deadlineOrderPayment',asOf).days,prazo_pagamento_pre_nota:resolve(row,'deadlinePaymentPrenote',asOf).days,prazo_total:resolve(row,'deadlineScPrenote',asOf).days};
 }
 return {today,validDate,weekdays,definitions,cancelled,partial,isPaid,delivered,resolve,summarize,detail,enrich};
});
