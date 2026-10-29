(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TosiBusinessCalendar=api;})(globalThis,function(){
 'use strict';
 const location='Cabreúva/SP';
 const source='https://www.dosp.com.br/exibe_do.php?i=NzU4OTE1';
 const cache=new Map();
 function easter(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return new Date(Date.UTC(year,month-1,day,12));}
 function holidays(year){if(cache.has(year))return cache.get(year);const fixed=['01-01','03-24','04-21','05-01','07-09','09-07','09-15','10-12','11-02','11-15','11-20','12-25'],set=new Set(fixed.map(d=>`${year}-${d}`));for(const delta of [-2,60]){const date=easter(year);date.setUTCDate(date.getUTCDate()+delta);set.add(date.toISOString().slice(0,10));}cache.set(year,set);return set;}
 function isHoliday(date){return /^\d{4}-\d{2}-\d{2}$/.test(date||'')&&holidays(Number(date.slice(0,4))).has(date);}
 // Intervals are (start, end]: the initial day is not counted.
 // No municipal optional days or company vacation periods are assumed.
 function weekdays(start,end){if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||end<start)return null;const a=new Date(start+'T12:00:00Z'),b=new Date(end+'T12:00:00Z');if(isNaN(a)||isNaN(b)||a.toISOString().slice(0,10)!==start||b.toISOString().slice(0,10)!==end)return null;let n=0;while(a<b){a.setUTCDate(a.getUTCDate()+1);if(![0,6].includes(a.getUTCDay())&&!isHoliday(a.toISOString().slice(0,10)))n++;}return n;}
 return {location,source,holidays,isHoliday,weekdays};
});
