//============================================================================================================================================
//                                                         VEHICLEMESHLOADER.JS
//============================================================================================================================================
// Decodes and prepares WebGL2 buffers for the authentic ControlVehicle mesh (Chassis, Rims, Tyres).

import { BodyGeometry, RimGeometry, TyreGeometry } from "../../Models/VehicleGeometryData.js";

export function BuildVehicleBuffers(gl) {
  // 1. Process Body Geometry
  const bodyVertCount = BodyGeometry.vertCount;
  const bodyFacetCount = BodyGeometry.facetCount;
  const bodyPos = BodyGeometry.positions;
  const bodyFacets = BodyGeometry.facets;
  const bodyFams = BodyGeometry.families;

  // Calculate smooth normals for body
  const bodyNormals = new Float32Array(bodyVertCount * 3);
  for (let i = 0; i < bodyFacetCount; i++) {
    const i0 = bodyFacets[i * 3];
    const i1 = bodyFacets[i * 3 + 1];
    const i2 = bodyFacets[i * 3 + 2];

    const ax = bodyPos[i1 * 3] - bodyPos[i0 * 3];
    const ay = bodyPos[i1 * 3 + 1] - bodyPos[i0 * 3 + 1];
    const az = bodyPos[i1 * 3 + 2] - bodyPos[i0 * 3 + 2];

    const bx = bodyPos[i2 * 3] - bodyPos[i0 * 3];
    const by = bodyPos[i2 * 3 + 1] - bodyPos[i0 * 3 + 1];
    const bz = bodyPos[i2 * 3 + 2] - bodyPos[i0 * 3 + 2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    bodyNormals[i0 * 3] += nx; bodyNormals[i0 * 3 + 1] += ny; bodyNormals[i0 * 3 + 2] += nz;
    bodyNormals[i1 * 3] += nx; bodyNormals[i1 * 3 + 1] += ny; bodyNormals[i1 * 3 + 2] += nz;
    bodyNormals[i2 * 3] += nx; bodyNormals[i2 * 3 + 1] += ny; bodyNormals[i2 * 3 + 2] += nz;
  }

  for (let i = 0; i < bodyVertCount; i++) {
    const nx = bodyNormals[i * 3], ny = bodyNormals[i * 3 + 1], nz = bodyNormals[i * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1.0;
    bodyNormals[i * 3] = nx / len;
    bodyNormals[i * 3 + 1] = ny / len;
    bodyNormals[i * 3 + 2] = nz / len;
  }

  // Flatten body triangles with per-face material families
  const bodyTotalVertices = bodyFacetCount * 3;
  const bodyInterleaved = new Float32Array(bodyTotalVertices * 8); // pos(3), normal(3), matId(1), unused(1)

  for (let i = 0; i < bodyFacetCount; i++) {
    const fam = bodyFams[i];
    for (let c = 0; c < 3; c++) {
      const vIdx = bodyFacets[i * 3 + c];
      const outIdx = (i * 3 + c) * 8;
      bodyInterleaved[outIdx]     = bodyPos[vIdx * 3];
      bodyInterleaved[outIdx + 1] = bodyPos[vIdx * 3 + 1];
      bodyInterleaved[outIdx + 2] = bodyPos[vIdx * 3 + 2];

      bodyInterleaved[outIdx + 3] = bodyNormals[vIdx * 3];
      bodyInterleaved[outIdx + 4] = bodyNormals[vIdx * 3 + 1];
      bodyInterleaved[outIdx + 5] = bodyNormals[vIdx * 3 + 2];

      bodyInterleaved[outIdx + 6] = fam;
      bodyInterleaved[outIdx + 7] = 0.0;
    }
  }

  // 2. Process Wheel (Rim + Tyre combined)
  // Rim: 1568 facets, cornerNormals present
  // Tyre: 3968 facets, cornerNormals present
  const rimFacets = RimGeometry.facetCount;
  const tyreFacets = TyreGeometry.facetCount;
  const wheelTotalFacets = rimFacets + tyreFacets;
  const wheelTotalVertices = wheelTotalFacets * 3;
  const wheelInterleaved = new Float32Array(wheelTotalVertices * 8);

  // Fill Rim (Material ID: 10 = Hub/Rim)
  const rimPos = RimGeometry.positions;
  const rimIdx = RimGeometry.facets;
  const rimNormals = RimGeometry.cornerNormals;
  for (let i = 0; i < rimFacets; i++) {
    for (let c = 0; c < 3; c++) {
      const v = rimIdx[i * 3 + c];
      const outIdx = (i * 3 + c) * 8;
      wheelInterleaved[outIdx]     = rimPos[v * 3];
      wheelInterleaved[outIdx + 1] = rimPos[v * 3 + 1];
      wheelInterleaved[outIdx + 2] = rimPos[v * 3 + 2];

      wheelInterleaved[outIdx + 3] = rimNormals[(i * 3 + c) * 3];
      wheelInterleaved[outIdx + 4] = rimNormals[(i * 3 + c) * 3 + 1];
      wheelInterleaved[outIdx + 5] = rimNormals[(i * 3 + c) * 3 + 2];

      wheelInterleaved[outIdx + 6] = 10.0; // Hub
      wheelInterleaved[outIdx + 7] = 0.0;
    }
  }

  // Fill Tyre (Material ID: 9 = Tyre Rubber)
  const tyrePos = TyreGeometry.positions;
  const tyreIdx = TyreGeometry.facets;
  const tyreNormals = TyreGeometry.cornerNormals;
  const offsetVert = rimFacets * 3;
  for (let i = 0; i < tyreFacets; i++) {
    for (let c = 0; c < 3; c++) {
      const v = tyreIdx[i * 3 + c];
      const outIdx = (offsetVert + i * 3 + c) * 8;
      wheelInterleaved[outIdx]     = tyrePos[v * 3];
      wheelInterleaved[outIdx + 1] = tyrePos[v * 3 + 1];
      wheelInterleaved[outIdx + 2] = tyrePos[v * 3 + 2];

      wheelInterleaved[outIdx + 3] = tyreNormals[(i * 3 + c) * 3];
      wheelInterleaved[outIdx + 4] = tyreNormals[(i * 3 + c) * 3 + 1];
      wheelInterleaved[outIdx + 5] = tyreNormals[(i * 3 + c) * 3 + 2];

      wheelInterleaved[outIdx + 6] = 9.0; // Tyre rubber
      wheelInterleaved[outIdx + 7] = 0.0;
    }
  }

  // Create GPU VAO & VBO for Body
  const bodyVao = gl.createVertexArray();
  gl.bindVertexArray(bodyVao);
  const bodyVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bodyVbo);
  gl.bufferData(gl.ARRAY_BUFFER, bodyInterleaved, gl.STATIC_DRAW);

  // Attrib 0: pos (3 floats)
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  // Attrib 1: normal (3 floats)
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  // Attrib 2: material ID (1 float)
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);

  // Create GPU VAO & VBO for Wheel
  const wheelVao = gl.createVertexArray();
  gl.bindVertexArray(wheelVao);
  const wheelVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, wheelVbo);
  gl.bufferData(gl.ARRAY_BUFFER, wheelInterleaved, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);

  gl.bindVertexArray(null);

  return {
    body: {
      vao: bodyVao,
      vbo: bodyVbo,
      vertexCount: bodyTotalVertices,
      boundsMin: BodyGeometry.boundsMin,
      boundsMax: BodyGeometry.boundsMax
    },
    wheel: {
      vao: wheelVao,
      vbo: wheelVbo,
      vertexCount: wheelTotalVertices,
      boundsMin: TyreGeometry.boundsMin,
      boundsMax: TyreGeometry.boundsMax
    }
  };
}
