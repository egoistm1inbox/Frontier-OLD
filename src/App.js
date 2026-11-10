//============================================================================================================================================
//                                                                 APP.JS
//============================================================================================================================================
// Main application orchestrator: connects ReSTIR PT Engine, Scene, Vehicle Physics, Cameras, and ProjectZero UI.

import { Mat4, Vec3 } from "./Engine/MathUtils.js";
import { ReSTIRPathTracer } from "./Engine/ReSTIRPathTracer.js";
import { SceneManager } from "./Engine/SceneManager.js";
import { VehiclePhysics } from "./Vehicle/VehiclePhysics.js";
import { ProjectZeroUI, CarSwatches } from "./UI/ProjectZeroUI.js";

export class Application {
  constructor() {
    this.canvas = document.getElementById("viewport-canvas");
    if (!this.canvas) {
      throw new Error("Viewport canvas not found in DOM");
    }

    // Engine & Scene Initialization
    this.engine = new ReSTIRPathTracer(this.canvas);
    this.scene = new SceneManager(this.engine.gl);
    this.vehicle = new VehiclePhysics();

    // Camera State
    this.cameraMode = "chase"; // "chase" or "orbit"
    this.camera = {
      position: Vec3.create(-8.0, 0.0, 2.5),
      target: Vec3.create(0.0, 0.0, 1.0),
      up: Vec3.create(0.0, 0.0, 1.0),
      viewMatrix: Mat4.create(),
      projMatrix: Mat4.create(),
      fov: (55 * Math.PI) / 180.0,
      near: 0.1,
      far: 200.0,
      orbitYaw: -0.3,
      orbitPitch: 0.35,
      orbitDist: 10.0
    };

    // Keyboard Input State
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
      reset: false
    };

    // Mouse Orbit State
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Initialize UI
    this.ui = new ProjectZeroUI(
      document.getElementById("app"),
      this.engine,
      this.scene,
      this.vehicle,
      (camMode) => {
        this.cameraMode = camMode;
      },
      (preset) => {
        this.applyPreset(preset);
      }
    );

    this.bindInputs();
    this.bindCanvasResize();

    // Spawn vehicle facing showcase props
    this.vehicle.reset(0, 0, 0);

