import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import { appearanceFromSpec } from '../assets/phenotype.js';
const $=id=>document.getElementById(id);
const search=new URLSearchParams(location.search);
const studio=search.has('studio');
const mobile=matchMedia('(max-width: 900px)').matches;
if(studio)document.body.classList.add('studio-mode');
const host=$('stage');
const profile=window.STUDBOOK_VISUAL_PROFILE??{name:'high',bytes:22450000};const lite=profile.name==='lite';
for(const row of document.querySelectorAll('.details div')){const label=row.querySelector('span'),value=row.querySelector('b');if(label?.textContent==='Material')value.textContent=lite?'PBR · texturas 1K':'PBR · 2K sem perdas';if(label?.textContent==='Arquivo original'){label.textContent='Modelo otimizado';value.textContent=(profile.bytes/1e6).toFixed(2)+' MB';}}
const palettes={studio:{bg:0x121b15,floor:0x1b271d,key:0xffd2a0,exposure:1.1},sunset:{bg:0x9d886e,floor:0x79664b,key:0xffc27a,exposure:1.05},night:{bg:0x152227,floor:0x28363b,key:0xb1ceff,exposure:.92},portrait:{bg:0x121b15,floor:0x1a251b,key:0xffd5a0,exposure:1.12}};
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:studio});}catch(e){$('loading').innerHTML='<h2>WebGL indisponível</h2><p>Abra este arquivo em um navegador atualizado com aceleração gráfica.</p>';throw e;}
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
const software=ext&&/SwiftShader|llvmpipe/i.test(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
let quality=software?.75:Math.min(devicePixelRatio,mobile||lite?1:1.5);
renderer.setPixelRatio(quality);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Cavalo 3D interativo; arraste para girar e use a roda ou gesto de pinça para aproximar.');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.05,100);
const pmrem=new THREE.PMREMGenerator(renderer);const environment=new RoomEnvironment();scene.environment=pmrem.fromScene(environment,.04).texture;environment.dispose();pmrem.dispose();scene.environmentIntensity=.65;
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=3.5;controls.maxDistance=10;controls.minPolarAngle=.35;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=false;
const hemi=new THREE.HemisphereLight(0xe8f1ff,0x4a3d2d,.65);scene.add(hemi);
const key=new THREE.DirectionalLight(0xffedda,3.3);key.position.set(-3.5,7,5);key.castShadow=true;key.shadow.mapSize.set(lite||mobile?1024:2048,lite||mobile?1024:2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.camera.near=.1;key.shadow.camera.far=18;key.shadow.normalBias=.025;key.shadow.bias=-.0001;scene.add(key);
const rim=new THREE.DirectionalLight(0xc5deff,2.1);rim.position.set(4,5,-4);scene.add(rim);
const floorMaterial=new THREE.MeshStandardMaterial({color:0xc9c2b3,roughness:.88});
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.13;floor.receiveShadow=true;scene.add(floor);
const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(2.35,2.35,.12,96),new THREE.MeshStandardMaterial({color:0xbeb6a5,roughness:.86,metalness:.08}));pedestal.position.y=-.06;pedestal.receiveShadow=true;scene.add(pedestal);
const ring=new THREE.Mesh(new THREE.TorusGeometry(2.29,.009,6,96),new THREE.MeshStandardMaterial({color:0xa38b59,metalness:.65,roughness:.4}));ring.rotation.x=Math.PI/2;ring.position.y=.004;scene.add(ring);
let mixer,activeAction,model,clips=[],paused=false,autoRotate=false;let cameraGoal=null,cameraView='three';const target=new THREE.Vector3();
let anatomyStrength=1;const anatomyMeshes=[];
function setAnatomy(value){anatomyStrength=Number(value);for(const {mesh,index} of anatomyMeshes)mesh.morphTargetInfluences[index]=anatomyStrength;$('anatomy-value').textContent=Math.round(anatomyStrength*100)+'%';$('anatomy-range').value=anatomyStrength;document.querySelectorAll('[data-anatomy]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.anatomy)===anatomyStrength));if(window.__horseProof)window.__horseProof.anatomyStrength=anatomyStrength;}
const cameraPresets={three:[4.35,2.45,4.85],side:[6.5,2.2,.1],front:[.1,2.0,6.7]};
function setCamera(name){cameraView=name;cameraGoal=new THREE.Vector3(...cameraPresets[name]);cameraGoal.sub(controls.target).multiplyScalar(Math.max(1,.95/camera.aspect)).add(controls.target);document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('selected',b.dataset.camera===name));}
function lighting(name){const p=palettes[name];scene.background=new THREE.Color(p.bg);scene.fog=new THREE.Fog(p.bg,15,45);floorMaterial.color.setHex(p.floor);key.color.setHex(p.key);renderer.toneMappingExposure=p.exposure;pedestal.material.color.setHex(p.floor);rim.intensity=name==='night'?3:name==='studio'?2.6:2.1;scene.environmentIntensity=name==='night'?.28:.6;document.querySelectorAll('[data-light]').forEach(b=>b.classList.toggle('selected',b.dataset.light===name));}
function play(name){const clip=THREE.AnimationClip.findByName(clips,name);if(!clip)return;const next=mixer.clipAction(clip);if(activeAction!==next){next.reset().fadeIn(.35).play();activeAction?.fadeOut(.35);activeAction=next;}document.querySelectorAll('[data-clip]').forEach(b=>b.classList.toggle('selected',b.dataset.clip===name));$('motion').textContent={Idle:'Repouso',Idle_2:'Repouso II',Walk:'Passo',Trot:'Trote',Canter:'Galope curto',Gallop:'Galope'}[name]||name;window.__horseProof.activeClip=name;}
lighting('studio');controls.target.set(0,1.2,0);camera.position.fromArray(cameraPresets.three);
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();setCamera(cameraView);}new ResizeObserver(resize).observe(host);resize();
const coatMaterials=[];
function paintCoat(material,look){
 const sockHeight=[-1,0.3,0.38,0.46,0.55][look.sockCount??0];
 const blaze=(look.blazeWidth??0)>0?1:0;
 const u={coat:{value:new THREE.Color(look.bodyColor)},sock:{value:sockHeight},blaze:{value:blaze}};
 coatMaterials.push({material,u});
 material.color.set(0xffffff);
 material.onBeforeCompile=(shader)=>{
  shader.uniforms.uCoat=u.coat;
  shader.uniforms.uSockHeight=u.sock;
  shader.uniforms.uBlaze=u.blaze;
  shader.vertexShader='varying vec3 vRestPos;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vRestPos = position;');
  shader.fragmentShader='varying vec3 vRestPos;\nuniform vec3 uCoat;\nuniform float uSockHeight;\nuniform float uBlaze;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
   float mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
   float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
   float baseWhite = smoothstep(0.52, 0.72, mn) * (1.0 - smoothstep(0.18, 0.35, mx - mn));
   diffuseColor.rgb = mix(diffuseColor.rgb, uCoat * (0.9 + lum * 0.4), baseWhite * 0.92);
   diffuseColor.rgb = mix(diffuseColor.rgb, uCoat * (0.45 + lum * 1.25), 0.78);
   float sockEdge = smoothstep(uSockHeight - 0.02, uSockHeight + 0.045, vRestPos.y);
   vec3 socked = mix(diffuseColor.rgb, vec3(0.94,0.92,0.86), 0.9);
   diffuseColor.rgb = mix(socked, diffuseColor.rgb, sockEdge);
   float faceZ = smoothstep(1.24, 1.34, vRestPos.z);
   float faceY = smoothstep(1.98, 2.06, vRestPos.y) * (1.0 - smoothstep(2.25, 2.32, vRestPos.y));
   float faceX = 1.0 - smoothstep(0.09, 0.14, abs(vRestPos.x));
   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94,0.92,0.86), uBlaze * faceZ * faceY * faceX * 0.95);`);
 };
 material.needsUpdate=true;
}
try{
 const gltf=await new GLTFLoader().loadAsync(profile.modelUrl);model=gltf.scene;clips=gltf.animations;
 const appearance=studio?appearanceFromSpec({coat:search.get('coat')||'bay',socks:search.get('socks')||0,blaze:search.get('blaze')||0}):((window.__horseAppearance)??(await window.__horseAppearancePromise)??{bodyColor:'#7a4b2e',maneColor:'#241a14',sockCount:0,blazeWidth:0,labelPt:'Castanho'});
 const bounds=new THREE.Box3().setFromObject(model),center=new THREE.Vector3(),size=new THREE.Vector3();bounds.getCenter(center);bounds.getSize(size);model.position.set(-center.x,-bounds.min.y,-center.z);scene.add(model);
 model.traverse(node=>{if(node.isMesh){const shape=node.morphTargetDictionary?.StudbookAthleticStudy;if(Number.isInteger(shape))anatomyMeshes.push({mesh:node,index:shape});node.castShadow=true;node.receiveShadow=false;node.frustumCulled=false;const mats=Array.isArray(node.material)?node.material:[node.material];for(const material of mats){if(material.map)material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());if(material.alphaTest>0)material.side=THREE.DoubleSide;if(material.name==='coat_B')paintCoat(material,appearance);if(material.name==='tail_hair')material.color.set(appearance.maneColor);}}});
 mixer=new THREE.AnimationMixer(model);controls.target.set(0,size.y*.5,0);
 window.__horseProof={loaded:true,profile:profile.name,modelBytes:profile.bytes,appearance,animations:clips.map(c=>({name:c.name,duration:c.duration})),softwareRenderer:!!software,dimensions:size.toArray(),errors:[]};
 window.__applyLook=(spec)=>{const look=appearanceFromSpec(spec);for(const {u} of coatMaterials){u.coat.value.set(look.bodyColor);u.sock.value=[-1,0.3,0.38,0.46,0.55][look.sockCount];u.blaze.value=look.blazeWidth>0?1:0;}model.traverse(node=>{if(node.isMesh){const mats=Array.isArray(node.material)?node.material:[node.material];for(const m of mats)if(m.name==='tail_hair')m.color.set(look.maneColor);}});window.__horseProof.appearance=look;return look;};
 window.__snap=()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');};
 $('loading').hidden=true;document.querySelectorAll('button,input').forEach(e=>e.disabled=false);$('status').textContent=software?'Modelo carregado · renderização por software':'Modelo 3D carregado';$('loading-progress').hidden=true;play('Idle');setAnatomy(1);window.__horseProof.anatomyMeshes=anatomyMeshes.length;if(studio){lighting('portrait');setCamera('three');}
}catch(e){$('loading').innerHTML='<h2>Não foi possível abrir o modelo</h2><p>O arquivo pode estar incompleto. Abra a cópia baixada integralmente.</p>';window.__horseProof={loaded:false,error:String(e)};console.error(e);}
document.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>play(b.dataset.clip));document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>setCamera(b.dataset.camera));document.querySelectorAll('[data-light]').forEach(b=>b.onclick=()=>lighting(b.dataset.light));
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Retomar':'Pausar';};$('rotate').onclick=()=>{autoRotate=!autoRotate;controls.autoRotate=autoRotate;controls.autoRotateSpeed=.6;$('rotate').classList.toggle('selected',autoRotate);};$('speed').oninput=e=>{$('speed-value').textContent=Number(e.target.value).toFixed(2)+'×';};
document.querySelectorAll('[data-anatomy]').forEach(b=>b.onclick=()=>setAnatomy(b.dataset.anatomy));$('anatomy-range').oninput=e=>setAnatomy(e.target.value);
controls.addEventListener('start',()=>{cameraGoal=null;});
let last=performance.now(),elapsed=0,frames=0,windowStart=last;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;if(document.hidden)return;if(mixer&&!paused)mixer.update(dt*Number($('speed').value));for(const {mesh,index} of anatomyMeshes)mesh.morphTargetInfluences[index]=anatomyStrength;if(cameraGoal){camera.position.lerp(cameraGoal,Math.min(1,dt*5));if(camera.position.distanceToSquared(cameraGoal)<.0001)cameraGoal=null;}controls.update();renderer.render(scene,camera);frames++;
 if(now-windowStart>1200){const fps=Math.round(frames*1000/(now-windowStart));$('perf').textContent=fps+' FPS · '+renderer.info.render.calls+' draw calls';if(window.__horseProof){window.__horseProof.fps=fps;window.__horseProof.drawCalls=renderer.info.render.calls;window.__horseProof.triangles=renderer.info.render.triangles;window.__horseProof.renderScale=quality;}if(fps<28&&quality>.55){quality=Math.max(.55,quality*.8);renderer.setPixelRatio(quality);}frames=0;windowStart=now;}}
requestAnimationFrame(frame);
