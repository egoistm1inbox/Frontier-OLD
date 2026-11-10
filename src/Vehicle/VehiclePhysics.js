//============================================================================================================================================
//                                                         VEHICLEPHYSICS.JS
//============================================================================================================================================
// Complete 4-wheel vehicle physics solver with powertrain, suspension struts, tyre slip, steering, and camera tracking.

import { Vec3, Mat4, Quat } from "../Engine/MathUtils.js";

// Socket mounts from ControlVehicle specification
export const AxleMounts = [
  [+1.7274, +1.0475, +0.0914], // FrontLeft
  [+1.7274, -1.0475, +0.0914], // FrontRight
  [-1.6686, +1.0475, +0.0914], // RearLeft
  [-1.6686, -1.0475, +0.0914], // RearRight
];

export const TyreRadius = 0.50855; // meters
export const RestHeight = 0.41715; // base ground offset

export class VehiclePhysics {
  constructor() {
    this.position = Vec3.create(0.0, 0.0, RestHeight);
    this.velocity = Vec3.create(0, 0, 0);
    this.yaw = 0.0;
    this.pitch = 0.0;
    this.roll = 0.0;
    this.steerAngle = 0.0;
    this.targetSteer = 0.0;

    // Powertrain & Telemetry
    this.speed = 0.0;        // m/s
    this.speedKmh = 0.0;     // km/h
    this.engineRpm = 900.0;  // Idle RPM
    this.throttle = 0.0;
    this.brake = 0.0;
    this.handbrake = false;
    this.gear = 1;           // -1 = R, 0 = N, 1..6
    this.gearRatios = [3.827, 2.360, 1.685, 1.312, 1.000, 0.793];
    this.reverseRatio = 3.383;
    this.finalDrive = 3.700;

    // Suspension corners [FL, FR, RL, RR]
    this.suspensionDeflection = [0, 0, 0, 0];
    this.wheelSpin = [0, 0, 0, 0];       // radians
    this.wheelSpinSpeed = [0, 0, 0, 0];  // rad/s

    // Physics parameters (adjustable via inspector)
    this.powerMultiplier = 1.0;
    this.brakeGain = 1.0;
    this.suspensionStiffness = 1.0;
    this.suspensionDamping = 1.0;
    this.tyreGrip = 1.15;
    this.weightTransferGain = 1.0;

    // Chase camera parameters
    this.cameraPosition = Vec3.create(-8.0, 0.0, 2.8);
    this.cameraTarget = Vec3.create(0.0, 0.0, 1.2);
    this.cameraDistance = 8.5;
    this.cameraHeight = 2.4;

    // Matrices
    this.transformMatrix = Mat4.create();
    this.wheelTransforms = [Mat4.create(), Mat4.create(), Mat4.create(), Mat4.create()];

    this.updateMatrices();
  }

