import * as THREE from 'three';

// ----------------- 类型 & 小工具 -----------------
type GridPoint = [number, number];

function idx(ix: number, iy: number, nx: number) {
  return iy * nx + ix;
}

// 简单的 marching-squares：mask 里 0/1，输出网格坐标上的折线
function marchingSquares(
  mask: Uint8Array,
  nx: number,
  ny: number,
  isoLevel = 0.5
): GridPoint[][] {
  interface Segment { a: GridPoint; b: GridPoint }
  interface Neighbor { p: GridPoint; segIndex: number }

  const segments: Segment[] = [];

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const v00 = mask[idx(ix,     iy,     nx)];
      const v10 = mask[idx(ix + 1, iy,     nx)];
      const v11 = mask[idx(ix + 1, iy + 1, nx)];
      const v01 = mask[idx(ix,     iy + 1, nx)];

      let c = 0;
      if (v00 > isoLevel) c |= 1;
      if (v10 > isoLevel) c |= 2;
      if (v11 > isoLevel) c |= 4;
      if (v01 > isoLevel) c |= 8;
      if (c === 0 || c === 15) continue;

      const interpEdge = (edge: number): GridPoint => {
        let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
        let va = 0, vb = 0;
        switch (edge) {
          case 0: x0 = ix;     y0 = iy;     x1 = ix + 1; y1 = iy;     va = v00; vb = v10; break;
          case 1: x0 = ix + 1; y0 = iy;     x1 = ix + 1; y1 = iy + 1; va = v10; vb = v11; break;
          case 2: x0 = ix + 1; y0 = iy + 1; x1 = ix;     y1 = iy + 1; va = v11; vb = v01; break;
          case 3: x0 = ix;     y0 = iy + 1; x1 = ix;     y1 = iy;     va = v01; vb = v00; break;
        }
        const denom = vb - va;
        const t = Math.abs(denom) < 1e-6 ? 0.5 : (isoLevel - va) / denom;
        return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
      };

      const table: number[][][] = [
        [],
        [[3, 0]],
        [[0, 1]],
        [[3, 1]],
        [[1, 2]],
        [[3, 2], [0, 1]],
        [[0, 2]],
        [[3, 2]],
        [[2, 3]],
        [[0, 2]],
        [[0, 3], [1, 2]],
        [[1, 2]],
        [[1, 3]],
        [[0, 1]],
        [[3, 0]],
        [],
      ];

      const segDef = table[c];
      for (let s = 0; s < segDef.length; s++) {
        const [e0, e1] = segDef[s];
        const p0 = interpEdge(e0);
        const p1 = interpEdge(e1);
        segments.push({ a: p0, b: p1 });
      }
    }
  }

  if (!segments.length) return [];

  const adj = new Map<string, Neighbor[]>();
  const keyOf = (p: GridPoint) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

  segments.forEach((seg, idx) => {
    const ka = keyOf(seg.a);
    const kb = keyOf(seg.b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push({ p: seg.b, segIndex: idx });
    adj.get(kb)!.push({ p: seg.a, segIndex: idx });
  });

  const usedSeg = new Array(segments.length).fill(false);
  const contours: GridPoint[][] = [];

  const trace = (startSegIndex: number): GridPoint[] => {
    const seg = segments[startSegIndex];
    usedSeg[startSegIndex] = true;

    const contour: GridPoint[] = [];
    let curr: GridPoint = seg.a;
    const startKey = keyOf(curr);
    contour.push(curr);

    let prevKey = keyOf(seg.b);

    while (true) {
      const currKey = keyOf(curr);
      const neighbors = adj.get(currKey) || [];
      let next: GridPoint | null = null;
      let nextIdx = -1;

      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        if (usedSeg[n.segIndex]) continue;

        const nk = keyOf(n.p);
        if (nk === prevKey && neighbors.length > 1) continue;

        next = n.p;
        nextIdx = n.segIndex;
        break;
      }

      if (!next) break;

      usedSeg[nextIdx] = true;
      contour.push(next);

      prevKey = currKey;
      curr = next;

      if (keyOf(curr) === startKey) break;
    }

    return contour;
  };

  for (let i = 0; i < segments.length; i++) {
    if (usedSeg[i]) continue;
    const contour = trace(i);
    if (contour.length > 1) contours.push(contour);
  }

  return contours;
}

// 在线更新均值的小工具
function updateMean(prevMean: number, prevCount: number, newVal: number) {
  const n = prevCount + 1;
  return prevMean + (newVal - prevMean) / n;
}

// ----------------- 区域生长（从中心往外） -----------------

