import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { processPointCloud } from '../utils/pointCloudUtils';
import type { Point3D } from '../utils/pointCloudUtils';
import { smoothen } from '@/utils/smoothen';
import {
  buildHumanPatchMeshFromHeightMap,
  type SkinMaterialParams,
} from '@/utils/build_mesh_skin';
// import { testSmoothMethod } from '@/utils/test_smooth_method';
// import { buildOutlineFromRegionMask, growRegionFromCenter } from '@/utils/product_interation';
// import { testSmoothMethod } from '@/utils/test_smooth_method';
import { growFittedSurface } from '@/utils/surfaceFit';

export interface PointCloudProps {
  points: Point3D[];
  opacity: number;
  skinOpacity: number;
  scene: THREE.Scene | THREE.Object3D;
  pointType: 'sphere' | 'box';
  humanColors?: { r: number; g: number; b: number }[];
  showPointCloud: boolean;
  showSkin: boolean;
  pointSize: number;
  showOriginalColor: boolean;
  skinParams?: SkinMaterialParams & { depthGapRatio?: number };
}

/* -------------------- 形态学 & Marching Squares 工具 -------------------- */

// type GridPoint = [number, number];

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
//           if (mask[idx(xx, yy)]) {
//             v = 1;
//             break;
//           }
//         }
//       }
//       out[idx(ix, iy)] = v;
//     }
//   }
//   return out;
// }

// function marchingSquares(
//   mask: ArrayLike<number>,
//   nx: number,
//   ny: number,
//   isoLevel = 0.5,
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
//   const idx1D = (ix: number, iy: number) => iy * nx + ix;

//   // 为每个网格 cell 计算轮廓线段
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
//         let x0 = 0,
//           y0 = 0,
//           x1 = 0,
//           y1 = 0;
//         let va = 0,
//           vb = 0;

//         switch (edge) {
//           case 0: // bottom
//             x0 = ix;
//             y0 = iy;
//             x1 = ix + 1;
//             y1 = iy;
//             va = v00;
//             vb = v10;
//             break;
//             va = v00;
//             vb = v10;
//             break;
//           case 1: // right
//             x0 = ix + 1;
//             y0 = iy;
//             x1 = ix + 1;
//             y1 = iy + 1;
//             va = v10;
//             vb = v11;
//             break;
//           case 2: // top
//             x0 = ix + 1;
//             y0 = iy + 1;
//             x1 = ix;
//             y1 = iy + 1;
//             va = v11;
//             vb = v01;
//             break;
//           case 3: // left
//             x0 = ix;
//             y0 = iy + 1;
//             x1 = ix;
//             y1 = iy;
//             va = v01;
//             vb = v00;
//             break;
//         }

//         const denom = vb - va;
//         const t = Math.abs(denom) < 1e-6 ? 0.5 : (isoLevel - va) / denom;
//         return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
//       };

//       const table: number[][][] = [
//         [],
//         [[3, 0]],
//         [[0, 1]],
//         [[3, 1]],
//         [[1, 2]],
//         [[3, 2], [0, 1]],
//         [[0, 2]],
//         [[3, 2]],
//         [[2, 3]],
//         [[0, 2]],
//         [[0, 3], [1, 2]],
//         [[1, 2]],
//         [[1, 3]],
//         [[0, 1]],
//         [[3, 0]],
//         [],
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

//   // 把线段拼成轮廓
//   const adj = new Map<string, Neighbor[]>();
//   const keyOf = (p: GridPoint) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

//   segments.forEach((seg, idx) => {
//     const ka = keyOf(seg.a);
//     const kb = keyOf(seg.b);
//     if (!adj.has(ka)) adj.set(ka, []);
//     if (!adj.has(kb)) adj.set(kb, []);
//     adj.get(ka)!.push({ p: seg.b, segIndex: idx });
//     adj.get(kb)!.push({ p: seg.a, segIndex: idx });
//   });

//   const usedSeg = new Array(segments.length).fill(false);
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

//       if (keyOf(curr) === startKey) break;
//     }