  reset(x = 0, y = 0, yaw = 0) {
    Vec3.set(this.position, x, y, RestHeight);
    Vec3.set(this.velocity, 0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.steerAngle = 0;
    this.targetSteer = 0;
    this.speed = 0;
    this.speedKmh = 0;
    this.engineRpm = 900;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.gear = 1;
    this.suspensionDeflection = [0, 0, 0, 0];
    this.updateMatrices();
  }

  update(dt, input) {
    // 1. Process Input
    const forward = input.forward ? 1 : 0;
    const backward = input.backward ? 1 : 0;
    const left = input.left ? 1 : 0;
    const right = input.right ? 1 : 0;
    this.handbrake = input.handbrake;

    if (input.reset) {
      this.reset(0, 0, 0);
      return;
    }

    // Steering ramp & speed sensitivity
    const speedFactor = Math.max(0.25, 1.0 - Math.min(1.0, this.speedKmh / 160.0) * 0.65);
    const maxSteer = 0.55 * speedFactor; // ~31 degrees at low speed
    this.targetSteer = (left - right) * maxSteer;
    const steerSpeed = 4.2;
    this.steerAngle += (this.targetSteer - this.steerAngle) * Math.min(1.0, dt * steerSpeed);

    // Throttle & Brake integration
    if (this.speed > -0.5 && forward > 0) {
      this.gear = Math.max(1, this.gear);
      this.throttle = Math.min(1.0, this.throttle + dt * 4.0);
      this.brake = 0.0;
    } else if (this.speed < 0.5 && backward > 0 && this.speed <= 0.1) {
      // Reverse
      this.gear = -1;
      this.throttle = Math.min(0.75, this.throttle + dt * 3.5);
      this.brake = 0.0;
    } else if (backward > 0 && this.speed > 0.1) {
      // Braking while going forward
      this.throttle = Math.max(0.0, this.throttle - dt * 8.0);
      this.brake = Math.min(1.0, this.brake + dt * 5.0) * this.brakeGain;
    } else {
      this.throttle = Math.max(0.0, this.throttle - dt * 5.0);
      this.brake = Math.max(0.0, this.brake - dt * 6.0);
    }

    if (this.handbrake) {
      this.brake = Math.max(this.brake, 0.95);
    }

    // 2. Powertrain Simulation (Engine RPM & Auto-shifting)
    const forwardDirection = [Math.cos(this.yaw), Math.sin(this.yaw), 0];
    const forwardSpeed = this.velocity[0] * forwardDirection[0] + this.velocity[1] * forwardDirection[1];
    this.speed = forwardSpeed;
    this.speedKmh = Math.abs(this.speed * 3.6);

    const currentRatio = this.gear === -1 ? this.reverseRatio : (this.gearRatios[this.gear - 1] || 1.0);
    const effectiveWheelRpm = (Math.abs(this.speed) / (2 * Math.PI * TyreRadius)) * 60;
    const calculatedRpm = effectiveWheelRpm * currentRatio * this.finalDrive;

    const idleRpm = 900.0;
    const maxRpm = 7500.0;
    this.engineRpm = Math.max(idleRpm, Math.min(maxRpm, idleRpm + (calculatedRpm - idleRpm) * 0.85 + this.throttle * 1800));

    // Auto transmission up/down shift
    if (this.gear > 0) {
      if (this.engineRpm > 6200 && this.gear < 6) {
        this.gear++;
      } else if (this.engineRpm < 2200 && this.gear > 1) {
        this.gear--;
      }
    }

    // 3. Acceleration & Driving Force
    const peakTorque = 650.0 * this.powerMultiplier; // Nm (GT-R curve)
    const torqueCurve = Math.max(0.35, Math.sin(Math.min(Math.PI, (this.engineRpm / maxRpm) * Math.PI)));
    const engineTorque = peakTorque * torqueCurve * this.throttle;
    const driveForce = (engineTorque * currentRatio * this.finalDrive) / TyreRadius * (this.gear === -1 ? -1 : 1);

    // Braking force
    const brakeForce = this.brake * 14000.0 * (forwardSpeed > 0 ? -1 : (forwardSpeed < 0 ? 1 : 0));

    // Rolling resistance & Aero drag
    const rollingResistance = -forwardSpeed * 120.0;
    const aeroDrag = -0.5 * 1.225 * 0.35 * 2.2 * forwardSpeed * Math.abs(forwardSpeed);

    const totalLongitudinalForce = driveForce + brakeForce + rollingResistance + aeroDrag;
    const mass = 1350.0; // kg
    const accelLong = totalLongitudinalForce / mass;

    // Apply longitudinal velocity change
    this.velocity[0] += forwardDirection[0] * accelLong * dt;
    this.velocity[1] += forwardDirection[1] * accelLong * dt;

    // 4. Lateral Dynamics & Steering
    const wheelbase = 2.85; // meters
    const turnRadius = wheelbase / Math.max(0.001, Math.abs(Math.sin(this.steerAngle)));
    const yawRateTarget = (forwardSpeed / turnRadius) * Math.sign(this.steerAngle);

    // Apply tyre grip and yaw rotation
    const lateralDamping = Math.min(1.0, dt * 14.0 * this.tyreGrip);
    // Lateral velocity component cancellation (drift prevention unless handbrake)
    const rightDirection = [-Math.sin(this.yaw), Math.cos(this.yaw), 0];
    const lateralSpeed = this.velocity[0] * rightDirection[0] + this.velocity[1] * rightDirection[1];
    const lateralCorrection = -lateralSpeed * (this.handbrake ? 0.35 : lateralDamping);

    this.velocity[0] += rightDirection[0] * lateralCorrection;
    this.velocity[1] += rightDirection[1] * lateralCorrection;

    this.yaw += yawRateTarget * dt * (this.handbrake ? 1.45 : 1.0);

    // 5. Suspension Pitch & Roll Weight Transfer
    const targetPitch = -(accelLong / 9.81) * 0.05 * this.weightTransferGain;
    const targetRoll = -(lateralSpeed * yawRateTarget / 9.81) * 0.07 * this.weightTransferGain;

    const suspensionSpring = 12.0 * this.suspensionStiffness;
    this.pitch += (targetPitch - this.pitch) * Math.min(1.0, dt * suspensionSpring);
    this.roll += (targetRoll - this.roll) * Math.min(1.0, dt * suspensionSpring);

    // Corner suspension travel
    this.suspensionDeflection[0] = targetPitch - targetRoll; // FL
    this.suspensionDeflection[1] = targetPitch + targetRoll; // FR
    this.suspensionDeflection[2] = -targetPitch - targetRoll; // RL
    this.suspensionDeflection[3] = -targetPitch + targetRoll; // RR

    // 6. Integrate Position
    this.position[0] += this.velocity[0] * dt;
    this.position[1] += this.velocity[1] * dt;
    this.position[2] = RestHeight + (Math.abs(this.pitch) + Math.abs(this.roll)) * 0.1;

    // Boundary constraints (stay within arena)
    const maxExtent = 180.0;
    if (Math.abs(this.position[0]) > maxExtent || Math.abs(this.position[1]) > maxExtent) {
      this.position[0] = Math.max(-maxExtent, Math.min(maxExtent, this.position[0]));
      this.position[1] = Math.max(-maxExtent, Math.min(maxExtent, this.position[1]));
      this.velocity[0] *= -0.3;
      this.velocity[1] *= -0.3;
    }

    // 7. Wheel Spin Rotation
    const wheelRotSpeed = this.speed / TyreRadius;
    for (let i = 0; i < 4; i++) {
      this.wheelSpinSpeed[i] = wheelRotSpeed;
      this.wheelSpin[i] += wheelRotSpeed * dt;
    }

    // 8. Update Transforms & Matrices
    this.updateMatrices();

    // 9. Update Chase Camera
    this.updateCamera(dt);
  }

  updateMatrices() {
    // Body transformation matrix: Translation * RotationYaw * RotationPitch * RotationRoll
    const qYaw = Quat.create();
    Quat.setAxisAngle(qYaw, [0, 0, 1], this.yaw);

    const qPitch = Quat.create();
    Quat.setAxisAngle(qPitch, [0, 1, 0], this.pitch);

    const qRoll = Quat.create();
    Quat.setAxisAngle(qRoll, [1, 0, 0], this.roll);

    const qRot = Quat.create();
    Quat.multiply(qRot, qYaw, qPitch);
    Quat.multiply(qRot, qRot, qRoll);

    Mat4.fromRotationTranslation(this.transformMatrix, qRot, this.position);

    // Compute 4 Wheel Matrices
    for (let i = 0; i < 4; i++) {
      const socket = AxleMounts[i];
      const isFront = (i < 2);
      const isRight = (i % 2 === 1);

      // Local wheel position with suspension deflection
      const localPos = [socket[0], socket[1], socket[2] + this.suspensionDeflection[i]];

      // Wheel steer (front wheels steer)
      const qSteer = Quat.create();
      if (isFront) {
        Quat.setAxisAngle(qSteer, [0, 0, 1], this.steerAngle);
      } else {
        Quat.identity(qSteer);
      }

      // Wheel spin rotation around axle (Y-axis)
      const qSpin = Quat.create();
      Quat.setAxisAngle(qSpin, [0, 1, 0], this.wheelSpin[i] * (isRight ? -1 : 1));

      // Right wheels flip 180 degrees so rims face outward
      const qFlip = Quat.create();
      if (isRight) {
        Quat.setAxisAngle(qFlip, [0, 0, 1], Math.PI);
      } else {
        Quat.identity(qFlip);
      }

      const qWheelLocal = Quat.create();
      Quat.multiply(qWheelLocal, qSteer, qFlip);
      Quat.multiply(qWheelLocal, qWheelLocal, qSpin);

      // World wheel rotation = BodyRotation * qWheelLocal
      const qWheelWorld = Quat.create();
      Quat.multiply(qWheelWorld, qRot, qWheelLocal);

      // World wheel position = BodyTransform * localPos
      const worldPos = Vec3.create();
      Quat.rotateVector(worldPos, qRot, localPos);
      Vec3.add(worldPos, worldPos, this.position);

      Mat4.fromRotationTranslation(this.wheelTransforms[i], qWheelWorld, worldPos);
    }
  }

  updateCamera(dt) {
    // Chase camera sits behind car at distance, smoothly trailing
    const forwardX = Math.cos(this.yaw);
    const forwardY = Math.sin(this.yaw);

    const targetX = this.position[0] - forwardX * this.cameraDistance;
    const targetY = this.position[1] - forwardY * this.cameraDistance;
    const targetZ = this.position[2] + this.cameraHeight;

    const followSpeed = 6.0;
    this.cameraPosition[0] += (targetX - this.cameraPosition[0]) * Math.min(1.0, dt * followSpeed);
    this.cameraPosition[1] += (targetY - this.cameraPosition[1]) * Math.min(1.0, dt * followSpeed);
    this.cameraPosition[2] += (targetZ - this.cameraPosition[2]) * Math.min(1.0, dt * followSpeed);

    // Look slightly ahead of the car hood
    const lookAheadX = this.position[0] + forwardX * 2.0;
    const lookAheadY = this.position[1] + forwardY * 2.0;
    const lookAheadZ = this.position[2] + 0.8;

    this.cameraTarget[0] += (lookAheadX - this.cameraTarget[0]) * Math.min(1.0, dt * 8.0);
    this.cameraTarget[1] += (lookAheadY - this.cameraTarget[1]) * Math.min(1.0, dt * 8.0);
    this.cameraTarget[2] += (lookAheadZ - this.cameraTarget[2]) * Math.min(1.0, dt * 8.0);
  }
}
