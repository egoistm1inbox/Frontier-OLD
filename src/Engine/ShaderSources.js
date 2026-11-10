//============================================================================================================================================
//                                                           SHADERSOURCES.JS
//============================================================================================================================================
// GLSL ES 3.00 shader sources for G-Buffer, Candidate Path Tracing, ReSTIR Temporal/Spatial Resampling, Multi-Bounce Reflections, and Tone Mapping.

export const GBufferVertexShader = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in float a_matId;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_prevModelViewProj;

out vec3 v_worldPos;
out vec3 v_worldNormal;
out float v_matId;
out vec4 v_clipCurrent;
out vec4 v_clipPrev;

void main() {
    vec4 worldPos = u_model * vec4(a_position, 1.0);
    v_worldPos = worldPos.xyz;
    
    // Normal transform
    mat3 normalMat = mat3(u_model);
    v_worldNormal = normalize(normalMat * a_normal);
    
    v_matId = a_matId;
    
    vec4 clipPos = u_projection * u_view * worldPos;
    v_clipCurrent = clipPos;
    v_clipPrev = u_prevModelViewProj * vec4(a_position, 1.0);
    
    gl_Position = clipPos;
}
`;

export const GBufferFragmentShader = `#version 300 es
precision highp float;

layout(location = 0) out vec4 outPosDepth;       // xyz: worldPos, w: linearDepth
layout(location = 1) out vec4 outNormalRough;     // xyz: normal, w: roughness
layout(location = 2) out vec4 outAlbedoMetal;     // rgb: albedo, a: metallic
layout(location = 3) out vec4 outMaterialParam;   // x: specular, y: transmission, z: IOR, w: matId
layout(location = 4) out vec2 outMotion;          // xy: screen motion vector

in vec3 v_worldPos;
in vec3 v_worldNormal;
in float v_matId;
in vec4 v_clipCurrent;
in vec4 v_clipPrev;

// Material Uniforms
uniform vec3 u_carPaintColor;
uniform float u_carClearcoatWeight;
uniform float u_carClearcoatRoughness;
uniform float u_carFlakeHeadroom;

uniform vec3 u_glassColor;
uniform float u_glassIor;
uniform float u_glassRoughness;
uniform float u_glassTransmission;

uniform vec3 u_plasticColor;
uniform float u_plasticRoughness;
uniform float u_plasticSpecular;
uniform float u_plasticClearcoat;

uniform vec3 u_metalColor;
uniform float u_metalRoughness;
uniform float u_metalness;

uniform float u_tyreRoughness;
uniform vec3 u_rimColor;
uniform float u_rimMetallic;

uniform float u_floorRoughness;
uniform float u_floorReflectivity;

void main() {
    vec3 N = normalize(v_worldNormal);
    float matId = floor(v_matId + 0.5);
    
    vec3 albedo = vec3(0.5);
    float roughness = 0.5;
    float metallic = 0.0;
    float specular = 0.04;
    float transmission = 0.0;
    float ior = 1.5;
    
    // Material ID classification matching Frontier CourseMaterial
    if (matId == 6.0) {
        // BodyCoat (Car Paint)
        albedo = u_carPaintColor * u_carFlakeHeadroom;
        roughness = mix(0.04, u_carClearcoatRoughness, 0.5);
        metallic = 0.15;
        specular = mix(0.04, 0.25, u_carClearcoatWeight);
    } else if (matId == 7.0) {
        // VehicleGlass (Windshield & Windows)
        albedo = u_glassColor;
        roughness = u_glassRoughness;
        metallic = 0.0;
        specular = 0.05;
        transmission = u_glassTransmission;
        ior = u_glassIor;
    } else if (matId == 8.0) {
        // VehiclePlastic
        albedo = u_plasticColor;
        roughness = u_plasticRoughness;
        metallic = 0.0;
        specular = u_plasticSpecular;
    } else if (matId == 9.0) {
        // Tyre Rubber
        albedo = vec3(0.035);
        roughness = u_tyreRoughness;
        metallic = 0.0;
        specular = 0.02;
    } else if (matId == 10.0) {
        // Wheel Hub / Rim
        albedo = u_rimColor;
        roughness = 0.18;
        metallic = u_rimMetallic;
        specular = 0.12;
    } else if (matId == 13.0) {
        // Headlight (Emissive)
        albedo = vec3(1.0);
        roughness = 0.05;
        metallic = 0.0;
        specular = 0.08;
    } else if (matId == 14.0) {
        // Taillight (Emissive Red)
        albedo = vec3(0.95, 0.05, 0.02);
        roughness = 0.08;
        metallic = 0.0;
        specular = 0.06;
    } else if (matId == 82.0) {
        // Chrome Mirror
        albedo = vec3(0.98);
        roughness = 0.005;
        metallic = 1.0;
        specular = 1.0;
    } else if (matId == 84.0) {
        // Gold Conductor
        albedo = u_metalColor;
        roughness = u_metalRoughness;
        metallic = u_metalness;
        specular = 0.15;
    } else if (matId == 85.0) {
        // Showcase Optical Glass
        albedo = u_glassColor;
        roughness = u_glassRoughness;
        metallic = 0.0;
        transmission = u_glassTransmission;
        ior = u_glassIor;
        specular = 0.05;
    } else if (matId >= 26.0 && matId <= 32.0) {
        // Proving Ground Asphalt / Floor
        // Checkered pattern for showcase evaluation
        vec2 grid = floor(v_worldPos.xy * 0.5);
        float check = mod(grid.x + grid.y, 2.0);
        vec3 darkTile = vec3(0.065, 0.067, 0.072);
        vec3 lightTile = vec3(0.12, 0.125, 0.135);
        albedo = mix(darkTile, lightTile, check);
        roughness = u_floorRoughness;
        metallic = 0.0;
        specular = mix(0.04, 0.15, u_floorReflectivity);
    } else {
        // Default / Trim
        albedo = vec3(0.25);
        roughness = 0.45;
        metallic = 0.1;
        specular = 0.04;
    }
    
    // Depth
    float depth = gl_FragCoord.z;
    outPosDepth = vec4(v_worldPos, depth);
    outNormalRough = vec4(N, roughness);
    outAlbedoMetal = vec4(albedo, metallic);
    outMaterialParam = vec4(specular, transmission, ior, matId);
    
    // Motion vector
    vec2 ndcCurrent = (v_clipCurrent.xy / v_clipCurrent.w) * 0.5 + 0.5;
    vec2 ndcPrev = (v_clipPrev.xy / v_clipPrev.w) * 0.5 + 0.5;
    outMotion = ndcCurrent - ndcPrev;
}
`;

export const ScreenQuadVertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// ReSTIR PT Enhanced Candidate Generation & Path Tracing Shader
export const ReSTIRCandidateShader = `#version 300 es
precision highp float;

