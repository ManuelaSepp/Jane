const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),errors=[],writes=[];
const item={datum:'2026-10-01',art:'stunden',id:'',label:'Arbeitsstunden',gesamtCent:10000,bezahltCent:2500,offenCent:7500,altBezahlt:false,zahlungen:[{zahlungsdatum:'2026-10-10',betragCent:2500}]};
const special={datum:'2025-12-01',art:'sonder',id:'special',label:'Sonderleistung: Extra',gesamtCent:4000,bezahltCent:0,offenCent:4000,altBezahlt:false,zahlungen:[]};
const entry={datum:'2026-10-01',stunden:5,beginn:'09:00',ende:'14:00',fahrten:[],sonderleistungen:[],kilometer:0,kmModus:'km',paymentItems:[item],journalLock:true,bezahlt:false};
let overview={ok:true,paymentVersion:1,positionen:[item,special],zahlungen:[{id:'initial_payment',datum:'2026-10-10',betrag:25,positionen:[{datum:item.datum,label:item.label,betragCent:2500}],notiz:'Test'}]};
const init={ok:true,paymentVersion:1,eintraegeJahr:[entry],fahrziele:[],stundenloehne:[{ab:'2026-01-01',lohn:20}],kilometersaetze:[],startAdresse:''};
let failNext=false;
class Loader extends ResourceLoader{
 fetch(url){const u=new URL(url);if(u.hostname==='script.google.com'){
  const action=u.searchParams.get('action'),value=action==='paymentOverview'?overview:action==='writeStatus'?{done:true,ok:true}:init;
  return Promise.resolve(Buffer.from(u.searchParams.get('callback')+'('+JSON.stringify(value)+');'));
 }if(u.hostname==='jane.test'){const file=path.join(root,u.pathname.slice(1));if(fs.existsSync(file))return Promise.resolve(fs.readFileSync(file));}return null;}
}
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(root+'/index.html','utf8'),{url:'https://jane.test/',runScripts:'dangerously',resources:new Loader(),virtualConsole:vc,beforeParse(w){
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.confirm=()=>true;w.fetch=async(url,options)=>{writes.push(new URLSearchParams(options.body));if(failNext){failNext=false;throw new Error('Simulierter Verbindungsabbruch');}return {};};
 w.localStorage.setItem('jane_sonder_vorlagen_v1',JSON.stringify([{name:'Vorlage',betrag:42,historie:[{ab:'2025-01-01',betrag:40}]}]));
}});
const w=dom.window,$=id=>w.document.getElementById(id),evalValue=s=>w.eval(s);
const wait=async predicate=>{for(let i=0;i<100;i++){try{if(predicate())return;}catch(e){if(e.name!=='ReferenceError')throw e;}await new Promise(r=>setTimeout(r,25));}throw new Error('UI timeout: '+errors.join('; '));};
(async()=>{
 await wait(()=>evalValue('state.jahresEintraege.length===1'));
 assert.equal(evalValue('geldWerte(state.jahresEintraege).bezahlt'),25);assert.equal(evalValue('geldWerte(state.jahresEintraege).offen'),75);assert.equal(evalValue('bezahlteStunden(state.jahresEintraege[0])'),1.25);
 const template=w.localStorage.getItem('jane_sonder_vorlagen_v1');
 await evalValue('openPayments()');assert.equal(w.document.querySelectorAll('.payment-amount').length,2);assert.match($('paymentHistory').textContent,/2026-10-10/);
 $('paymentTotal').value='50,00';$('paymentSuggest').click();assert.match($('paymentHint').textContent,/ältesten/);
 $('paymentDate').value='2026-10-13';$('paymentConfirm').click();await wait(()=>!evalValue('paymentDialog.open'));
 assert.equal(writes.length,1);const first=JSON.parse(writes[0].get('payload'));assert.equal(first.betrag,50);assert.equal(first.positionen.find(p=>p.datum==='2025-12-01').betragCent,4000);assert.equal(first.positionen.find(p=>p.datum==='2026-10-01').betragCent,1000);assert.equal(first.datum,'2026-10-13');
 await evalValue('openPayments()');$('paymentTotal').value='200';$('paymentSuggest').click();assert.match($('paymentHint').textContent,/übersteigt/);assert.equal($('paymentConfirm').disabled,true);
 const input=w.document.querySelector('.payment-amount');input.value='10,001';input.dispatchEvent(new w.Event('input'));assert.equal($('paymentConfirm').disabled,true);
 input.value='10';input.dispatchEvent(new w.Event('input'));$('paymentTotal').value='11';$('paymentConfirm').click();await wait(()=>$('paymentHint').textContent.includes('stimmen nicht'));assert.equal(writes.length,1);
 $('paymentTotal').value='10';failNext=true;$('paymentConfirm').click();await wait(()=>$('paymentHint').textContent.includes('Verbindungsabbruch'));
 const failed=JSON.parse(writes[1].get('payload'));$('paymentConfirm').click();await wait(()=>!evalValue('paymentDialog.open'));assert.equal(JSON.parse(writes[2].get('payload')).id,failed.id);
 assert.equal(w.localStorage.getItem('jane_sonder_vorlagen_v1'),template);assert.deepEqual(errors,[]);
 assert.match(evalValue('pdfZahlungen(state.jahresEintraege)'),/Zahlung 2026-10-10/);
 dom.window.close();console.log('Frontend: startup, partial totals, all-year items, suggestions, dated confirmation, POST, validation, idempotent retry, templates and PDF summary passed.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

