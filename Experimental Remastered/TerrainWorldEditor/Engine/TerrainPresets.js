import { CreateTerrainLayer } from './TerrainLayerStack.js';

const specs=[
 ['Alpine Glacial Headwaters',[['multifractal',{name:'High-relief alpine massif',amplitude:185,scale:2.2,falloff:{mode:'continental',distance:400}}],['ridged',{name:'Arête spine',amplitude:105,scale:2.8,falloff:{mode:'soft',distance:300}}],['erosion-glacial',{name:'Seasonal snowpack & valley ice',season:0,temperatureC:-5,strength:.58,iterations:4,falloff:{mode:'soft',distance:300}}],['erosion-hydraulic',{name:'Snowmelt channel incision',rainfall:.5,strength:.42,iterations:3}]]],
 ['Desert Yardangs',[['multifractal',{name:'Arid basin base',amplitude:85,scale:2.3}],['billow',{name:'Wind-built dune fields',amplitude:30,duneMix:.72,azimuth:40}],['erosion-wind',{name:'Saltation & canyon fluting',azimuth:40,strength:.72,iterations:5}]]],
 ['Basalt Sea Cliffs',[['voronoi',{name:'Columnar basalt plateaus',variant:0,amplitude:145,falloff:{mode:'none'}}],['terrace',{name:'Dipping basalt benches',bedCount:8,strength:.72,falloff:{mode:'none'}}],['erosion-rockfall',{name:'Cliff wedges & talus aprons',strength:.48,iterations:2,falloff:{mode:'none'}}]]],
 ['Karst Limestone',[['multifractal',{name:'Limestone upland',amplitude:110,scale:2.1}],['erosion-hydraulic',{name:'Runoff and dissolution routing',rainfall:.62,strength:.42,iterations:4}],['erosion-chemical',{name:'Carbonate karst weathering',acidity:.8,strength:.68,iterations:5}]]],
 ['Frost-Shattered Granite',[['ridged',{name:'Jointed granitic range',amplitude:155,sharpness:.78}],['erosion-pitting',{name:'Freeze-thaw & insolation pits',temperatureC:-5,strength:.72,iterations:5}],['erosion-rockfall',{name:'Spall evacuation & talus',strength:.35,iterations:2}]]],
 ['Meandering River Basin',[['multifractal',{name:'Alluvial catchment',amplitude:95,scale:1.9,falloff:{mode:'soft',distance:340}}],['erosion-hydraulic',{name:'Infiltration, flow & sediment load',rainfall:.68,strength:.7,iterations:5}],['erosion-chemical',{name:'Streamline mineral weathering',acidity:.35,strength:.28,iterations:2}]]],
 ['Volcanic Caldera',[['voronoi',{name:'Caldera blocks',variant:2,amplitude:125}],['ridged',{name:'Rim crest',amplitude:62,falloff:{mode:'rim',distance:240}}],['erosion-hydraulic',{name:'Breach runoff',rainfall:.45,strength:.32,iterations:2}]]],
 ['Coastal Salt Playa',[['billow',{name:'Low playa dunes',amplitude:22,duneMix:.4}],['erosion-chemical',{name:'Salt crystallization weathering',acidity:.2,strength:.55,iterations:4}],['erosion-wind',{name:'Deflation & dune migration',strength:.5,iterations:3}]]],
 ['Folded Sandstone Canyon',[['ridged',{name:'Folded sedimentary upland',amplitude:145,azimuth:28}],['terrace',{name:'Cross-bedded strata',bedCount:12,dipDeg:7,strikeDeg:28}],['erosion-wind',{name:'Venturi wall abrasion',strength:.72,azimuth:65,iterations:5}],['erosion-hydraulic',{name:'Flash-flood channel cutting',rainfall:.5,strength:.38,iterations:2}]]],
 ['Temperate Foothills',[['multifractal',{name:'Foothill relief',amplitude:90}],['erosion-hydraulic',{name:'Seasonal runoff',rainfall:.4,strength:.38,iterations:3}],['erosion-chemical',{name:'Soil and silicate weathering',acidity:.35,strength:.25,iterations:2}]]],
 ['Glacial Fjord',[['multifractal',{name:'Coastal mountain body',amplitude:175,scale:2.5}],['spline',{name:'Fjord valley guide',splineMode:'river',width:130,amount:42,points:[]}],['erosion-glacial',{name:'Snow and U-valley abrasion',season:0,strength:.65,iterations:5}]]],
 ['Talus Scree Cone',[['voronoi',{name:'Jointed cliff source',variant:1,amplitude:115,falloff:{mode:'none'}}],['erosion-rockfall',{name:'Native wedge failures and sorted talus',strength:.75,iterations:4,falloff:{mode:'none'}}]]],
 ['Thermal Desert Tafoni',[['multifractal',{name:'Desert sandstone bedrock',amplitude:75}],['terrace',{name:'Porous cross-bedding',bedCount:9,dipDeg:3}],['erosion-pitting',{name:'Solar thermal fatigue',temperatureC:18,strength:.75,iterations:6}]]],
 ['Copper-Rich Highlands',[['ridged',{name:'Mineralized ridge terrain',amplitude:125}],['erosion-hydraulic',{name:'Runoff transport',rainfall:.42,strength:.38,iterations:3}],['erosion-chemical',{name:'Cu / Fe alteration and patina',acidity:.6,strength:.48,iterations:4}]]],
 ['Snowmelt Alluvial Fan',[['multifractal',{name:'Mountain catchment',amplitude:135}],['erosion-glacial',{name:'Winter accumulation / spring melt',season:1,temperatureC:3,strength:.55,iterations:3}],['erosion-hydraulic',{name:'Snowmelt fan deposition',rainfall:.76,strength:.68,iterations:5}]]],
 ['Mixed Geological Testbed',[['multifractal',{name:'Continental base',amplitude:120}],['erosion-hydraulic',{name:'Fluvial transport',strength:.4,iterations:2}],['erosion-wind',{name:'Aeolian transport',strength:.3,iterations:2}],['erosion-pitting',{name:'Cryo-thermal weathering',strength:.25,iterations:2}],['erosion-chemical',{name:'Mineral weathering',strength:.25,iterations:2}]]]
];
export const TERRAIN_PRESETS=specs.map(([name,layers])=>({name,layers}));
/** Replace only the region stack; 2D mask identity, bounds, thin slab, and region settings remain intact. */
export function ApplyTerrainPreset(region,preset){
 const spec=typeof preset==='string'?TERRAIN_PRESETS.find(p=>p.name===preset):preset;
 if(!region||!spec)throw new Error('Terrain region or preset not found');
 region.stack=spec.layers.map(([type,overrides],i)=>CreateTerrainLayer(type,{...overrides,seed:((region.id.length*977+i*7919+4029)>>>0),name:overrides.name||type}));
 region.dirty=true;region.meshDirty=true;return region;
}
