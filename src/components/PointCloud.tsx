import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { processPointCloud } from '../utils/pointCloudUtils'
import type { Point3D } from '../utils/pointCloudUtils'
import { getHeightMapByRawPoints, smoothen } from '@/utils/smoothen'
import { 
  buildHumanPatchMeshFromHeightMap, 
  // buildSmoothSilhouetteSkinMesh, 
  type SkinMaterialParams } from '@/utils/build_mesh_skin'
import { markEdgeOutliersSimple } from '@/utils/edgeFilter'

interface PointCloudProps {
  points: Point3D[]
  opacity: number
  skinOpacity: number
  scene: THREE.Object3D
  minOffset?: number
  pointType: 'sphere' | 'box'
  humanColors?: { r: number, g: number, b: number }[]
  showPointCloud: boolean
  showSkin: boolean
  pointSize: number
  showOriginalColor: boolean
  skinParams?: SkinMaterialParams & { depthGapRatio?: number }
  isSmoothed: boolean
  isSmoothedSkin: boolean
}

// function dilate(mask: Uint8Array, nx: number, ny: number, radius: number) {
//   const out = new Uint8Array(nx * ny);
//   const idx = (ix: number, iy: number) => iy * nx + ix;
//   for (let iy = 0; iy < ny; iy++) {
//     for (let ix = 0; ix < nx; ix++) {
//       let v = 0;
//       for (let dy = -radius; dy <= radius && !v; dy++) {
//         const yy = iy + dy;
//         if (yy < 0 || yy >= ny) continue;
//         for (let dx = -radius; dx <= radius; dx++) {
//           const xx = ix + dx;
//           if (xx < 0 || xx >= nx) continue;
//           if (mask[idx(xx, yy)]) { v = 1; break; }
//         }
//       }
//       out[idx(ix, iy)] = v;
//     }
//   }
//   return out;
// }

// function erode(mask: Uint8Array, nx: number, ny: number, radius: number) {
//   const out = new Uint8Array(nx * ny);
//   const idx = (ix: number, iy: number) => iy * nx + ix;
//   for (let iy = 0; iy < ny; iy++) {
//     for (let ix = 0; ix < nx; ix++) {
//       if (!mask[idx(ix, iy)]) { out[idx(ix, iy)] = 0; continue; }
//       let v = 1;
//       for (let dy = -radius; dy <= radius && v; dy++) {
//         const yy = iy + dy;
//         if (yy < 0 || yy >= ny) continue;
//         for (let dx = -radius; dx <= radius; dx++) {
//           const xx = ix + dx;
//           if (xx < 0 || xx >= nx) continue;
//           if (!mask[idx(xx, yy)]) { v = 0; break; }
//         }
//       }
//       out[idx(ix, iy)] = v;
//     }
//   }
//   return out;
// }

// mask 可以是 Uint8Array / Float32Array / number[]
// function marchingSquares(
//   mask: ArrayLike<number>,
//   nx: number,
//   ny: number,
//   isoLevel: number = 0.5
// ): GridPoint[][] {
//   interface Segment {
//     a: GridPoint;
//     b: GridPoint;
//   }

//   interface Neighbor {
//     p: GridPoint;
//     segIndex: number;
//   }

//   const segments: Segment[] = [];

//   const idx1D = (ix: number, iy: number): number => iy * nx + ix;

//   // === 先把所有单元格里的线段算出来 ===
//   for (let iy = 0; iy < ny - 1; iy++) {
//     for (let ix = 0; ix < nx - 1; ix++) {
//       const v00 = mask[idx1D(ix, iy)];
//       const v10 = mask[idx1D(ix + 1, iy)];
//       const v11 = mask[idx1D(ix + 1, iy + 1)];
//       const v01 = mask[idx1D(ix, iy + 1)];

//       let c = 0;
//       if (v00 > isoLevel) c |= 1;
//       if (v10 > isoLevel) c |= 2;
//       if (v11 > isoLevel) c |= 4;
//       if (v01 > isoLevel) c |= 8;

//       if (c === 0 || c === 15) continue;

//       const interpEdge = (edge: number): GridPoint => {
//         let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
//         let va = 0, vb = 0;

//         switch (edge) {
//           case 0: // bottom (ix,iy)-(ix+1,iy)
//             x0 = ix;     y0 = iy;
//             x1 = ix + 1; y1 = iy;
//             va = v00;    vb = v10;
//             break;
//           case 1: // right (ix+1,iy)-(ix+1,iy+1)
//             x0 = ix + 1; y0 = iy;
//             x1 = ix + 1; y1 = iy + 1;
//             va = v10;    vb = v11;
//             break;
//           case 2: // top (ix+1,iy+1)-(ix,iy+1)
//             x0 = ix + 1; y0 = iy + 1;
//             x1 = ix;     y1 = iy + 1;
//             va = v11;    vb = v01;
//             break;
//           case 3: // left (ix,iy+1)-(ix,iy)
//             x0 = ix;     y0 = iy + 1;
//             x1 = ix;     y1 = iy;
//             va = v01;    vb = v00;
//             break;
//         }

//         const denom = vb - va;
//         const t = Math.abs(denom) < 1e-6 ? 0.5 : (isoLevel - va) / denom;
//         return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
//       };

//       // case -> 边索引对（每个 case 可能有多条线段）
//       const table: number[][][] = [
//         [],               // 0
//         [[3, 0]],         // 1
//         [[0, 1]],         // 2
//         [[3, 1]],         // 3
//         [[1, 2]],         // 4
//         [[3, 2], [0, 1]], // 5
//         [[0, 2]],         // 6
//         [[3, 2]],         // 7
//         [[2, 3]],         // 8
//         [[0, 2]],         // 9
//         [[0, 3], [1, 2]], // 10
//         [[1, 2]],         // 11
//         [[1, 3]],         // 12
//         [[0, 1]],         // 13
//         [[3, 0]],         // 14
//         []                // 15
//       ];

//       const segDef = table[c];
//       for (let s = 0; s < segDef.length; s++) {
//         const [e0, e1] = segDef[s];
//         const p0 = interpEdge(e0);
//         const p1 = interpEdge(e1);
//         segments.push({ a: p0, b: p1 });
//       }
//     }
//   }

//   if (!segments.length) return [];

//   // === 把线段拼成轮廓 ===
//   const adj = new Map<string, Neighbor[]>();

