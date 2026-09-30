const $=id=>document.getElementById(id);
const state={
  eintraege:[],fahrziele:[],kalenderDatum:new Date(),ausgewaehlt:null,originalDatum:null,
  cacheJahr:null,jahresEintraege:[],startAdresse:"",routeTmp:null,tooltipBlockDatum:null,
  zahlungsModus:false,zahlAuswahl:new Set(),stundenloehne:[],aktuelleFahrten:[]
};
let jsonpSequenz=0,ladeSequenz=0;

const form=$("entryForm"),datum=$("datum"),beginn=$("beginn"),ende=$("ende"),abwesenheit=$("abwesenheit"),fahrziel=$("fahrziel"),notiz=$("notiz"),meldung=$("meldung");
const save=$("saveButton"),update=$("updateButton"),del=$("deleteButton"),copyTime=$("copyTimeButton"),cancel=$("cancelButton"),buttonRow=$("buttonRow");

window.onload=init;
form.onsubmit=speichern;
update.onclick=aktualisieren;
del.onclick=loeschen;
copyTime.onclick=arbeitszeitKopieren;
cancel.onclick=()=>resetForm();
beginn.oninput=stundenBerechnen; ende.oninput=stundenBerechnen;
beginn.addEventListener("blur",()=>zeitFormatieren(beginn));
ende.addEventListener("blur",()=>zeitFormatieren(ende));
abwesenheit.onchange=handleAbwesenheit;
fahrziel.onchange=renderFahrtInfo;
$("fahrtHinzufuegen").onclick=fahrtHinzufuegen;
$("prevMonth").onclick=()=>monatWechseln(-1);
$("nextMonth").onclick=()=>monatWechseln(1);
datum.onchange=datumGeaendert;
$("startSpeichern").onclick=startadresseSpeichern;
$("streckeBerechnen").onclick=streckeBerechnen;
$("zielSpeichern").onclick=fahrzielSpeichern;
$("exportExcel").onclick=exportExcel;
$("exportPdf").onclick=exportPdf;
$("zahlungBearbeiten").onclick=zahlungBearbeitenStart;
$("zahlungBezahlt").onclick=()=>zahlungsstatusSetzen(true);
$("zahlungOffen").onclick=()=>zahlungsstatusSetzen(false);
$("zahlungAbbrechen").onclick=zahlungBearbeitenEnde;
$("lohnSpeichern").onclick=stundenlohnSpeichern;
$("lohnMonat").onchange=renderStundenlohn;

function pruefeKonfiguration(){
  if(typeof SCRIPT_URL!=="string"||!SCRIPT_URL.trim()){
    zeige("Noch nicht verbunden: Bitte zuerst in config.js die neue Apps-Script-Web-App-URL eintragen.","error");
    return false;
  }
  return true;
}

async function init(){
  datum.value=iso(new Date());
  state.ausgewaehlt=datum.value;
  state.kalenderDatum=ausIso(datum.value);
  $("lohnMonat").value=datum.value.slice(0,7);
  stundenBerechnen();

  // Kalender sofort anzeigen. Die gespeicherten Daten werden danach geladen.
  renderLeerzustand();

  if(pruefeKonfiguration()){
    $("weekBox").textContent="Daten werden geladen …";
    await ladeJahr(state.kalenderDatum.getFullYear());
  }
}

function renderLeerzustand(){
  $("monthLabel").textContent=state.kalenderDatum.toLocaleString("de-DE",{month:"long",year:"numeric"});
  $("weekBox").textContent="Noch keine Datenverbindung";
  $("monatStunden").textContent="0 h";
  $("monatKm").textContent="0 km";
  $("monatBezahlt").textContent="0 h";
  $("monatOffen").textContent="0 h";
  $("monatBezahltEuro").textContent="–";
  $("monatOffenEuro").textContent="–";
  $("monatVerdienst").textContent="–";
  $("jahrStunden").textContent="0 h";
  $("jahrKm").textContent="0 km";
  renderKalender();
  renderMonatsGrid();
  renderFahrziele();
  renderAktuelleFahrten();
}

function normalisiereZeit(v){
  const s=String(v||"").trim();
  if(!s)return "";

  let m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if(!m)m=s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/);

  if(m){
    const h=Number(m[1]),min=Number(m[2]);
    if(h>=0&&h<=23&&min>=0&&min<=59){
      return String(h).padStart(2,"0")+":"+String(min).padStart(2,"0");
    }
  }
  return "";
}
function minuten(t){
  const n=normalisiereZeit(t);
  if(!n)return null;
  const[a,b]=n.split(":").map(Number);
  return a*60+b;
}
function berechneStundenAusZeiten(start,schluss){
  const a=minuten(start),b=minuten(schluss);
  if(a===null||b===null)return 0;
  let diff=b-a;
  if(diff<0)diff+=1440;
  return diff/60;
}

