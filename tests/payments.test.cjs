const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {propose}=require('../payment-matching.js');
class Sheet{
 constructor(rows=[]){this.rows=rows;this.writes=0;}
 getLastRow(){return this.rows.length;}
 getRange(row,col,n=1,m=1){const sheet=this;return {
  getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[row+i-1]?.[col+j-1]??'')),
  setValues(values){sheet.writes++;values.forEach((r,i)=>{sheet.rows[row+i-1]??=[];r.forEach((v,j)=>sheet.rows[row+i-1][col+j-1]=v);});return this;},
  getValue:()=>sheet.rows[row-1]?.[col-1]??'',setValue(v){return this.setValues([[v]]);},setNumberFormat(){return this;}
 };}
}
function fixture(){
 const row=Array(21).fill('');Object.assign(row,{0:'entry-1',1:'2026-10-01',2:'09:00',3:'14:00',4:5,9:20,12:false,15:JSON.stringify([{id:'special-1',name:'Extra',betrag:40,bezahlt:false,fixbetrag:null}]),17:false,19:'km'});
 const sheets={Arbeitszeiten:new Sheet([Array(21).fill('header'),row]),Fahrten:new Sheet([Array(8).fill('header'),['trip-1','2026-10-01','dest','Ziel',20,'',false,'']]),Stundenlohn:new Sheet([['Gültig_ab','Lohn',''],['2026-01-01',20,'']]),Kilometerpauschale:new Sheet([['Gültig_ab','Satz',''],['2026-01-01',0.3,'']]),Fahrziele:new Sheet([Array(7).fill('')]),Einstellungen:new Sheet([['','']])};
 const props={},locks={acquired:0,released:0};
 const ctx={console,SpreadsheetApp:{getActive:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet())}),flush(){}},Utilities:{formatDate:(d,tz,fmt)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return fmt==='yyyy-MM-dd'?`${y}-${m}-${day}`:'';}},LockService:{getScriptLock:()=>({waitLock(){locks.acquired++;},releaseLock(){locks.released++;}})},PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>props[k]=v,getProperty:k=>props[k]})},ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../backend/Code.gs','utf8')+'\n'+fs.readFileSync(__dirname+'/../backend/Payments.gs','utf8'),ctx);
 const overview=()=>JSON.parse(JSON.stringify(ctx.paymentOverview_()));
 const post=(action,p)=>JSON.parse(ctx.doPost({parameter:{action,payload:JSON.stringify(p),requestId:'request_123456789'}}).text);
 const payload=(amount=25,id='payment_123456789',art='stunden')=>{const p=overview().positionen.find(p=>p.art===art);return{id,datum:'2026-10-12',betrag:amount,notiz:'Bank 123',positionen:[{datum:p.datum,art:p.art,id:p.id,betragCent:Math.round(amount*100),gesamtCent:p.gesamtCent}]};};
 return {ctx,sheets,overview,post,payload,locks};
}
test('partial and full dated payments preserve original rows, rates and old flags',()=>{
 const f=fixture(),original=JSON.stringify(f.sheets);let p=f.payload();assert.equal(f.post('recordPayment',p).ok,true);
 assert.equal(f.overview().positionen.find(x=>x.art==='stunden').offenCent,7500);
 assert.equal(f.ctx.init_(2026).eintraegeJahr[0].bezahlt,false);
 assert.equal(f.ctx.init_(2026).eintraegeJahr[0].journalLock,true);
 for(const art of ['stunden','fahrt','sonder']){const item=f.overview().positionen.find(x=>x.art===art);assert.equal(f.post('recordPayment',f.payload(item.offenCent/100,'payment_rest_'+art,art)).ok,true);}
 assert.ok(f.overview().positionen.every(x=>x.offenCent===0));
 const journal=f.sheets.Zahlungen;delete f.sheets.Zahlungen;assert.equal(JSON.stringify(f.sheets),original);f.sheets.Zahlungen=journal;
 assert.equal(f.overview().zahlungen[0].datum,'2026-10-12');assert.equal(f.locks.acquired,f.locks.released);
});
test('same payment retry is idempotent; reused ID with different data rejected',()=>{
 const f=fixture(),p=f.payload();assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.sheets.Zahlungen.getLastRow(),2);p.notiz='changed';assert.equal(f.post('recordPayment',p).ok,false);
});
test('one bank transfer allocates three service kinds in a single row',()=>{
 const f=fixture(),items=f.overview().positionen;
 const p={id:'payment_bank_123456',datum:'2026-10-13',betrag:146,positionen:items.map(x=>({...x,betragCent:x.offenCent})),notiz:'Gesamtüberweisung'};
 assert.equal(f.post('recordPayment',p).ok,true);assert.equal(f.sheets.Zahlungen.getLastRow(),2);assert.equal(f.overview().zahlungen[0].positionen.length,3);assert.ok(f.overview().positionen.every(x=>x.offenCent===0));
});
test('flat mileage avoids trip double counting and missing rates prevent booking',()=>{
 const f=fixture();f.sheets.Arbeitszeiten.rows[1][19]='pauschal';f.sheets.Arbeitszeiten.rows[1][20]=15;
 const km=f.overview().positionen.filter(x=>x.art==='km'||x.art==='fahrt');assert.equal(km.length,1);assert.equal(km[0].gesamtCent,1500);
 assert.equal(f.post('recordPayment',f.payload(10,'payment_flat_1234','km')).ok,true);assert.equal(f.overview().positionen.find(x=>x.art==='km').offenCent,500);
 const g=fixture();g.sheets.Stundenlohn.rows.length=1;const p=g.payload();assert.equal(p.positionen[0].gesamtCent,null);assert.equal(g.post('recordPayment',p).ok,false);assert.equal(g.sheets.Zahlungen,undefined);
});
test('overpayment, stale valuation, duplicate allocation, total mismatch and impossible date write nothing',()=>{
 for(const modify of [p=>p.positionen[0].betragCent=10001,p=>p.positionen[0].gesamtCent++,p=>p.positionen.push(p.positionen[0]),p=>p.betrag=26,p=>p.datum='2026-02-30',p=>p.betrag=25.001,p=>p.positionen[0].betragCent=-1]){
  const f=fixture(),p=f.payload();modify(p);assert.equal(f.post('recordPayment',p).ok,false);assert.equal(f.sheets.Zahlungen,undefined);
 }
});
test('concurrent stale remainder cannot overpay and partial valuation survives rate change',()=>{
 const f=fixture(),stale=f.payload(80,'payment_stale_123');assert.equal(f.post('recordPayment',f.payload()).ok,true);assert.equal(f.post('recordPayment',stale).ok,false);
 f.sheets.Stundenlohn.rows[1][1]=30;assert.equal(f.overview().positionen.find(x=>x.art==='stunden').gesamtCent,10000);
});
test('paid journal day protected from update/delete/legacy resets',()=>{
 const f=fixture();f.post('recordPayment',f.payload());
 for(const [a,p] of [['update',{originalDatum:'2026-10-01'}],['delete',{datum:'2026-10-01'}],['setLeistungBezahlt',{datum:'2026-10-01',art:'stunden',bezahlt:false}],['setBezahlt',{daten:['2026-10-01'],bezahlt:false}]])assert.equal(f.post(a,p).ok,false);
});
test('legacy paid item remains paid with unknown date; cross-year open items included',()=>{
 const f=fixture();f.sheets.Arbeitszeiten.rows[1][12]=true;f.sheets.Arbeitszeiten.rows[1][16]=100;
 assert.equal(f.overview().positionen.find(x=>x.art==='stunden').offenCent,0);assert.equal(f.overview().positionen.find(x=>x.art==='stunden').zahlungen.length,0);
 const row=[...f.sheets.Arbeitszeiten.rows[1]];row[0]='old';row[1]='2025-01-01';row[12]=false;row[15]='[]';f.sheets.Arbeitszeiten.rows.push(row);assert.ok(f.overview().positionen.some(p=>p.datum==='2025-01-01'));
});
test('sum search handles alternatives, partial fallback, excess and cents without reusing an item',()=>{
 const items=[{id:'a',offenCent:100},{id:'b',offenCent:100},{id:'c',offenCent:200}];
 const p=propose(items,200);assert.equal(p.kind,'exact');assert.equal(p.alternatives.length,2);for(const a of p.alternatives){assert.equal(new Set(a.map(x=>x.id)).size,a.length);assert.equal(a.reduce((s,x)=>s+x.betragCent,0),200);}
 assert.equal(propose(items,250).kind,'oldest');assert.equal(propose(items,401).restCent,1);assert.throws(()=>propose(items,0));
 assert.equal(propose([{offenCent:10},{offenCent:20}],30).kind,'exact');
});
test('bounded search completes and says when limited',()=>{
 const items=Array.from({length:25},(_,i)=>({id:String(i),offenCent:2**i}));const p=propose(items,20000000);assert.equal(p.limited,true);assert.equal(p.alternatives[0].reduce((s,x)=>s+x.betragCent,0),20000000);
});
