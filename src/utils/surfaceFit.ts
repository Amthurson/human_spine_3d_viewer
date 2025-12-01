// surfaceFit.ts
import * as THREE from 'three';
import type { TransformParams } from '../utils/pointCloudUtils';

function idx(ix: number, iy: number, nx: number) {
  return iy * nx + ix;
}

/**
 * 用最小二乘拟合平面 z = a x + b y + c
 */
function fitPlaneLS(samples: Array<{ x: number; y: number; z: number }>): { a: number; b: number; c: number } | null {
  const n = samples.length;
  if (n < 3) return null;

  let Sx = 0, Sy = 0, Sz = 0;
  let Sxx = 0, Syy = 0, Sxy = 0;
  let Sxz = 0, Syz = 0;

  for (const s of samples) {
    const { x, y, z } = s;
    Sx += x;
    Sy += y;
    Sz += z;
    Sxx += x * x;
    Syy += y * y;
    Sxy += x * y;
    Sxz += x * z;
    Syz += y * z;
  }

  const A = [
    [Sxx, Sxy, Sx],
    [Sxy, Syy, Sy],
    [Sx,  Sy,  n ],
  ];
  const B = [Sxz, Syz, Sz];

  // 3x3 高斯消元
  for (let i = 0; i < 3; i++) {
    // 选一个绝对值最大的主元
    let maxRow = i;
    for (let r = i + 1; r < 3; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[maxRow][i])) maxRow = r;
    }
    if (Math.abs(A[maxRow][i]) < 1e-8) return null;

    if (maxRow !== i) {
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      [B[i], B[maxRow]] = [B[maxRow], B[i]];
    }

    const pivot = A[i][i];
    for (let c = i; c < 3; c++) A[i][c] /= pivot;
    B[i] /= pivot;

    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const factor = A[r][i];
      for (let c = i; c < 3; c++) A[r][c] -= factor * A[i][c];
      B[r] -= factor * B[i];
    }
  }

  const [a, b, c] = B;
  return { a, b, c };
}

function updateMean(prevMean: number, prevCount: number, newVal: number) {
  const n = prevCount + 1;
  return prevMean + (newVal - prevMean) / n;
}

/**
 * 在 heightMap 上，从中心开始区域生长 + 局部平面拟合
 * 返回拟合后的 heightMap 和 mask
 */
