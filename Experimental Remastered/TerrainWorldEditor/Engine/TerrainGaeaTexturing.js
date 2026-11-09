/* Gaea-inspired data-driven terrain texturing utilities. Maps are Float32Arrays in [0,1]. */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const TERRAIN_DATA_MAPS=['Flow','Wear','Deposits','Talus','Velocity','Curvature','Occlusion','Slope','Insolation','Strata','Chemistry','Pitting','Wetness','Snow/Ice'];
export const TERRAIN_EXPORT_MAPS=[...TERRAIN_DATA_MAPS,'Coast','Albedo','Normal+Roughness','Splatmap RGBA'];
export const SATMAP_PALETTES=[
 {name:'Alpine Granite',stops:[[0,'#354039'],[.24,'#657064'],[.52,'#928f82'],[.78,'#bcb6a8'],[1,'#ece8de']]},
 {name:'Basalt & Lichen',stops:[[0,'#202729'],[.3,'#3d4a49'],[.58,'#65766c'],[.8,'#89917d'],[1,'#c5b99b']]},
 {name:'Desert Sandstone',stops:[[0,'#4b3324'],[.28,'#86593a'],[.55,'#bc8658'],[.82,'#dfb77b'],[1,'#f0dca9']]},
 {name:'Karst Limestone',stops:[[0,'#45443d'],[.3,'#77766b'],[.6,'#aaa99b'],[.85,'#d4d2c3'],[1,'#f0eee0']]},
 {name:'Glacial Gneiss',stops:[[0,'#39424a'],[.3,'#6e7a80'],[.6,'#9ca7a8'],[.84,'#c9ceca'],[1,'#f4f3e8']]},
 {name:'Volcanic Ash',stops:[[0,'#171b1e'],[.3,'#363b3d'],[.6,'#6e6a60'],[.82,'#a39476'],[1,'#ded0ad']]},
 {name:'Red Mesa',stops:[[0,'#482c26'],[.3,'#87483a'],[.58,'#bd7453'],[.82,'#d99c6d'],[1,'#ead0a0']]},
 {name:'Coastal Dune',stops:[[0,'#82735a'],[.3,'#b6a17b'],[.6,'#d6c396'],[.84,'#e9d8ad'],[1,'#f5ebd3']]},
 {name:'Slate & Snow',stops:[[0,'#28313d'],[.34,'#536274'],[.62,'#8794a0'],[.84,'#c4ccd1'],[1,'#f1f4f3']]},
 {name:'Copper Ore',stops:[[0,'#333b37'],[.3,'#5c665b'],[.58,'#998451'],[.8,'#b9804f'],[1,'#d5a67d']]},
 {name:'Mossy Schist',stops:[[0,'#343b31'],[.3,'#5c674c'],[.58,'#7d8461'],[.82,'#a39a76'],[1,'#d0c4a1']]},
 {name:'Evaporite Playa',stops:[[0,'#73685f'],[.3,'#a69c8f'],[.6,'#d1cabb'],[.84,'#e5e2d9'],[1,'#faf8f0']]},
 {name:'Iron-Rich Laterite',stops:[[0,'#443126'],[.3,'#87523a'],[.6,'#b46e45'],[.82,'#d49762'],[1,'#e7c891']]},
 {name:'Pillow Basalt',stops:[[0,'#232e31'],[.3,'#435958'],[.58,'#71867c'],[.82,'#a5ad9a'],[1,'#dcd8c7']]},
 {name:'Tundra Permafrost',stops:[[0,'#38443d'],[.3,'#69766b'],[.58,'#959d91'],[.82,'#c6c9bd'],[1,'#e8ece8']]},
 {name:'Canyon Ochre',stops:[[0,'#542f20'],[.3,'#8c4c2b'],[.6,'#bd733b'],[.82,'#df9b54'],[1,'#f0d095']]},
 {name:'Fjord Gabbro',stops:[[0,'#26363b'],[.3,'#506568'],[.58,'#808f8d'],[.82,'#b3b7ac'],[1,'#e4e1d5']]},
 {name:'Chalk Downs',stops:[[0,'#5c5547'],[.3,'#958d7b'],[.58,'#c3bca9'],[.82,'#e2dccb'],[1,'#f5f1e4']]},
 {name:'Serpentine',stops:[[0,'#283d39'],[.3,'#496553'],[.58,'#73836a'],[.82,'#a3a17d'],[1,'#d0c6a0']]},
 {name:'Andesite',stops:[[0,'#33373a'],[.3,'#646666'],[.58,'#92928b'],[.82,'#c0bbb0'],[1,'#e4ded0']]}
];
export const MICRO_FABRIC_STAMPS=['strata-crossbed','columnar-basalt','granite-joints','wind-flutes-ripples','tafoni-pits','scree-clutter'];