//     return contour;
//   };

//   for (let i = 0; i < segments.length; i++) {
//     if (usedSeg[i]) continue;
//     const contour = traceContour(i);
//     if (contour.length > 1) contours.push(contour);
//   }

//   return contours;
// }

/**
 * 根据统一坐标系里的点云，计算 XY 投影轮廓
 */
// function computeXYOutline(points: THREE.Vector3[]): THREE.Vector3[] {
//   if (!points.length) return [];

//   // 1. 统计 XY 范围
//   let minX = Infinity,
//     maxX = -Infinity,
//     minY = Infinity,
//     maxY = -Infinity;

//   for (const p of points) {
//     if (p.x < minX) minX = p.x;
//     if (p.x > maxX) maxX = p.x;
//     if (p.y < minY) minY = p.y;
//     if (p.y > maxY) maxY = p.y;
//   }

//   const widthX = maxX - minX || 1;
//   const heightY = maxY - minY || 1;

//   // 2. 创建栅格，投影点云
//   const nx = 256;
//   const ny = 256;
//   const mask = new Uint8Array(nx * ny);
//   const idx = (ix: number, iy: number) => iy * nx + ix;

//   for (const p of points) {
//     const u = (p.x - minX) / widthX;
//     const v = (p.y - minY) / heightY;
//     const ix = Math.min(nx - 1, Math.max(0, Math.floor(u * (nx - 1))));
//     const iy = Math.min(ny - 1, Math.max(0, Math.floor(v * (ny - 1))));
//     mask[idx(ix, iy)] = 1;
//   }

//   // 3. 膨胀一点避免空洞
//   const dilateRadius = Math.max(2, Math.floor(Math.min(nx, ny) / 150));
//   const maskClosed = dilate(mask, nx, ny, dilateRadius);

//   // 4. Marching Squares 取轮廓
//   const contours = marchingSquares(maskClosed, nx, ny, 0.5);
//   if (!contours.length) return [];

//   // 选择最长的轮廓
//   let outer = contours[0];
//   for (const c of contours) {
//     if (c.length > outer.length) outer = c;
//   }

//   // 5. 映射回 3D 空间（Z 取点云中位数附近）
//   let zMin = Infinity,
//     zMax = -Infinity;
//   for (const p of points) {
//     if (p.z < zMin) zMin = p.z;
//     if (p.z > zMax) zMax = p.z;
//   }
//   const zCenter = (zMin + zMax) / 2;

//   const outlineWorld: THREE.Vector3[] = outer.map(([gx, gy]) => {
//     const u = gx / (nx - 1);
//     const v = gy / (ny - 1);
//     const x = minX + u * widthX;
//     const y = minY + v * heightY;
//     return new THREE.Vector3(x, y, zCenter);
//   });

//   // 保证闭合
//   if (outlineWorld.length > 1) {
//     const first = outlineWorld[0];
//     const last = outlineWorld[outlineWorld.length - 1];
//     if (first.distanceToSquared(last) > 1e-6) {
//       outlineWorld.push(first.clone());
//     }
//   }

//   return outlineWorld;
// }

/* ------------------------------- 组件本体 ------------------------------- */

