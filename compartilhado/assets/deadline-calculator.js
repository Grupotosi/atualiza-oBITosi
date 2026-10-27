(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TosiDeadlines=api;})(globalThis,function(){
 'use strict';
 const norm=v=>String(v??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
 function weekdays(a,b){if(!validDate(a)||!validDate(b)||b<a)return null;const start=new Date(a+'T12:00:00Z'),count=Math.round((Date.parse(b+'T12:00:00Z')-start.getTime())/86400000);let days=Math.floor(count/7)*5;for(let i=1;i<=count%7;i++){const day=(start.getUTCDay()+i)%7;if(day!==0&&day!==6)days++;}return days;}
 const definitions={
  advanceDeadlineScOrder:{phase:'scOrder',limit:5,label:'Emissão SC → emissão do pedido ou hoje'},
  advanceDeadlineReportPayment:{phase:'reportPayment',limit:5,label:'Relatório → pagamento efetivo ou hoje; títulos vencidos sinalizados'},
  advanceDeadlinePaymentPrenote:{phase:'paymentPrenote',limit:7,label:'Pagamento efetivo → conclusão da entrega ou hoje'},
  advanceDeadlineScPrenote:{phase:'scPrenote',limit:15,label:'Emissão SC → conclusão da entrega ou hoje'},
  termDeadlineScOrder:{phase:'scOrder',limit:5,label:'Emissão SC → emissão do pedido ou hoje'},
  termDeadlineOrderPrenote:{phase:'orderPrenote',limit:7,label:'Emissão do pedido → conclusão da entrega ou hoje'},
  termDeadlineScPrenote:{phase:'scPrenote',limit:7,label:'Emissão SC → conclusão da entrega ou hoje'},
  deadlineScOrder:{phase:'scOrder',limit:5,label:'Emissão SC → emissão do pedido ou hoje'},
  deadlineOrderPayment:{phase:'orderPayment',limit:5,label:'Emissão do pedido → pagamento efetivo ou hoje'},
  deadlinePaymentPrenote:{phase:'paymentPrenote',limit:7,label:'Pagamento efetivo → conclusão da entrega ou hoje'},
  deadlineScPrenote:{phase:'scPrenote',limit:15,label:'Emissão SC → conclusão da entrega ou hoje'}
 };
 const cancelled=r=>/cancel|eliminad/.test(norm(r.status_pedido));
 const partial=r=>/parcial/.test(norm(r.status_pedido));
 const isPaid=r=>norm(r.status_titulo)==='pago'||validDate(r.data_pagamento_real);
 function delivered(r){const s=norm(r.status_pedido);if(partial(r)||/pendente/.test(s))return false;return /atendido|usado em pre.nota/.test(s)||validDate(r.data_pre_nota);}
 function resolve(row,criterion,asOf=today()){
  const config=definitions[criterion];if(!config)throw Error('Indicador de prazo desconhecido: '+criterion);
  const r=row||{},result={criterion,limit:config.limit,days:null,displayDays:null,from:null,to:null,displayFrom:null,displayTo:null,pending:false,overdueDays:null,paymentOverdue:false,displayBasis:'elapsed',reason:'',excluded:false};
  if(cancelled(r)){result.excluded=true;result.reason='Pedido cancelado ou eliminado';return result;}
  if(!validDate(asOf)){result.reason='Data de referência inválida';return result;}
  const paid=isPaid(r),complete=delivered(r),commitments=[r.data_pagamento_programada,r.data_vencimento].filter(validDate).sort(),due=commitments[0];
  result.overdueSource=due&&due===r.data_pagamento_programada?'programacao':'vencimento';
  if(!paid&&validDate(due)&&due<asOf){result.overdueDays=weekdays(due,asOf);result.paymentOverdue=true;}
  let from,to,pending=false;
  switch(config.phase){
   case 'scOrder':from=r.data_sc;pending=!validDate(r.data_pedido);to=pending?asOf:r.data_pedido;break;
   case 'reportPayment':from=r.data_relatorio;pending=!paid;to=pending?asOf:r.data_pagamento_real;break;
   case 'orderPayment':from=r.data_pedido;pending=!paid;to=pending?asOf:r.data_pagamento_real;break;
   case 'paymentPrenote':from=paid?r.data_pagamento_real:null;pending=paid&&!complete;to=complete?r.data_pre_nota:pending?asOf:null;break;
   case 'orderPrenote':from=r.data_pedido;pending=!complete;to=pending?asOf:r.data_pre_nota;break;
   case 'scPrenote':from=r.data_sc;pending=!complete;to=pending?asOf:r.data_pre_nota;break;
  }
  Object.assign(result,{from:validDate(from)?from:null,to:validDate(to)?to:null,pending});
  if(!validDate(from))result.reason=config.phase==='reportPayment'?'Relatório não registrado':config.phase==='paymentPrenote'?'Pagamento efetivo não registrado':'Data inicial não registrada';
  else if(!validDate(to))result.reason=paid&&/Payment$/.test(config.phase)?'Data do pagamento efetivo não registrada':'Data de conclusão não registrada';
  else if(from>asOf||to>asOf)result.reason='Data efetiva futura: conferir origem';
  else if(to<from)result.reason='Datas invertidas: conferir origem';
  else result.days=weekdays(from,to);
  Object.assign(result,{displayDays:result.days,displayFrom:result.from,displayTo:result.to});
  // A missing report never becomes a fictitious zero-day SLA. Payment overdue
  // is independently observable from the due date, and explicitly labelled.
  if(config.phase==='reportPayment'&&result.paymentOverdue&&(result.days==null||result.overdueDays>result.days))Object.assign(result,{displayDays:result.overdueDays,displayFrom:due,displayTo:asOf,displayBasis:'overdue'});
  result.outside=result.displayDays!=null&&(result.days>config.limit||(config.phase==='reportPayment'&&result.paymentOverdue));
  if(config.phase!=='reportPayment')result.outside=result.days!=null&&result.days>config.limit;
  return result;
 }
 function summarize(rows,criterion,asOf=today()){
  const results=rows.map(r=>resolve(r,criterion,asOf)).filter(r=>!r.excluded),values=results.filter(r=>r.displayDays!=null),outside=values.filter(r=>r.outside),inside=values.filter(r=>!r.outside),selected=[...(outside.length?outside:inside)].sort((a,b)=>b.displayDays-a.displayDays)[0],limit=definitions[criterion].limit;
  return {limit,days:selected?.displayDays??null,displayBasis:selected?.displayBasis||'elapsed',overdueSource:selected?.overdueSource||null,items:results.length,evaluated:values.length,outside:outside.length,inside:inside.length,maxInside:inside.length?Math.max(...inside.map(r=>r.displayDays)):null,pending:results.filter(r=>r.pending).length,missing:results.filter(r=>r.days==null).length,overduePayments:definitions[criterion].phase==='reportPayment'?results.filter(r=>r.paymentOverdue).length:0,state:outside.length?'bad':!values.length?'neutral':inside.some(r=>r.displayDays>=limit-1)?'warn':'ok',asOf};
 }
 function detail(row,criterion,asOf=today()){
  const d=resolve(row,criterion,asOf);return {...row,prazo_inicio:d.displayFrom,prazo_fim:d.displayTo,prazo_em_andamento:d.pending,prazo_base:d.displayBasis==='overdue'?d.overdueSource==='programacao'?'Atraso desde pagamento programado':'Atraso desde vencimento':'Duração da etapa',prazo_motivo:d.reason,dias_atraso_pagamento:d.overdueDays,prazo_calculado:d.displayDays,prazo_fora_meta:d.outside,prazo_data_referencia:asOf};
 }
 function enrich(row,asOf=today()){
  return {...row,prazo_sc_pedido:resolve(row,'deadlineScOrder',asOf).days,prazo_pedido_pagamento:resolve(row,'deadlineOrderPayment',asOf).days,prazo_pagamento_pre_nota:resolve(row,'deadlinePaymentPrenote',asOf).days,prazo_total:resolve(row,'deadlineScPrenote',asOf).days};
 }
 return {today,validDate,weekdays,definitions,cancelled,partial,isPaid,delivered,resolve,summarize,detail,enrich};
});
