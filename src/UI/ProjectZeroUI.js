//============================================================================================================================================
//                                                             PROJECTZEROUI.JS
//============================================================================================================================================
// Generates the Project-Zero UI components: Notch, Outliner, Viewport HUD, and Inspector tabs with live bindings.

export const CarSwatches = [
  { name: "British Racing Green", hex: "#1b4d3e", rgb: [0.105, 0.302, 0.243] },
  { name: "Cyber Gold", hex: "#d4bd88", rgb: [0.831, 0.741, 0.533] },
  { name: "Midnight Blue", hex: "#1a2b4c", rgb: [0.102, 0.169, 0.298] },
  { name: "Crimson Red", hex: "#8b0000", rgb: [0.545, 0.0, 0.0] },
  { name: "Papaya Orange", hex: "#ff7518", rgb: [1.0, 0.459, 0.094] },
  { name: "Alpine White", hex: "#f0f2f5", rgb: [0.941, 0.949, 0.961] },
  { name: "Matte Stealth", hex: "#22252a", rgb: [0.133, 0.145, 0.165] },
  { name: "Liquid Silver", hex: "#d0d5dd", rgb: [0.816, 0.835, 0.867] }
];

export class ProjectZeroUI {
  constructor(container, engine, scene, vehicle, onCameraToggle, onPresetChange) {
    this.container = container;
    this.engine = engine;
    this.scene = scene;
    this.vehicle = vehicle;
    this.onCameraToggle = onCameraToggle;
    this.onPresetChange = onPresetChange;

    this.activeInspectorTab = "engine"; // "engine", "materials", "lighting", "vehicle"
    this.cameraMode = "chase"; // "chase", "orbit"

    this.buildHTML();
    this.bindEvents();
  }