layout(location = 0) out vec4 outReservoirData; // xyz: hitPosition x2, w: candidate target p_hat
layout(location = 1) out vec4 outReservoirRadiance; // rgb: incoming radiance L_i, w: weight W
layout(location = 2) out vec4 outReservoirStats; // x: weightSum, y: sampleCount M, z: matId x2, w: valid

in vec2 v_uv;

uniform sampler2D u_gPosDepth;
uniform sampler2D u_gNormalRough;
uniform sampler2D u_gAlbedoMetal;
uniform sampler2D u_gMaterialParam;

uniform vec3 u_cameraPos;
uniform mat4 u_invView;
uniform mat4 u_invProjection;
uniform uint u_frameIndex;
uniform int u_candidateCount; // Initial RIS candidate count M (e.g. 2 to 16)
uniform int u_maxBounces;

// Lighting uniforms
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;
uniform vec3 u_skyZenith;
uniform vec3 u_skyHorizon;

uniform vec3 u_softboxPos;
uniform vec3 u_softboxSize;
uniform vec3 u_softboxColor;
uniform float u_softboxIntensity;

uniform vec3 u_neonRingPos;
uniform float u_neonRingRadius;
uniform vec3 u_neonRingColor;
uniform float u_neonRingIntensity;

// PRNG
uint pcg_hash(uint seed) {
    uint state = seed * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

float randFloat(inout uint seed) {
    seed = pcg_hash(seed);
    return float(seed) / 4294967295.0;
}

vec2 randVec2(inout uint seed) {
    return vec2(randFloat(seed), randFloat(seed));
}

vec3 cosineSampleHemisphere(vec3 N, vec2 xi) {
    float phi = 2.0 * 3.14159265359 * xi.x;
    float cosTheta = sqrt(xi.y);
    float sinTheta = sqrt(max(0.0, 1.0 - xi.y));
    vec3 local = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
    
    vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(up, N));
    vec3 bitangent = cross(N, tangent);
    return normalize(tangent * local.x + bitangent * local.y + N * local.z);
}

// Microfacet GGX VNDF sampling (Heitz 2018)
vec3 sampleGGXVNDF(vec3 V, vec3 N, float roughness, vec2 xi) {
    float alpha = max(0.001, roughness * roughness);
    vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(up, N));
    vec3 B = cross(N, T);
    
    // Transform V to local hemisphere
    vec3 Vh = normalize(vec3(dot(V, T) * alpha, dot(V, B) * alpha, dot(V, N)));
    
    float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
    vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(lensq) : vec3(1.0, 0.0, 0.0);
    vec3 T2 = cross(Vh, T1);
    
    float r = sqrt(xi.x);
    float phi = 2.0 * 3.14159265359 * xi.y;
    float t1 = r * cos(phi);
    float t2 = r * sin(phi);
    float s = 0.5 * (1.0 + Vh.z);
    t2 = (1.0 - s) * sqrt(max(0.0, 1.0 - t1 * t1)) + s * t2;
    
    vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;
    vec3 Ne = normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
    return normalize(T * Ne.x + B * Ne.y + N * Ne.z);
}

// Ray-scene intersection against material showcase props & bounds
struct HitRecord {
    bool hit;
    float t;
    vec3 position;
    vec3 normal;
    vec3 albedo;
    float roughness;
    float metallic;
    float transmission;
    float ior;
    vec3 emission;
    float matId;
};