//   const keyOf = (p: GridPoint): string =>
//     `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

//   segments.forEach((seg, idx) => {
//     const ka = keyOf(seg.a);
//     const kb = keyOf(seg.b);
//     if (!adj.has(ka)) adj.set(ka, []);
//     if (!adj.has(kb)) adj.set(kb, []);
//     adj.get(ka)!.push({ p: seg.b, segIndex: idx });
//     adj.get(kb)!.push({ p: seg.a, segIndex: idx });
//   });

//   const usedSeg: boolean[] = new Array(segments.length).fill(false);
//   const contours: GridPoint[][] = [];

//   const traceContour = (startSegIndex: number): GridPoint[] => {
//     const seg = segments[startSegIndex];
//     usedSeg[startSegIndex] = true;

//     const contour: GridPoint[] = [];
//     let curr: GridPoint = seg.a;
//     const startKey = keyOf(curr);
//     contour.push(curr);

//     let prevKey = keyOf(seg.b);

//     while (true) {
//       const currKey = keyOf(curr);
//       const neighbors = adj.get(currKey) || [];
//       let next: GridPoint | null = null;
//       let nextSegIndex = -1;

//       for (let i = 0; i < neighbors.length; i++) {
//         const n = neighbors[i];
//         if (usedSeg[n.segIndex]) continue;

//         const nk = keyOf(n.p);
//         if (nk === prevKey && neighbors.length > 1) continue;

//         next = n.p;
//         nextSegIndex = n.segIndex;
//         break;
//       }

//       if (!next) break;

//       usedSeg[nextSegIndex] = true;
//       contour.push(next);

//       prevKey = currKey;
//       curr = next;

//       if (keyOf(curr) === startKey) {
//         break; // 闭合
//       }
//     }

//     return contour;
//   };

//   for (let i = 0; i < segments.length; i++) {
//     if (usedSeg[i]) continue;
//     const contour = traceContour(i);
//     if (contour.length > 1) {
//       contours.push(contour);
//     }
//   }

//   return contours;
// }

// === 直接在 transformedPoints 的 XY 平面上构建人体轮廓 ===

// /**
//  * 从 transformedPoints 的 XY 投影构造闭合轮廓，并返回世界坐标下的顶点
//  */
// function buildOutlineFromPointCloudXY(
//   points: THREE.Vector3[],
//   gridRes: number = 256       // 网格分辨率，可以调高边缘会更圆滑
// ): THREE.Vector3[] {
//   if (!points.length) return []

//   // 1) 计算 XY 范围（都是在 processPointCloud 之后的坐标系）
//   let xMin = Infinity, xMax = -Infinity
//   let yMin = Infinity, yMax = -Infinity
//   let zMin = Infinity, zMax = -Infinity

//   for (const p of points) {
//     if (p.x < xMin) xMin = p.x
//     if (p.x > xMax) xMax = p.x
//     if (p.y < yMin) yMin = p.y
//     if (p.y > yMax) yMax = p.y
//     if (p.z < zMin) zMin = p.z
//     if (p.z > zMax) zMax = p.z
//   }

//   const widthX = xMax - xMin || 1
//   const heightY = yMax - yMin || 1

//   // 根据长宽比自适应设置 nx, ny，避免人物被拉长
//   const aspect = widthX / heightY
//   let nx = gridRes
//   let ny = gridRes
//   if (aspect > 1) {
//     ny = Math.max(32, Math.round(gridRes / aspect))
//   } else {
//     nx = Math.max(32, Math.round(gridRes * aspect))
//   }

//   const mask = new Uint8Array(nx * ny)
//   const zSum = new Float32Array(nx * ny)
//   const zCnt = new Uint32Array(nx * ny)

//   const idx = (ix: number, iy: number) => iy * nx + ix

//   // 2) 把所有点投影到 XY 网格上：填 mask，同时记录该 cell 的 z 平均值
//   for (const p of points) {
//     const u = (p.x - xMin) / widthX
//     const v = (p.y - yMin) / heightY

//     const uu = Math.max(0, Math.min(1, u))
//     const vv = Math.max(0, Math.min(1, v))

//     const ix = Math.floor(uu * (nx - 1))
//     const iy = Math.floor(vv * (ny - 1))

//     const id = idx(ix, iy)
//     mask[id] = 1
//     zSum[id] += p.z
//     zCnt[id]++
//   }

//   // 3) 形态学操作：闭运算（先膨胀后腐蚀），平滑边缘但保住整体形状
//   const dilateRadius = 2
//   const erodeRadius = 1
//   let closed = dilate(mask, nx, ny, dilateRadius)
//   closed = erode(closed, nx, ny, erodeRadius)

//   // 4) marching squares 得到轮廓（在网格坐标系中）
//   const contours = marchingSquares(closed, nx, ny, 0.5)
//   if (!contours.length) return []

//   // 5) 选面积最大的那条轮廓作为人体外轮廓
//   let best = contours[0]
//   let bestArea = -Infinity
//   for (const c of contours) {
//     if (c.length < 10) continue
//     let minX = Infinity, maxX = -Infinity
//     let minY = Infinity, maxY = -Infinity
//     for (const [gx, gy] of c) {
//       if (gx < minX) minX = gx
//       if (gx > maxX) maxX = gx
//       if (gy < minY) minY = gy
//       if (gy > maxY) maxY = gy
//     }
//     const area = (maxX - minX) * (maxY - minY)
//     if (area > bestArea) {
//       bestArea = area
//       best = c
//     }
//   }

//   // 6) 网格坐标 -> 世界坐标（在 transformedPoints 的同一坐标系）
//   const outline: THREE.Vector3[] = []

//   // 一个小工具：给一个网格位置找一个附近非空 cell 的平均 z
//   function sampleZ(gx: number, gy: number): number {
//     const rx = Math.round(gx)
//     const ry = Math.round(gy)
//     const maxR = 3
//     for (let r = 0; r <= maxR; r++) {
//       for (let dy = -r; dy <= r; dy++) {
//         const iy = ry + dy
//         if (iy < 0 || iy >= ny) continue
//         for (let dx = -r; dx <= r; dx++) {
//           const ix = rx + dx
//           if (ix < 0 || ix >= nx) continue
//           const id = idx(ix, iy)
//           if (zCnt[id] > 0) {
//             return zSum[id] / zCnt[id]
//           }
//         }
//       }
//     }
//     // 实在没有，就用整体的中间 z
//     return (zMin + zMax) / 2
//   }

