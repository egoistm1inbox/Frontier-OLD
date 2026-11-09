/* Deterministic CPU geomorphology kernels for the Terrain Studio heightfield surface.
 * All transport is bounded to the 2D land mask; sediment is tracked separately from bedrock.
 * These are fast authoring-scale approximations, not a claim of fully coupled field simulation.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (i, seed) => { let x = Math.imul((i + seed) | 0, 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return ((x ^ (x >>> 16)) >>> 0) / 4294967295; };
const offsets = [-1, 1, 0, 0];
const zoffs = [0, 0, -1, 1];

export const EROSION_LAYER_TYPES = ['erosion-hydraulic', 'erosion-wind', 'erosion-pitting', 'erosion-rockfall', 'erosion-chemical', 'erosion-glacial'];

/** Run a stable, deterministic erosion pass. Mutates heights & sediment fields and returns diagnostics. */
export function StepTerrainErosion(state, options = {}) {
    const { nx, nz, heights, sdf2D } = state;
    const n = nx * nz;
    if (!heights || heights.length !== n || !sdf2D) throw new Error('Invalid terrain erosion state');
    const dx = Math.max(0.1, state.stepX || 1), dz = Math.max(0.1, state.stepZ || dx);
    const cell = Math.sqrt(dx * dz), sea = Number(options.seaLevel) || 0;
    const kind = options.kind || 'erosion-hydraulic';
    const strength = clamp(Number(options.strength ?? 0.5), 0, 1);
    const dt = clamp(Number(options.dt ?? 1), 0.05, 20);
    const rain = clamp(Number(options.rainfall ?? 0.35), 0, 1);
    const season = ((Number(options.season) || 0) % 4 + 4) % 4;
    const allowed = i => sdf2D[i] <= 0 && heights[i] > (state.slabBottom ?? sea - 6) + 0.35;
    const ensure = (key) => state[key] instanceof Float32Array && state[key].length === n ? state[key] : (state[key] = new Float32Array(n));
    const sediment = ensure('sediment'), fine = ensure('fineSediment'), wetness = ensure('wetness'), flow = ensure('flow'), wear = ensure('wear'), deposits = ensure('deposits'), talus = ensure('talus'), chemistry = ensure('chemistry'), snow = ensure('snow'), ice = ensure('ice');
    const before = heights.reduce((s, h, i) => s + (allowed(i) ? h : 0), 0);
    let exported = 0, eroded = 0, deposited = 0;

    if (kind === 'erosion-hydraulic') {
        const water = ensure('waterDepth'), flux = new Float32Array(n * 4), incoming = new Float32Array(n), sedimentOut = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) if (allowed(i)) {
            water[i] += rain * (0.08 + 0.45 * strength) * dt;
            const evap = Math.min(water[i], 0.012 * dt); water[i] -= evap;
            // Green-Ampt-like infiltration; porous soil infiltrates faster at low saturation.
            const infiltration = Math.min(water[i], (0.008 + 0.018 * (1 - clamp(sediment[i] / 2, 0, 1))) * dt);
            water[i] -= infiltration; wetness[i] = clamp(wetness[i] * 0.72 + water[i] * 1.8, 0, 1);
            const x = i % nx, z = (i / nx) | 0; let sum = 0, slopes = [0, 0, 0, 0];
            for (let d = 0; d < 4; d++) { const xx=x+offsets[d], zz=z+zoffs[d]; if(xx<0||xx>=nx||zz<0||zz>=nz) continue; const j=zz*nx+xx; const drop=heights[i]-heights[j]; if(drop>0 && sdf2D[j]<=0) { slopes[d]=drop/(d<2?dx:dz); sum+=slopes[d]; } }
            // A limited virtual-pipe flux, no opaque sheet-water accumulation.
            const moving = Math.min(water[i], Math.sqrt(Math.max(0.001, sum)) * water[i] * 0.28 * dt);
            for(let d=0;d<4;d++) if(slopes[d]>0) { const f=moving*slopes[d]/sum; flux[i*4+d]=f; const xx=x+offsets[d],zz=z+zoffs[d],j=zz*nx+xx; incoming[j]+=f; }
            if(sum>0.05 && water[i]>0.035) {
                const shear = Math.sqrt(sum) * water[i] * 9.81;
                const capacity = Math.max(0, shear-0.035) * 0.018 * strength;
                const detach = Math.min(0.035*strength, Math.max(0, capacity-sediment[i])*0.22*dt);
                const bedrockCut = Math.min(0.006*strength, Math.max(0, shear-0.35)*0.0008*dt);
                heights[i] -= detach + bedrockCut; sediment[i] += detach + bedrockCut; wear[i] += detach + bedrockCut; eroded += detach + bedrockCut;
            }
        }
        for(let i=0;i<n;i++) if(allowed(i)) {
            let out=0; for(let d=0;d<4;d++) out+=flux[i*4+d];
            const old=water[i]; water[i]=Math.max(0, old-out+incoming[i]); flow[i]=flow[i]*0.78+incoming[i]*0.22;
            const capacity=Math.max(0, flow[i]-0.025)*0.28;
            const settle=Math.min(sediment[i], Math.max(0, sediment[i]-capacity)*0.24);
            if(settle>0){ heights[i]+=settle; sediment[i]-=settle; deposits[i]+=settle; deposited+=settle; }
            // Coastal cells and cells at sea level drain to open ocean; no globally flooded water plane.
            if(sdf2D[i] >= -cell*0.65 || heights[i] <= sea+0.2) { exported += sediment[i]*0.015; sediment[i]*=0.985; water[i]*=0.15; }
        }
    } else if (kind === 'erosion-wind') {
        const az=(Number(options.azimuth)||35)*Math.PI/180, vx=Math.cos(az), vz=Math.sin(az), next=new Float32Array(n);
        for(let z=1;z<nz-1;z++) for(let x=1;x<nx-1;x++) { const i=z*nx+x; if(!allowed(i))continue;
            const gx=(heights[i+1]-heights[i-1])/(2*dx), gz=(heights[i+nx]-heights[i-nx])/(2*dz);
            const exposure=clamp(0.58+0.42*(Math.abs(gx* vz-gz*vx)+0.25),0,1.45); const speed=(0.25+strength*0.9)*exposure;
            const loose=Math.min(0.025*dt, Math.max(0, heights[i]-((state.baseTop||sea)+0.3))*0.00016*speed);
            const cut=Math.min(0.025*dt, Math.max(0, speed-0.55)*0.006*strength*(0.3+Math.abs(gx*vz-gz*vx)));
            heights[i]-=loose+cut; eroded+=loose+cut; const j=(z+Math.round(vz)) * nx + x + Math.round(vx);
            if(j>=0&&j<n&&sdf2D[j]<=0) next[j]+=loose+cut; else exported+=loose+cut;
            // Avalanching slipface toward repose angle (34 degrees).
            for(let d=0;d<4;d++){const xx=x+offsets[d],zz=z+zoffs[d],j2=zz*nx+xx;if(!allowed(j2))continue;const diff=heights[i]-heights[j2], repose=Math.tan(34*Math.PI/180)*(d<2?dx:dz);if(diff>repose){const t=Math.min(0.006*strength,(diff-repose)*0.025);next[j2]+=t;next[i]-=t;}}
        }
        for(let i=0;i<n;i++) if(allowed(i)&&next[i]) { heights[i]+=next[i]; deposits[i]+=next[i]; deposited+=next[i]; }
    } else if (kind === 'erosion-pitting') {
        const temp=Number(options.temperatureC ?? -5), cold=clamp((-temp-2)/6,0,1), solar=clamp(Number(options.solarExposure ?? 0.55),0,1);
        const thermal=clamp(Number(options.diurnalRangeC ?? 18)/35,0,1)*solar;
        for(let i=0;i<n;i++)if(allowed(i)){
            const porous=0.45+0.55*hash(i,Number(options.seed)||4029), joint=0.25+0.75*hash(i,((Number(options.seed)||4029)^0x31ad));
            // Per-step damage is an authoring-time equivalent: enough to expose sub-cell spalls at 8–20m sampling, while remaining deterministic and tunable.
            const damage=Math.min(0.65,(cold*0.85+thermal*0.45)*strength*porous*joint*dt);
            if(damage>0){ heights[i]-=damage; sediment[i]+=damage; fine[i]+=damage; wear[i]+=damage; eroded+=damage; }
        }
        // Immediate gravity evacuation from steep pits prevents self-burial.
        for(let z=1;z<nz-1;z++)for(let x=1;x<nx-1;x++){const i=z*nx+x;if(!allowed(i)||fine[i]<0.001)continue;let low=i;for(let d=0;d<4;d++){const j=(z+zoffs[d])*nx+x+offsets[d];if(allowed(j)&&heights[j]<heights[low])low=j;}if(low!==i&&heights[i]-heights[low]>0.2){const move=Math.min(fine[i]*0.18,0.01);fine[i]-=move;sediment[i]=Math.max(0,sediment[i]-move);sediment[low]+=move;}}
    } else if (kind === 'erosion-rockfall') {
        const friction=clamp(Number(options.friction ?? 0.52),0.2,0.9), threshold=Math.tan((Number(options.criticalAngle)||48)*Math.PI/180);
        const delta=new Float32Array(n);
        for(let z=1;z<nz-1;z++)for(let x=1;x<nx-1;x++){const i=z*nx+x;if(!allowed(i))continue;let j=-1,drop=0;for(let d=0;d<4;d++){const k=(z+zoffs[d])*nx+x+offsets[d],s=(heights[i]-heights[k])/(d<2?dx:dz);if(s>drop){drop=s;j=k;}}
            if(j>=0&&drop>threshold){const wedge=Math.min(Math.max(0,heights[i]-(state.baseTop||sea)),0.35*strength);if(wedge>0){delta[i]-=wedge;let cur=j,remaining=wedge;for(let step=0;step<8&&remaining>0.001;step++){const cz=(cur/nx)|0,cx=cur%nx;let next=-1,dh=0;for(let d=0;d<4;d++){let xx=cx+offsets[d],zz=cz+zoffs[d];if(xx<0||xx>=nx||zz<0||zz>=nz)continue;let k=zz*nx+xx,dd=heights[cur]-heights[k];if(allowed(k)&&dd>dh){dh=dd;next=k;}}if(next<0)break;const put=Math.min(remaining*0.25,0.07);delta[next]+=put;remaining-=put;cur=next;}if(remaining>0){delta[cur]+=remaining;talus[cur]+=remaining;}eroded+=wedge;}}
        }
        for(let i=0;i<n;i++)if(delta[i]){heights[i]+=delta[i];sediment[i]=Math.max(0,sediment[i]+delta[i]);if(delta[i]>0){deposits[i]+=delta[i];deposited+=delta[i];}}
    } else if (kind === 'erosion-chemical') {
        const acidity=clamp(Number(options.acidity ?? 0.45),0,1), wet=rain;
        for(let i=0;i<n;i++)if(allowed(i)){const rate=(0.0015+0.008*acidity*wet)*strength*dt;heights[i]-=rate;chemistry[i]=clamp(chemistry[i]+rate*12,0,1);wear[i]+=rate;eroded+=rate;}
        // Advected stain proxy follows the hydraulic flow field.
        for(let i=0;i<n;i++)if(allowed(i)) chemistry[i]=clamp(chemistry[i]+(flow[i]||0)*0.002,0,1);
    } else if (kind === 'erosion-glacial') {
        const temp=Number(options.temperatureC ?? (season===0?-7:season===1?1:season===2?8:-2));
        for(let i=0;i<n;i++)if(allowed(i)){const h=heights[i]-sea, cold=clamp((7-temp)/12,0,1), accumulation=clamp((2800-h)/1600,0,1)*cold*0.08*dt; snow[i]=Math.max(0,snow[i]+accumulation-(temp>1?0.12*dt:0)); ice[i]=Math.max(0,ice[i]+snow[i]*0.18);
            const z=(i/nx)|0,x=i%nx; let slope=0; if(x>0&&x<nx-1)slope=Math.max(slope,Math.abs(heights[i+1]-heights[i-1])/(2*dx));if(z>0&&z<nz-1)slope=Math.max(slope,Math.abs(heights[i+nx]-heights[i-nx])/(2*dz));
            const abrasion=Math.min(0.025*strength,ice[i]*slope*0.06*dt); heights[i]-=abrasion; wear[i]+=abrasion; eroded+=abrasion; if(temp>1){wetness[i]=clamp(wetness[i]+snow[i]*0.2,0,1);snow[i]*=0.82;}}
    }
    const after=heights.reduce((s,h,i)=>s+(allowed(i)?h:0),0);
    return { kind, cells:n, eroded, deposited, exported, elevationDelta:after-before, massResidual:eroded-deposited-exported, fields:{sediment,fineSediment:fine,wetness,flow,wear,deposits,talus,chemistry,snow,ice} };
}

/** Runtime single-frame simulation entry point; deterministic if options.tick/seed are unchanged. */
export function StepWorldWeatherSimulation(regions, options = {}) {
    const group = options.weatherGroupId;
    const list = (regions || []).filter(r => r?.runtime?.hasLand && (!group || r.weatherGroupId === group));
    const results = [];
    for (const region of list) {
        const result = StepTerrainErosion(region.runtime, { ...options, seed: (options.seed ?? 4029) + (options.sharedPattern ? 0 : (region.id || '').length * 97) });
        region.dirty = false; region.meshDirty = true; results.push({ regionId: region.id, ...result });
    }
    return results;
}