HitRecord intersectScene(vec3 ro, vec3 rd, float minT, float maxT) {
    HitRecord best;
    best.hit = false;
    best.t = maxT;
    
    // 1. Proving Ground floor (z = 0)
    if (abs(rd.z) > 1e-4) {
        float tFloor = -ro.z / rd.z;
        if (tFloor > minT && tFloor < best.t) {
            vec3 p = ro + rd * tFloor;
            if (abs(p.x) < 80.0 && abs(p.y) < 40.0) {
                best.hit = true;
                best.t = tFloor;
                best.position = p;
                best.normal = vec3(0.0, 0.0, 1.0);
                vec2 g = floor(p.xy * 0.5);
                float ch = mod(g.x + g.y, 2.0);
                best.albedo = mix(vec3(0.065), vec3(0.125), ch);
                best.roughness = 0.25;
                best.metallic = 0.0;
                best.transmission = 0.0;
                best.ior = 1.5;
                best.emission = vec3(0.0);
                best.matId = 26.0;
            }
        }
    }
    
    // 2. Optical Glass Sphere (at [6.0, -3.0, 1.2], r = 0.8)
    vec3 glassCenter = vec3(6.0, -3.0, 1.2);
    float glassR = 0.8;
    vec3 ocGlass = ro - glassCenter;
    float bG = dot(ocGlass, rd);
    float cG = dot(ocGlass, ocGlass) - glassR * glassR;
    float discGlass = bG * bG - cG;
    if (discGlass > 0.0) {
        float sDisc = sqrt(discGlass);
        float t0 = -bG - sDisc;
        float t1 = -bG + sDisc;
        float tHit = (t0 > minT) ? t0 : ((t1 > minT) ? t1 : -1.0);
        if (tHit > minT && tHit < best.t) {
            best.hit = true;
            best.t = tHit;
            best.position = ro + rd * tHit;
            best.normal = normalize(best.position - glassCenter);
            best.albedo = vec3(0.96, 0.98, 1.0);
            best.roughness = 0.01;
            best.metallic = 0.0;
            best.transmission = 1.0;
            best.ior = 1.52;
            best.emission = vec3(0.0);
            best.matId = 85.0;
        }
    }
    
    // 3. High-Gloss Plastic Sphere (at [6.0, -1.0, 1.2], r = 0.8)
    vec3 plasticCenter = vec3(6.0, -1.0, 1.2);
    float plasticR = 0.8;
    vec3 ocPlastic = ro - plasticCenter;
    float bP = dot(ocPlastic, rd);
    float cP = dot(ocPlastic, ocPlastic) - plasticR * plasticR;
    float discP = bP * bP - cP;
    if (discP > 0.0) {
        float tHit = -bP - sqrt(discP);
        if (tHit > minT && tHit < best.t) {
            best.hit = true;
            best.t = tHit;
            best.position = ro + rd * tHit;
            best.normal = normalize(best.position - plasticCenter);
            best.albedo = vec3(0.85, 0.08, 0.04); // Vibrant cherry red
            best.roughness = 0.06;
            best.metallic = 0.0;
            best.transmission = 0.0;
            best.ior = 1.5;
            best.emission = vec3(0.0);
            best.matId = 54.0;
        }
    }
    
    // 4. Gold Conductor Sphere (at [6.0, 3.0, 1.2], r = 0.8)
    vec3 goldCenter = vec3(6.0, 3.0, 1.2);
    float goldR = 0.8;
    vec3 ocGold = ro - goldCenter;
    float bGold = dot(ocGold, rd);
    float cGold = dot(ocGold, ocGold) - goldR * goldR;
    float discGold = bGold * bGold - cGold;
    if (discGold > 0.0) {
        float tHit = -bGold - sqrt(discGold);
        if (tHit > minT && tHit < best.t) {
            best.hit = true;
            best.t = tHit;
            best.position = ro + rd * tHit;
            best.normal = normalize(best.position - goldCenter);
            best.albedo = vec3(1.00, 0.71, 0.29); // Authentic gold F0
            best.roughness = 0.08;
            best.metallic = 1.0;
            best.transmission = 0.0;
            best.ior = 0.2;
            best.emission = vec3(0.0);
            best.matId = 84.0;
        }
    }
    
    // 5. Polished Chrome Standing Mirror Panel (x = 8.5, y: -4..4, z: 0..3.2)
    if (abs(rd.x) > 1e-4) {
        float tMirror = (8.5 - ro.x) / rd.x;
        if (tMirror > minT && tMirror < best.t) {
            vec3 p = ro + rd * tMirror;
            if (abs(p.y) < 4.5 && p.z >= 0.0 && p.z <= 3.2) {
                best.hit = true;
                best.t = tMirror;
                best.position = p;
                best.normal = vec3(-1.0, 0.0, 0.0); // Facing car
                best.albedo = vec3(0.98);
                best.roughness = 0.005;
                best.metallic = 1.0;
                best.transmission = 0.0;
                best.ior = 2.5;
                best.emission = vec3(0.0);
                best.matId = 82.0;
            }
        }
    }
    
    // 6. Overhead Studio Softbox Light Panel (z = 7.5, x: -3..3, y: -2..2)
    if (abs(rd.z) > 1e-4) {
        float tSoftbox = (7.5 - ro.z) / rd.z;
        if (tSoftbox > minT && tSoftbox < best.t) {
            vec3 p = ro + rd * tSoftbox;
            if (abs(p.x) < 3.5 && abs(p.y) < 2.5) {
                best.hit = true;
                best.t = tSoftbox;
                best.position = p;
                best.normal = vec3(0.0, 0.0, -1.0);
                best.albedo = vec3(1.0);
                best.roughness = 1.0;
                best.metallic = 0.0;
                best.transmission = 0.0;
                best.ior = 1.0;
                best.emission = u_softboxColor * u_softboxIntensity;
                best.matId = 42.0;
            }
        }
    }
    
    return best;
}