export function growFittedSurface(
  heightMap: Float32Array | ArrayLike<number>,
  validMask: Uint8Array | ArrayLike<number>,
  nx: number,
  ny: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zMin: number,
  zMax: number,
  windowRadius = 2          // 局部拟合窗口半径（栅格数）
): {
  fittedHeightMap: Float32Array;
  fittedMask: Uint8Array;
} {
  const srcH =
    heightMap instanceof Float32Array
      ? heightMap
      : Float32Array.from(heightMap as ArrayLike<number>);
  const srcMask =
    validMask instanceof Uint8Array
      ? validMask
      : new Uint8Array(validMask as ArrayLike<number>);

  const fittedHeightMap = new Float32Array(nx * ny);
  const fittedMask = new Uint8Array(nx * ny);
  const visited = new Uint8Array(nx * ny);

  const widthX = xMax - xMin || 1;
  const heightY = yMax - yMin || 1;
  const zRange = zMax - zMin || 1;

  // ---- 1. 找一个靠近中心的种子格子 ----
  const cx0 = Math.floor((nx - 1) / 2);
  const cy0 = Math.floor((ny - 1) / 2);

  let startX = cx0;
  let startY = cy0;
  let found = false;

  const maxR = Math.max(nx, ny);
  for (let r = 0; r < maxR && !found; r++) {
    for (let dy = -r; dy <= r && !found; dy++) {
      for (let dx = -r; dx <= r && !found; dx++) {
        const ix = cx0 + dx;
        const iy = cy0 + dy;
        if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;
        if (srcMask[idx(ix, iy, nx)]) {
          startX = ix;
          startY = iy;
          found = true;
        }
      }
    }
  }

  if (!found) {
    console.warn('[growFittedSurface] 没有找到种子点，直接返回原图');
    return {
      fittedHeightMap: srcH.slice(),
      fittedMask: srcMask.slice(),
    };
  }

  // 预先算好每个格子中心的 x,y 坐标
  const gridX = new Float32Array(nx);
  const gridY = new Float32Array(ny);
  for (let ix = 0; ix < nx; ix++) {
    const u = ix / (nx - 1);
    gridX[ix] = xMin + u * widthX;
  }
  for (let iy = 0; iy < ny; iy++) {
    const v = iy / (ny - 1);
    gridY[iy] = yMin + v * heightY;
  }

  const q: Array<{ ix: number; iy: number }> = [];
  q.push({ ix: startX, iy: startY });

  const seedIndex = idx(startX, startY, nx);
  visited[seedIndex] = 1;
  fittedMask[seedIndex] = 1;
  fittedHeightMap[seedIndex] = srcH[seedIndex];

  let meanZ = srcH[seedIndex];
  let count = 1;
  const zThreshold = 0.12 * zRange; // 可以按需要再调：越小越严格

  while (q.length) {
    const { ix, iy } = q.shift()!;
    const neighbors = [
      [ix + 1, iy],
      [ix - 1, iy],
      [ix, iy + 1],
      [ix, iy - 1],
    ] as const;

    for (const [nx_, ny_] of neighbors) {
      if (nx_ < 0 || nx_ >= nx || ny_ < 0 || ny_ >= ny) continue;
      const i2 = idx(nx_, ny_, nx);
      if (visited[i2]) continue;
      visited[i2] = 1;

      // 在候选格子附近窗口收集原始样本点
      const samples: Array<{ x: number; y: number; z: number }> = [];
      for (let wy = -windowRadius; wy <= windowRadius; wy++) {
        const jy = ny_ + wy;
        if (jy < 0 || jy >= ny) continue;
        for (let wx = -windowRadius; wx <= windowRadius; wx++) {
          const jx = nx_ + wx;
          if (jx < 0 || jx >= nx) continue;
          const k = idx(jx, jy, nx);
          if (!srcMask[k]) continue;
          const z = srcH[k];
          if (!Number.isFinite(z)) continue;
          samples.push({
            x: gridX[jx],
            y: gridY[jy],
            z,
          });
        }
      }

      if (samples.length < 3) {
        // 样本不足，无法拟合平面，放弃这个格子
        continue;
      }

      const plane = fitPlaneLS(samples);
      if (!plane) continue;
      const { a, b, c } = plane;

      const xCenter = gridX[nx_];
      const yCenter = gridY[ny_];
      const zPred = a * xCenter + b * yCenter + c;

      let zObs: number | null = null;
      if (srcMask[i2]) {
        zObs = srcH[i2];
      }

      // 有原始观测，比较差值；没有观测，就用与均值的差判断
      let diff = 0;
      if (zObs != null) {
        diff = Math.abs(zObs - zPred);
      } else {
        diff = Math.abs(zPred - meanZ);
      }

      if (diff > zThreshold) {
        // 偏离太大，认为已经离开人体表面
        continue;
      }

      // 接受：加入区域，使用拟合 z
      fittedMask[i2] = 1;
      fittedHeightMap[i2] = zPred;

      meanZ = updateMean(meanZ, count, zPred);
      count++;

      q.push({ ix: nx_, iy: ny_ });
    }
  }

  // 对于没有被生长到但原来 valid 的点，可以选择：
  // - 直接保留原值，避免“挖洞”；或者
  // - 全部设为 0/NaN，实现严格的人体区域。
  // 这里选择保留原值但标记 mask=0，方便后续根据 fittedMask 控制。
  for (let i = 0; i < nx * ny; i++) {
    if (!fittedMask[i] && srcMask[i]) {
      // 保留原 z，当作“参考”，但不算在人体拟合面里
      fittedHeightMap[i] = srcH[i];
    }
  }

  return { fittedHeightMap, fittedMask };
}

/**
 * 如果你想直接用拟合后的曲面画一个调试用 Mesh（可选）
 */
export function buildFittedSurfaceMesh(
  fittedHeightMap: Float32Array,
  fittedMask: Uint8Array,
  nx: number,
  ny: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  transformParams: TransformParams
): THREE.Mesh | null {
  const widthX = xMax - xMin || 1;
  const heightY = yMax - yMin || 1;

  const positions: number[] = [];
  const indices: number[] = [];

  // 顶点
  for (let iy = 0; iy < ny; iy++) {
    const v = iy / (ny - 1);
    const y = yMin + v * heightY;
    for (let ix = 0; ix < nx; ix++) {
      const u = ix / (nx - 1);
      const x = xMin + u * widthX;
      const k = idx(ix, iy, nx);
      const z = fittedHeightMap[k];

      const p = new THREE.Vector3(x, y, z);
      p.multiplyScalar(transformParams.scaleFactor);
      p.sub(transformParams.center);

      positions.push(p.x, p.y, p.z);
    }
  }

  // 简单的规则网格三角化（只连 mask=1 的格子）
  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const k00 = idx(ix,     iy,     nx);
      const k10 = idx(ix + 1, iy,     nx);
      const k11 = idx(ix + 1, iy + 1, nx);
      const k01 = idx(ix,     iy + 1, nx);

      const m00 = fittedMask[k00];
      const m10 = fittedMask[k10];
      const m11 = fittedMask[k11];
      const m01 = fittedMask[k01];

      // 至少 3 个格子在人体区域再连三角形
      if (m00 && m10 && m11) {
        indices.push(k00, k10, k11);
      }
      if (m00 && m11 && m01) {
        indices.push(k00, k11, k01);
      }
    }
  }

  if (!indices.length) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    wireframe: false,
    transparent: true,
    opacity: 0.35,
  });

  const mesh = new THREE.Mesh(geom, mat);
  return mesh;
}
