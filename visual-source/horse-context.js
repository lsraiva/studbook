const params=new URLSearchParams(location.search);
const high=params.get('quality')==='high';
window.STUDBOOK_VISUAL_PROFILE={name:high?'high':'lite',bytes:high?18441404:8906220,modelUrl:new URL(`assets/models/horse-${high?'high':'lite'}-v03.glb`,location.href).href};
const quality=document.getElementById('quality-switch');
quality.textContent=high?'Usar perfil leve':'Alta qualidade';
quality.onclick=()=>{const url=new URL(location.href);url.searchParams.set('quality',high?'lite':'high');location.href=url.href;};
const summary=document.getElementById('horse-summary');
const id=params.get('horse');
async function context(){
 if(!id){summary.textContent='Exemplar de demonstração · modelo compartilhado';return;}
 try{
  let horse;
  if(params.get('offline')==='1'){
   const cached=JSON.parse(sessionStorage.getItem('studbook:3d-selection')||'null');
   if(cached?.id===id)horse=cached;
  }else{
   const token=localStorage.getItem('hf:studbook:token');
   if(!token)throw Error('Entre no estábulo para consultar este cavalo.');
   const response=await fetch(new URL('api/me',location.href),{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
   if(!response.ok)throw Error('Não foi possível consultar seu estábulo.');
   const data=await response.json();horse=data.state?.view?.horses?.find(h=>h.id===id);
  }
  if(!horse)throw Error('Cavalo não encontrado neste estábulo.');
  document.querySelector('aside h1').textContent=horse.name;
  summary.textContent=`${horse.sex==='F'?'Égua':'Garanhão'} · ${horse.age} anos · ${horse.lineage} · ${params.get('offline')==='1'?'demonstração offline':'dados do seu estábulo'}. Aparência 3D ainda compartilhada.`;
 }catch(error){summary.textContent=error.message;}
}
context();