vec3 sampleSky(vec3 dir) {
    float t = clamp(dir.z * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(u_skyHorizon, u_skyZenith, t);
    
    // Sun disc
    float sunDot = dot(dir, normalize(u_sunDirection));
    if (sunDot > 0.998) {
        sky += u_sunColor * u_sunIntensity * 2.5;
    }
    return sky;
}

void main() {
    vec4 posDepth = texture(u_gPosDepth, v_uv);
    if (posDepth.w >= 1.0) {
        // Background sky
        vec2 ndc = v_uv * 2.0 - 1.0;
        vec4 target = u_invProjection * vec4(ndc, 1.0, 1.0);
        vec3 rayDir = normalize((u_invView * vec4(normalize(target.xyz / target.w), 0.0)).xyz);
        vec3 skyCol = sampleSky(rayDir);
        
        outReservoirData = vec4(0.0);
        outReservoirRadiance = vec4(skyCol, 1.0);
        outReservoirStats = vec4(1.0, 1.0, 0.0, 1.0);
        return;
    }
    
    vec3 p1 = posDepth.xyz;
    vec4 normRough = texture(u_gNormalRough, v_uv);
    vec3 n1 = normRough.xyz;
    float roughness = normRough.w;
    
    vec4 albedoMetal = texture(u_gAlbedoMetal, v_uv);
    vec3 albedo = albedoMetal.rgb;
    float metallic = albedoMetal.a;
    
    vec4 matParam = texture(u_gMaterialParam, v_uv);
    float transmission = matParam.y;
    float ior = matParam.z;
    
    vec3 V = normalize(u_cameraPos - p1);
    
    // Seed PRNG uniquely per pixel and frame
    uvec2 pixelCoord = uvec2(gl_FragCoord.xy);
    uint seed = pixelCoord.x + pixelCoord.y * 3840u + u_frameIndex * 199999u;
    
    // ReSTIR Reservoir fields
    vec3 chosenHit = vec3(0.0);
    vec3 chosenRadiance = vec3(0.0);
    float chosenTargetP = 0.0;
    float weightSum = 0.0;
    float chosenMatId = 0.0;
    
    int M = max(1, u_candidateCount);
    
    // Generate M candidate paths (RIS - Resampled Importance Sampling)
    for (int i = 0; i < 16; i++) {
        if (i >= M) break;
        
        vec2 xi = randVec2(seed);
        vec3 sampleDir;
        float sourcePdf = 1.0;
        
        if (transmission > 0.5) {
            // Glass dielectric: Snell refraction or reflection
            float eta = 1.0 / ior;
            float cosTheta = dot(n1, V);
            vec3 refractDir = refract(-V, n1, eta);
            if (length(refractDir) > 0.1) {
                sampleDir = refractDir;
            } else {
                sampleDir = reflect(-V, n1);
            }
            sourcePdf = 1.0;
        } else if (metallic > 0.5 || roughness < 0.15) {
            // Microfacet GGX VNDF specular
            vec3 H = sampleGGXVNDF(V, n1, roughness, xi);
            sampleDir = reflect(-V, H);
            sourcePdf = max(0.01, dot(n1, sampleDir));
        } else {
            // Cosine hemisphere diffuse
            sampleDir = cosineSampleHemisphere(n1, xi);
            sourcePdf = max(0.01, dot(n1, sampleDir) / 3.14159265);
        }
        
        // Ray trace secondary hit x2
        vec3 rayOrigin = p1 + n1 * 0.005;
        HitRecord hit = intersectScene(rayOrigin, sampleDir, 0.01, 80.0);
        
        vec3 pathRadiance = vec3(0.0);
        if (hit.hit) {
            // Next Event Estimation (NEE) towards Sun & Softbox
            vec3 sunDir = normalize(u_sunDirection);
            float nDotL = max(0.0, dot(hit.normal, sunDir));
            if (nDotL > 0.0) {
                HitRecord shadowHit = intersectScene(hit.position + hit.normal * 0.005, sunDir, 0.01, 60.0);
                if (!shadowHit.hit || shadowHit.matId == 42.0) {
                    pathRadiance += hit.albedo * u_sunColor * (u_sunIntensity * nDotL / 3.14159265);
                }
            }
            // Add emissive contribution
            pathRadiance += hit.emission;
            
            // Add ambient skylight bounce
            pathRadiance += hit.albedo * sampleSky(hit.normal) * 0.35;
        } else {
            pathRadiance = sampleSky(sampleDir);
        }
        
        // Target function p_hat = || f_s * cosTheta * L ||
        float cosTheta1 = max(0.0, dot(n1, sampleDir));
        vec3 bsdf = albedo / 3.14159265;
        if (metallic > 0.5) {
            bsdf = albedo;
        }
        vec3 targetContrib = bsdf * cosTheta1 * pathRadiance;
        float targetP = length(targetContrib);
        
        // RIS weight: w_i = targetP / sourcePdf
        float candidateWeight = targetP / max(1e-4, sourcePdf);
        weightSum += candidateWeight;
        
        // Reservoir sample replacement
        float r = randFloat(seed);
        if (r * weightSum < candidateWeight) {
            chosenHit = hit.hit ? hit.position : (p1 + sampleDir * 50.0);
            chosenRadiance = pathRadiance;
            chosenTargetP = targetP;
            chosenMatId = hit.hit ? hit.matId : 0.0;
        }
    }
    
    // Unbiased reservoir weight W = weightSum / (M * p_hat)
    float W = chosenTargetP > 1e-5 ? (weightSum / (float(M) * chosenTargetP)) : 0.0;
    W = clamp(W, 0.0, 5.0); // Firefly suppression
    
    outReservoirData = vec4(chosenHit, chosenTargetP);
    outReservoirRadiance = vec4(chosenRadiance, W);
    outReservoirStats = vec4(weightSum, float(M), chosenMatId, 1.0);
}
`;

// ReSTIR PT Temporal Resampling Shader with CandidateEvidenceFit & Reconnection Shift
export const ReSTIRTemporalShader = `#version 300 es
precision highp float;

layout(location = 0) out vec4 outReservoirData;
layout(location = 1) out vec4 outReservoirRadiance;
layout(location = 2) out vec4 outReservoirStats;

in vec2 v_uv;

uniform sampler2D u_currData;
uniform sampler2D u_currRadiance;
uniform sampler2D u_currStats;

uniform sampler2D u_prevData;
uniform sampler2D u_prevRadiance;
uniform sampler2D u_prevStats;

uniform sampler2D u_gPosDepth;
uniform sampler2D u_gNormalRough;
uniform sampler2D u_prevGPosDepth;
uniform sampler2D u_prevGNormalRough;
uniform sampler2D u_gMotion;

uniform bool u_enableTemporal;
uniform int u_maxHistoryM;

void main() {
    vec4 currData = texture(u_currData, v_uv);
    vec4 currRadiance = texture(u_currRadiance, v_uv);
    vec4 currStats = texture(u_currStats, v_uv);
    
    if (!u_enableTemporal) {
        outReservoirData = currData;
        outReservoirRadiance = currRadiance;
        outReservoirStats = currStats;
        return;
    }
    
    vec2 motion = texture(u_gMotion, v_uv).xy;
    vec2 prevUV = v_uv - motion;
    
    // Check screen bounds
    if (prevUV.x < 0.0 || prevUV.x > 1.0 || prevUV.y < 0.0 || prevUV.y > 1.0) {
        outReservoirData = currData;
        outReservoirRadiance = currRadiance;
        outReservoirStats = currStats;
        return;
    }
    
    // Check geometric similarity (Depth & Normal difference)
    vec4 currPosDepth = texture(u_gPosDepth, v_uv);
    vec4 prevPosDepth = texture(u_prevGPosDepth, prevUV);
    
    vec3 currN = texture(u_gNormalRough, v_uv).xyz;
    vec3 prevN = texture(u_prevGNormalRough, prevUV).xyz;
    
    float depthDiff = abs(currPosDepth.w - prevPosDepth.w) / max(0.01, currPosDepth.w);
    float normalDot = dot(currN, prevN);
    
    if (depthDiff > 0.12 || normalDot < 0.85) {
        // Disocclusion detected, reject history
        outReservoirData = currData;
        outReservoirRadiance = currRadiance;
        outReservoirStats = currStats;
        return;
    }
    
    // Combine current reservoir and previous temporal reservoir
    vec4 prevData = texture(u_prevData, prevUV);
    vec4 prevRadiance = texture(u_prevRadiance, prevUV);
    vec4 prevStats = texture(u_prevStats, prevUV);
    
    float M_curr = currStats.y;
    float targetP_curr = currData.w;
    float W_curr = currRadiance.w;
    float weightSum_curr = currStats.x;
    
    float M_prev = min(prevStats.y, float(u_maxHistoryM));
    float targetP_prev = prevData.w;
    float W_prev = prevRadiance.w;
    
    // Reconnection Shift Mapping:
    // Reconnect previous frame secondary hit x2 to current primary hit x1
    vec3 p1 = currPosDepth.xyz;
    vec3 x2_prev = prevData.xyz;
    vec3 dirPrevToCurr = normalize(x2_prev - p1);
    
    // Jacobian determinant of shift mapping:
    // J = (cosTheta1_new / cosTheta1_old) * (distOld^2 / distNew^2)
    float distOld = length(x2_prev - prevPosDepth.xyz);
    float distNew = length(x2_prev - p1);
    float distRatio = (distOld * distOld) / max(0.01, distNew * distNew);
    float cosNew = max(0.05, dot(currN, dirPrevToCurr));
    float cosOld = max(0.05, dot(prevN, normalize(x2_prev - prevPosDepth.xyz)));
    float jacobian = clamp((cosNew / cosOld) * distRatio, 0.1, 4.0);
    
    // CandidateEvidenceFit: MIS / generalized balance heuristic weight
    float shiftedTargetP = targetP_prev * jacobian;
    float weight_temporal = shiftedTargetP * W_prev * M_prev;
    
    float combinedWeightSum = weightSum_curr + weight_temporal;
    float combinedM = M_curr + M_prev;
    
    // Stochastic selection
    float pSelectTemporal = weight_temporal / max(1e-4, combinedWeightSum);
    bool pickTemporal = (pSelectTemporal > 0.5); // Expected value tracking
    
    vec3 finalHit = pickTemporal ? x2_prev : currData.xyz;
    vec3 finalRadiance = pickTemporal ? prevRadiance.rgb : currRadiance.rgb;
    float finalTargetP = pickTemporal ? shiftedTargetP : targetP_curr;
    float finalMatId = pickTemporal ? prevStats.z : currStats.z;
    
    float finalW = finalTargetP > 1e-5 ? (combinedWeightSum / (combinedM * finalTargetP)) : 0.0;
    finalW = clamp(finalW, 0.0, 5.0);
    
    outReservoirData = vec4(finalHit, finalTargetP);
    outReservoirRadiance = vec4(finalRadiance, finalW);
    outReservoirStats = vec4(combinedWeightSum, combinedM, finalMatId, 1.0);
}
`;

// ReSTIR PT Spatial Resampling Shader with Hybrid Reconnection Shift & Candidate Evidence Fit
export const ReSTIRSpatialShader = `#version 300 es
precision highp float;

layout(location = 0) out vec4 outFinalIndirect;
layout(location = 1) out vec4 outDebugView;

in vec2 v_uv;

uniform sampler2D u_reservoirData;
uniform sampler2D u_reservoirRadiance;
uniform sampler2D u_reservoirStats;

uniform sampler2D u_gPosDepth;
uniform sampler2D u_gNormalRough;
uniform sampler2D u_gAlbedoMetal;
uniform sampler2D u_gMaterialParam;

uniform bool u_enableSpatial;
uniform int u_spatialRadius;
uniform int u_spatialNeighbors;
uniform vec2 u_screenSize;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec4 centerData = texture(u_reservoirData, v_uv);
    vec4 centerRadiance = texture(u_reservoirRadiance, v_uv);
    vec4 centerStats = texture(u_reservoirStats, v_uv);
    
    vec4 posDepth = texture(u_gPosDepth, v_uv);
    if (posDepth.w >= 1.0) {
        outFinalIndirect = vec4(centerRadiance.rgb, 1.0);
        outDebugView = vec4(0.0);
        return;
    }
    
    if (!u_enableSpatial) {
        vec3 finalL = centerRadiance.rgb * centerRadiance.w;
        outFinalIndirect = vec4(finalL, 1.0);
        outDebugView = vec4(vec3(centerStats.y / 20.0), 1.0);
        return;
    }
    
    vec3 p1 = posDepth.xyz;
    vec3 N = texture(u_gNormalRough, v_uv).xyz;
    float roughness = texture(u_gNormalRough, v_uv).w;
    
    float weightSum = centerStats.x;
    float totalM = centerStats.y;
    vec3 chosenRadiance = centerRadiance.rgb;
    vec3 chosenHit = centerData.xyz;
    float chosenTargetP = centerData.w;
    
    int numNeighbors = clamp(u_spatialNeighbors, 1, 8);
    float radius = float(u_spatialRadius);
    
    vec2 texelSize = 1.0 / u_screenSize;
    
    // Spatial resampling loop over neighbor pixels
    for (int i = 0; i < 8; i++) {
        if (i >= numNeighbors) break;
        
        float angle = float(i) * (2.0 * 3.14159265 / float(numNeighbors)) + hash12(v_uv + float(i)) * 0.5;
        float r = (0.3 + 0.7 * hash12(v_uv * 2.0 + float(i))) * radius;
        vec2 offset = vec2(cos(angle), sin(angle)) * r * texelSize;
        vec2 neighborUV = v_uv + offset;
        
        if (neighborUV.x < 0.0 || neighborUV.x > 1.0 || neighborUV.y < 0.0 || neighborUV.y > 1.0) continue;
        
        // Edge stopping bilateral test
        vec4 nPosDepth = texture(u_gPosDepth, neighborUV);
        vec3 nN = texture(u_gNormalRough, neighborUV).xyz;
        
        float depthDiff = abs(posDepth.w - nPosDepth.w) / max(0.01, posDepth.w);
        float normalDot = dot(N, nN);
        if (depthDiff > 0.15 || normalDot < 0.80) continue;
        
        vec4 nData = texture(u_reservoirData, neighborUV);
        vec4 nRadiance = texture(u_reservoirRadiance, neighborUV);
        vec4 nStats = texture(u_reservoirStats, neighborUV);
        
        vec3 x2_neighbor = nData.xyz;
        float M_neighbor = nStats.y;
        float W_neighbor = nRadiance.w;
        float p_hat_neighbor = nData.w;
        
        // Hybrid Reconnection Shift:
        // Diffuse: reconnect x2 to current pixel p1 with geometric Jacobian
        // Specular: reflection direction preservation
        float jacobian = 1.0;
        if (roughness > 0.15) {
            float distNeighbor = length(x2_neighbor - nPosDepth.xyz);
            float distCurrent = length(x2_neighbor - p1);
            float ratio = (distNeighbor * distNeighbor) / max(0.01, distCurrent * distCurrent);
            float cosCur = max(0.05, dot(N, normalize(x2_neighbor - p1)));
            float cosNbr = max(0.05, dot(nN, normalize(x2_neighbor - nPosDepth.xyz)));
            jacobian = clamp((cosCur / cosNbr) * ratio, 0.1, 3.0);
        }
        
        float shiftedTargetP = p_hat_neighbor * jacobian;
        float neighborWeight = shiftedTargetP * W_neighbor * M_neighbor;
        
        weightSum += neighborWeight;
        totalM += M_neighbor;
        
        // Reservoir replacement
        float pAccept = neighborWeight / max(1e-4, weightSum);
        if (hash12(neighborUV + float(i) * 11.0) < pAccept) {
            chosenRadiance = nRadiance.rgb;
            chosenHit = x2_neighbor;
            chosenTargetP = shiftedTargetP;
        }
    }
    
    float finalW = chosenTargetP > 1e-5 ? (weightSum / (totalM * chosenTargetP)) : 0.0;
    finalW = clamp(finalW, 0.0, 5.0);
    
    vec3 finalL = chosenRadiance * finalW;
    outFinalIndirect = vec4(finalL, 1.0);
    outDebugView = vec4(vec3(totalM / 50.0), 1.0);
}
`;

// Multi-Bounce Specular Reflections & Dielectric Refractions Shader
export const SpecularReflectionShader = `#version 300 es
precision highp float;