  buildHTML() {
    this.container.innerHTML = `
      <div class="app-container">
        <!-- TOP NOTCH HEADER -->
        <header class="top-header">
          <div class="notch">
            <div class="notch-brand">
              <div class="brand-icon">F</div>
              <span>PROJECT-ZERO</span>
            </div>
            
            <div class="notch-pill enhanced">
              <div class="status-dot"></div>
              <span>ReSTIR PT Enhanced · CandidateEvidenceFit</span>
            </div>

            <div class="notch-telemetry">
              <div class="stat-item"><span class="stat-val" id="telemetry-fps">60</span> fps</div>
              <div class="stat-item"><span class="stat-val" id="telemetry-spp">1</span> spp</div>
              <div class="stat-item">M: <span class="stat-val" id="telemetry-m">4</span></div>
              <div class="stat-item">Bounces: <span class="stat-val" id="telemetry-bounces">3</span></div>
            </div>

            <div class="notch-actions">
              <button class="btn-pill" id="btn-camera-toggle">
                <span id="cam-icon">🎥</span> <span id="cam-label">Chase Cam</span>
              </button>
              <select class="btn-pill" id="select-preset">
                <option value="studio">Studio Showcase</option>
                <option value="daylight">Daylight Straight</option>
                <option value="golden">Golden Hour</option>
                <option value="cyber">Cyberpunk Neon</option>
              </select>
              <button class="btn-pill" id="btn-respawn-car" title="Reset Vehicle (R)">↺ Respawn</button>
            </div>
          </div>
        </header>

        <!-- THREE-COLUMN WORKSPACE -->
        <main class="workspace">
          <!-- LEFT DOCK: SCENE OUTLINER -->
          <aside class="dock left">
            <div class="dock-header">
              <span class="dock-title">Scene Outliner</span>
            </div>
            <div class="outliner-search">
              <input type="text" class="search-input" id="outliner-search-input" placeholder="Search scene nodes…" />
            </div>
            <div class="outliner-tree" id="outliner-tree">
              <!-- Vehicle Group -->
              <div class="tree-node selected" style="--depth: 0;" data-target="vehicle">
                <div class="node-left">
                  <span class="node-icon">🚗</span>
                  <span>ControlVehicle (Hero)</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="vehicle-body">
                <div class="node-left">
                  <span class="node-icon">🎨</span>
                  <span>BodyCoat (Paint)</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="vehicle-glass">
                <div class="node-left">
                  <span class="node-icon">🪟</span>
                  <span>VehicleGlass (Glazing)</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="vehicle-wheels">
                <div class="node-left">
                  <span class="node-icon">🛞</span>
                  <span>4x Wheels (Rims & Tyres)</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              
              <!-- Materials Showcase Gallery -->
              <div class="tree-node" style="--depth: 0;" data-target="showcase">
                <div class="node-left">
                  <span class="node-icon">💎</span>
                  <span>Materials Showcase Gallery</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="glass-sphere">
                <div class="node-left">
                  <span class="node-icon">🔮</span>
                  <span>Optical Glass Sphere (Dielectric)</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="plastic-sphere">
                <div class="node-left">
                  <span class="node-icon">🔴</span>
                  <span>High-Gloss Plastic Sphere</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="gold-sphere">
                <div class="node-left">
                  <span class="node-icon">🪙</span>
                  <span>Gold Conductor Sphere</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="mirror-panel">
                <div class="node-left">
                  <span class="node-icon">🪞</span>
                  <span>Chrome Standing Mirror</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="floor-runway">
                <div class="node-left">
                  <span class="node-icon">🏁</span>
                  <span>Proving Grounds Asphalt Floor</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>

              <!-- Lighting -->
              <div class="tree-node" style="--depth: 0;" data-target="lighting">
                <div class="node-left">
                  <span class="node-icon">💡</span>
                  <span>Lighting & Environment</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="sun-sky">
                <div class="node-left">
                  <span class="node-icon">☀️</span>
                  <span>Sun & Sky Scattering</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="softbox">
                <div class="node-left">
                  <span class="node-icon">🔲</span>
                  <span>Overhead Softbox Light</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
              <div class="tree-node" style="--depth: 1;" data-target="neon-ring">
                <div class="node-left">
                  <span class="node-icon">⭕</span>
                  <span>Neon Halo Ring</span>
                </div>
                <span class="node-visibility">👁</span>
              </div>
            </div>
          </aside>

          <!-- CENTRE DOCK: VIEWPORT & HUD -->
          <section class="dock centre">
            <!-- Viewport Mode Toolbar -->
            <div class="viewport-top-bar">
              <button class="view-mode-pill active" data-mode="0">ReSTIR PT Final</button>
              <button class="view-mode-pill" data-mode="1">Direct (NEE)</button>
              <button class="view-mode-pill" data-mode="2">Indirect GI</button>
              <button class="view-mode-pill" data-mode="3">Reflections</button>
              <button class="view-mode-pill" data-mode="4">Refraction</button>
              <button class="view-mode-pill" data-mode="5">Normals</button>
              <button class="view-mode-pill" data-mode="6">Albedo</button>
              <button class="view-mode-pill" data-mode="7">Reservoir M</button>
            </div>

            <!-- WebGL Canvas -->
            <canvas id="viewport-canvas"></canvas>

            <!-- Driving HUD Overlay -->
            <div class="driving-hud">
              <div class="hud-cluster">
                <div class="speed-display">
                  <span class="speed-val" id="hud-speed">0</span>
                  <span class="speed-unit">KM / H</span>
                </div>
                
                <div class="gear-badge" id="hud-gear">1</div>

                <div class="rpm-bar-container">
                  <div class="rpm-label">
                    <span>RPM</span>
                    <span id="hud-rpm">900</span>
                  </div>
                  <div class="rpm-track">
                    <div class="rpm-fill" id="hud-rpm-fill"></div>
                  </div>
                </div>

                <div class="hud-inputs">
                  <div class="input-meter">
                    <div class="meter-track">
                      <div class="meter-fill" id="hud-throttle-fill"></div>
                    </div>
                    <span class="meter-label">THR</span>
                  </div>
                  <div class="input-meter">
                    <div class="meter-track">
                      <div class="meter-fill brake" id="hud-brake-fill"></div>
                    </div>
                    <span class="meter-label">BRK</span>
                  </div>
                </div>
              </div>

              <div class="hud-hint">
                <b>WASD / Arrows:</b> Drive · <b>Space:</b> Handbrake · <b>R:</b> Respawn · <b>C:</b> Camera · <b>Left-Drag:</b> Orbit View
              </div>
            </div>

            <!-- Viewport Footer -->
            <footer class="viewport-footer">
              <span>PROJECT-ZERO PREVIEW · <b>RESTIR PT ENHANCED</b> · CANDIDATE EVIDENCE FIT · RECONNECTION SHIFT</span>
              <span>2.08–3.05× ACCELERATION · REFLECTIONS ACTIVE</span>
            </footer>
          </section>

          <!-- RIGHT DOCK: INSPECTOR -->
          <aside class="dock right">
            <div class="dock-header">
              <span class="dock-title">Inspector</span>
            </div>
            
            <!-- Tab Strip -->
            <div class="tab-strip">
              <div class="tab-item active" data-tab="engine">Engine</div>
              <div class="tab-item" data-tab="materials">Materials</div>
              <div class="tab-item" data-tab="lighting">Lighting</div>
              <div class="tab-item" data-tab="vehicle">Vehicle</div>
            </div>

            <!-- Inspector Body -->
            <div class="inspector-body" id="inspector-content">
              <!-- Dynamically populated by renderInspectorTab() -->
            </div>
          </aside>
        </main>
      </div>
    `;

    this.renderInspectorTab();
  }

