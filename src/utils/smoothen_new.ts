import type { Point3D } from "./pointCloudUtils";

/**
 * 构建高度图：把原始点云投影到 XY 网格上，记录每个格子的最高点 z 与颜色
 */
export interface HeightMapResult {
  heightMap: Float32Array;
  validMask: Uint8Array;
  colorMapR: Float32Array;
  colorMapG: Float32Array;
  colorMapB: Float32Array;
  widthX: number;
  heightY: number;
  N: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  nx: number;
  ny: number;
}

interface GetHeightMapParams {
  rawPoints: Point3D[];
  humanColors: Uint8ClampedArray; // 长度 >= rawPoints.length * 4 (RGBA)
  nx: number;
  ny: number;
}

/**
 * 将 rawPoints 映射到 nx * ny 网格，得到 heightMap & 颜色
 */
export function getHeightMapByRawPoints(params: GetHeightMapParams): HeightMapResult {
  const { rawPoints, humanColors, nx, ny } = params;
  const N = rawPoints.length;

  let xMin = +Infinity, xMax = -Infinity;
  let yMin = +Infinity, yMax = -Infinity;
  let zMin = +Infinity, zMax = -Infinity;

  for (let i = 0; i < N; i++) {
    const p = rawPoints[i];
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
    if (p.z < zMin) zMin = p.z;
    if (p.z > zMax) zMax = p.z;
  }

  const widthX  = xMax - xMin || 1.0;
  const heightY = yMax - yMin || 1.0;

  const size = nx * ny;
  const heightMap = new Float32Array(size);
  const validMask = new Uint8Array(size);
  const colorMapR = new Float32Array(size);
  const colorMapG = new Float32Array(size);
  const colorMapB = new Float32Array(size);

  // 初始化为无效
  for (let i = 0; i < size; i++) {
    heightMap[i] = -Infinity;
    validMask[i] = 0;
  }

  const idx = (ix: number, iy: number) => iy * nx + ix;

  for (let i = 0; i < N; i++) {
    const p = rawPoints[i];
    const u = (p.x - xMin) / widthX;
    const v = (p.y - yMin) / heightY;

    let ix = Math.floor(u * nx);
    let iy = Math.floor(v * ny);

    if (ix < 0) ix = 0;
    if (ix >= nx) ix = nx - 1;
    if (iy < 0) iy = 0;
    if (iy >= ny) iy = ny - 1;

    const k = idx(ix, iy);

    // 同一格取 z 更靠近摄像机的那个，这里假设 z 越大越靠外
    if (!validMask[k] || p.z > heightMap[k]) {
      heightMap[k] = p.z;
      validMask[k] = 1;

      const ci = i * 4;
      colorMapR[k] = humanColors[ci]     ?? 200;
      colorMapG[k] = humanColors[ci + 1] ?? 160;
      colorMapB[k] = humanColors[ci + 2] ?? 140;
    }
  }

  // 把 -Infinity 填成 zMin，避免后面计算 NaN
  for (let i = 0; i < size; i++) {
    if (!validMask[i]) {
      heightMap[i] = zMin;
    }
  }

  return {
    heightMap,
    validMask,
    colorMapR,
    colorMapG,
    colorMapB,
    widthX,
    heightY,
    N,
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
    nx,
    ny,
  };
}

/**
 * 双边滤波：在空间和高度两个维度上做权重
 */
export function bilateralFilterHeight(
  heightMap: Float32Array,
  validMask: Uint8Array,
  nx: number,
  ny: number,
  radius: number,
  sigmaSpace: number,
  sigmaDepth: number,
  iterations: number
): Float32Array {
  const size = nx * ny;
  let src = new Float32Array(heightMap);
  let dst = new Float32Array(size);

  const idx = (ix: number, iy: number) => iy * nx + ix;
  const spaceWeight: number[] = [];

  // 预计算空间核
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist2 = dx * dx + dy * dy;
      const w = Math.exp(-dist2 / (2 * sigmaSpace * sigmaSpace));
      spaceWeight.push(w);
    }
  }

  const kernelSize = radius * 2 + 1;

  for (let it = 0; it < iterations; it++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const k = idx(ix, iy);
        if (!validMask[k]) {
          dst[k] = src[k];
          continue;
        }

        const centerH = src[k];
        let wSum = 0;
        let hSum = 0;
        let idxW = 0;

        for (let ddy = -radius; ddy <= radius; ddy++) {
          const yy = iy + ddy;
          if (yy < 0 || yy >= ny) {
            idxW += kernelSize;
            continue;
          }
          for (let ddx = -radius; ddx <= radius; ddx++, idxW++) {
            const xx = ix + ddx;
            if (xx < 0 || xx >= nx) continue;

            const kk = idx(xx, yy);
            if (!validMask[kk]) continue;

            const h = src[kk];
            const dh = h - centerH;
            const wDepth = Math.exp(- (dh * dh) / (2 * sigmaDepth * sigmaDepth));
            const w = spaceWeight[idxW] * wDepth;

            wSum += w;
            hSum += h * w;
          }
        }

        if (wSum > 1e-6) {
          dst[k] = hSum / wSum;
        } else {
          dst[k] = centerH;
        }
      }
    }

    const tmp = src;
    src = dst;
    dst = tmp;
  }

  return src;
}