//   for (const [gx, gy] of best) {
//     const u = gx / (nx - 1)
//     const v = gy / (ny - 1)

//     const x = xMin + u * widthX
//     const y = yMin + v * heightY
//     const z = sampleZ(gx, gy)

//     outline.push(new THREE.Vector3(x, y, z))
//   }

//   // 7) 确保闭合
//   if (outline.length > 1) {
//     const first = outline[0]
//     const last = outline[outline.length - 1]
//     if (first.distanceToSquared(last) > 1e-6) {
//       outline.push(first.clone())
//     }
//   }

//   return outline
// }

// === 用凸包在 transformedPoints 的 XY 平面上构造人体轮廓 ===

// type Vec2 = { x: number; y: number }

/**
 * 2D 单调链凸包算法（O(n log n)）
 */
// function convexHull2D(points: Vec2[]): Vec2[] {
//   const n = points.length
//   if (n <= 1) return points.slice()

//   const pts = points.slice().sort((a, b) =>
//     a.x === b.x ? a.y - b.y : a.x - b.x
//   )

//   const cross = (o: Vec2, a: Vec2, b: Vec2) =>
//     (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

//   const lower: Vec2[] = []
//   for (const p of pts) {
//     while (lower.length >= 2 &&
//       cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
//     ) {
//       lower.pop()
//     }
//     lower.push(p)
//   }

//   const upper: Vec2[] = []
//   for (let i = pts.length - 1; i >= 0; i--) {
//     const p = pts[i]
//     while (upper.length >= 2 &&
//       cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
//     ) {
//       upper.pop()
//     }
//     upper.push(p)
//   }

//   // 最后一个点分别是首点，去掉
//   lower.pop()
//   upper.pop()
//   return lower.concat(upper)
// }

/**
 * 从 transformedPoints 的 XY 投影构造闭合轮廓
 * 1. 下采样点云
 * 2. 计算 2D 凸包
 * 3. 把 Z 固定在外层（比如 zMin），得到 3D 轮廓
 */
// function buildOutlineFromPointCloudXY(
//   points: THREE.Vector3[],
//   sampleStep: number = 5     // 适当下采样，避免点太多
// ): THREE.Vector3[] {
//   const N = points.length
//   if (!N) return []

//   // 统计 Z 范围，用于选择背部平面
//   let zMin = Infinity
//   let zMax = -Infinity
//   for (const p of points) {
//     if (p.z < zMin) zMin = p.z
//     if (p.z > zMax) zMax = p.z
//   }

//   // 取一部分点投影到 XY 平面
//   const samples: Vec2[] = []
//   for (let i = 0; i < N; i += sampleStep) {
//     const p = points[i]
//     samples.push({ x: p.x, y: p.y })
//   }

//   if (samples.length < 3) return []

//   const hull2D = convexHull2D(samples)
//   if (hull2D.length < 3) return []

//   // 选择轮廓所在的 Z 平面：
//   // - 扫描是从背后拍的，一般“背部皮肤”会在 zMin 那一侧
//   // - 如果你发现方向反了，可以把 zPlane 换成 zMax
//   const zPlane = zMin

//   const outline: THREE.Vector3[] = hull2D.map(p =>
//     new THREE.Vector3(p.x, p.y, zPlane)
//   )

//   // 闭合一下
//   if (outline.length > 1) {
//     outline.push(outline[0].clone())
//   }

//   return outline
// }

// function pointInPolygon(x: number, y: number, poly: Vec2[]) {
//   let inside = false;
//   for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
//     const xi = poly[i].x, yi = poly[i].y;
//     const xj = poly[j].x, yj = poly[j].y;
//     const intersect =
//       ((yi > y) !== (yj > y)) &&
//       (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi);
//     if (intersect) inside = !inside;
//   }
//   return inside;
// }

// const smoothenXYPlaneEdge = (
//   positionsSmooth: Float32Array,
//   N: number,
//   nx: number,
//   ny: number,
//   xMin: number,
//   yMin: number,
//   widthX: number,
//   heightY: number
// ) => {
//   const bodyMask = new Uint8Array(nx * ny);
//   const idx1D = (ix: number, iy: number) => iy * nx + ix;

//   // 统计坐标范围（只是调试/保留）
//   const xRange = { min: Infinity, max: -Infinity };
//   const yRange = { min: Infinity, max: -Infinity };

//   // 1. 把点云投到栅格上，填 bodyMask
//   for (let i = 0; i < N; i++) {
//     const x = positionsSmooth[i * 3];
//     const y = positionsSmooth[i * 3 + 1];

//     if (x < xRange.min) xRange.min = x;
//     if (x > xRange.max) xRange.max = x;
//     if (y < yRange.min) yRange.min = y;
//     if (y > yRange.max) yRange.max = y;

//     const u = (x - xMin) / (widthX || 1.0);
//     const v = (y - yMin) / (heightY || 1.0);

//     const clampedU = Math.max(0, Math.min(1, u));
//     const clampedV = Math.max(0, Math.min(1, v));

//     const ix = Math.floor(clampedU * (nx - 1));
//     const iy = Math.floor(clampedV * (ny - 1));

//     if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;

//     bodyMask[idx1D(ix, iy)] = 1;
//   }

//   // 2. 简单的膨胀 + 轻微腐蚀，填补空洞 + 平滑边缘
//   const dilateRadius = Math.max(2, Math.floor(Math.min(nx, ny) / 100));
//   const erodeRadius  = Math.max(1, Math.floor(dilateRadius / 2));

//   let maskClosed = dilate(bodyMask, nx, ny, dilateRadius);
//   maskClosed = erode(maskClosed, nx, ny, erodeRadius);

//   // 3. marching squares 拿到所有轮廓（网格坐标）
//   const contours = marchingSquares(maskClosed, nx, ny, 0.5);
//   if (!contours.length) {
//     console.warn('[smoothenXYPlaneEdge] no contours');
//     return { insidePoints: [] as number[], outsidePoints: [...Array(N).keys()], outlineWorld: [] as Vec2[] };
//   }