layout(location = 0) out vec4 outReflections;
layout(location = 1) out vec4 outRefractions;

in vec2 v_uv;

uniform sampler2D u_gPosDepth;
uniform sampler2D u_gNormalRough;
uniform sampler2D u_gAlbedoMetal;
uniform sampler2D u_gMaterialParam;

uniform vec3 u_cameraPos;
uniform int u_reflectionBounces;
uniform float u_reflectionScale;
uniform float u_glassIor;

// Environment / Scene primitives
uniform vec3 u_sunDirection;
uniform vec3 u_sunColor;
uniform float u_sunIntensity;
uniform vec3 u_skyZenith;
uniform vec3 u_skyHorizon;

struct HitRecord {
    bool hit;
    float t;
    vec3 position;
    vec3 normal;
    vec3 albedo;
    float roughness;
    float metallic;
    float transmission;
    vec3 emission;
};

HitRecord intersectScene(vec3 ro, vec3 rd, float minT, float maxT) {
    HitRecord best;
    best.hit = false;
    best.t = maxT;
    
    // 1. Proving Ground floor (z = 0)
    if (abs(rd.z) > 1e-4) {
        float tFloor = -ro.z / rd.z;
        if (tFloor > minT && tFloor < best.t) {
            vec3 p = ro + rd * tFloor;
            if (abs(p.x) < 80.0 && abs(p.y) < 40.0) {
                best.hit = true;
                best.t = tFloor;
                best.position = p;
                best.normal = vec3(0.0, 0.0, 1.0);
                vec2 g = floor(p.xy * 0.5);
                float ch = mod(g.x + g.y, 2.0);
                best.albedo = mix(vec3(0.065), vec3(0.125), ch);
                best.roughness = 0.25;
                best.metallic = 0.0;
                best.transmission = 0.0;
                best.emission = vec3(0.0);
            }
        }
    }
    
    // 2. Optical Glass Sphere (at [6.0, -3.0, 1.2], r = 0.8)
    vec3 glassCenter = vec3(6.0, -3.0, 1.2);
    float glassR = 0.8;
    vec3 ocGlass = ro - glassCenter;
    float bG = dot(ocGlass, rd);
    float cG = dot(ocGlass, ocGlass) - glassR * glassR;
    float discGlass = bG * bG - cG;
    if (discGlass > 0.0) {
        float tHit = -bG - sqrt(discGlass);
        if (tHit > minT && tHit < best.t) {
            best.hit = true;
            best.t = tHit;
            best.position = ro + rd * tHit;
            best.normal = normalize(best.position - glassCenter);
            best.albedo = vec3(0.96, 0.98, 1.0);
            best.roughness = 0.01;
            best.metallic = 0.0;
            best.transmission = 1.0;
            best.emission = vec3(0.0);
        }
    }
    
    // 3. High-Gloss Plastic Sphere (at [6.0, -1.0, 1.2], r = 0.8)
    vec3 plasticCenter = vec3(6.0, -1.0, 1.2);
    float plasticR = 0.8;
    vec3 ocPlastic = ro - plasticCenter;
    float bP = dot(ocPlastic, rd);
    float cP = dot(ocPlastic, ocPlastic) - plasticR * plasticR;
    float discP = bP * bP - cP;
    if (discP > 0.0) {
        float tHit = -bP - sqrt(discP);
        if (tHit > minT && tHit < best.t) {
            best.hit = true;
            best.t = tHit;
            best.position = ro + rd * tHit;
            best.normal = normalize(best.position - plasticCenter);
            best.albedo = vec3(0.85, 0.08, 0.04);
            best.roughness = 0.06;
            best.metallic = 0.0;
            best.transmission = 0.0;
            best.emission = vec3(0.0);
        }
    }
    
    // 4. Gold Conductor Sphere (at [6.0, 3.0, 1.2], r = 0.8)
    vec3 goldCenter = vec3(6.0, 3.0, 1.2);
    float goldR = 0.8;
    vec3 ocGold = ro - goldCenter;
    float bGold = dot(ocGold, rd);
    float cGold = dot(ocGold, ocGold) - goldR * goldR;
    float discGold = bGold * bGold - cGold;
    if (discGold > 0.0) {
        float tHit = -bGold - sqrt(discGold);
        if (tHit > minT && tHit < best.t) {
            best.hit = true;
            best.t = tHit;
            best.position = ro + rd * tHit;
            best.normal = normalize(best.position - goldCenter);
            best.albedo = vec3(1.00, 0.71, 0.29);
            best.roughness = 0.08;
            best.metallic = 1.0;
            best.transmission = 0.0;
            best.emission = vec3(0.0);
        }
    }
    
    // 5. Polished Chrome Standing Mirror (x = 8.5)
    if (abs(rd.x) > 1e-4) {
        float tMirror = (8.5 - ro.x) / rd.x;
        if (tMirror > minT && tMirror < best.t) {
            vec3 p = ro + rd * tMirror;
            if (abs(p.y) < 4.5 && p.z >= 0.0 && p.z <= 3.2) {
                best.hit = true;
                best.t = tMirror;
                best.position = p;
                best.normal = vec3(-1.0, 0.0, 0.0);
                best.albedo = vec3(0.98);
                best.roughness = 0.005;
                best.metallic = 1.0;
                best.transmission = 0.0;
                best.emission = vec3(0.0);
            }
        }
    }
    
    return best;
}