    this.lastTime = performance.now();
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  bindInputs() {
    window.addEventListener("keydown", (e) => {
      // Don't intercept when typing in search or inputs
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;

      const code = e.code;
      if (code === "KeyW" || code === "ArrowUp") this.keys.forward = true;
      if (code === "KeyS" || code === "ArrowDown") this.keys.backward = true;
      if (code === "KeyA" || code === "ArrowLeft") this.keys.left = true;
      if (code === "KeyD" || code === "ArrowRight") this.keys.right = true;
      if (code === "Space") {
        this.keys.handbrake = true;
        e.preventDefault();
      }
      if (code === "KeyR") this.keys.reset = true;
      if (code === "KeyC") {
        // Toggle camera
        this.cameraMode = (this.cameraMode === "chase") ? "orbit" : "chase";
        const btn = document.getElementById("cam-label");
        if (btn) btn.textContent = (this.cameraMode === "chase") ? "Chase Cam" : "Orbit View";
      }
    });

    window.addEventListener("keyup", (e) => {
      const code = e.code;
      if (code === "KeyW" || code === "ArrowUp") this.keys.forward = false;
      if (code === "KeyS" || code === "ArrowDown") this.keys.backward = false;
      if (code === "KeyA" || code === "ArrowLeft") this.keys.left = false;
      if (code === "KeyD" || code === "ArrowRight") this.keys.right = false;
      if (code === "Space") this.keys.handbrake = false;
      if (code === "KeyR") this.keys.reset = false;
    });

    // Canvas Pointer drag for orbit camera
    const canvas = document.getElementById("viewport-canvas");
    if (canvas) {
      canvas.addEventListener("pointerdown", (e) => {
        this.isDragging = true;
        this.dragStart.x = e.clientX;
        this.dragStart.y = e.clientY;
      });

      window.addEventListener("pointermove", (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.dragStart.x = e.clientX;
        this.dragStart.y = e.clientY;

        this.camera.orbitYaw -= dx * 0.005;
        this.camera.orbitPitch = Math.max(0.05, Math.min(1.4, this.camera.orbitPitch + dy * 0.005));
      });

      window.addEventListener("pointerup", () => {
        this.isDragging = false;
      });

      canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.camera.orbitDist = Math.max(3.0, Math.min(30.0, this.camera.orbitDist + e.deltaY * 0.015));
      }, { passive: false });
    }
  }

  bindCanvasResize() {
    const handleResize = () => {
      const dock = document.querySelector(".dock.centre");
      if (!dock) return;
      const w = dock.clientWidth;
      const h = dock.clientHeight;
      if (w > 0 && h > 0) {
        this.engine.resize(w, h);
      }
    };
    window.addEventListener("resize", handleResize);
    setTimeout(handleResize, 100);
  }

  applyPreset(preset) {
    const l = this.scene.lighting;
    const m = this.scene.materials;

    if (preset === "studio") {
      l.sunElevation = 45;
      l.sunAzimuth = 140;
      l.sunIntensity = 2.5;
      l.sunColor = [1.0, 0.98, 0.95];
      l.softboxIntensity = 16.0;
      l.neonRingIntensity = 25.0;
      l.neonRingColor = [0.1, 0.85, 1.0];
      m.floorReflectivity = 0.85;
      m.floorRoughness = 0.22;
    } else if (preset === "daylight") {
      l.sunElevation = 65;
      l.sunAzimuth = 180;
      l.sunIntensity = 5.5;
      l.sunColor = [1.0, 0.98, 0.9];
      l.softboxIntensity = 0.0;
      l.neonRingIntensity = 5.0;
      m.floorReflectivity = 0.35;
      m.floorRoughness = 0.45;
    } else if (preset === "golden") {
      l.sunElevation = 14;
      l.sunAzimuth = 240;
      l.sunIntensity = 6.0;
      l.sunColor = [1.0, 0.65, 0.25];
      l.softboxIntensity = 4.0;
      l.neonRingIntensity = 15.0;
      m.floorReflectivity = 0.75;
      m.floorRoughness = 0.25;
    } else if (preset === "cyber") {
      l.sunElevation = 8;
      l.sunAzimuth = 30;
      l.sunIntensity = 0.4;
      l.sunColor = [0.2, 0.3, 0.8];
      l.softboxIntensity = 8.0;
      l.neonRingIntensity = 65.0;
      l.neonRingColor = [1.0, 0.05, 0.6]; // Hot magenta
      m.floorReflectivity = 0.95;
      m.floorRoughness = 0.12;
    }

    this.scene.updateSunDirection();
    this.ui.renderInspectorTab();
  }

  updateCamera() {
    const cam = this.camera;
    const aspect = this.engine.width / this.engine.height;
    Mat4.perspective(cam.projMatrix, cam.fov, aspect, cam.near, cam.far);

    if (this.cameraMode === "chase") {
      // Dynamic Chase Camera following vehicle
      Vec3.copy(cam.position, this.vehicle.cameraPosition);
      Vec3.copy(cam.target, this.vehicle.cameraTarget);
      Mat4.lookAt(cam.viewMatrix, cam.position, cam.target, cam.up);
    } else {
      // Orbit camera focused on car or showcase
      const target = this.vehicle.position;
      const cx = target[0] + cam.orbitDist * Math.cos(cam.orbitPitch) * Math.sin(cam.orbitYaw);
      const cy = target[1] + cam.orbitDist * Math.cos(cam.orbitPitch) * Math.cos(cam.orbitYaw);
      const cz = target[2] + cam.orbitDist * Math.sin(cam.orbitPitch);

      Vec3.set(cam.position, cx, cy, cz);
      Vec3.set(cam.target, target[0], target[1], target[2] + 0.8);
      Mat4.lookAt(cam.viewMatrix, cam.position, cam.target, cam.up);
    }
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000.0);
    this.lastTime = now;

    // 1. Advance Vehicle Physics
    this.vehicle.update(dt, this.keys);

    // 2. Update Camera Matrices
    this.updateCamera();

    // 3. Render ReSTIR PT Enhanced Frame
    this.engine.render(this.scene, this.camera, this.vehicle);

    // 4. Update UI Telemetry
    this.ui.updateTelemetry();

    requestAnimationFrame(this.tick);
  }
}
