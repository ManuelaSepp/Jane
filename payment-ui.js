let paymentOverview=null,paymentPending=null,paymentBusy=false;
const paymentDialog=document.createElement('dialog');
paymentDialog.style.cssText='max-width:850px;width:92%;max-height:90vh;overflow:auto;border:1px solid #ccd3d9;border-radius:14px;padding:20px';
paymentDialog.innerHTML=`<h2>Zahlungen erfassen</h2><p>Voll- und Teilzahlungen für einzelne Leistungen oder eine gesamte Überweisung. Offene Posten aus allen Jahren werden berücksichtigt.</p>
<label>Zahlungsdatum <input id="paymentDate" type="date"></label>
<label>Gesamtüberweisung (€) <input id="paymentTotal" inputmode="decimal" placeholder="z. B. 150,00"></label>
<label>Notiz / Bankreferenz <input id="paymentNote" maxlength="500"></label>
<p><button id="paymentSuggest" type="button">Passende Posten vorschlagen</button> <button id="paymentFill" type="button">Ausgewählte Restbeträge übernehmen</button></p>
<p id="paymentHint" role="status"></p><div id="paymentAlternatives"></div><div id="paymentItems"></div>
<p id="paymentSum"></p><p><button id="paymentConfirm" type="button">Zuordnung prüfen und bestätigen</button> <button id="paymentClose" type="button">Schließen</button></p>
<h3>Zahlungsjournal</h3><div id="paymentHistory"></div>`;
document.body.appendChild(paymentDialog);
const paymentLaunch=document.createElement('button');paymentLaunch.type='button';paymentLaunch.textContent='Zahlung / Überweisung erfassen';
$('zahlungBearbeiten').before(paymentLaunch);paymentLaunch.onclick=()=>openPayments();
$('paymentClose').onclick=()=>{if(!paymentBusy)paymentDialog.close();};
paymentDialog.addEventListener('cancel',e=>{if(paymentBusy)e.preventDefault();});
$('paymentSuggest').onclick=paymentSuggest;
$('paymentFill').onclick=()=>{for(const input of paymentInputs()){const check=input.parentElement.querySelector('input[type=checkbox]');if(check.checked)input.value=(Number(input.dataset.rest)/100).toFixed(2).replace('.',',');else input.value='';}paymentUpdateSum(true);};
$('paymentConfirm').onclick=confirmPayment;
function paymentInputs(){return [...$('paymentItems').querySelectorAll('.payment-amount')];}
function paymentParse(s){const v=String(s).trim();if(!/^\d+(?:[.,]\d{1,2})?$/.test(v))throw new Error('Bitte einen positiven Betrag mit höchstens zwei Nachkommastellen eingeben.');const c=Math.round(Number(v.replace(',','.'))*100);if(!Number.isSafeInteger(c)||c<=0||c>1000000000)throw new Error('Ungültiger Betrag.');return c;}
async function openPayments(filter=null){
 paymentOverview=null;paymentPending=null;$('paymentItems').replaceChildren();$('paymentHistory').replaceChildren();$('paymentAlternatives').replaceChildren();
 $('paymentDate').value=iso(new Date());$('paymentTotal').value='';$('paymentNote').value='';$('paymentHint').textContent='Offene Posten werden geladen …';$('paymentConfirm').disabled=true;
 if(!paymentDialog.open)paymentDialog.showModal();
 try{
  const r=await jsonp({action:'paymentOverview'});if(!r.ok||r.paymentVersion!==1)throw new Error(r.message||'Bitte zuerst das neue Backend bereitstellen.');
  paymentOverview=r;
  const open=r.positionen.filter(p=>p.offenCent===null||p.offenCent>0);
  for(const p of open){
   const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center;border-top:1px solid #ddd;padding:8px 0;flex-wrap:wrap';
   const check=document.createElement('input');check.type='checkbox';check.disabled=p.offenCent===null;
   const text=document.createElement('span');text.style.flex='1';text.textContent=p.datum+' · '+p.label+' · '+(p.offenCent===null?'Vergütung fehlt':euro(p.offenCent/100)+' offen; '+euro(p.bezahltCent/100)+' bezahlt');
   const input=document.createElement('input');input.className='payment-amount';input.inputMode='decimal';input.placeholder='Teilbetrag €';input.style.width='130px';input.disabled=p.offenCent===null;input.dataset.key=JSON.stringify([p.datum,p.art,p.id]);input.dataset.rest=p.offenCent;input.setAttribute('aria-label','Zahlbetrag für '+p.datum+' '+p.label);
   check.setAttribute('aria-label','Restbetrag auswählen für '+p.datum+' '+p.label);
   if(filter&&filter.some(x=>x.datum===p.datum&&x.art===p.art&&(x.id||'')===p.id)){check.checked=true;input.value=(p.offenCent/100).toFixed(2).replace('.',',');}
   input.oninput=()=>{paymentUpdateSum();};
   row.append(check,text,input);$('paymentItems').appendChild(row);
  }
  if(!open.length)$('paymentItems').textContent='Keine offenen Posten.';
  for(const z of [...r.zahlungen].reverse()){
   const row=document.createElement('div');row.style.marginBottom='12px';
   row.textContent=z.datum+' · '+euro(z.betrag)+(z.notiz?' · '+z.notiz:'');
   for(const p of z.positionen){const line=document.createElement('div');line.textContent=p.datum+' · '+p.label+' · '+euro(p.betragCent/100);row.appendChild(line);}
   $('paymentHistory').appendChild(row);
  }
  if(!r.zahlungen.length)$('paymentHistory').textContent='Noch keine datierten Zahlungen. Bestehende Bezahlt-Markierungen bleiben erhalten; ihr Zahlungsdatum ist unbekannt.';
  $('paymentHint').textContent='Teilbeträge direkt eingeben oder einen Überweisungsbetrag vorschlagen lassen.';paymentUpdateSum(!!filter);
 }catch(e){$('paymentHint').textContent=e.message;}
}
function paymentUpdateSum(fill=false){
 try{
  const sum=paymentInputs().reduce((s,x)=>s+(x.value.trim()?paymentParse(x.value):0),0);
  $('paymentSum').textContent='Zugeordnet: '+euro(sum/100);if(fill)$('paymentTotal').value=(sum/100).toFixed(2).replace('.',',');
  $('paymentConfirm').disabled=!paymentOverview||sum===0||paymentBusy;
 }catch(e){$('paymentSum').textContent=e.message;$('paymentConfirm').disabled=true;}
}
function paymentApply(allocations){
 for(const input of paymentInputs()){
  const item=allocations.find(x=>JSON.stringify([x.datum,x.art,x.id])===input.dataset.key);
  input.value=item?(item.betragCent/100).toFixed(2).replace('.',','):'';
  input.parentElement.querySelector('input[type=checkbox]').checked=!!item;
 }paymentUpdateSum();
}
function paymentSuggest(){
 if(!paymentOverview)return;
 try{
  const p=JanePayments.propose(paymentOverview.positionen,paymentParse($('paymentTotal').value));$('paymentAlternatives').replaceChildren();
  if(p.kind==='excess'){paymentApply([]);$('paymentHint').textContent='Überweisung übersteigt die bekannten offenen Posten um '+euro(p.restCent/100)+'. Bitte Betrag und fehlende Posten prüfen.';return;}
  $('paymentHint').textContent=p.kind==='exact'?'Passende volle Restbeträge gefunden. Mehrere mögliche Zuordnungen bitte prüfen.':'Vorschlag nach ältesten offenen Posten, mit Teilzahlung auf die letzte Leistung. Keine eindeutige volle Kombination gefunden.';
  if(p.limited)$('paymentHint').textContent+=' Die Kombinationssuche wurde begrenzt.';
  paymentApply(p.alternatives[0]);
  p.alternatives.forEach((a,i)=>{const b=document.createElement('button');b.type='button';b.textContent='Vorschlag '+(i+1);b.onclick=()=>paymentApply(a);$('paymentAlternatives').appendChild(b);});
 }catch(e){$('paymentHint').textContent=e.message;}
}
async function confirmPayment(){
 if(paymentBusy||!paymentOverview)return;
 try{
  const date=$('paymentDate').value;if(!date||iso(ausIso(date))!==date)throw new Error('Bitte ein gültiges Zahlungsdatum eingeben.');
  const target=paymentParse($('paymentTotal').value);
  const positionen=paymentInputs().filter(x=>x.value.trim()).map(x=>{
   const [datum,art,id]=JSON.parse(x.dataset.key),p=paymentOverview.positionen.find(p=>p.datum===datum&&p.art===art&&p.id===id),betragCent=paymentParse(x.value);
   if(!p||betragCent>p.offenCent)throw new Error('Teilbetrag überschreitet offenen Rest.');
   return {datum,art,id,betragCent,gesamtCent:p.gesamtCent};
  });
  if(positionen.reduce((s,p)=>s+p.betragCent,0)!==target)throw new Error('Zuordnungen stimmen nicht mit der Gesamtüberweisung überein.');
  const review=positionen.map(p=>p.datum+' · '+paymentOverview.positionen.find(x=>x.datum===p.datum&&x.art===p.art&&x.id===p.id).label+' · '+euro(p.betragCent/100)).join('\n');
  if(!confirm('Zahlung vom '+date+' über '+euro(target/100)+' buchen?\n\n'+review))return;
  const data={datum:date,betrag:target/100,positionen,notiz:$('paymentNote').value.trim()};
  const signature=JSON.stringify(data);
  if(paymentPending&&paymentPending.signature!==signature)throw new Error('Vorherige Zahlung noch nicht bestätigt. Mit unveränderten Angaben erneut versuchen oder schließen und Journal neu laden.');
  if(!paymentPending)paymentPending={signature,payload:{...data,id:'payment_'+crypto.randomUUID()}};
  paymentBusy=true;for(const input of paymentDialog.querySelectorAll('input,button'))input.disabled=true;
  await schreiben('recordPayment',paymentPending.payload);
  paymentPending=null;paymentDialog.close();await ladeJahr(state.kalenderDatum.getFullYear(),true);zeige('Zahlung mit Datum und Zuordnung gespeichert.','success');
 }catch(e){$('paymentHint').textContent=e.message+' Bei ausbleibender Bestätigung mit unveränderter Zuordnung erneut versuchen.';}
 finally{paymentBusy=false;for(const input of paymentDialog.querySelectorAll('input,button'))input.disabled=false;for(const input of paymentInputs())if(input.dataset.rest==='null'){input.disabled=true;input.parentElement.querySelector('input[type=checkbox]').disabled=true;}paymentUpdateSum();}
}