//   // 工具：把一个 contour 从网格坐标转到世界坐标（当前坐标系）
//   const contourToWorld = (c: GridPoint[]): Vec2[] =>
//     c.map(([gx, gy]) => {
//       const u = Math.max(0, Math.min(1, gx / (nx - 1)));
//       const v = Math.max(0, Math.min(1, gy / (ny - 1)));
//       return {
//         x: xMin + u * widthX,
//         y: yMin + v * heightY,
//       };
//     });

//   // 4. 抽样一部分点，用于评估“这条轮廓里面包含了多少点云”
//   const sampleIndices: number[] = [];
//   const sampleStep = Math.max(1, Math.floor(N / 2000)); // 最多 ~2000 个样本
//   for (let i = 0; i < N; i += sampleStep) {
//     sampleIndices.push(i);
//   }

//   let bestOutline: Vec2[] = [];
//   let bestScore = -1;

//   for (const contour of contours) {
//     if (contour.length < 8) continue; // 太短的忽略

//     const polyWorld = contourToWorld(contour);
//     if (!polyWorld.length) continue;

//     // 确保闭合（pointInPolygon 不强制要求，但我们画线时需要闭合）
//     const first = polyWorld[0];
//     const last = polyWorld[polyWorld.length - 1];
//     const dx = first.x - last.x;
//     const dy = first.y - last.y;
//     if (dx * dx + dy * dy > 1e-6) {
//       polyWorld.push({ x: first.x, y: first.y });
//     }

//     // 统计有多少采样点落在这个多边形内部
//     let insideCount = 0;
//     for (const idx of sampleIndices) {
//       const px = positionsSmooth[idx * 3];
//       const py = positionsSmooth[idx * 3 + 1];
//       if (pointInPolygon(px, py, polyWorld)) insideCount++;
//     }

//     if (insideCount > bestScore) {
//       bestScore = insideCount;
//       bestOutline = polyWorld;
//     }
//   }

//   // 如果实在没选出来（极端情况），兜底选最长的一条
//   if (!bestOutline.length) {
//     let longest: GridPoint[] = [];
//     for (const c of contours) {
//       if (c.length > longest.length) longest = c;
//     }
//     bestOutline = contourToWorld(longest);
//     const first = bestOutline[0];
//     const last = bestOutline[bestOutline.length - 1];
//     const dx = first.x - last.x;
//     const dy = first.y - last.y;
//     if (dx * dx + dy * dy > 1e-6) {
//       bestOutline.push({ x: first.x, y: first.y });
//     }
//   }

//   const outlineWorld = bestOutline;

//   // 5. 用最终轮廓把所有点分成 inside / outside
//   const insidePoints: number[] = [];
//   const outsidePoints: number[] = [];

//   if (outlineWorld.length) {
//     for (let i = 0; i < N; i++) {
//       const x = positionsSmooth[i * 3];
//       const y = positionsSmooth[i * 3 + 1];
//       if (pointInPolygon(x, y, outlineWorld)) {
//         insidePoints.push(i);
//       } else {
//         outsidePoints.push(i);
//       }
//     }
//   } else {
//     // 没有轮廓，把所有点当外部
//     for (let i = 0; i < N; i++) outsidePoints.push(i);
//   }

//   return { insidePoints, outsidePoints, outlineWorld };
// };

// function computeOutlineFromValidMask(
//   validMask: Uint8Array,
//   nx: number,
//   ny: number,
//   xMin: number,
//   xMax: number,
//   yMin: number,
//   yMax: number
// ): Vec2[] {

//   const widthX = xMax - xMin;
//   const heightY = yMax - yMin;

//   const bodyMask = new Uint8Array(validMask); // copy

//   // 简单闭运算
//   const dilateRadius = 2;
//   const erodeRadius = 1;
//   let maskClosed = dilate(bodyMask, nx, ny, dilateRadius);
//   maskClosed = erode(maskClosed, nx, ny, erodeRadius);

//   const contours = marchingSquares(maskClosed, nx, ny, 0.5);
//   if (!contours.length) return [];

//   // 选择最长的轮廓 = 最外层
//   let longest: GridPoint[] = [];
//   for (const c of contours) {
//     if (c.length > longest.length) longest = c;
//   }

//   // 网格坐标 → 世界 (x,y)
//   const outlineWorld: Vec2[] = longest.map(([gx, gy]) => {
//     const u = gx / (nx - 1);
//     const v = gy / (ny - 1);
//     return {
//       x: xMin + u * widthX,
//       y: yMin + v * heightY,
//     };
//   });

//   // 闭合
//   if (outlineWorld.length > 0) {
//     const f = outlineWorld[0], l = outlineWorld[outlineWorld.length - 1];
//     if ((f.x - l.x) ** 2 + (f.y - l.y) ** 2 > 1e-6) {
//       outlineWorld.push({ ...f });
//     }
//   }

//   return outlineWorld;
// }

// function applyTransformToXY(
//   x: number,
//   y: number,
//   z: number,
//   transformParams: TransformParams
// ) {
//   const { scaleFactor, center } = transformParams;
//   const v = new THREE.Vector3(x, y, z);

//   v.multiplyScalar(scaleFactor);
//   v.sub(center);

//   return v;
// }

// === 利用 heightMap / validMask 在原始网格上算轮廓，再用 transformParams 变到 three.js 世界坐标 ===

// type TransformParams = {
//   scaleFactor: number
//   center: THREE.Vector3   // 注意：你现在的实现里，这个 center 已经是 *scaled* 过的
// }

// type OutlineResult = {
//   outlineWorld: THREE.Vector3[]
// }

// function buildOutlineFromHeightMap(options: {
//   validMask: Uint8Array | ArrayLike<number>
//   nx: number
//   ny: number
//   xMin: number
//   xMax: number
//   yMin: number
//   yMax: number
//   heightMap?: Float32Array | ArrayLike<number>  // 可选，用来给 z ；没有就用 0
//   transformParams: TransformParams
// }): OutlineResult {
//   const { validMask, nx, ny, xMin, xMax, yMin, yMax, heightMap, transformParams } = options

//   const widthX = xMax - xMin
//   const heightY = yMax - yMin

//   // 1) 先把 validMask 拷贝出来作为人体 mask（也可以只取 1/0）
//   const bodyMask = new Uint8Array(nx * ny)
//   for (let i = 0; i < nx * ny; i++) {
//     bodyMask[i] = validMask[i] ? 1 : 0
//   }