/**
 * 在 heightMap 上，从中心向四周区域生长，利用 z 值过滤掉远离“人体面”的点，
 * 返回：
 *   - regionMask：1 表示属于人体区域
 *   - growCenter：最终用到的起点格子
 */
export function growRegionFromCenter(
  heightMap: Float32Array | ArrayLike<number>,
  validMask: Uint8Array | ArrayLike<number>,
  nx: number,
  ny: number,
  zMin: number,
  zMax: number
) {
  const maskU8 =
    validMask instanceof Uint8Array ? validMask : new Uint8Array(validMask as ArrayLike<number>);

  const regionMask = new Uint8Array(nx * ny);
  const visited = new Uint8Array(nx * ny);

  // 1. 找一个起点：以栅格中心为圆心向外扩散，找到第一个 validMask=1 的格子
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
        if (maskU8[idx(ix, iy, nx)]) {
          startX = ix;
          startY = iy;
          found = true;
        }
      }
    }
  }

  if (!found) {
    console.warn('[growRegionFromCenter] 找不到有效起点，直接返回空区域');
    return { regionMask, growCenter: null as { ix: number; iy: number } | null };
  }

  const q: Array<{ ix: number; iy: number }> = [];
  q.push({ ix: startX, iy: startY });

  const index0 = idx(startX, startY, nx);
  visited[index0] = 1;
  regionMask[index0] = 1;

  const zArray =
    heightMap instanceof Float32Array
      ? heightMap
      : Float32Array.from(heightMap as ArrayLike<number>);

  let meanZ = zArray[index0];
  let count = 1;

  const zRange = zMax - zMin || 1;
  // 允许的 z 偏差（可以根据实际再调，0.12 相当于 12% 的深度范围）
  const zThreshold = 0.12 * zRange;

  while (q.length) {
    const { ix, iy } = q.shift()!;
    // const baseIdx = idx(ix, iy, nx);
    // const baseZ = zArray[baseIdx];

    const neighbors = [
      [ix + 1, iy],
      [ix - 1, iy],
      [ix, iy + 1],
      [ix, iy - 1],
    ];

    for (const [nx_, ny_] of neighbors) {
      if (nx_ < 0 || nx_ >= nx || ny_ < 0 || ny_ >= ny) continue;
      const i2 = idx(nx_, ny_, nx);
      if (visited[i2]) continue;
      visited[i2] = 1;

      if (!maskU8[i2]) continue; // 无点

      const zVal = zArray[i2];
      if (!Number.isFinite(zVal)) continue;

      // z 距离全局均值太远，就认为是“离开人体面了”
      if (Math.abs(zVal - meanZ) > zThreshold) continue;

      // 通过：加入区域 & 更新均值
      regionMask[i2] = 1;
      meanZ = updateMean(meanZ, count, zVal);
      count++;

      q.push({ ix: nx_, iy: ny_ });
    }
  }

  return { regionMask, growCenter: { ix: startX, iy: startY } };
}

// ----------------- 从 regionMask 生成 three.js 轮廓线 -----------------

import type { TransformParams } from '../utils/pointCloudUtils';

/**
 * 基于区域生长得到的 regionMask，做 marching-squares，
 * 再应用 transformParams（和点云一样的缩放/居中）投影到 three 世界坐标。
 */
export function buildOutlineFromRegionMask(
  regionMask: Uint8Array,
  nx: number,
  ny: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zMin: number,
  zMax: number,
  transformParams: TransformParams
): THREE.Vector3[] {
  const contours = marchingSquares(regionMask, nx, ny, 0.5);
  if (!contours.length) return [];

  // 取最长的一条，基本就是外轮廓
  let outer = contours[0];
  for (const c of contours) {
    if (c.length > outer.length) outer = c;
  }

  const widthX = xMax - xMin || 1;
  const heightY = yMax - yMin || 1;
  const zCenter = (zMin + zMax) / 2;

  const outline: THREE.Vector3[] = [];

  for (const [gx, gy] of outer) {
    const u = gx / (nx - 1);
    const v = gy / (ny - 1);

    const x = xMin + u * widthX;
    const y = yMin + v * heightY;

    const p = new THREE.Vector3(x, y, zCenter);
    // 应用和点云一样的缩放 & 居中
    p.multiplyScalar(transformParams.scaleFactor);
    p.sub(transformParams.center);
    outline.push(p);
  }

  // 闭合一下
  if (outline.length > 1) {
    const first = outline[0];
    const last = outline[outline.length - 1];
    if (first.distanceToSquared(last) > 1e-6) {
      outline.push(first.clone());
    }
  }

  return outline;
}