/**
 * 从 heightMap 中按 (x, y) 做双线性插值
 */
export function sampleHeightFromGrid(
  heightMap: Float32Array,
  x: number,
  y: number,
  nx: number,
  ny: number,
  widthX: number,
  heightY: number,
  xMin: number,
  yMin: number
): number {
  const u = (x - xMin) / widthX;
  const v = (y - yMin) / heightY;

  const gx = u * (nx - 1);
  const gy = v * (ny - 1);

  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;

  const clamp = (val: number, min: number, max: number) =>
    val < min ? min : val > max ? max : val;

  const x0 = clamp(ix, 0, nx - 1);
  const y0 = clamp(iy, 0, ny - 1);
  const x1 = clamp(ix + 1, 0, nx - 1);
  const y1 = clamp(iy + 1, 0, ny - 1);

  const idx = (ix: number, iy: number) => iy * nx + ix;

  const h00 = heightMap[idx(x0, y0)];
  const h10 = heightMap[idx(x1, y0)];
  const h01 = heightMap[idx(x0, y1)];
  const h11 = heightMap[idx(x1, y1)];

  const hx0 = h00 * (1 - fx) + h10 * fx;
  const hx1 = h01 * (1 - fx) + h11 * fx;

  return hx0 * (1 - fy) + hx1 * fy;
}

export interface SmoothenResult {
  smoothed: Point3D[];
  heightMapFiltered: Float32Array;
  validMask: Uint8Array;
  colorMapR: Float32Array;
  colorMapG: Float32Array;
  colorMapB: Float32Array;
  nx: number;
  ny: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
  widthX: number;
  heightY: number;
}

/**
 * 整体入口：点云 → 自适应分辨率高度图 → 双边滤波 → 平滑后的点云
 */
export function smoothen_new(params: {
  rawPoints: Point3D[];
  humanColors: Uint8ClampedArray;
  targetCellSize?: number; // 约束每个格子的物理大小
  maxResolution?: number;
  minResolution?: number;
}): SmoothenResult {
  const {
    rawPoints,
    humanColors,
    targetCellSize = 0.005, // ~5mm 一格
    maxResolution = 192,
    minResolution = 64,
  } = params;

  const N = rawPoints.length;
  if (!N) {
    throw new Error("rawPoints is empty");
  }

  // 计算 XY 范围，自适应 nx / ny
  let xMin0 = +Infinity, xMax0 = -Infinity;
  let yMin0 = +Infinity, yMax0 = -Infinity;

  for (let i = 0; i < N; i++) {
    const p = rawPoints[i];
    if (p.x < xMin0) xMin0 = p.x;
    if (p.x > xMax0) xMax0 = p.x;
    if (p.y < yMin0) yMin0 = p.y;
    if (p.y > yMax0) yMax0 = p.y;
  }

  const width0 = xMax0 - xMin0 || 1.0;
  const height0 = yMax0 - yMin0 || 1.0;

  let nx = Math.round(width0 / targetCellSize);
  let ny = Math.round(height0 / targetCellSize);

  nx = Math.min(maxResolution, Math.max(minResolution, nx));
  ny = Math.min(maxResolution, Math.max(minResolution, ny));

  const hMapRes = getHeightMapByRawPoints({
    rawPoints,
    humanColors,
    nx,
    ny,
  });

  const {
    heightMap,
    validMask,
    widthX,
    heightY,
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
  } = hMapRes;

  // 估计高度范围，用于 sigmaDepth
  let hMin = +Infinity, hMax = -Infinity;
  for (let i = 0; i < heightMap.length; i++) {
    const h = heightMap[i];
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  const hRange = hMax - hMin || 1.0;

  const radius = 2;
  const sigmaSpace = 1.8;
  const sigmaDepth = hRange * 0.06;
  const iterations = 2;

  const heightMapFiltered = bilateralFilterHeight(
    heightMap,
    validMask,
    nx,
    ny,
    radius,
    sigmaSpace,
    sigmaDepth,
    iterations
  );

  const smoothed: Point3D[] = [];
  for (let i = 0; i < N; i++) {
    const { x, y } = rawPoints[i];
    const zSmooth = sampleHeightFromGrid(
      heightMapFiltered,
      x,
      y,
      nx,
      ny,
      widthX,
      heightY,
      xMin,
      yMin
    );
    smoothed.push({ x, y, z: zSmooth });
  }

  return {
    smoothed,
    heightMapFiltered,
    validMask: hMapRes.validMask,
    colorMapR: hMapRes.colorMapR,
    colorMapG: hMapRes.colorMapG,
    colorMapB: hMapRes.colorMapB,
    nx,
    ny,
    xMin,
    xMax,
    yMin,
    yMax,
    zMin,
    zMax,
    widthX,
    heightY,
  };
}