vec3 sampleSky(vec3 dir) {
    float t = clamp(dir.z * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(u_skyHorizon, u_skyZenith, t);
    float sunDot = dot(dir, normalize(u_sunDirection));
    if (sunDot > 0.998) sky += u_sunColor * u_sunIntensity * 2.0;
    return sky;
}

// Fresnel Schlick approximation
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

void main() {
    vec4 posDepth = texture(u_gPosDepth, v_uv);
    if (posDepth.w >= 1.0) {
        outReflections = vec4(0.0);
        outRefractions = vec4(0.0);
        return;
    }
    
    vec3 p1 = posDepth.xyz;
    vec3 N = texture(u_gNormalRough, v_uv).xyz;
    float roughness = texture(u_gNormalRough, v_uv).w;
    
    vec4 albedoMetal = texture(u_gAlbedoMetal, v_uv);
    vec3 albedo = albedoMetal.rgb;
    float metallic = albedoMetal.a;
    
    vec4 matParam = texture(u_gMaterialParam, v_uv);
    float specular = matParam.x;
    float transmission = matParam.y;
    float ior = matParam.z;
    
    vec3 V = normalize(u_cameraPos - p1);
    float nDotV = max(0.0, dot(N, V));
    
    vec3 F0 = mix(vec3(specular), albedo, metallic);
    vec3 F = fresnelSchlick(nDotV, F0);
    
    // --- 1. Multi-Bounce Specular Reflections ---
    vec3 reflectedRadiance = vec3(0.0);
    vec3 throughput = F * u_reflectionScale;
    
    vec3 rayO = p1 + N * 0.005;
    vec3 rayD = reflect(-V, N);
    
    int maxBounces = clamp(u_reflectionBounces, 1, 6);
    
    for (int b = 0; b < 6; b++) {
        if (b >= maxBounces) break;
        if (length(throughput) < 0.01) break;
        
        HitRecord hit = intersectScene(rayO, rayD, 0.01, 80.0);
        if (hit.hit) {
            // Direct lighting at bounce hit
            vec3 sunDir = normalize(u_sunDirection);
            float nDotL = max(0.0, dot(hit.normal, sunDir));
            vec3 directL = hit.albedo * u_sunColor * (u_sunIntensity * nDotL / 3.14159265);
            reflectedRadiance += throughput * (directL + hit.emission);
            
            // Advance ray for next bounce
            vec3 nextF0 = mix(vec3(0.04), hit.albedo, hit.metallic);
            float cosThetaBounce = max(0.0, dot(hit.normal, -rayD));
            vec3 bounceF = fresnelSchlick(cosThetaBounce, nextF0);
            throughput *= bounceF;
            
            rayO = hit.position + hit.normal * 0.005;
            rayD = reflect(rayD, hit.normal);
        } else {
            reflectedRadiance += throughput * sampleSky(rayD);
            break;
        }
    }
    
    // --- 2. Dielectric Glass Refraction & Transmission ---
    vec3 refractedRadiance = vec3(0.0);
    if (transmission > 0.01) {
        float eta = 1.0 / max(1.001, ior);
        vec3 refrDir = refract(-V, N, eta);
        if (length(refrDir) > 0.01) {
            // Ray enters glass sphere / windshield
            vec3 enterP = p1 - N * 0.005;
            HitRecord exitHit = intersectScene(enterP, refrDir, 0.01, 20.0);
            if (exitHit.hit) {
                // Secondary exit refraction
                float distInside = length(exitHit.position - enterP);
                // Beer-Lambert law absorption
                vec3 absorption = exp(-vec3(0.05, 0.02, 0.08) * distInside);
                
                vec3 exitD = refract(refrDir, -exitHit.normal, ior);
                vec3 finalRayD = length(exitD) > 0.01 ? exitD : reflect(refrDir, -exitHit.normal);
                
                HitRecord sceneHit = intersectScene(exitHit.position + finalRayD * 0.005, finalRayD, 0.01, 60.0);
                if (sceneHit.hit) {
                    refractedRadiance = absorption * sceneHit.albedo * sampleSky(sceneHit.normal);
                } else {
                    refractedRadiance = absorption * sampleSky(finalRayD);
                }
            } else {
                refractedRadiance = sampleSky(refrDir);
            }
        } else {
            // Total Internal Reflection (TIR)
            refractedRadiance = reflectedRadiance;
        }
    }
    
    outReflections = vec4(reflectedRadiance, 1.0);
    outRefractions = vec4(refractedRadiance, transmission);
}
`;

// Final Recombination, Temporal Anti-Lag, and ACES Filmic Tone Mapping Shader
export const ToneMappingShader = `#version 300 es
precision highp float;

out vec4 fragColor;
in vec2 v_uv;

uniform sampler2D u_gPosDepth;
uniform sampler2D u_gNormalRough;
uniform sampler2D u_gAlbedoMetal;
uniform sampler2D u_gMaterialParam;

uniform sampler2D u_directLight;
uniform sampler2D u_indirectRadiance;
uniform sampler2D u_reflections;
uniform sampler2D u_refractions;
uniform sampler2D u_prevAccum;
uniform sampler2D u_reservoirDebug;

uniform int u_viewMode; // 0: Final ReSTIR PT, 1: Direct Only, 2: Indirect GI, 3: Reflections, 4: Refraction, 5: Normals, 6: Albedo, 7: Reservoir M
uniform float u_exposure;
uniform int u_toneMapOp; // 0: ACES Filmic, 1: Reinhard, 2: Linear
uniform float u_accumWeight;

// ACES Tone Mapping
vec3 acesFilmic(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec4 posDepth = texture(u_gPosDepth, v_uv);
    if (posDepth.w >= 1.0) {
        // Sky background
        vec3 sky = texture(u_directLight, v_uv).rgb;
        fragColor = vec4(pow(acesFilmic(sky * u_exposure), vec3(1.0 / 2.2)), 1.0);
        return;
    }
    
    vec3 N = texture(u_gNormalRough, v_uv).xyz;
    float roughness = texture(u_gNormalRough, v_uv).w;
    
    vec4 albedoMetal = texture(u_gAlbedoMetal, v_uv);
    vec3 albedo = albedoMetal.rgb;
    float metallic = albedoMetal.a;
    
    vec4 matParam = texture(u_gMaterialParam, v_uv);
    float transmission = matParam.y;
    
    vec3 direct = texture(u_directLight, v_uv).rgb;
    vec3 indirect = texture(u_indirectRadiance, v_uv).rgb;
    vec3 reflections = texture(u_reflections, v_uv).rgb;
    vec4 refractions = texture(u_refractions, v_uv);
    
    // Debug View modes
    if (u_viewMode == 1) {
        // Direct Illumination Only
        fragColor = vec4(pow(acesFilmic(direct * u_exposure), vec3(1.0 / 2.2)), 1.0);
        return;
    } else if (u_viewMode == 2) {
        // Indirect GI Radiance
        fragColor = vec4(pow(acesFilmic(indirect * u_exposure), vec3(1.0 / 2.2)), 1.0);
        return;
    } else if (u_viewMode == 3) {
        // Specular Reflections
        fragColor = vec4(pow(acesFilmic(reflections * u_exposure), vec3(1.0 / 2.2)), 1.0);
        return;
    } else if (u_viewMode == 4) {
        // Refraction
        fragColor = vec4(pow(acesFilmic(refractions.rgb * u_exposure), vec3(1.0 / 2.2)), 1.0);
        return;
    } else if (u_viewMode == 5) {
        // Shading Normals
        fragColor = vec4(N * 0.5 + 0.5, 1.0);
        return;
    } else if (u_viewMode == 6) {
        // Albedo & Roughness
        fragColor = vec4(albedo, 1.0);
        return;
    } else if (u_viewMode == 7) {
        // Reservoir Stats / M count heatmap
        vec4 debugRes = texture(u_reservoirDebug, v_uv);
        // Turbo / Heatmap color map
        float val = clamp(debugRes.x, 0.0, 1.0);
        vec3 heat = mix(vec3(0.05, 0.1, 0.9), vec3(0.1, 0.9, 0.2), val);
        if (val > 0.5) heat = mix(vec3(0.1, 0.9, 0.2), vec3(0.95, 0.2, 0.05), (val - 0.5) * 2.0);
        fragColor = vec4(heat, 1.0);
        return;
    }
    
    // --- Full ReSTIR PT Recombination ---
    // Diffuse / Base term
    vec3 diffuseRadiance = (direct + indirect) * albedo * (1.0 - metallic) * (1.0 - transmission);
    
    // Add Specular reflections
    vec3 totalColor = diffuseRadiance + reflections;
    
    // Blend Glass refraction
    if (transmission > 0.01) {
        totalColor = mix(totalColor, refractions.rgb, transmission * (1.0 - roughness));
    }
    
    // Tone mapping
    vec3 exposed = totalColor * u_exposure;
    vec3 mapped = (u_toneMapOp == 0) ? acesFilmic(exposed) : (u_toneMapOp == 1 ? exposed / (exposed + 1.0) : clamp(exposed, 0.0, 1.0));
    
    // Gamma correction
    vec3 gammaCorrected = pow(mapped, vec3(1.0 / 2.2));
    
    // Temporal Anti-Lag accumulation
    vec4 prev = texture(u_prevAccum, v_uv);
    vec3 blended = mix(prev.rgb, gammaCorrected, u_accumWeight);
    
    fragColor = vec4(blended, 1.0);
}
`;