export function BuildTerrainDataMaps(rt){
 const {nx,nz,heights,sdf2D,stepX=1,stepZ=1}=rt,n=nx*nz, maps={};
 for(const name of TERRAIN_DATA_MAPS) maps[name]=new Float32Array(n);
 const get=(x,z)=>heights[clamp(z,0,nz-1)*nx+clamp(x,0,nx-1)];
 let lo=Infinity,hi=-Infinity;for(let i=0;i<n;i++)if(sdf2D[i]<=0){lo=Math.min(lo,heights[i]);hi=Math.max(hi,heights[i]);}
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const i=z*nx+x;if(sdf2D[i]>0)continue;
  const gx=(get(x+1,z)-get(x-1,z))/(2*stepX),gz=(get(x,z+1)-get(x,z-1))/(2*stepZ),s=Math.hypot(gx,gz),curv=get(x+1,z)+get(x-1,z)+get(x,z+1)+get(x,z-1)-4*heights[i];
  const range=Math.max(1,hi-lo), normalize=(key,v,den=1)=>maps[key][i]=clamp(v/den);
  normalize('Flow',rt.flow?.[i]||0,0.25);normalize('Wear',rt.wear?.[i]||0,0.5);normalize('Deposits',rt.deposits?.[i]||0,0.5);normalize('Talus',rt.talus?.[i]||0,0.35);normalize('Velocity',rt.velocity?.[i]||((rt.flow?.[i]||0)*s),0.3);
  normalize('Curvature',.5-curv*.018);normalize('Occlusion',clamp(1-s*.13));normalize('Slope',Math.atan(s)/(Math.PI/2));normalize('Insolation',clamp(.7-.25*gz/Math.max(1,s)+.15*gx/Math.max(1,s)));normalize('Strata',(heights[i]-lo)/range);normalize('Chemistry',rt.chemistry?.[i]||0);normalize('Pitting',rt.wear?.[i]||0,0.2);normalize('Wetness',rt.wetness?.[i]||0);normalize('Snow/Ice',Math.max(rt.snow?.[i]||0,rt.ice?.[i]||0),1);
 }
 return maps;
}

export function SampleSatMap(palette,elevation){const p=palette?.stops||SATMAP_PALETTES[0].stops,t=clamp(elevation),idx=Math.max(0,p.findIndex((a,i)=>i<p.length-1&&t<=p[i+1][0])),a=p[idx],b=p[Math.min(p.length-1,idx+1)],f=clamp((t-a[0])/Math.max(1e-6,b[0]-a[0]));const rgb=s=>s.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));const A=rgb(a[1]),B=rgb(b[1]);return A.map((v,i)=>Math.round(v+(B[i]-v)*f));}

/** Export a map as a browser-downloadable PNG Blob. */
export function ExportTerrainMapPng(rt,mapName='Slope',options={}){
 const maps=options.maps||BuildTerrainDataMaps(rt), values=maps[mapName];
 if(!values&&!['Coast','Albedo','Normal+Roughness','Splatmap RGBA'].includes(mapName))throw new Error(`Unknown terrain map: ${mapName}`);
 const canvas=document.createElement('canvas');canvas.width=rt.nx;canvas.height=rt.nz;const ctx=canvas.getContext('2d'),img=ctx.createImageData(rt.nx,rt.nz),n=rt.nx*rt.nz;
 const palette=SATMAP_PALETTES.find(p=>p.name===options.paletteName)||SATMAP_PALETTES[0];
 for(let z=0;z<rt.nz;z++)for(let x=0;x<rt.nx;x++){const i=z*rt.nx+x,p=i*4; if(rt.sdf2D[i]>0){img.data[p+3]=0;continue;}
  if(mapName==='Coast'){const c=Math.round(clamp(.5-rt.sdf2D[i]/Math.max(1,options.coastRange||500))*255);img.data[p]=img.data[p+1]=img.data[p+2]=c;img.data[p+3]=255;continue;}
  if(mapName==='Albedo'){const c=SampleSatMap(palette,maps.Strata[i]);img.data[p]=c[0];img.data[p+1]=c[1];img.data[p+2]=c[2];img.data[p+3]=255;continue;}
  if(mapName==='Normal+Roughness'){const gx=(rt.heights[z*rt.nx+Math.min(rt.nx-1,x+1)]-rt.heights[z*rt.nx+Math.max(0,x-1)])/(2*(rt.stepX||1)),gz=(rt.heights[Math.min(rt.nz-1,z+1)*rt.nx+x]-rt.heights[Math.max(0,z-1)*rt.nx+x])/(2*(rt.stepZ||1)),len=Math.hypot(gx,1,gz);img.data[p]=Math.round((-.0-gx/len)*127.5+127.5);img.data[p+1]=Math.round((1/len)*127.5+127.5);img.data[p+2]=Math.round((-.0-gz/len)*127.5+127.5);img.data[p+3]=Math.round((.88-(maps.Wetness[i]||0)*.3)*255);continue;}
  if(mapName==='Splatmap RGBA'){img.data[p]=Math.round(maps.Slope[i]*255);img.data[p+1]=Math.round(maps.Flow[i]*255);img.data[p+2]=Math.round(maps.Deposits[i]*255);img.data[p+3]=Math.round(maps['Snow/Ice'][i]*255);continue;}
  const c=Math.round(clamp(values[i])*255);img.data[p]=img.data[p+1]=img.data[p+2]=c;img.data[p+3]=255;
 }
 ctx.putImageData(img,0,0);return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