//   // 2) 形态学操作：轻微膨胀 + 轻微腐蚀，平滑边缘但尽量保体态
//   const dilateRadius = 2
//   const erodeRadius = 1
//   let closed = dilate(bodyMask, nx, ny, dilateRadius)
//   closed = erode(closed, nx, ny, erodeRadius)

//   // 3) marching squares 得到所有轮廓（网格坐标）
//   const contours = marchingSquares(closed, nx, ny, 0.5)
//   if (!contours.length) {
//     return { outlineWorld: [] }
//   }

//   // 4) 选最大的那个轮廓（面积最大）
//   let best = contours[0]
//   let bestArea = -Infinity
//   for (const c of contours) {
//     if (c.length < 10) continue
//     let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
//     for (const [gx, gy] of c) {
//       if (gx < minX) minX = gx
//       if (gx > maxX) maxX = gx
//       if (gy < minY) minY = gy
//       if (gy > maxY) maxY = gy
//     }
//     const area = (maxX - minX) * (maxY - minY)
//     if (area > bestArea) {
//       bestArea = area
//       best = c
//     }
//   }

//   // 5) 网格坐标 -> 原始世界坐标 (x,y,z)
//   const scaleFactor = transformParams.scaleFactor
//   const centerScaled = transformParams.center   // = 原始 center * scaleFactor

//   const outlineWorld: THREE.Vector3[] = []

//   const getIdx = (ix: number, iy: number) => iy * nx + ix

//   for (const [gx, gy] of best) {
//     const u = gx / (nx - 1)   // [0,1]
//     const v = gy / (ny - 1)

//     const x = xMin + u * widthX
//     const y = yMin + v * heightY

//     let z = 0
//     if (heightMap) {
//       // 取最近的一个网格点深度
//       const ix = Math.max(0, Math.min(nx - 1, Math.round(gx)))
//       const iy = Math.max(0, Math.min(ny - 1, Math.round(gy)))
//       z = heightMap[getIdx(ix, iy)] as number
//     }

//     // 6) 应用跟点云完全一样的变换：scale + 居中
//     const xT = x * scaleFactor - centerScaled.x
//     const yT = y * scaleFactor - centerScaled.y
//     const zT = z * scaleFactor - centerScaled.z

//     outlineWorld.push(new THREE.Vector3(xT, yT, zT))
//   }

//   // 7) 确保闭合
//   if (outlineWorld.length > 1) {
//     const first = outlineWorld[0]
//     const last = outlineWorld[outlineWorld.length - 1]
//     if (first.distanceToSquared(last) > 1e-6) {
//       outlineWorld.push(first.clone())
//     }
//   }

//   return { outlineWorld }
// }