  renderInspectorTab() {
    const container = document.getElementById("inspector-content");
    if (!container) return;

    const eng = this.engine.settings;
    const mat = this.scene.materials;
    const lit = this.scene.lighting;
    const veh = this.vehicle;

    if (this.activeInspectorTab === "engine") {
      container.innerHTML = `
        <!-- Render Engine Card -->
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">⚡ ReSTIR PT Enhanced Engine</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <span class="row-label-val">Algorithm Mode</span>
              <select class="select-input" id="engine-render-mode">
                <option value="0" ${eng.renderMode === 0 ? "selected" : ""}>ReSTIR PT Enhanced (CandidateEvidenceFit)</option>
                <option value="1" ${eng.renderMode === 1 ? "selected" : ""}>Classic Path Tracing (Naive)</option>
                <option value="2" ${eng.renderMode === 2 ? "selected" : ""}>Direct Illumination Only (NEE)</option>
                <option value="3" ${eng.renderMode === 3 ? "selected" : ""}>ReSTIR GI (Diffuse/Specular split)</option>
              </select>
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Max Path Bounces</span>
                <span class="row-val" id="val-bounces">${eng.maxBounces}</span>
              </div>
              <input type="range" id="input-bounces" min="1" max="6" step="1" value="${eng.maxBounces}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Initial Candidates (M)</span>
                <span class="row-val" id="val-candidates">${eng.candidateCount}</span>
              </div>
              <input type="range" id="input-candidates" min="1" max="16" step="1" value="${eng.candidateCount}" />
            </div>

            <div class="switch-row" id="toggle-temporal">
              <span>Temporal Reservoir Reuse</span>
              <div class="toggle-switch ${eng.enableTemporal ? "active" : ""}"></div>
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Max Temporal History (M_max)</span>
                <span class="row-val" id="val-history-m">${eng.maxHistoryM}</span>
              </div>
              <input type="range" id="input-history-m" min="4" max="64" step="2" value="${eng.maxHistoryM}" />
            </div>

            <div class="switch-row" id="toggle-spatial">
              <span>Spatial Reservoir Reuse</span>
              <div class="toggle-switch ${eng.enableSpatial ? "active" : ""}"></div>
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Spatial Kernel Radius</span>
                <span class="row-val" id="val-spatial-radius">${eng.spatialRadius} px</span>
              </div>
              <input type="range" id="input-spatial-radius" min="2" max="32" step="1" value="${eng.spatialRadius}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Spatial Neighbor Samples (k)</span>
                <span class="row-val" id="val-spatial-neighbors">${eng.spatialNeighbors}</span>
              </div>
              <input type="range" id="input-spatial-neighbors" min="1" max="8" step="1" value="${eng.spatialNeighbors}" />
            </div>
          </div>
        </div>

        <!-- Reflections & Tone Mapping Card -->
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🪞 Reflections & Post-Processing</span>
          </div>
          <div class="card-content">
            <div class="switch-row" id="toggle-reflections">
              <span>Ray-Traced Reflections</span>
              <div class="toggle-switch ${eng.enableReflections ? "active" : ""}"></div>
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Reflection Bounces</span>
                <span class="row-val" id="val-refl-bounces">${eng.reflectionBounces}</span>
              </div>
              <input type="range" id="input-refl-bounces" min="1" max="6" step="1" value="${eng.reflectionBounces}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Reflection Multiplier</span>
                <span class="row-val" id="val-refl-scale">${eng.reflectionScale.toFixed(2)}</span>
              </div>
              <input type="range" id="input-refl-scale" min="0.0" max="2.0" step="0.05" value="${eng.reflectionScale}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Exposure</span>
                <span class="row-val" id="val-exposure">${eng.exposure.toFixed(2)}</span>
              </div>
              <input type="range" id="input-exposure" min="0.2" max="3.5" step="0.05" value="${eng.exposure}" />
            </div>

            <div class="control-row">
              <span class="row-label-val">Tone Mapping Curve</span>
              <select class="select-input" id="select-tonemap">
                <option value="0" ${eng.toneMapOp === 0 ? "selected" : ""}>ACES Filmic Tone Map</option>
                <option value="1" ${eng.toneMapOp === 1 ? "selected" : ""}>Reinhard Extended</option>
                <option value="2" ${eng.toneMapOp === 2 ? "selected" : ""}>Linear Clamp</option>
              </select>
            </div>
          </div>
        </div>
      `;
    } else if (this.activeInspectorTab === "materials") {
      container.innerHTML = `
        <!-- Glass Dielectric Card -->
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🔮 Glass (Dielectric BSDF)</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Index of Refraction (IOR)</span>
                <span class="row-val" id="val-glass-ior">${mat.glassIor.toFixed(2)}</span>
              </div>
              <input type="range" id="input-glass-ior" min="1.0" max="2.42" step="0.01" value="${mat.glassIor}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Glass Roughness (Frosting)</span>
                <span class="row-val" id="val-glass-rough">${mat.glassRoughness.toFixed(2)}</span>
              </div>
              <input type="range" id="input-glass-rough" min="0.0" max="0.6" step="0.01" value="${mat.glassRoughness}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Transmission</span>
                <span class="row-val" id="val-glass-trans">${mat.glassTransmission.toFixed(2)}</span>
              </div>
              <input type="range" id="input-glass-trans" min="0.0" max="1.0" step="0.02" value="${mat.glassTransmission}" />
            </div>
          </div>
        </div>

        <!-- Plastic Card -->
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🔴 Plastic (Dual-Lobe Clearcoat)</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Plastic Roughness</span>
                <span class="row-val" id="val-plastic-rough">${mat.plasticRoughness.toFixed(2)}</span>
              </div>
              <input type="range" id="input-plastic-rough" min="0.01" max="0.8" step="0.01" value="${mat.plasticRoughness}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Specular Level</span>
                <span class="row-val" id="val-plastic-spec">${mat.plasticSpecular.toFixed(2)}</span>
              </div>
              <input type="range" id="input-plastic-spec" min="0.01" max="0.2" step="0.01" value="${mat.plasticSpecular}" />
            </div>
          </div>
        </div>

        <!-- Metals Card -->
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🪙 Metals / Conductors</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Gold Metal Roughness</span>
                <span class="row-val" id="val-metal-rough">${mat.metalRoughness.toFixed(2)}</span>
              </div>
              <input type="range" id="input-metal-rough" min="0.01" max="0.6" step="0.01" value="${mat.metalRoughness}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Metalness</span>
                <span class="row-val" id="val-metalness">${mat.metalness.toFixed(2)}</span>
              </div>
              <input type="range" id="input-metalness" min="0.0" max="1.0" step="0.02" value="${mat.metalness}" />
            </div>
          </div>
        </div>

        <!-- Floor / Runway Card -->
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🏁 Proving Grounds Floor</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Asphalt Roughness</span>
                <span class="row-val" id="val-floor-rough">${mat.floorRoughness.toFixed(2)}</span>
              </div>
              <input type="range" id="input-floor-rough" min="0.05" max="0.9" step="0.02" value="${mat.floorRoughness}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Floor Reflectivity / Wetness</span>
                <span class="row-val" id="val-floor-refl">${mat.floorReflectivity.toFixed(2)}</span>
              </div>
              <input type="range" id="input-floor-refl" min="0.0" max="1.0" step="0.02" value="${mat.floorReflectivity}" />
            </div>
          </div>
        </div>
      `;
    } else if (this.activeInspectorTab === "lighting") {
      container.innerHTML = `
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">☀️ Sun & Directional Light</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Sun Elevation</span>
                <span class="row-val" id="val-sun-elevation">${lit.sunElevation.toFixed(0)}°</span>
              </div>
              <input type="range" id="input-sun-elevation" min="5" max="85" step="1" value="${lit.sunElevation}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Sun Azimuth</span>
                <span class="row-val" id="val-sun-azimuth">${lit.sunAzimuth.toFixed(0)}°</span>
              </div>
              <input type="range" id="input-sun-azimuth" min="0" max="360" step="2" value="${lit.sunAzimuth}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Sun Intensity</span>
                <span class="row-val" id="val-sun-intensity">${lit.sunIntensity.toFixed(1)}</span>
              </div>
              <input type="range" id="input-sun-intensity" min="0.5" max="8.0" step="0.1" value="${lit.sunIntensity}" />
            </div>
          </div>
        </div>

        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🔲 Studio Lights & Neon</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Softbox Light Intensity</span>
                <span class="row-val" id="val-softbox-intensity">${lit.softboxIntensity.toFixed(1)}</span>
              </div>
              <input type="range" id="input-softbox-intensity" min="0.0" max="30.0" step="0.5" value="${lit.softboxIntensity}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Neon Ring Glow Intensity</span>
                <span class="row-val" id="val-neon-intensity">${lit.neonRingIntensity.toFixed(1)}</span>
              </div>
              <input type="range" id="input-neon-intensity" min="0.0" max="50.0" step="1.0" value="${lit.neonRingIntensity}" />
            </div>
          </div>
        </div>
      `;
    } else if (this.activeInspectorTab === "vehicle") {
      container.innerHTML = `
        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">🎨 Vehicle Paint & Body Coat</span>
          </div>
          <div class="card-content">
            <span class="row-label-val">Preset Finishes</span>
            <div class="swatches-grid">
              ${CarSwatches.map((swatch, idx) => `
                <div class="swatch-btn ${idx === 0 ? "active" : ""}" 
                     style="background: ${swatch.hex};" 
                     data-swatch="${idx}" 
                     title="${swatch.name}"></div>
              `).join("")}
            </div>

            <div class="control-row" style="margin-top: 8px;">
              <div class="row-label-val">
                <span>Clearcoat Weight</span>
                <span class="row-val" id="val-car-coat-weight">${mat.carClearcoatWeight.toFixed(2)}</span>
              </div>
              <input type="range" id="input-car-coat-weight" min="0.0" max="1.0" step="0.02" value="${mat.carClearcoatWeight}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Clearcoat Roughness</span>
                <span class="row-val" id="val-car-coat-rough">${mat.carClearcoatRoughness.toFixed(3)}</span>
              </div>
              <input type="range" id="input-car-coat-rough" min="0.01" max="0.3" step="0.005" value="${mat.carClearcoatRoughness}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Metallic Flake Headroom</span>
                <span class="row-val" id="val-car-flake">${mat.carFlakeHeadroom.toFixed(2)}</span>
              </div>
              <input type="range" id="input-car-flake" min="0.2" max="1.2" step="0.02" value="${mat.carFlakeHeadroom}" />
            </div>
          </div>
        </div>

        <div class="inspector-card">
          <div class="card-header">
            <span class="card-title">⚙️ Powertrain & Chassis Tuning</span>
          </div>
          <div class="card-content">
            <div class="control-row">
              <div class="row-label-val">
                <span>Engine Power Multiplier</span>
                <span class="row-val" id="val-power-mult">${veh.powerMultiplier.toFixed(2)}x</span>
              </div>
              <input type="range" id="input-power-mult" min="0.5" max="2.5" step="0.05" value="${veh.powerMultiplier}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Brake Gain</span>
                <span class="row-val" id="val-brake-gain">${veh.brakeGain.toFixed(2)}x</span>
              </div>
              <input type="range" id="input-brake-gain" min="0.5" max="2.0" step="0.05" value="${veh.brakeGain}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Suspension Stiffness</span>
                <span class="row-val" id="val-susp-stiff">${veh.suspensionStiffness.toFixed(2)}x</span>
              </div>
              <input type="range" id="input-susp-stiff" min="0.5" max="2.0" step="0.05" value="${veh.suspensionStiffness}" />
            </div>

            <div class="control-row">
              <div class="row-label-val">
                <span>Tyre Grip (Lateral)</span>
                <span class="row-val" id="val-tyre-grip">${veh.tyreGrip.toFixed(2)}x</span>
              </div>
              <input type="range" id="input-tyre-grip" min="0.6" max="2.0" step="0.05" value="${veh.tyreGrip}" />
            </div>

            <button class="btn-pill" id="btn-respawn-car-tab" style="width: 100%; justify-content: center; margin-top: 6px;">
              ↺ Reset Vehicle Dynamics (R)
            </button>
          </div>
        </div>
      `;
    }

    this.bindTabInputs();
  }