export default function PointCloud(props: PointCloudProps) {
  const {
    points,
    opacity,
    skinOpacity,
    scene,
    pointType,
    humanColors,
    showPointCloud,
    showSkin,
    pointSize,
    showOriginalColor,
    skinParams,
  } = props;

  const meshRef = useRef<THREE.InstancedMesh | THREE.Points | null>(null);
  const humanPatchMeshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!points || points.length === 0) return;

    // 1. smoothen（你原来的逻辑，不动坐标系）
    const {
      smoothed: smoothedPoints,
      heightMapFiltered,
      validMask,
      colorMapR,
      colorMapG,
      colorMapB,
      nx,
      ny,
      xMin,
      xMax,
      yMin,
      yMax,
      zMax,
      zMin,
    } = smoothen({ rawPoints: points, humanColors });

    // === 新增：基于 heightMap 做 3D 曲面拟合 + 区域生长 ===
    const {
      fittedHeightMap,
      fittedMask,
    } = growFittedSurface(
      heightMapFiltered,
      validMask,
      nx,
      ny,
      xMin,
      xMax,
      yMin,
      yMax,
      zMin,
      zMax,
      2              // windowRadius，可调：1-3 之间试试
    );

    // 如果你想用拟合曲面替换原来的 heightMap 给皮肤网格：
    const heightMapForSkin = fittedHeightMap;
    const validMaskForSkin = fittedMask;

    // 2. 统一居中 + 缩放（只做一次）
    const {
      transformedPoints, // THREE.Vector3[]
      transformParams,
    } = processPointCloud(smoothedPoints);

    // testSmoothMethod(transformedPoints, scene, (progress) => {
    //   console.log(`扩散进度: ${(progress * 100).toFixed(2)}%`);
    // });

    // ====== 新增：从中心区域生长 + 轮廓线 ======
    // const { regionMask } = growRegionFromCenter(
    //   heightMapFiltered,   // 每个栅格的深度 z
    //   validMask,           // 每个栅格是否有点
    //   nx,
    //   ny,
    //   zMin,
    //   zMax
    // );

    // const outlineWorld = buildOutlineFromRegionMask(
    //   regionMask,
    //   nx,
    //   ny,
    //   xMin,
    //   xMax,
    //   yMin,
    //   yMax,
    //   zMin,
    //   zMax,
    //   transformParams
    // );

    // if (outlineWorld.length > 1) {
    //   const lineGeom = new THREE.BufferGeometry().setFromPoints(outlineWorld);
    //   const lineMat = new THREE.LineBasicMaterial({ color: 0x0000ff });
    //   const lineLoop = new THREE.LineLoop(lineGeom, lineMat);
    //   lineLoop.renderOrder = 10;
    //   scene.add(lineLoop);
    // }

    const N = transformedPoints.length;
    const positionsSmooth = new Float32Array(N * 3);
    const colorsSmooth = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      const p = transformedPoints[i];
      positionsSmooth[i * 3 + 0] = p.x;
      positionsSmooth[i * 3 + 1] = p.y;
      positionsSmooth[i * 3 + 2] = p.z;

      const col = humanColors?.[i] || { r: 255, g: 255, b: 255 };
      colorsSmooth[i * 3 + 0] = (col.r ?? 255) / 255;
      colorsSmooth[i * 3 + 1] = (col.g ?? 255) / 255;
      colorsSmooth[i * 3 + 2] = (col.b ?? 255) / 255;
    }

    // 3. 计算 XY 轮廓，并画出 LineLoop
    // const outline = computeXYOutline(transformedPoints);
    // if (outline.length > 1) {
    //   const geom = new THREE.BufferGeometry().setFromPoints(outline);
    //   const mat = new THREE.LineBasicMaterial({
    //     color: 0x0000ff,
    //   });
    //   const loop = new THREE.LineLoop(geom, mat);
    //   loop.renderOrder = 10;
    //   scene.add(loop);
    // }

    try {
      // 4. 点云渲染
      if (showPointCloud) {
        if (pointType === 'sphere') {
          const sphereGeom = new THREE.BoxGeometry(
            pointSize,
            pointSize,
            pointSize,
          );
          const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.5,
            roughness: 0.5,
            transparent: true,
            opacity,
          });

          const inst = new THREE.InstancedMesh(
            sphereGeom,
            sphereMat,
            transformedPoints.length,
          );
          const matrix = new THREE.Matrix4();
          const color = new THREE.Color();

          transformedPoints.forEach((p, i) => {
            matrix.makeTranslation(p.x, p.y, p.z);
            inst.setMatrixAt(i, matrix);

            const r = colorsSmooth[i * 3 + 0];
            const g = colorsSmooth[i * 3 + 1];
            const b = colorsSmooth[i * 3 + 2];
            color.setRGB(r, g, b);
            inst.setColorAt(i, color);
          });

          inst.instanceMatrix.needsUpdate = true;
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

          scene.add(inst);
          meshRef.current = inst;
        } else {
          const geom = new THREE.BufferGeometry();
          geom.setAttribute(
            'position',
            new THREE.BufferAttribute(positionsSmooth, 3),
          );
          geom.setAttribute(
            'color',
            new THREE.BufferAttribute(colorsSmooth, 3),
          );

          const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            vertexColors: true,
            uniforms: {
              uSize: { value: pointSize },   // 像素尺寸基准
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
              void main() {
                // [-1,1] 的点精灵坐标
                vec2 p = gl_PointCoord * 2.0 - 1.0;
                float r2 = dot(p, p);
          
                // 圆形边界 + fwidth 抗锯齿
                float w = fwidth(r2);
                float alpha = 1.0 - smoothstep(1.0 - w, 1.0 + w, r2);
          
                // 高斯柔一下
                alpha *= exp(-r2 * 2.0);
          
                if(alpha < 0.01) discard;
                gl_FragColor = vec4(vColor, alpha);
              }
            `,
          });

          // const mat = new THREE.PointsMaterial({
          //   color: showOriginalColor ? undefined : 0xcccccc,
          //   vertexColors: showOriginalColor,
          //   size: pointSize,
          //   sizeAttenuation: true,
          //   transparent: true,
          //   opacity,
          // });

          const pts = new THREE.Points(geom, material);
          scene.add(pts);
          meshRef.current = pts;
        }
      }

      // 5. 皮肤 mesh（保持你原先的 heightMap → mesh 逻辑）
      if (showSkin) {
        const depthGapRatio = skinParams?.depthGapRatio ?? 0.25;
        const { mesh: humanPatchMesh } = buildHumanPatchMeshFromHeightMap({
          heightMap: heightMapForSkin,
          validMask: validMaskForSkin,
          nx,
          ny,
          xMin,
          xMax,
          yMin,
          yMax,
          colorMapR,
          colorMapG,
          colorMapB,
          depthGap: (zMax - zMin) * depthGapRatio,
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
        });

        if (humanPatchMesh) {
          humanPatchMesh.receiveShadow = true;
          humanPatchMesh.castShadow = true;
          humanPatchMesh.renderOrder = 2;
          scene.add(humanPatchMesh);
          humanPatchMeshRef.current = humanPatchMesh;
        }
      }

      return () => {
        if (humanPatchMeshRef.current) {
          scene.remove(humanPatchMeshRef.current);
          humanPatchMeshRef.current.geometry.dispose();
          if (
            humanPatchMeshRef.current.material instanceof THREE.Material
          ) {
            humanPatchMeshRef.current.material.dispose();
          }
          humanPatchMeshRef.current = null;
        }
        if (meshRef.current) {
          scene.remove(meshRef.current);
          if (
            meshRef.current instanceof THREE.InstancedMesh ||
            meshRef.current instanceof THREE.Points
          ) {
            meshRef.current.geometry.dispose();
            if (meshRef.current.material instanceof THREE.Material) {
              meshRef.current.material.dispose();
            }
          }
          meshRef.current = null;
        }
      };
    } catch (err) {
      console.error('Error creating point cloud:', err);
    }
  }, [
    points,
    scene,
    opacity,
    pointType,
    humanColors,
    skinOpacity,
    showPointCloud,
    showSkin,
    pointSize,
    showOriginalColor,
    skinParams,
  ]);

  // 动态更新透明度
  useEffect(() => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.Material & {
      opacity?: number;
      transparent?: boolean;
    };
    if (mat && 'opacity' in mat) {
      mat.transparent = true;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    }
  }, [opacity]);

  useEffect(() => {
    if (
      humanPatchMeshRef.current &&
      humanPatchMeshRef.current.material instanceof THREE.MeshPhysicalMaterial
    ) {
      humanPatchMeshRef.current.material.opacity = skinOpacity;
      humanPatchMeshRef.current.material.needsUpdate = true;
    }
  }, [skinOpacity]);

  return null;
}