function zeitFormatieren(feld){
  let v=String(feld.value||"").trim(); if(!v){feld.value="";stundenBerechnen();return}
  if(/^\d{1,2}:\d{2}$/.test(v)){const[h,m]=v.split(":").map(Number);if(h>=0&&h<=23&&m>=0&&m<=59){feld.value=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");stundenBerechnen();return}}
  const z=v.replace(/\D/g,""); if(z.length===3||z.length===4){const p=z.padStart(4,"0"),h=Number(p.slice(0,2)),m=Number(p.slice(2,4));if(h<=23&&m<=59){feld.value=String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");stundenBerechnen();return}}
  stundenBerechnen();
}
function stundenBerechnen(){
  if(abwesenheit.value){
    $("stundenAnzeige").textContent="0";
    return 0;
  }
  const h=berechneStundenAusZeiten(beginn.value,ende.value);
  $("stundenAnzeige").textContent=format(h);
  return h;
}

function handleAbwesenheit(){
  const x=!!abwesenheit.value;beginn.disabled=x;ende.disabled=x;
  if(x){beginn.value="";ende.value=""} stundenBerechnen();
}

function gewaehltesZiel(){return state.fahrziele.find(z=>z.id===fahrziel.value)||null}
function renderFahrtInfo(){
  const z=gewaehltesZiel();
  $("fahrtInfo").classList.toggle("hidden",!z);
  $("fahrtKm").textContent=z?format(z.kmHinRueck)+" km":"0 km";
  $("fahrtHinzufuegen").disabled=!z;
}
function renderFahrzielDropdown(){
  const wert=fahrziel.value;
  fahrziel.innerHTML='<option value="">Fahrziel auswählen</option>';
  state.fahrziele.filter(z=>z.aktiv!==false).forEach(z=>{
    const o=document.createElement("option");
    o.value=z.id;o.textContent=z.name;fahrziel.appendChild(o)
  });
  if([...fahrziel.options].some(o=>o.value===wert))fahrziel.value=wert;
  renderFahrtInfo();
}
function aktuellerFahrzielName(fahrzielId,fallback=""){
  const id=String(fahrzielId||"");
  if(!id)return String(fallback||"");
  const z=state.fahrziele.find(x=>String(x.id||"")===id);
  return z?String(z.name||fallback||""):String(fallback||"");
}
function aktualisiereFahrzielNamen(){
  state.jahresEintraege.forEach(e=>{
    if(Array.isArray(e.fahrten)&&e.fahrten.length){
      e.fahrten=e.fahrten.map(f=>({
        ...f,
        fahrziel:aktuellerFahrzielName(f.fahrzielId,f.fahrziel)
      }));
      e.fahrziel=e.fahrten.map(f=>f.fahrziel).filter(Boolean).join(" · ");
    }else if(e.fahrzielId){
      e.fahrziel=aktuellerFahrzielName(e.fahrzielId,e.fahrziel);
    }
  });
}
function fahrtHinzufuegen(){
  const z=gewaehltesZiel();
  if(!z)return;
  state.aktuelleFahrten.push({
    id:"fahrt_"+Date.now()+"_"+state.aktuelleFahrten.length,
    fahrzielId:z.id,
    fahrziel:z.name,
    kilometer:Number(z.kmHinRueck||0)
  });
  fahrziel.value="";
  renderFahrtInfo();
  renderAktuelleFahrten();
}
function fahrtEntfernen(index){
  state.aktuelleFahrten.splice(index,1);
  renderAktuelleFahrten();
}
function renderAktuelleFahrten(){
  const g=$("aktuelleFahrten"),gesamt=$("fahrtGesamt");
  g.innerHTML="";
  if(!state.aktuelleFahrten.length){
    g.innerHTML='<div class="export-hint">Noch keine Fahrt für diesen Tag hinzugefügt.</div>';
    gesamt.classList.add("hidden");
    return;
  }
  state.aktuelleFahrten.forEach((f,i)=>{
    const d=document.createElement("div");d.className="entry-trip-item";
    const info=document.createElement("div");
    info.innerHTML=`<strong>${htmlSicher(f.fahrziel)}</strong><small>Hin & Rück: ${format(f.kilometer)} km</small>`;
    const b=document.createElement("button");b.type="button";b.className="danger";b.textContent="Entfernen";b.onclick=()=>fahrtEntfernen(i);
    d.append(info,b);g.appendChild(d);
  });
  const km=state.aktuelleFahrten.reduce((s,f)=>s+Number(f.kilometer||0),0);
  $("fahrtGesamtKm").textContent=format(km)+" km";
  gesamt.classList.remove("hidden");
}
function daten(){
  const fahrten=state.aktuelleFahrten.map(f=>({
    id:f.id||"",
    fahrzielId:f.fahrzielId||"",
    fahrziel:f.fahrziel||"",
    kilometer:Number(f.kilometer||0)
  }));
  const kilometer=fahrten.reduce((s,f)=>s+Number(f.kilometer||0),0);
  const fahrzielText=fahrten.map(f=>f.fahrziel).filter(Boolean).join(" · ");
  return{
    datum:datum.value,beginn:beginn.value,ende:ende.value,stunden:stundenBerechnen(),abwesenheit:abwesenheit.value,notiz:notiz.value,
    fahrten,
    fahrzielId:fahrten.length===1?fahrten[0].fahrzielId:"",
    fahrziel:fahrzielText,
    kilometer
  };
}
function validiere(d){
  if(!d.datum)return"Bitte Datum auswählen.";
  if(d.abwesenheit)return"";
  if(!d.beginn||!d.ende)return"Bitte Beginn und Ende eintragen.";
  if(!(d.stunden>0))return"Die Arbeitszeit muss größer als 0 sein.";
  return"";
}

async function laden(jahr){
  let letzterFehler=null;
  for(let versuch=1;versuch<=2;versuch++){
    try{const r=await jsonp({action:"init",jahr});if(!r.ok)throw new Error(r.message||"Unbekannter Fehler");return r}
    catch(e){letzterFehler=e;if(versuch<2)await schlafen(900)}
  }
  throw letzterFehler;
}
async function ladeJahr(jahr){
  const seq=++ladeSequenz;setNavigation(true);zeige("Lade Daten ...","");
  try{
    const r=await laden(jahr);if(seq!==ladeSequenz)return;
    state.cacheJahr=jahr;
    state.jahresEintraege=(Array.isArray(r.eintraegeJahr)?r.eintraegeJahr:[]).map(e=>({
      ...e,
      beginn:normalisiereZeit(e.beginn),
      ende:normalisiereZeit(e.ende),
      stunden:Number(e.stunden||0),
      kilometer:Number(e.kilometer||0),
      fahrten:Array.isArray(e.fahrten)?e.fahrten.map(f=>({
        id:String(f.id||""),
        fahrzielId:String(f.fahrzielId||""),
        fahrziel:String(f.fahrziel||""),
        kilometer:Number(f.kilometer||0)
      })):(e.fahrziel&&Number(e.kilometer||0)>0?[{
        id:"legacy_"+e.datum,
        fahrzielId:String(e.fahrzielId||""),
        fahrziel:String(e.fahrziel||""),
        kilometer:Number(e.kilometer||0)
      }]:[]),
      bezahlt:e.bezahlt===true||String(e.bezahlt).toLowerCase()==="true"
    }));
    state.fahrziele=Array.isArray(r.fahrziele)?r.fahrziele:[];
    aktualisiereFahrzielNamen();
    state.stundenloehne=(Array.isArray(r.stundenloehne)?r.stundenloehne:[])
      .map(x=>({ab:String(x.ab||""),lohn:Number(x.lohn||0)}))
      .filter(x=>/^\d{4}-\d{2}$/.test(x.ab)&&x.lohn>0)
      .sort((a,b)=>a.ab.localeCompare(b.ab));
    state.startAdresse=String(r.startAdresse||"");
    $("startAdresse").value=state.startAdresse;
    monatLokalSetzen(jahr,state.kalenderDatum.getMonth()+1,false);
    renderFahrzielDropdown();renderFahrziele();renderStundenlohn();renderAlles();zeige("","");
  }catch(e){zeige("Fehler: "+e.message,"error")}
  finally{if(seq===ladeSequenz)setNavigation(false)}
}

function monatLokalSetzen(jahr,monat,rendern=true){
  if(state.cacheJahr!==jahr)return false;
  state.eintraege=state.jahresEintraege.filter(e=>{const d=ausIso(e.datum);return d.getFullYear()===jahr&&d.getMonth()===monat-1}).sort((a,b)=>a.datum.localeCompare(b.datum));
  if(rendern)renderAlles();return true;
}
function renderAlles(){renderKalender();renderWoche();renderStatistik();renderMonatsGrid()}
function setNavigation(x){$("prevMonth").disabled=x;$("nextMonth").disabled=x}

function schreiben(action,payload){
  const body=new URLSearchParams({action,payload:JSON.stringify(payload),zeit:String(Date.now())});
  fetch(SCRIPT_URL,{
    method:"POST",
    mode:"no-cors",
    body,
    cache:"no-store",
    keepalive:true
  }).catch(err=>console.error("Hintergrund-Speicherung fehlgeschlagen:",err));
  return Promise.resolve();
}

async function speichern(e){
  e.preventDefault();
  if(!abwesenheit.value){
    beginn.value=normalisiereZeit(beginn.value);
    ende.value=normalisiereZeit(ende.value);
  }
  const d=daten(),f=validiere(d);
  if(f)return zeige(f,"error");
  if(state.jahresEintraege.some(x=>x.datum===d.datum))return zeige("Für dieses Datum gibt es bereits einen Eintrag.","error");
  await aktion("save",d);
}
async function aktualisieren(){
  if(!abwesenheit.value){
    beginn.value=normalisiereZeit(beginn.value);
    ende.value=normalisiereZeit(ende.value);
  }
  const d={...daten(),originalDatum:state.originalDatum},f=validiere(d);
  if(f)return zeige(f,"error");
  if(state.jahresEintraege.some(x=>x.datum===d.datum&&x.datum!==state.originalDatum))return zeige("Für dieses Datum gibt es bereits einen Eintrag.","error");
  await aktion("update",d);
}

async function loeschen(){if(!confirm("Eintrag wirklich löschen?"))return;await aktion("delete",{datum:state.originalDatum})}
async function aktion(action,payload){
  const btn=action==="delete"?del:(action==="update"?update:save);
  const textVorher=btn.textContent;
  try{
    btn.disabled=true;
    btn.textContent=action==="delete"?"Lösche …":"Speichere …";
    zeige(action==="delete"?"Lösche Eintrag ...":"Speichere Eintrag ...","");
    await schreiben(action,payload);

    if(action==="delete")state.jahresEintraege=state.jahresEintraege.filter(e=>e.datum!==payload.datum);
    else{
      const alterEintrag=action==="update"?state.jahresEintraege.find(e=>e.datum===payload.originalDatum):null;
      const neu={
        datum:payload.datum,
        beginn:payload.abwesenheit?"":normalisiereZeit(payload.beginn),
        ende:payload.abwesenheit?"":normalisiereZeit(payload.ende),
        stunden:payload.abwesenheit?0:Number(payload.stunden||0),
        abwesenheit:payload.abwesenheit||"",
        notiz:payload.notiz||"",
        fahrten:Array.isArray(payload.fahrten)?payload.fahrten.map(f=>({...f,kilometer:Number(f.kilometer||0)})):[],
        fahrzielId:payload.fahrzielId||"",
        fahrziel:payload.fahrziel||"",
        kilometer:Number(payload.kilometer||0),
        bezahlt:alterEintrag?!!alterEintrag.bezahlt:false
      };
      if(action==="update")state.jahresEintraege=state.jahresEintraege.filter(e=>e.datum!==payload.originalDatum);
      state.jahresEintraege.push(neu);
      state.jahresEintraege.sort((a,b)=>a.datum.localeCompare(b.datum));
    }

    monatLokalSetzen(state.kalenderDatum.getFullYear(),state.kalenderDatum.getMonth()+1,false);
    resetForm(false);
    renderAlles();
    zeige(action==="delete"?"Eintrag gelöscht ✅":action==="update"?"Änderung gespeichert ✅":"Gespeichert ✅","success");
  }catch(e){
    zeige("Fehler beim Senden: "+e.message,"error");
  }finally{
    btn.disabled=false;
    btn.textContent=textVorher;
  }
}

function eintragLaden(e){
  state.originalDatum=e.datum;
  datum.value=e.datum;
  beginn.value=normalisiereZeit(e.beginn);
  ende.value=normalisiereZeit(e.ende);
  abwesenheit.value=e.abwesenheit||"";
  notiz.value=e.notiz||"";
  state.aktuelleFahrten=Array.isArray(e.fahrten)?e.fahrten.map(f=>({
    id:String(f.id||""),
    fahrzielId:String(f.fahrzielId||""),
    fahrziel:aktuellerFahrzielName(f.fahrzielId,f.fahrziel),
    kilometer:Number(f.kilometer||0)
  })):(e.fahrziel&&Number(e.kilometer||0)>0?[{
    id:"legacy_"+e.datum,
    fahrzielId:String(e.fahrzielId||""),
    fahrziel:aktuellerFahrzielName(e.fahrzielId,e.fahrziel),
    kilometer:Number(e.kilometer||0)
  }]:[]);
  fahrziel.value="";
  handleAbwesenheit();
  renderFahrtInfo();
  renderAktuelleFahrten();
  stundenBerechnen();
  editMode(true);
  window.scrollTo({top:0,behavior:"smooth"});
}
function arbeitszeitKopieren(){
  const start=normalisiereZeit(beginn.value),schluss=normalisiereZeit(ende.value);
  if(!start||!schluss){zeige("Für diesen Tag gibt es keine Arbeitszeit zum Kopieren.","error");return}
  state.originalDatum=null;state.ausgewaehlt=null;datum.value="";beginn.value=start;ende.value=schluss;abwesenheit.value="";notiz.value="";fahrziel.value="";state.aktuelleFahrten=[];
  editMode(false);handleAbwesenheit();renderFahrtInfo();renderAktuelleFahrten();stundenBerechnen();renderKalender();
  zeige("Arbeitszeit kopiert ✅ Bitte jetzt das neue Datum auswählen und speichern.","success");datum.focus();
}
function resetForm(heute=true){
  state.originalDatum=null;editMode(false);beginn.value="";ende.value="";abwesenheit.value="";notiz.value="";fahrziel.value="";state.aktuelleFahrten=[];
  if(heute){datum.value=iso(new Date());state.ausgewaehlt=datum.value}
  handleAbwesenheit();renderFahrtInfo();renderAktuelleFahrten();stundenBerechnen();
}
function editMode(a){save.hidden=a;update.hidden=!a;del.hidden=!a;copyTime.hidden=!a;buttonRow.classList.toggle("edit-mode",a)}

function renderKalender(){
  const y=state.kalenderDatum.getFullYear(),m=state.kalenderDatum.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),offset=(first.getDay()+6)%7,map=new Map(state.eintraege.map(e=>[e.datum,e])),g=$("calendarGrid");
  $("monthLabel").textContent=state.kalenderDatum.toLocaleString("de-DE",{month:"long",year:"numeric"});g.innerHTML="";
  ["Mo","Di","Mi","Do","Fr","Sa","So"].forEach(n=>{const d=document.createElement("div");d.className="day-name";d.textContent=n;g.appendChild(d)});
  for(let i=0;i<offset;i++){const d=document.createElement("div");d.className="day-cell empty";g.appendChild(d)}
  for(let t=1;t<=last.getDate();t++){
    const dt=new Date(y,m,t),i=iso(dt),e=map.get(i),b=document.createElement("button");b.type="button";b.dataset.datum=i;
    const istArbeit=!!(e&&!e.abwesenheit);
    b.className="day-cell "
      +(e?(e.abwesenheit?"status-abwesenheit":"status-arbeit"):"")
      +(i===iso(new Date())?" today":"")
      +(!state.zahlungsModus&&i===state.ausgewaehlt?" selected":"")
      +(istArbeit&&e.bezahlt?" status-bezahlt":"")
      +(state.zahlAuswahl.has(i)?" pay-selected":"");
    const label=e?(e.abwesenheit||format(e.stunden)+" h"+(Number(e.kilometer)>0?" · "+format(e.kilometer)+" km":"")):"";
    const bezahltBadge=istArbeit&&e.bezahlt?'<span class="paid-badge">✓ bezahlt</span>':"";
    b.innerHTML=`<span class="day-number">${t}</span><span class="status-label">${label}</span>${bezahltBadge}`;
    if(e){
      const tt=tooltipFuerEintrag(e)+(istArbeit?"\nZahlung: "+(e.bezahlt?"bezahlt":"offen"):"");
      b.title=tt.replace(/\n/g," | ");
      b.addEventListener("mouseenter",ev=>{if(state.tooltipBlockDatum===i)return;tooltipZeigen(ev.currentTarget,tt)});
      b.addEventListener("mousemove",ev=>{if(state.tooltipBlockDatum===i)return;tooltipPositionieren(ev.clientX,ev.clientY)});
      b.addEventListener("mouseleave",()=>{if(state.tooltipBlockDatum===i)state.tooltipBlockDatum=null;tooltipAusblenden()});
    }
    b.onclick=()=>{
      state.tooltipBlockDatum=i;tooltipAusblenden();b.blur();
      if(state.zahlungsModus){
        if(!istArbeit){zeige("Nur Arbeitstage können als bezahlt/offen markiert werden.","error");return}
        if(state.zahlAuswahl.has(i))state.zahlAuswahl.delete(i);else state.zahlAuswahl.add(i);
        renderKalender();renderZahlungsAuswahl();
        return;
      }
      state.ausgewaehlt=i;datum.value=i;e?eintragLaden(e):resetForm(false);datum.value=i;state.ausgewaehlt=i;renderKalender();renderWoche();
    };
    g.appendChild(b);
  }
}
function euro(v){
  return Number(v||0).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
}
function lohnFuerDatum(datumIso){
  const monat=String(datumIso||"").slice(0,7);
  let lohn=null;
  for(const x of state.stundenloehne){
    if(x.ab<=monat)lohn=Number(x.lohn);
    else break;
  }
  return lohn&&lohn>0?lohn:null;
}
function geldWerte(eintraege){
  const arbeit=eintraege.filter(x=>!x.abwesenheit&&Number(x.stunden||0)>0);
  if(!arbeit.length)return{bekannt:true,gesamt:0,bezahlt:0,offen:0};
  let gesamt=0,bezahlt=0,offen=0;
  for(const e of arbeit){
    const lohn=lohnFuerDatum(e.datum);
    if(!lohn)return{bekannt:false,gesamt:0,bezahlt:0,offen:0};
    const betrag=Number(e.stunden||0)*lohn;
    gesamt+=betrag;
    if(e.bezahlt)bezahlt+=betrag;else offen+=betrag;
  }
  return{bekannt:true,gesamt,bezahlt,offen};
}
function renderStundenlohn(){
  const monat=$("lohnMonat").value||iso(state.kalenderDatum).slice(0,7);
  const probe=monat+"-01",lohn=lohnFuerDatum(probe);
  $("lohnAktuell").textContent=lohn?("Für diesen Monat gültig: "+euro(lohn)+" / Stunde"):"Für diesen Monat ist noch kein Stundenlohn hinterlegt.";
  const g=$("lohnHistorie");g.innerHTML="";
  if(!state.stundenloehne.length){
    g.innerHTML='<div class="export-hint">Noch kein Stundenlohn gespeichert.</div>';
    return;
  }
  [...state.stundenloehne].reverse().forEach(x=>{
    const d=document.createElement("div");d.className="wage-item";
    const [j,m]=x.ab.split("-");
    d.innerHTML=`<span>ab ${m}/${j}</span><strong>${euro(x.lohn)} / h</strong>`;
    g.appendChild(d);
  });
}
async function stundenlohnSpeichern(){
  const ab=$("lohnMonat").value,roh=String($("stundenlohn").value||"").trim().replace(",","."),
        lohn=Number(roh);
  if(!/^\d{4}-\d{2}$/.test(ab))return zeige("Bitte den Monat für den Stundenlohn auswählen.","error");
  if(!(lohn>0))return zeige("Bitte einen gültigen Stundenlohn eintragen.","error");
  const vorhanden=state.stundenloehne.find(x=>x.ab===ab);
  if(vorhanden)vorhanden.lohn=lohn;else state.stundenloehne.push({ab,lohn});
  state.stundenloehne.sort((a,b)=>a.ab.localeCompare(b.ab));
  await schreiben("saveStundenlohn",{ab,lohn});
  $("stundenlohn").value="";
  renderStundenlohn();renderStatistik();
  zeige("Stundenlohn ab "+ab.slice(5,7)+"/"+ab.slice(0,4)+" gespeichert ✅","success");
}

function zahlungBearbeitenStart(){
  state.zahlungsModus=true;
  state.zahlAuswahl.clear();
  $("zahlungBearbeiten").classList.add("hidden");
  $("zahlungAktionen").classList.remove("hidden");
  renderZahlungsAuswahl();
  renderKalender();
}
function zahlungBearbeitenEnde(){
  state.zahlungsModus=false;
  state.zahlAuswahl.clear();
  $("zahlungAktionen").classList.add("hidden");
  $("zahlungBearbeiten").classList.remove("hidden");
  renderKalender();
  zeige("","");
}
function renderZahlungsAuswahl(){
  const n=state.zahlAuswahl.size;
  $("zahlungAuswahlText").textContent=n===1?"1 Arbeitstag ausgewählt":n+" Arbeitstage ausgewählt";
  $("zahlungBezahlt").disabled=n===0;
  $("zahlungOffen").disabled=n===0;
}
async function zahlungsstatusSetzen(bezahlt){
  const daten=[...state.zahlAuswahl];
  if(!daten.length)return;
  state.jahresEintraege.forEach(e=>{if(daten.includes(e.datum)&&!e.abwesenheit)e.bezahlt=bezahlt});
  state.eintraege.forEach(e=>{if(daten.includes(e.datum)&&!e.abwesenheit)e.bezahlt=bezahlt});
  await schreiben("setBezahlt",{daten,bezahlt});
  const anzahl=daten.length;
  zahlungBearbeitenEnde();
  renderAlles();
  zeige(anzahl+(anzahl===1?" Tag ":" Tage ")+(bezahlt?"als bezahlt markiert ✅":"wieder als offen markiert ✅"),"success");
}

function tooltipFuerEintrag(e){
  const z=[ausIso(e.datum).toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"})];
  if(e.abwesenheit)z.push(e.abwesenheit);
  else{
    if(e.beginn||e.ende)z.push("Zeit: "+(e.beginn||"–")+" bis "+(e.ende||"–")+" Uhr");
    z.push("Stunden: "+format(e.stunden)+" h")
  }
  const fahrten=Array.isArray(e.fahrten)?e.fahrten:[];
  if(fahrten.length){
    z.push("Fahrten:");
    fahrten.forEach(f=>z.push("• "+f.fahrziel+" · "+format(f.kilometer)+" km"));
    z.push("Kilometer gesamt: "+format(e.kilometer)+" km");
  }else if(e.fahrziel){
    z.push("Fahrt: "+e.fahrziel+" · "+format(e.kilometer)+" km");
  }
  if(e.notiz)z.push("Notiz: "+e.notiz);
  return z.join("\n");
}
function tooltipZeigen(el,text){const t=$("calendarTooltip");t.textContent=text;t.classList.add("visible");const r=el.getBoundingClientRect();tooltipPositionieren(r.left+r.width/2,r.top)}
function tooltipPositionieren(x,y){const t=$("calendarTooltip");if(!t.classList.contains("visible"))return;const a=12,w=t.offsetWidth,h=t.offsetHeight;let l=x-w/2,o=y-h-a;l=Math.max(8,Math.min(l,window.innerWidth-w-8));if(o<8)o=y+a;t.style.left=l+"px";t.style.top=o+"px"}
function tooltipAusblenden(){$("calendarTooltip").classList.remove("visible")}
document.addEventListener("mousemove",e=>{if(!state.tooltipBlockDatum)return;const tag=e.target.closest?.(".day-cell");if(tag?.dataset?.datum!==state.tooltipBlockDatum)state.tooltipBlockDatum=null});

function wochenGrenzen(d){const x=new Date(d);const tag=x.getDay()||7;const mo=new Date(x);mo.setDate(x.getDate()-(tag-1));const so=new Date(mo);so.setDate(mo.getDate()+6);return[mo,so]}
function renderWoche(){
  const d=state.ausgewaehlt?ausIso(state.ausgewaehlt):state.kalenderDatum,[mo,so]=wochenGrenzen(d);
  const werte=state.jahresEintraege.filter(e=>{const x=ausIso(e.datum);return x>=mo&&x<=so});
  const h=werte.reduce((s,e)=>s+Number(e.stunden||0),0),km=werte.reduce((s,e)=>s+Number(e.kilometer||0),0);
  $("weekBox").innerHTML=`Woche ${isoWoche(d)}: <strong>${format(h)} h</strong> · <strong>${format(km)} km</strong>`;
}
function monatsWerte(jahr,monat){
  const e=state.jahresEintraege.filter(x=>{const d=ausIso(x.datum);return d.getFullYear()===jahr&&d.getMonth()===monat-1});
  const arbeit=e.filter(x=>!x.abwesenheit);
  return{
    stunden:e.reduce((s,x)=>s+Number(x.stunden||0),0),
    km:e.reduce((s,x)=>s+Number(x.kilometer||0),0),
    bezahltStunden:arbeit.filter(x=>x.bezahlt).reduce((s,x)=>s+Number(x.stunden||0),0),
    offenStunden:arbeit.filter(x=>!x.bezahlt).reduce((s,x)=>s+Number(x.stunden||0),0),
    geld:geldWerte(e),
    daten:e
  };
}
function jahresWerte(jahr){
  const e=state.jahresEintraege.filter(x=>ausIso(x.datum).getFullYear()===jahr),arbeit=e.filter(x=>!x.abwesenheit);
  return{
    stunden:e.reduce((s,x)=>s+Number(x.stunden||0),0),
    km:e.reduce((s,x)=>s+Number(x.kilometer||0),0),
    bezahltStunden:arbeit.filter(x=>x.bezahlt).reduce((s,x)=>s+Number(x.stunden||0),0),
    offenStunden:arbeit.filter(x=>!x.bezahlt).reduce((s,x)=>s+Number(x.stunden||0),0)
  };
}
function renderStatistik(){
  const y=state.kalenderDatum.getFullYear(),m=state.kalenderDatum.getMonth()+1,mw=monatsWerte(y,m),jw=jahresWerte(y);
  $("monatStunden").textContent=format(mw.stunden)+" h";
  $("monatKm").textContent=format(mw.km)+" km";
  $("monatBezahlt").textContent=format(mw.bezahltStunden)+" h";
  $("monatOffen").textContent=format(mw.offenStunden)+" h";
  $("monatBezahltEuro").textContent=mw.geld&&mw.geld.bekannt?euro(mw.geld.bezahlt):"–";
  $("monatOffenEuro").textContent=mw.geld&&mw.geld.bekannt?euro(mw.geld.offen):"–";
  $("monatVerdienst").textContent=mw.geld&&mw.geld.bekannt?euro(mw.geld.gesamt):"–";
  $("jahrStunden").textContent=format(jw.stunden)+" h";
  $("jahrKm").textContent=format(jw.km)+" km";
}
function renderMonatsGrid(){
  const y=state.kalenderDatum.getFullYear(),namen=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"],g=$("monatsGrid");g.innerHTML="";
  namen.forEach((n,i)=>{
    const w=state.cacheJahr===y?monatsWerte(y,i+1):{stunden:0,km:0,offenStunden:0};
    const d=document.createElement("div");d.className="year-month";
    d.innerHTML=`<span>${n}</span><strong>${format(w.stunden)} h</strong><small>${format(w.km)} km</small><small>${format(w.offenStunden)} h offen</small>`;
    g.appendChild(d)
  });
}
async function monatWechseln(delta){
  const altJ=state.kalenderDatum.getFullYear();state.kalenderDatum=new Date(altJ,state.kalenderDatum.getMonth()+delta,1);const neuJ=state.kalenderDatum.getFullYear();state.ausgewaehlt=iso(state.kalenderDatum);$("lohnMonat").value=iso(state.kalenderDatum).slice(0,7);renderStundenlohn();
  if(state.cacheJahr===neuJ){monatLokalSetzen(neuJ,state.kalenderDatum.getMonth()+1,true)}else if(pruefeKonfiguration())await ladeJahr(neuJ);
}
function datumGeaendert(){if(!datum.value)return;state.ausgewaehlt=datum.value;const d=ausIso(datum.value);if(d.getFullYear()!==state.kalenderDatum.getFullYear()||d.getMonth()!==state.kalenderDatum.getMonth()){state.kalenderDatum=new Date(d.getFullYear(),d.getMonth(),1);if(state.cacheJahr===d.getFullYear())monatLokalSetzen(d.getFullYear(),d.getMonth()+1,true);else if(pruefeKonfiguration())ladeJahr(d.getFullYear())}else{renderKalender();renderWoche()}}

async function startadresseSpeichern(){
  const adr=$("startAdresse").value.trim();if(!adr)return zeige("Bitte Startadresse eintragen.","error");
  try{await schreiben("saveStartAdresse",{adresse:adr});state.startAdresse=adr;zeige("Startadresse gespeichert ✅","success")}
  catch(e){zeige("Startadresse konnte nicht gespeichert werden: "+e.message,"error")}
}
async function streckeBerechnen(){
  if(!pruefeKonfiguration())return;const start=$("startAdresse").value.trim(),name=$("zielName").value.trim(),ziel=$("zielAdresse").value.trim();
  if(!start)return zeige("Bitte zuerst die Startadresse eintragen.","error");if(!name)return zeige("Bitte eine Bezeichnung für das Fahrziel eintragen.","error");if(!ziel)return zeige("Bitte die Adresse des Fahrziels eintragen.","error");
  try{
    $("streckeBerechnen").disabled=true;zeige("Berechne Strecke ...","");const r=await jsonp({action:"route",start,ziel});if(!r.ok)throw new Error(r.message||"Strecke konnte nicht berechnet werden.");
    state.routeTmp={id:"ziel_"+Date.now(),name,adresse:ziel,kmEinfach:Number(r.kmEinfach),kmHinRueck:Number(r.kmHinRueck),aktiv:true};
    $("routeResult").classList.remove("hidden");$("routeResult").innerHTML=`Einfache Strecke: <strong>${format(r.kmEinfach)} km</strong><br>Hin & Rück: <strong>${format(r.kmHinRueck)} km</strong>`;$("zielSpeichern").disabled=false;zeige("","");
  }catch(e){zeige("Streckenberechnung: "+e.message,"error")}
  finally{$("streckeBerechnen").disabled=false}
}
async function fahrzielSpeichern(){
  const z=state.routeTmp;if(!z)return;
  try{await schreiben("saveFahrziel",z);state.fahrziele.push(z);state.fahrziele.sort((a,b)=>a.name.localeCompare(b.name,"de"));renderFahrzielDropdown();renderFahrziele();$("zielName").value="";$("zielAdresse").value="";$("routeResult").classList.add("hidden");$("routeResult").innerHTML="";$("zielSpeichern").disabled=true;state.routeTmp=null;zeige("Fahrziel gespeichert ✅","success")}
  catch(e){zeige("Fahrziel konnte nicht gespeichert werden: "+e.message,"error")}
}
function renderFahrziele(){
  const g=$("targetList");g.innerHTML="";if(!state.fahrziele.length){g.innerHTML='<div class="export-hint">Noch keine Fahrziele gespeichert.</div>';return}
  state.fahrziele.filter(z=>z.aktiv!==false).forEach(z=>{const d=document.createElement("div");d.className="target-item";const info=document.createElement("div");info.innerHTML=`<strong>${htmlSicher(z.name)}</strong><small>${htmlSicher(z.adresse)} · Hin & Rück ${format(z.kmHinRueck)} km</small>`;const b=document.createElement("button");b.type="button";b.className="danger";b.textContent="Entfernen";b.onclick=()=>fahrzielLoeschen(z);d.append(info,b);g.appendChild(d)})
}
async function fahrzielLoeschen(z){
  if(!confirm('Fahrziel "'+z.name+'" wirklich entfernen?'))return;
  try{await schreiben("deleteFahrziel",{id:z.id});state.fahrziele=state.fahrziele.filter(x=>x.id!==z.id);renderFahrzielDropdown();renderFahrziele();zeige("Fahrziel entfernt ✅","success")}
  catch(e){zeige("Fahrziel konnte nicht entfernt werden: "+e.message,"error")}
}

function exportKontext(){
  const art=$("exportZeitraum").value,y=state.kalenderDatum.getFullYear(),m=state.kalenderDatum.getMonth()+1;
  const daten=art==="monat"?monatsWerte(y,m).daten:state.jahresEintraege.filter(e=>ausIso(e.datum).getFullYear()===y);
  const stunden=daten.reduce((s,e)=>s+Number(e.stunden||0),0),km=daten.reduce((s,e)=>s+Number(e.kilometer||0),0);
  return{art,jahr:y,monat:m,titel:art==="monat"?state.kalenderDatum.toLocaleString("de-DE",{month:"long",year:"numeric"}):"Jahr "+y,stunden,km,daten:[...daten].sort((a,b)=>a.datum.localeCompare(b.datum))};
}
function exportZeile(e){const d=ausIso(e.datum);return{datum:d,datumText:d.toLocaleDateString("de-DE"),wochentag:d.toLocaleDateString("de-DE",{weekday:"short"}),beginn:e.beginn||"",ende:e.ende||"",stunden:Number(e.stunden||0),art:e.abwesenheit||"Arbeit",fahrziel:e.fahrziel||"",kilometer:Number(e.kilometer||0),bezahlt:!e.abwesenheit&&e.bezahlt===true}}
async function exportExcel(){
  try{
    if(typeof ExcelJS==="undefined")throw new Error("Excel-Modul konnte nicht geladen werden.");const x=exportKontext(),zeilen=x.daten.map(exportZeile),wb=new ExcelJS.Workbook(),ws=wb.addWorksheet("Arbeitszeit");
    ws.mergeCells("A1:I1");ws.getCell("A1").value="Arbeitszeit & Fahrten – "+x.titel;ws.getCell("A1").font={bold:true,size:16};ws.getCell("A1").alignment={horizontal:"center"};
    ws.mergeCells("A3:C3");ws.getCell("A3").value="Stunden gesamt";ws.getCell("D3").value=x.stunden;ws.getCell("D3").numFmt='0.00 "h"';
    ws.mergeCells("E3:G3");ws.getCell("E3").value="Kilometer gesamt";ws.getCell("H3").value=x.km;ws.getCell("H3").numFmt='0.0 "km"';
    ["A3","D3","E3","H3"].forEach(c=>ws.getCell(c).font={bold:true});
    const headerRow=5,headers=["Datum","Tag","Beginn","Ende","Stunden","Art","Fahrziel","km","Bezahlt"];
    headers.forEach((h,i)=>{const c=ws.getCell(headerRow,i+1);c.value=h;c.font={bold:true,color:{argb:"FFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"70AD47"}};c.alignment={horizontal:"center",vertical:"middle"}});
    zeilen.forEach((z,i)=>{const row=headerRow+1+i,serial=Date.UTC(z.datum.getFullYear(),z.datum.getMonth(),z.datum.getDate())/86400000+25569;ws.getCell(row,1).value=serial;ws.getCell(row,1).numFmt="dd.mm.yyyy";ws.getCell(row,2).value=z.wochentag;ws.getCell(row,3).value=z.beginn;ws.getCell(row,4).value=z.ende;ws.getCell(row,5).value=z.stunden;ws.getCell(row,5).numFmt='0.00';ws.getCell(row,6).value=z.art;ws.getCell(row,7).value=z.fahrziel;ws.getCell(row,8).value=z.kilometer;ws.getCell(row,8).numFmt='0.0';ws.getCell(row,9).value=z.art==="Arbeit"?(z.bezahlt?"Ja":"Nein"):"";for(let c=1;c<=9;c++)ws.getCell(row,c).alignment={horizontal:"center",vertical:"middle"}});
    const widths=[12,10,9,9,10,12,Math.max(14,...zeilen.map(z=>z.fahrziel.length+2)),10,10];ws.columns=widths.map(width=>({width}));ws.views=[{state:"frozen",ySplit:headerRow}];ws.autoFilter={from:{row:headerRow,column:1},to:{row:headerRow,column:9}};
    const buffer=await wb.xlsx.writeBuffer(),blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=x.art==="monat"?`Arbeitszeit_Fahrten_${x.jahr}-${String(x.monat).padStart(2,"0")}.xlsx`:`Arbeitszeit_Fahrten_${x.jahr}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){zeige("Excel-Export: "+e.message,"error")}
}
function exportPdf(){
  try{
    const x=exportKontext(),zeilen=x.daten.map(exportZeile),fenster=window.open("","_blank");if(!fenster)throw new Error("PDF-Fenster konnte nicht geöffnet werden.");
    const body=zeilen.map(z=>`<tr><td>${htmlSicher(z.datumText)}</td><td>${htmlSicher(z.wochentag)}</td><td>${htmlSicher(z.beginn)}</td><td>${htmlSicher(z.ende)}</td><td class="num">${htmlSicher(format(z.stunden))}</td><td>${htmlSicher(z.art)}</td><td>${htmlSicher(z.fahrziel)}</td><td class="num">${htmlSicher(format(z.kilometer))}</td><td>${z.art==="Arbeit"?(z.bezahlt?"Ja":"Nein"):""}</td></tr>`).join("");
    fenster.document.open();fenster.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Arbeitszeit & Fahrten</title><style>@page{size:A4 landscape;margin:11mm}body{font-family:Arial,sans-serif;color:#222;margin:0}h1{font-size:20px;margin:0 0 4px}.meta{font-size:11px;color:#666;margin-bottom:12px}.summary{display:flex;gap:10px;margin:0 0 14px}.summary div{border:1px solid #ccd3d9;border-radius:8px;padding:7px 10px;min-width:160px}.summary span{display:block;font-size:10px;color:#666}.summary strong{font-size:15px}table{width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border-bottom:1px solid #d6d6d6;padding:5px;vertical-align:top;text-align:center}th{background:#eef3f7}th:nth-child(7),td:nth-child(7){width:22%}.num{white-space:nowrap}.footer{margin-top:10px;font-size:9px;color:#777}</style></head><body><h1>Arbeitszeit & Fahrten – ${htmlSicher(x.titel)}</h1><div class="meta">Erstellt am ${htmlSicher(new Date().toLocaleDateString("de-DE"))}</div><div class="summary"><div><span>Stunden gesamt</span><strong>${htmlSicher(format(x.stunden))} h</strong></div><div><span>Kilometer gesamt</span><strong>${htmlSicher(format(x.km))} km</strong></div></div><table><thead><tr><th>Datum</th><th>Tag</th><th>Beginn</th><th>Ende</th><th>Stunden</th><th>Art</th><th>Fahrziel</th><th>km</th><th>Bezahlt</th></tr></thead><tbody>${body}</tbody></table><div class="footer">Arbeitszeit & Fahrten</div><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);fenster.document.close();
  }catch(e){zeige("PDF-Export: "+e.message,"error")}
}

function jsonp(p){
  return new Promise((res,rej)=>{const cb="azFahrtenCallback_"+Date.now()+"_"+(++jsonpSequenz),s=document.createElement("script");const t=setTimeout(()=>{clean();rej(new Error("Zeitüberschreitung"))},45000);function clean(){clearTimeout(t);try{delete window[cb]}catch(_){window[cb]=undefined}s.remove()}window[cb]=d=>{clean();res(d)};s.src=SCRIPT_URL+"?"+new URLSearchParams({...p,callback:cb,zeit:Date.now()});s.onerror=()=>{clean();rej(new Error("Verbindung fehlgeschlagen"))};document.head.appendChild(s)});
}
function iso(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function ausIso(s){const[a,b,c]=String(s).split("-").map(Number);return new Date(a,b-1,c)}
function isoWoche(d){const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return Math.ceil((((x-y)/86400000)+1)/7)}
function format(v){return Number(v||0).toLocaleString("de-DE",{maximumFractionDigits:2})}
function htmlSicher(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function schlafen(ms){return new Promise(r=>setTimeout(r,ms))}
function zeige(t,k){meldung.textContent=t;meldung.className=k||""}