export default function PointCloud({ points, opacity, skinOpacity, scene, pointType, humanColors, showPointCloud, showSkin, pointSize, showOriginalColor, skinParams, isSmoothed = false, isSmoothedSkin = false }: PointCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh | THREE.Points | null>(null)
  const humanPatchMeshRef = useRef<THREE.Mesh | null>(null)
  const pointsDataRef = useRef<{ transformedPoints: THREE.Vector3[]; minZ: number; maxZ: number } | null>(null)

  useEffect(() => {
    if (!points || points.length === 0) return

    const { smoothed: smoothedPoints, heightMapFiltered, nx, ny, validMask } = smoothen({rawPoints: points, humanColors})

    // === 新增：过滤边缘异常点 ===
    const { keepMask } = markEdgeOutliersSimple(
      points as Point3D[],
      smoothedPoints as Point3D[],
      {
        gridSize: 60,    // 可调：128~256
        radiusCells: 1,   // 邻域 3x3
        dzThreshold: 14, // 大约 1.5cm，可以自己试
        minNeighbors: 60,
      }
    )

    const filteredPoints: Point3D[] = []
    const filteredColors: { r: number; g: number; b: number }[] = []

    for (let i = 0; i < smoothedPoints.length; i++) {
      if (!keepMask[i]) continue
      filteredPoints.push(smoothedPoints[i])
      if (humanColors && humanColors[i]) {
        filteredColors.push(humanColors[i])
      }
    }
    // 处理点云数据
    const { transformedPoints: transformedPointsSmoothed, transformParams } = processPointCloud(filteredPoints)
    const { transformedPoints: transformedPointsOrigin } = processPointCloud(points)
    const N = transformedPointsSmoothed.length;
    const positionsSmooth = new Float32Array(N * 3);
    const originPointsMapMap = new Float32Array(N * 3);
    const colorsSmooth    = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // 平滑点云整体向右平移一点，方便对比
      positionsSmooth[i * 3]     = transformedPointsSmoothed[i].x; // X 方向偏移
      positionsSmooth[i * 3 + 1] = transformedPointsSmoothed[i].y;
      positionsSmooth[i * 3 + 2] = transformedPointsSmoothed[i].z;
      originPointsMapMap[i * 3] = transformedPointsOrigin[i].x;
      originPointsMapMap[i * 3 + 1] = transformedPointsOrigin[i].y;
      originPointsMapMap[i * 3 + 2] = transformedPointsOrigin[i].z;

      const col = (isSmoothed ? filteredColors?.[i] : humanColors?.[i]) || { r: 255, g: 255, b: 255 };
      const r = (col.r !== undefined ? col.r : 255) / 255;
      const g = (col.g !== undefined ? col.g : 255) / 255;
      const b = (col.b !== undefined ? col.b : 255) / 255;

      colorsSmooth[i * 3]     = r;
      colorsSmooth[i * 3 + 1] = g;
      colorsSmooth[i * 3 + 2] = b;
    }

    // 重要：需要基于 transformedPoints 重新计算坐标范围，因为 processPointCloud 进行了缩放和居中变换
    let transformedXMin = Infinity, transformedXMax = -Infinity;
    let transformedYMin = Infinity, transformedYMax = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = transformedPointsSmoothed[i].x;
      const y = transformedPointsSmoothed[i].y;
      if (x < transformedXMin) transformedXMin = x;
      if (x > transformedXMax) transformedXMax = x;
      if (y < transformedYMin) transformedYMin = y;
      if (y > transformedYMax) transformedYMax = y;
    }
    // const transformedWidthX = transformedXMax - transformedXMin;
    // const transformedHeightY = transformedYMax - transformedYMin;

    // === 基于 transformedPoints 构造轮廓 ===
    // const outlineWorld = buildOutlineFromPointCloudXY(transformedPoints, 256)

    // if (outlineWorld.length > 0) {
    //   const lineGeometry = new THREE.BufferGeometry().setFromPoints(outlineWorld)
    //   const lineLoop = new THREE.LineLoop(
    //     lineGeometry,
    //     new THREE.LineBasicMaterial({ color: 0x0000ff })
    //   )
    //   lineLoop.renderOrder = 10
    //   scene.add(lineLoop)
    // }

    // 基于 transformedPoints 的坐标范围，重新计算合适的网格分辨率
    // 保持与原始网格相同的物理分辨率（每个网格单元的大小）
    // const originalCellSizeX = (xMax - xMin) / (nx - 1);
    // const originalCellSizeY = (yMax - yMin) / (ny - 1);
    // const transformedNx = Math.max(64, Math.min(512, Math.round(transformedWidthX / originalCellSizeX) + 1));
    // const transformedNy = Math.max(64, Math.min(512, Math.round(transformedHeightY / originalCellSizeY) + 1));

    // const { outlineWorld } = smoothenXYPlaneEdge(
    //   positionsSmooth, N, transformedNx, transformedNy,
    //   transformedXMin, transformedYMin, transformedWidthX, transformedHeightY
    // );

    // const { outlineWorld } = buildOutlineFromHeightMap({
    //   validMask,
    //   nx,
    //   ny,
    //   xMin,
    //   xMax,
    //   yMin,
    //   yMax,
    //   heightMap: heightMapFiltered,   // 有就传，z 会更准
    //   transformParams,
    // })
    
    // // 3) 画轮廓线
    // if (outlineWorld.length > 0) {
    //   const lineGeometry = new THREE.BufferGeometry().setFromPoints(outlineWorld)
    //   const lineLoop = new THREE.LineLoop(
    //     lineGeometry,
    //     new THREE.LineBasicMaterial({ color: 0x0000ff })
    //   )
    //   lineLoop.renderOrder = 10
    //   scene.add(lineLoop)
    // }
    
    // // 只用 outlineWorld 来画轮廓线
    // if (outlineWorld.length > 0) {
    //   let zCenter = 0;
    //   if (N > 0) {
    //     let zMinP = Infinity, zMaxP = -Infinity;
    //     for (let i = 0; i < N; i++) {
    //       const z = positionsSmooth[i * 3 + 2];
    //       if (z < zMinP) zMinP = z;
    //       if (z > zMaxP) zMaxP = z;
    //     }
    //     zCenter = (zMinP + zMaxP) / 2;
    //   }
    
    //   const lineGeometry = new THREE.BufferGeometry().setFromPoints(
    //     outlineWorld.map(p => new THREE.Vector3(p.x, p.y, zCenter))
    //   );
    //   const lineLoop = new THREE.LineLoop(
    //     lineGeometry,
    //     new THREE.LineBasicMaterial({ color: 0x0000ff })
    //   );
    //   lineLoop.renderOrder = 10;
    //   scene.add(lineLoop);
    // }

    try {
      // 创建 BufferGeometry
      const positions: number[] = []
      let maxZ = 0;
      let minZ = 0;
      transformedPointsSmoothed.forEach((p) => {
        positions.push(p.x, p.y, p.z)
        if (p.z > maxZ) maxZ = p.z;
        if (p.z < minZ) minZ = p.z;
      })

      // 保存点云数据供后续使用
      pointsDataRef.current = { transformedPoints: transformedPointsSmoothed, minZ, maxZ }

      if (showSkin) {
        const depthGapRatio = skinParams?.depthGapRatio ?? 0.25
        // 使用边缘过滤后的点云，已经是smooth过的，重新计算buildHumanPatchMeshFromHeightMap所需要的参数，heightMap和validMask需要重新计算
        const { heightMap: originalHeightMapFiltered, validMask: validMaskFiltered, colorMapR: colorMapRFiltered, colorMapG: colorMapGFiltered, colorMapB: colorMapBFiltered, xMin: xMinFiltered, xMax: xMaxFiltered, yMin: yMinFiltered, yMax: yMaxFiltered, zMax: zMaxFiltered, zMin: zMinFiltered } = getHeightMapByRawPoints({rawPoints: filteredPoints, humanColors: filteredColors, nx, ny})

        const heightMapFilteredByFilteredPoints = new Float32Array(nx * ny)
        for (let i = 0; i < filteredPoints.length; i++) {
          const p = filteredPoints[i]
          const u = (p.x - xMinFiltered) / (xMaxFiltered - xMinFiltered)
          const v = (p.y - yMinFiltered) / (yMaxFiltered - yMinFiltered)
          const ix = Math.floor(u * nx)
          const iy = Math.floor(v * ny)
          const k = iy * nx + ix
          heightMapFilteredByFilteredPoints[k] = heightMapFiltered[k]
        }

        const { mesh: humanPatchMesh } = buildHumanPatchMeshFromHeightMap({
          heightMap: isSmoothedSkin ? heightMapFilteredByFilteredPoints : originalHeightMapFiltered,
          validMask: isSmoothedSkin ? validMaskFiltered : validMask,
          nx, ny, xMin: xMinFiltered, xMax: xMaxFiltered, yMin: yMinFiltered, yMax: yMaxFiltered, colorMapR: colorMapRFiltered, colorMapG: colorMapGFiltered, colorMapB: colorMapBFiltered, 
          depthGap: (zMaxFiltered - zMinFiltered) * depthGapRatio,
          transformParams,
          skinOpacity,
          meshColor: skinParams?.meshColor,
          metalness: skinParams?.metalness,
          roughness: skinParams?.roughness,
          transmission: skinParams?.transmission,
          thickness: skinParams?.thickness,
          ior: skinParams?.ior,
          clearcoat: skinParams?.clearcoat,
          clearcoatRoughness: skinParams?.clearcoatRoughness,
          reflectivity: skinParams?.reflectivity,
          attenuationDistance: skinParams?.attenuationDistance,
          attenuationColor: skinParams?.attenuationColor,
          envMapIntensity: skinParams?.envMapIntensity,
          sheen: skinParams?.sheen,
          sheenColor: skinParams?.sheenColor,
          sheenRoughness: skinParams?.sheenRoughness,
          useVertexColors: skinParams?.useVertexColors,
          colorBrightness: skinParams?.colorBrightness,
          points: isSmoothedSkin ? transformedPointsSmoothed : transformedPointsOrigin  , // 传入变换后的点云
        })
        
        if (humanPatchMesh) {
          humanPatchMesh.receiveShadow = true;
          humanPatchMesh.castShadow = true;
          humanPatchMesh.renderOrder = 2;
          scene.add(humanPatchMesh)
          humanPatchMeshRef.current = humanPatchMesh
        }
        
        // 输出不在 mesh 范围内的点索引
        // if (pointsOutsideMesh.length > 0) {
        //   console.log('[PointCloud] 不在mesh范围内的点索引:', pointsOutsideMesh.slice(0, 20), pointsOutsideMesh.length > 20 ? '...' : '')
        //   // 渲染时只渲染不在 mesh 范围内的点（使用 pointsOutsideMesh 中的索引）
        //   const outsidePositions = new Float32Array(pointsOutsideMesh.length * 3);
        //   const outsideColors = new Float32Array(pointsOutsideMesh.length * 3);
        //   pointsOutsideMesh.forEach((originalIndex, newIndex) => {
        //     outsidePositions[newIndex * 3] = positionsSmooth[originalIndex * 3];
        //     outsidePositions[newIndex * 3 + 1] = positionsSmooth[originalIndex * 3 + 1];
        //     outsidePositions[newIndex * 3 + 2] = positionsSmooth[originalIndex * 3 + 2];
        //     outsideColors[newIndex * 3] = colorsSmooth[originalIndex * 3];
        //     outsideColors[newIndex * 3 + 1] = colorsSmooth[originalIndex * 3 + 1];
        //     outsideColors[newIndex * 3 + 2] = colorsSmooth[originalIndex * 3 + 2];
        //   });
          
        //   const geomSmooth = new THREE.BufferGeometry();
        //   geomSmooth.setAttribute(
        //       "position",
        //       new THREE.BufferAttribute(outsidePositions, 3)
        //   );
        //   geomSmooth.setAttribute(
        //     "color",
        //     new THREE.BufferAttribute(outsideColors, 3)
        //   );
          
        //   const material = new THREE.ShaderMaterial({
        //     transparent: true,
        //     depthWrite: false,
        //     vertexColors: true,
        //     uniforms: {
        //       uSize: { value: pointSize },   // 像素尺寸基准
        //       uOpacity: { value: opacity },  // 用 uniform 控制透明度
        //     },
        //     vertexShader: `
        //       varying vec3 vColor;
        //       uniform float uSize;
        //       void main() {
        //         vColor = color;
        //         vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        //         float dist = -mvPosition.z;
        //         gl_Position = projectionMatrix * mvPosition;
        //         gl_PointSize = clamp(uSize * 120.0 / dist, 2.0, 12.0);
        //       }
        //     `,
        //     fragmentShader: `
        //       precision highp float;
        //       varying vec3 vColor;
        //       uniform float uOpacity;

        //       void main() {
        //         // [-1,1] 的点精灵坐标
        //         vec2 p = gl_PointCoord * 2.0 - 1.0;
        //         float r2 = dot(p, p);

        //         // 圆形边界 + fwidth 抗锯齿
        //         float w = fwidth(r2);
        //         float alpha = 1.0 - smoothstep(1.0 - w, 1.0 + w, r2);

        //         // 高斯柔一下
        //         alpha *= exp(-r2 * 2.0);

        //         // 叠加不透明度
        //         alpha *= uOpacity;

        //         if(alpha < 0.01) discard;

        //         // 直接使用原始颜色，无光照处理
        //         gl_FragColor = vec4(vColor, alpha);
        //       }
        //     `,
        //   });
    
        //   const pointsSmoothObj = new THREE.Points(geomSmooth, material);
        //   scene.add(pointsSmoothObj);
        // }
      }

      // 创建球体几何体
      let sphereGeometry: THREE.BufferGeometry
      if (pointType === 'sphere' && showPointCloud) {
        // 球体材质（使用 instanceColor）
        // MeshStandardMaterial 会自动使用 InstancedMesh 的 instanceColor
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff, // 基础颜色为白色，会被 instanceColor 覆盖
          metalness: 0.5,
          roughness: 0.5,
          transparent: true,
          opacity,
          // 添加轻微自发光，确保颜色可见
          emissive: 0x000000,
          emissiveIntensity: 0.1,
        });
        // 球体几何体
        sphereGeometry = new THREE.BoxGeometry(pointSize, pointSize, pointSize);
        // 给几何体每个顶点都复制上colorsSmooth颜色数组（所有顶点都用该点的颜色）
        // BoxGeometry有8个顶点，但我们希望每个实例的“box”颜色由其点的颜色决定
        // 所以仅设置 instanceColor，在 InstancedMesh 渲染时设置每个实例的颜色
        // 而不是在geometry顶点属性上设置
        // 但 THREE.InstancedMesh 只支持 instanceColor

        // 使用 InstancedMesh 高效渲染
        const instancedMesh = new THREE.InstancedMesh(
          sphereGeometry,
          sphereMaterial,
          N
        )
  
        const matrix = new THREE.Matrix4()
        transformedPointsSmoothed.forEach((point, i) => {
          matrix.makeTranslation(point.x, point.y, point.z)
          instancedMesh.setMatrixAt(i, matrix)
          
          // 使用 humanColors 为每个实例设置颜色
          let r = colorsSmooth[i * 3];
          let g = colorsSmooth[i * 3 + 1];
          let b = colorsSmooth[i * 3 + 2];
          
          // 如果颜色值无效，使用默认白色
          if (r === undefined || isNaN(r) || r < 0) r = 1;
          if (g === undefined || isNaN(g) || g < 0) g = 1;
          if (b === undefined || isNaN(b) || b < 0) b = 1;
          
          // 确保颜色值在有效范围内
          r = Math.max(0, Math.min(1, r));
          g = Math.max(0, Math.min(1, g));
          b = Math.max(0, Math.min(1, b));
          
          const color = new THREE.Color(r, g, b);
          instancedMesh.setColorAt(i, color)
        })
  
        instancedMesh.instanceMatrix.needsUpdate = true
        if (instancedMesh.instanceColor) {
          instancedMesh.instanceColor.needsUpdate = true
        }
        scene.add(instancedMesh)
        meshRef.current = instancedMesh
      } else if (showPointCloud) {
        const geomSmooth = new THREE.BufferGeometry();
        geomSmooth.setAttribute(
            "position",
            new THREE.BufferAttribute(isSmoothed ? positionsSmooth : originPointsMapMap, 3)
        );
        geomSmooth.setAttribute(
          "color",
          new THREE.BufferAttribute(colorsSmooth, 3)
        );
        
        const material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          vertexColors: true,
          uniforms: {
            uSize: { value: pointSize },   // 像素尺寸基准
            uOpacity: { value: opacity },  // 用 uniform 控制透明度
          },
          vertexShader: `
            varying vec3 vColor;
            uniform float uSize;
            void main() {
              vColor = color;
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              float dist = -mvPosition.z;
              gl_Position = projectionMatrix * mvPosition;
              gl_PointSize = clamp(uSize * 120.0 / dist, 2.0, 12.0);
            }
          `,
          fragmentShader: `
            precision highp float;
            varying vec3 vColor;
            uniform float uOpacity;

            void main() {
              // [-1,1] 的点精灵坐标
              vec2 p = gl_PointCoord * 2.0 - 1.0;
              float r2 = dot(p, p);

              // 圆形边界 + fwidth 抗锯齿
              float w = fwidth(r2);
              float alpha = 1.0 - smoothstep(1.0 - w, 1.0 + w, r2);

              // 高斯柔一下
              alpha *= exp(-r2 * 2.0);

              // 叠加不透明度
              alpha *= uOpacity;

              if(alpha < 0.01) discard;

              // 直接使用原始颜色，无光照处理
              gl_FragColor = vec4(vColor, alpha);
            }
          `,
        });
  
        const pointsSmoothObj = new THREE.Points(geomSmooth, material);
        scene.add(pointsSmoothObj);
        meshRef.current = pointsSmoothObj;
      }

      return () => {
        if (humanPatchMeshRef.current) {
          scene.remove(humanPatchMeshRef.current)
          if (humanPatchMeshRef.current.material instanceof THREE.Material) {
            humanPatchMeshRef.current.material.dispose()
          }
          humanPatchMeshRef.current.geometry.dispose()
          humanPatchMeshRef.current = null
        }
        if (meshRef.current) {
          scene.remove(meshRef.current)
          if (meshRef.current instanceof THREE.InstancedMesh) {
            meshRef.current.geometry.dispose()
            if (meshRef.current.material instanceof THREE.Material) {
              meshRef.current.material.dispose()
            }
          } else if (meshRef.current instanceof THREE.Points) {
            meshRef.current.geometry.dispose()
            if (meshRef.current.material instanceof THREE.Material) {
              meshRef.current.material.dispose()
            }
            meshRef.current = null
          }
        }
      }
    } catch (error) {
      console.error('Error creating point cloud:', error)
    }
  }, [points, scene, opacity, pointType, humanColors, skinOpacity, showPointCloud, showSkin, pointSize, showOriginalColor, skinParams, isSmoothed, isSmoothedSkin])

  // 更新透明度
  useEffect(() => {
    if (meshRef.current && meshRef.current.material) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial
      material.opacity = opacity
    }
  }, [opacity])

  // 更新皮肤材质参数
  useEffect(() => {
    if (!humanPatchMeshRef.current || !skinParams) return
    const material = humanPatchMeshRef.current.material
    if (!(material instanceof THREE.MeshPhysicalMaterial)) return
    
    // 更新所有材质属性
    if (skinParams.meshColor) material.color.copy(skinParams.meshColor)
    if (skinParams.metalness !== undefined) material.metalness = skinParams.metalness
    if (skinParams.roughness !== undefined) material.roughness = skinParams.roughness
    if (skinParams.transmission !== undefined) material.transmission = skinParams.transmission
    if (skinParams.thickness !== undefined) material.thickness = skinParams.thickness
    if (skinParams.ior !== undefined) material.ior = skinParams.ior
    if (skinParams.clearcoat !== undefined) material.clearcoat = skinParams.clearcoat
    if (skinParams.clearcoatRoughness !== undefined) material.clearcoatRoughness = skinParams.clearcoatRoughness
    if (skinParams.reflectivity !== undefined) material.reflectivity = skinParams.reflectivity
    if (skinParams.attenuationDistance !== undefined) material.attenuationDistance = skinParams.attenuationDistance
    if (skinParams.attenuationColor) material.attenuationColor.copy(skinParams.attenuationColor)
    if (skinParams.envMapIntensity !== undefined) material.envMapIntensity = skinParams.envMapIntensity
    if (skinParams.sheen !== undefined) material.sheen = skinParams.sheen
    if (skinParams.sheenColor) material.sheenColor.copy(skinParams.sheenColor)
    if (skinParams.sheenRoughness !== undefined) material.sheenRoughness = skinParams.sheenRoughness
    material.needsUpdate = true
  }, [skinParams])

  // 更新皮肤透明度
  useEffect(() => {
    if (humanPatchMeshRef.current && humanPatchMeshRef.current.material instanceof THREE.MeshPhysicalMaterial) {
      const material = humanPatchMeshRef.current.material as THREE.MeshPhysicalMaterial
      material.opacity = skinOpacity
      material.needsUpdate = true
    }
  }, [skinOpacity])

  // 更新颜色（当 minOffset 改变时）
  // useEffect(() => {
  //   if (!meshRef.current || !pointsDataRef.current) return

  //   const instancedMesh = meshRef.current
  //   const { transformedPoints, minZ } = pointsDataRef.current
  //   const matrix = new THREE.Matrix4()

  //   transformedPoints.forEach((point, i) => {
  //     matrix.makeTranslation(point.x, point.y, point.z)
  //     const percent = (minOffset - point.z) / (minOffset - minZ)
  //     // 将 percent 映射到 0.3-1.0 范围，避免过暗的颜色
  //     const brightness = 0.3 + percent * 0.7;
  //     instancedMesh.setColorAt(i, new THREE.Color(brightness, brightness, brightness))
  //     instancedMesh.setMatrixAt(i, matrix)
  //   })

  //   if (instancedMesh.instanceColor) {
  //     instancedMesh.instanceColor.needsUpdate = true
  //   }
  //   instancedMesh.instanceMatrix.needsUpdate = true
  // }, [minOffset])

  return null
}