  bindEvents() {
    // Top Notch Actions
    document.getElementById("btn-camera-toggle")?.addEventListener("click", () => {
      this.cameraMode = (this.cameraMode === "chase") ? "orbit" : "chase";
      const lbl = document.getElementById("cam-label");
      if (lbl) lbl.textContent = (this.cameraMode === "chase") ? "Chase Cam" : "Orbit View";
      this.onCameraToggle?.(this.cameraMode);
    });

    document.getElementById("btn-respawn-car")?.addEventListener("click", () => {
      this.vehicle.reset(0, 0, 0);
    });

    document.getElementById("select-preset")?.addEventListener("change", (e) => {
      this.onPresetChange?.(e.target.value);
    });

    // Viewport Mode Pills
    document.querySelectorAll(".view-mode-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".view-mode-pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.engine.settings.viewMode = parseInt(btn.dataset.mode, 10);
      });
    });

    // Inspector Tab Switching
    document.querySelectorAll(".tab-item").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab-item").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        this.activeInspectorTab = tab.dataset.tab;
        this.renderInspectorTab();
      });
    });

    // Outliner Node Selection
    document.querySelectorAll(".tree-node").forEach((node) => {
      node.addEventListener("click", () => {
        document.querySelectorAll(".tree-node").forEach(n => n.classList.remove("selected"));
        node.classList.add("selected");
        const target = node.dataset.target;
        if (target.startsWith("vehicle")) {
          this.activeInspectorTab = "vehicle";
        } else if (target === "lighting" || target.includes("sun") || target.includes("softbox") || target.includes("neon")) {
          this.activeInspectorTab = "lighting";
        } else {
          this.activeInspectorTab = "materials";
        }
        document.querySelectorAll(".tab-item").forEach(t => {
          t.classList.toggle("active", t.dataset.tab === this.activeInspectorTab);
        });
        this.renderInspectorTab();
      });
    });
  }

  bindTabInputs() {
    const eng = this.engine.settings;
    const mat = this.scene.materials;
    const lit = this.scene.lighting;
    const veh = this.vehicle;

    // Helper
    const bindSlider = (id, valId, obj, key, fmt = (v) => v.toString()) => {
      const slider = document.getElementById(id);
      const valDisp = document.getElementById(valId);
      if (slider && valDisp) {
        slider.addEventListener("input", (e) => {
          const val = parseFloat(e.target.value);
          obj[key] = val;
          valDisp.textContent = fmt(val);
        });
      }
    };

    if (this.activeInspectorTab === "engine") {
      document.getElementById("engine-render-mode")?.addEventListener("change", (e) => {
        eng.renderMode = parseInt(e.target.value, 10);
      });

      bindSlider("input-bounces", "val-bounces", eng, "maxBounces", (v) => v.toFixed(0));
      bindSlider("input-candidates", "val-candidates", eng, "candidateCount", (v) => v.toFixed(0));

      document.getElementById("toggle-temporal")?.addEventListener("click", (e) => {
        eng.enableTemporal = !eng.enableTemporal;
        e.currentTarget.querySelector(".toggle-switch")?.classList.toggle("active", eng.enableTemporal);
      });

      bindSlider("input-history-m", "val-history-m", eng, "maxHistoryM", (v) => v.toFixed(0));

      document.getElementById("toggle-spatial")?.addEventListener("click", (e) => {
        eng.enableSpatial = !eng.enableSpatial;
        e.currentTarget.querySelector(".toggle-switch")?.classList.toggle("active", eng.enableSpatial);
      });

      bindSlider("input-spatial-radius", "val-spatial-radius", eng, "spatialRadius", (v) => `${v.toFixed(0)} px`);
      bindSlider("input-spatial-neighbors", "val-spatial-neighbors", eng, "spatialNeighbors", (v) => v.toFixed(0));

      document.getElementById("toggle-reflections")?.addEventListener("click", (e) => {
        eng.enableReflections = !eng.enableReflections;
        e.currentTarget.querySelector(".toggle-switch")?.classList.toggle("active", eng.enableReflections);
      });

      bindSlider("input-refl-bounces", "val-refl-bounces", eng, "reflectionBounces", (v) => v.toFixed(0));
      bindSlider("input-refl-scale", "val-refl-scale", eng, "reflectionScale", (v) => v.toFixed(2));
      bindSlider("input-exposure", "val-exposure", eng, "exposure", (v) => v.toFixed(2));

      document.getElementById("select-tonemap")?.addEventListener("change", (e) => {
        eng.toneMapOp = parseInt(e.target.value, 10);
      });
    } else if (this.activeInspectorTab === "materials") {
      bindSlider("input-glass-ior", "val-glass-ior", mat, "glassIor", (v) => v.toFixed(2));
      bindSlider("input-glass-rough", "val-glass-rough", mat, "glassRoughness", (v) => v.toFixed(2));
      bindSlider("input-glass-trans", "val-glass-trans", mat, "glassTransmission", (v) => v.toFixed(2));

      bindSlider("input-plastic-rough", "val-plastic-rough", mat, "plasticRoughness", (v) => v.toFixed(2));
      bindSlider("input-plastic-spec", "val-plastic-spec", mat, "plasticSpecular", (v) => v.toFixed(2));

      bindSlider("input-metal-rough", "val-metal-rough", mat, "metalRoughness", (v) => v.toFixed(2));
      bindSlider("input-metalness", "val-metalness", mat, "metalness", (v) => v.toFixed(2));

      bindSlider("input-floor-rough", "val-floor-rough", mat, "floorRoughness", (v) => v.toFixed(2));
      bindSlider("input-floor-refl", "val-floor-refl", mat, "floorReflectivity", (v) => v.toFixed(2));
    } else if (this.activeInspectorTab === "lighting") {
      const onSunChange = () => {
        this.scene.updateSunDirection();
      };
      const sunEl = document.getElementById("input-sun-elevation");
      if (sunEl) {
        sunEl.addEventListener("input", (e) => {
          lit.sunElevation = parseFloat(e.target.value);
          document.getElementById("val-sun-elevation").textContent = `${lit.sunElevation.toFixed(0)}°`;
          onSunChange();
        });
      }
      const sunAz = document.getElementById("input-sun-azimuth");
      if (sunAz) {
        sunAz.addEventListener("input", (e) => {
          lit.sunAzimuth = parseFloat(e.target.value);
          document.getElementById("val-sun-azimuth").textContent = `${lit.sunAzimuth.toFixed(0)}°`;
          onSunChange();
        });
      }
      bindSlider("input-sun-intensity", "val-sun-intensity", lit, "sunIntensity", (v) => v.toFixed(1));
      bindSlider("input-softbox-intensity", "val-softbox-intensity", lit, "softboxIntensity", (v) => v.toFixed(1));
      bindSlider("input-neon-intensity", "val-neon-intensity", lit, "neonRingIntensity", (v) => v.toFixed(1));
    } else if (this.activeInspectorTab === "vehicle") {
      // Swatches
      document.querySelectorAll(".swatch-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".swatch-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          const idx = parseInt(btn.dataset.swatch, 10);
          mat.carPaintColor = [...CarSwatches[idx].rgb];
        });
      });

      bindSlider("input-car-coat-weight", "val-car-coat-weight", mat, "carClearcoatWeight", (v) => v.toFixed(2));
      bindSlider("input-car-coat-rough", "val-car-coat-rough", mat, "carClearcoatRoughness", (v) => v.toFixed(3));
      bindSlider("input-car-flake", "val-car-flake", mat, "carFlakeHeadroom", (v) => v.toFixed(2));

      bindSlider("input-power-mult", "val-power-mult", veh, "powerMultiplier", (v) => `${v.toFixed(2)}x`);
      bindSlider("input-brake-gain", "val-brake-gain", veh, "brakeGain", (v) => `${v.toFixed(2)}x`);
      bindSlider("input-susp-stiff", "val-susp-stiff", veh, "suspensionStiffness", (v) => `${v.toFixed(2)}x`);
      bindSlider("input-tyre-grip", "val-tyre-grip", veh, "tyreGrip", (v) => `${v.toFixed(2)}x`);

      document.getElementById("btn-respawn-car-tab")?.addEventListener("click", () => {
        veh.reset(0, 0, 0);
      });
    }
  }

  updateTelemetry() {
    const fpsElem = document.getElementById("telemetry-fps");
    const sppElem = document.getElementById("telemetry-spp");
    const mElem = document.getElementById("telemetry-m");
    const bElem = document.getElementById("telemetry-bounces");

    if (fpsElem) fpsElem.textContent = this.engine.fps;
    if (sppElem) sppElem.textContent = this.engine.sampleCount;
    if (mElem) mElem.textContent = this.engine.settings.candidateCount;
    if (bElem) bElem.textContent = this.engine.settings.maxBounces;

    // Driving HUD Telemetry
    const speedElem = document.getElementById("hud-speed");
    const gearElem = document.getElementById("hud-gear");
    const rpmElem = document.getElementById("hud-rpm");
    const rpmFill = document.getElementById("hud-rpm-fill");
    const thrFill = document.getElementById("hud-throttle-fill");
    const brkFill = document.getElementById("hud-brake-fill");

    if (speedElem) speedElem.textContent = Math.round(this.vehicle.speedKmh);
    if (gearElem) gearElem.textContent = this.vehicle.gear === -1 ? "R" : (this.vehicle.gear === 0 ? "N" : this.vehicle.gear);
    if (rpmElem) rpmElem.textContent = Math.round(this.vehicle.engineRpm);
    if (rpmFill) {
      const pct = Math.min(100, Math.max(0, ((this.vehicle.engineRpm - 900) / (7500 - 900)) * 100));
      rpmFill.style.width = `${pct}%`;
    }
    if (thrFill) thrFill.style.height = `${this.vehicle.throttle * 100}%`;
    if (brkFill) brkFill.style.height = `${this.vehicle.brake * 100}%`;
  }
}
