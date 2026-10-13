/* Integer cents only. Suggestions never write data. */
(function(root){
 function propose(items,target){
  if(!Number.isSafeInteger(target)||target<=0)throw new Error('Ungültiger Betrag.');
  const open=items.filter(x=>Number.isSafeInteger(x.offenCent)&&x.offenCent>0).sort((a,b)=>String(a.datum||'').localeCompare(String(b.datum||'')));
  const total=open.reduce((s,x)=>s+x.offenCent,0);
  if(target>total)return {kind:'excess',alternatives:[],restCent:target-total};
  let states=new Map([[0,[[]]]]),limited=false;
  for(let i=0;i<open.length;i++){
   const previous=[...states].map(([sum,paths])=>[sum,paths.slice()]);
   for(const [sum,paths] of previous){
    const next=sum+open[i].offenCent;if(next>target)continue;
    if(!states.has(next)&&states.size>=20000){limited=true;continue;}
    const dest=states.get(next)||[];
    for(const path of paths){if(dest.length<3)dest.push([...path,i]);}
    states.set(next,dest);
   }
   if(limited)break;
  }
  const exact=states.get(target);
  if(exact)return {kind:'exact',limited,alternatives:exact.map(path=>path.map(i=>({...open[i],betragCent:open[i].offenCent})))};
  let rest=target;const allocations=[];
  for(const item of open){if(!rest)break;const n=Math.min(rest,item.offenCent);allocations.push({...item,betragCent:n});rest-=n;}
  return {kind:'oldest',limited,alternatives:[allocations]};
 }
 root.JanePayments={propose};
 if(typeof module!=='undefined')module.exports=root.JanePayments;
})(typeof globalThis!=='undefined'?globalThis:this);
