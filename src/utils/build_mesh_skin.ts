import * as THREE from 'three'
import type { TransformParams } from './pointCloudUtils'
import { sampleHeightFromGrid, type SmoothenResult } from './smoothen_new';

// ======== 从颜色图采样颜色（双线性插值） ========
function sampleColorFromGrid(x: number, y: number, colorMapR: Float32Array, colorMapG: Float32Array, colorMapB: Float32Array, nx: number, ny: number, widthX: number, heightY: number, xMin: number, yMin: number, xCenter: number, yCenter: number) {
    // 归一化到 [0, 1]
    // x 和 y 是中心化后的坐标，与构建颜色图时使用的坐标系统一致
    const u = (x - (xMin - xCenter)) / widthX;
    const v = (y - (yMin - yCenter)) / heightY;

    // 映射到 [0, nx-1], [0, ny-1] 的连续坐标
    const fx = u * (nx - 1);
    const fy = v * (ny - 1);

    let ix = Math.floor(fx);
    let iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;

    ix = Math.max(0, Math.min(nx - 1, ix));
    iy = Math.max(0, Math.min(ny - 1, iy));
    const ix1 = Math.min(ix + 1, nx - 1);
    const iy1 = Math.min(iy + 1, ny - 1);

    const idx00 = iy  * nx + ix;
    const idx10 = iy  * nx + ix1;
    const idx01 = iy1 * nx + ix;
    const idx11 = iy1 * nx + ix1;

    // 双线性插值 RGB
    const r00 = colorMapR[idx00];
    const r10 = colorMapR[idx10];
    const r01 = colorMapR[idx01];
    const r11 = colorMapR[idx11];
    const r0 = r00 * (1 - tx) + r10 * tx;
    const r1 = r01 * (1 - tx) + r11 * tx;
    const r = r0 * (1 - ty) + r1 * ty;

    const g00 = colorMapG[idx00];
    const g10 = colorMapG[idx10];
    const g01 = colorMapG[idx01];
    const g11 = colorMapG[idx11];
    const g0 = g00 * (1 - tx) + g10 * tx;
    const g1 = g01 * (1 - tx) + g11 * tx;
    const g = g0 * (1 - ty) + g1 * ty;

    const b00 = colorMapB[idx00];
    const b10 = colorMapB[idx10];
    const b01 = colorMapB[idx01];
    const b11 = colorMapB[idx11];
    const b0 = b00 * (1 - tx) + b10 * tx;
    const b1 = b01 * (1 - tx) + b11 * tx;
    const b = b0 * (1 - ty) + b1 * ty;

    // 如果颜色值为NaN或undefined，使用默认白色，否则使用实际值（包括0）
    const result = { 
        r: (Number.isNaN(r) || r === undefined) ? 1 : Math.max(0, Math.min(1, r)), 
        g: (Number.isNaN(g) || g === undefined) ? 1 : Math.max(0, Math.min(1, g)), 
        b: (Number.isNaN(b) || b === undefined) ? 1 : Math.max(0, Math.min(1, b)) 
    }
    return result;
}

/**
 * 平滑高度图边缘，使用双边滤波算法
 * @param heightMap 高度图
 * @param validMask 有效掩码
 * @param nx 网格分辨率
 * @param ny 网格分辨率
 * @param iterations 迭代次数
 * @returns 平滑后的高度图
 */
export function smoothHeightMapEdge(
  heightMap: Float32Array | ArrayLike<number>,
  validMask: Uint8Array,
  nx: number,
  ny: number,
  iterations = 3
): Float32Array {
  const heightMapArray = Array.from(heightMap);
  const validMaskArray = Array.from(validMask);
  const idx = (x: number, y: number) => y * nx + x;

  for (let it = 0; it < iterations; it++) {
    const copy = new Float32Array(heightMapArray);
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const k = idx(x, y);
        if (!validMaskArray[k]) continue;

        // 只对“接近边界”的点平滑：周围存在 invalid 就算边界
        const neighbors = [
          idx(x - 1, y), idx(x + 1, y),
          idx(x, y - 1), idx(x, y + 1),
        ];
        let hasInvalid = false;
        for (const n of neighbors) if (!validMaskArray[n]) { hasInvalid = true; break; }
        if (!hasInvalid) continue;

        let sum = 0, cnt = 0;
        for (const n of neighbors) {
          if (!validMaskArray[n]) continue;
          sum += copy[n];
          cnt++;
        }
        if (cnt > 0) heightMapArray[k] = (copy[k] * 0.5 + sum / cnt * 0.5);
      }
    }
  }
  return new Float32Array(heightMapArray);
}

export interface SkinMaterialParams {
    meshColor?: THREE.Color,
    metalness?: number,
    roughness?: number,
    transmission?: number,
    thickness?: number,
    ior?: number,
    clearcoat?: number,
    clearcoatRoughness?: number,
    reflectivity?: number,
    attenuationDistance?: number,
    attenuationColor?: THREE.Color,
    envMapIntensity?: number,
    sheen?: number,
    sheenColor?: THREE.Color,
    sheenRoughness?: number,
    useVertexColors?: boolean,
    colorBrightness?: number,  // 颜色亮度调整因子，默认1.0，大于1.0会提亮
}

export interface BuildMeshResult {
    mesh: THREE.Mesh | null;
    pointsOutsideMesh: number[]; // 不在 mesh 范围内的点索引
}

export const buildHumanPatchMeshFromHeightMap = ({
    heightMap,
    validMask,
    nx,
    ny,
    xMin,
    xMax,
    yMin,
    yMax,
    colorMapR,
    colorMapG,
    colorMapB,
    depthGap = 0,
    transformParams,
    skinOpacity,
    meshColor = new THREE.Color(0xDBC0A7),
    // metalness = 0.06,
    // roughness = 0.46,
    // transmission = 0.2,
    // thickness = 0.2,
    // ior = 1.42,
    // clearcoat = 1.0,
    // clearcoatRoughness = 0.5,
    // reflectivity = 0.5,
    // attenuationDistance = 1,
    // attenuationColor = new THREE.Color(0xffccaa),
    // envMapIntensity = 1.5,
    // sheen = 1.0,
    // sheenColor = new THREE.Color(0xfbe9d6),
    // sheenRoughness = 0.5,
    useVertexColors = false,
    colorBrightness = 1.3,  // 默认提亮50%
    points, // 传入的点云（变换后的坐标）
}: {
    heightMap: Float32Array,
    validMask: Uint8Array,
    nx: number,
    ny: number,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    colorMapR: Float32Array,
    colorMapG: Float32Array,
    colorMapB: Float32Array,
    depthGap?: number,
    transformParams?: TransformParams,
    skinOpacity?: number,
    meshColor?: THREE.Color,
    metalness?: number,
    roughness?: number,
    transmission?: number,
    thickness?: number,
    ior?: number,
    clearcoat?: number,
    clearcoatRoughness?: number,
    reflectivity?: number,
    attenuationDistance?: number,
    attenuationColor?: THREE.Color,
    envMapIntensity?: number,
    sheen?: number,
    sheenColor?: THREE.Color,
    sheenRoughness?: number,
    useVertexColors?: boolean,
    colorBrightness?: number,
    points?: THREE.Vector3[], // 点云（变换后的坐标）
}): BuildMeshResult => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const vertIndex = new Int32Array(nx * ny);
    vertIndex.fill(-1);

    const widthX  = xMax - xMin || 1.0;
    const heightY = yMax - yMin || 1.0;

    const xCenter = (xMin + xMax) / 2;
    const yCenter = (yMin + yMax) / 2;
    const idx = (ix: number, iy: number) => iy * nx + ix;

    for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
            const g = idx(ix, iy);
            if (!validMask[g]) continue;
            const z = heightMap[g];
            if (Number.isNaN(z)) continue;

            const u = ix / (nx - 1);
            const v = iy / (ny - 1);

            // 先计算原始坐标（未变换的）
            const xRaw = xMin + u * widthX;
            const yRaw = yMin + v * heightY;
            const zRaw = z;

            // 应用与点云相同的变换（缩放和居中）
            let x: number, y: number, zFinal: number;
            
            if (transformParams) {
                // 应用缩放和居中变换：newPoint = (oldPoint * scaleFactor) - (center * scaleFactor)
                const point = new THREE.Vector3(xRaw, yRaw, zRaw);
                point.multiplyScalar(transformParams.scaleFactor);
                point.sub(transformParams.center);
                x = point.x;
                y = point.y;
                zFinal = point.z;
            } else {
                // 如果没有变换参数，只做中心化
                x = xRaw - xCenter;
                y = yRaw - yCenter;
                zFinal = zRaw;
            }

            vertIndex[g] = positions.length / 3;
            positions.push(x, y, zFinal);
            
            // 采样颜色（使用中心化后的坐标，因为颜色图是基于中心化坐标构建的）
            // 注意：这里 x, y 已经是变换后的坐标，但我们需要中心化后的原始坐标来采样颜色
            // 所以使用 xRaw - xCenter, yRaw - yCenter
            const cx = xRaw - xCenter;
            const cy = yRaw - yCenter;
            const col = sampleColorFromGrid(cx, cy, colorMapR, colorMapG, colorMapB, nx, ny, widthX, heightY, xMin, yMin, xCenter, yCenter);
            
            // 确保颜色值有效（避免变量名冲突，使用不同的变量名）
            let colorR = (col && typeof col.r === 'number' && !Number.isNaN(col.r)) ? col.r : 1;
            let colorG = (col && typeof col.g === 'number' && !Number.isNaN(col.g)) ? col.g : 1;
            let colorB = (col && typeof col.b === 'number' && !Number.isNaN(col.b)) ? col.b : 1;
            
            // 应用亮度调整：使用混合白色的方法来提亮，保持颜色自然
            if (colorBrightness > 1.0) {
                const brightnessFactor = colorBrightness - 1.0;  // 0.0 到 1.0 之间
                colorR = Math.min(1.0, colorR + (1.0 - colorR) * brightnessFactor * 0.5);
                colorG = Math.min(1.0, colorG + (1.0 - colorG) * brightnessFactor * 0.5);
                colorB = Math.min(1.0, colorB + (1.0 - colorB) * brightnessFactor * 0.5);
            } else if (colorBrightness < 1.0) {
                // 如果小于1.0，可以调暗
                colorR *= colorBrightness;
                colorG *= colorBrightness;
                colorB *= colorBrightness;
            }
            
            colors.push(colorR, colorG, colorB);
        }
    }

    for (let iy = 0; iy < ny - 1; iy++) {
        for (let ix = 0; ix < nx - 1; ix++) {
            const g00 = idx(ix,     iy);
            const g10 = idx(ix + 1, iy);
            const g01 = idx(ix,     iy + 1);
            const g11 = idx(ix + 1, iy + 1);

            const a = vertIndex[g00];
            const b = vertIndex[g10];
            const c = vertIndex[g01];
            const d = vertIndex[g11];
            if (a < 0 || b < 0 || c < 0 || d < 0) continue;

            if (depthGap > 0) {
                // 检查所有相邻顶点之间的z值差异，而不仅仅是相对于z00的差异
                // 这样可以避免在边缘区域产生z轴向后延伸的倒刺
                const z00 = heightMap[g00];
                const z10 = heightMap[g10];
                const z01 = heightMap[g01];
                const z11 = heightMap[g11];
                
                // 检查所有相邻顶点之间的z值差异
                const dz00_10 = Math.abs(z00 - z10);
                const dz00_01 = Math.abs(z00 - z01);
                const dz00_11 = Math.abs(z00 - z11);
                const dz10_01 = Math.abs(z10 - z01);
                const dz10_11 = Math.abs(z10 - z11);
                const dz01_11 = Math.abs(z01 - z11);
                
                // 如果任意两个相邻顶点之间的z值差异超过depthGap，跳过这个四边形
                const maxDz = Math.max(dz00_10, dz00_01, dz00_11, dz10_01, dz10_11, dz01_11);
                if (maxDz > depthGap) continue;
            }

            // 确保三角形顺序正确，法线指向外部（朝向观察者）
            // 由于 z = -p.z，网格是从后往前看的
            // 从正面看（z轴正方向），顶点顺序应该是逆时针，这样法线指向外部
            // 反转索引顺序，使法线指向正确方向
            // 第一个三角形：c(左上) -> a(左下) -> b(右下) - 从正面看是逆时针
            // 第二个三角形：c(左上) -> b(右下) -> d(右上) - 从正面看是逆时针
            indices.push(c, a, b,  c, b, d);
        }
    }

    if (!positions.length) {
        return {
            mesh: null,
            pointsOutsideMesh: points ? Array.from({ length: points.length }, (_, i) => i) : []
        };
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(colors, 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const skinMaterial = new THREE.MeshPhysicalMaterial({
        color: meshColor,
        roughness: 0.48,
        metalness: 0.0,
      
        // ---- 类 SSS 效果 ----
        transmission: 0.25,      // 光线穿透感（近似 SSS）
        thickness: 0.35,         // 模拟皮肤厚度
        attenuationDistance: 0.8,
        attenuationColor: new THREE.Color(1.0, 0.6, 0.5),
      
        // ---- 表面细节 ----
        clearcoat: 0.3,          // 轻微油脂层（皮肤光泽）
        clearcoatRoughness: 0.65,
      
        envMapIntensity: 0.75,
        side: THREE.DoubleSide,       // 反面渲染（如需双面可用 DoubleSide）
        transparent: true,
        vertexColors: useVertexColors,      // 启用顶点颜色
        opacity: skinOpacity,
    });

    // 更加拟真的皮肤材质设置
    // const material = new THREE.MeshPhysicalMaterial({
    //     color: meshColor, // 偏浅肤色
    //     metalness,  // 低金属性，皮肤近似为非金属
    //     roughness,  // 稍微有点粗糙模拟表皮
    //     transmission, // 皮肤有一定透光感
    //     thickness,    // 模拟皮肤厚度
    //     ior,         // 人体皮肤折射率
    //     clearcoat,    // 全清漆模拟皮肤油脂光泽
    //     clearcoatRoughness, // 微小清漆粗糙度
    //     reflectivity,  // 适度反射
    //     attenuationDistance, // 控制皮肤"透射"的距离
    //     attenuationColor,  // 透射偏暖橙
    //     transparent: true,
    //     opacity: skinOpacity,
    //     envMapIntensity,
    //     sheen,                 // 光泽:让表皮有光晕感
    //     sheenColor, // 薄薄亮色
    //     sheenRoughness,
    //     side: THREE.DoubleSide,       // 反面渲染（如需双面可用 DoubleSide）
    //     // vertexColors: true          // 启用顶点颜色
    // });
    // console.log(material, skinMaterial);

    const mesh = new THREE.Mesh(geometry, skinMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // 找出不在 mesh 范围内的点
    const pointsOutsideMesh: number[] = []
    if (points && points.length > 0) {
        const widthX = xMax - xMin || 1.0;
        const heightY = yMax - yMin || 1.0;
        const xCenter = (xMin + xMax) / 2;
        const yCenter = (yMin + yMax) / 2;
        const idx = (ix: number, iy: number) => iy * nx + ix;
        
        // 计算 mesh 的 z 范围（从 heightMap 中）
        let meshZMin = Infinity, meshZMax = -Infinity
        for (let i = 0; i < heightMap.length; i++) {
            if (validMask[i] && !Number.isNaN(heightMap[i])) {
                const z = heightMap[i]
                if (transformParams) {
                    const zTransformed = z * transformParams.scaleFactor - transformParams.center.z
                    if (zTransformed < meshZMin) meshZMin = zTransformed
                    if (zTransformed > meshZMax) meshZMax = zTransformed
                } else {
                    if (z < meshZMin) meshZMin = z
                    if (z > meshZMax) meshZMax = z
                }
            }
        }
        
        // 统计 validMask 中有效点的数量
        // let validMaskCount = 0
        // for (let i = 0; i < validMask.length; i++) {
        //     if (validMask[i]) validMaskCount++
        // }
        // console.log(`[buildHumanPatchMeshFromHeightMap] validMask 有效点数: ${validMaskCount}, 网格总数: ${nx * ny}`)
        // console.log(`[buildHumanPatchMeshFromHeightMap] 网格范围: x[${xMin.toFixed(3)}, ${xMax.toFixed(3)}], y[${yMin.toFixed(3)}, ${yMax.toFixed(3)}], z[${meshZMin.toFixed(3)}, ${meshZMax.toFixed(3)}]`)
        
        // 如果有点云，检查哪些点不在 mesh 范围内
        let sampleCount = 0
        const sampleSize = Math.min(20, points.length) // 采样前20个点用于调试
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i]
            
            // 将点反变换回原始坐标（如果使用了 transformParams）
            let xRaw: number, yRaw: number
            if (transformParams) {
                // 反变换：原始点 = (变换点 + center) / scaleFactor
                // 因为变换是：newPoint = oldPoint * scaleFactor - center
                // 所以反变换：oldPoint = (newPoint + center) / scaleFactor
                const originalPoint = point.clone()
                originalPoint.add(transformParams.center)
                originalPoint.divideScalar(transformParams.scaleFactor)
                xRaw = originalPoint.x
                yRaw = originalPoint.y
                // zRaw = originalPoint.z
            } else {
                // 如果没有变换，点已经是中心化后的坐标，需要加回中心
                xRaw = point.x + xCenter
                yRaw = point.y + yCenter
                // zRaw = point.z
            }
            
            // 采样前几个点打印调试信息
            if (sampleCount < sampleSize) {
                // const u = (xRaw - xMin) / widthX
                // const v = (yRaw - yMin) / heightY
                // const gx = Math.floor(u * (nx - 1))
                // const gy = Math.floor(v * (ny - 1))
                // const gridIndex = idx(gx, gy)
                // const inRange = !(xRaw < xMin || xRaw > xMax || yRaw < yMin || yRaw > yMax)
                // const inGrid = !(gx < 0 || gx >= nx || gy < 0 || gy >= ny)
                // const inMask = inGrid && validMask[gridIndex] ? true : false
                // const meshZ = inGrid && validMask[gridIndex] ? heightMap[gridIndex] : NaN
                // const zDiff = !Number.isNaN(meshZ) ? Math.abs(point.z - (transformParams ? (meshZ * transformParams.scaleFactor - transformParams.center.z) : meshZ)) : Infinity
                // console.log(`点 ${i}: 变换后(${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}), 反变换后(${xRaw.toFixed(3)}, ${yRaw.toFixed(3)}, ${zRaw.toFixed(3)}), 网格(${gx},${gy}), 范围内:${inRange}, 网格内:${inGrid}, 有效:${inMask}, z差:${zDiff.toFixed(3)}`)
                sampleCount++
            }
            
            // 检查点是否在 (xMin, xMax, yMin, yMax) 范围内
            if (xRaw < xMin || xRaw > xMax || yRaw < yMin || yRaw > yMax) {
                pointsOutsideMesh.push(i)
                continue
            }
            
            // 计算点对应的网格索引
            // 注意：这里使用 (nx - 1) 和 (ny - 1) 因为网格索引是从 0 到 nx-1
            const u = (xRaw - xMin) / widthX
            const v = (yRaw - yMin) / heightY
            const gx = Math.floor(u * (nx - 1))
            const gy = Math.floor(v * (ny - 1))
            
            // 边界检查
            if (gx < 0 || gx >= nx || gy < 0 || gy >= ny) {
                pointsOutsideMesh.push(i)
                continue
            }
            
            // 检查对应的网格单元是否在 validMask 中
            const gridIndex = idx(gx, gy)
            if (!validMask[gridIndex]) {
                pointsOutsideMesh.push(i)
                continue
            }
            
            // 额外检查：点的 z 坐标是否在 mesh 的 z 范围内（允许一定容差）
            const meshZ = heightMap[gridIndex]
            if (!Number.isNaN(meshZ)) {
                const meshZTransformed = transformParams 
                    ? (meshZ * transformParams.scaleFactor - transformParams.center.z)
                    : meshZ
                const zTolerance = Math.abs(meshZMax - meshZMin) * 0.1 // 容差为 z 范围的 10%
                if (Math.abs(point.z - meshZTransformed) > zTolerance) {
                    // z 坐标差异太大，认为不在 mesh 范围内
                    pointsOutsideMesh.push(i)
                    continue
                }
            }
        }
        
        // console.log(`[buildHumanPatchMeshFromHeightMap] 总点数: ${points.length}, 不在mesh范围内的点数: ${pointsOutsideMesh.length}`)
    }
    
    return {
        mesh,
        pointsOutsideMesh
    }
}

interface Vec2 {
    x: number;
    y: number;
}

/**
 * 从 validMask 中提取边界格子 → 转成世界坐标的边界点
 */
function extractBoundaryLoopFromMask(
    validMask: Uint8Array,
    nx: number,
    ny: number,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number
  ): Vec2[] {
    const pts: Vec2[] = [];
    const widthX = xMax - xMin;
    const heightY = yMax - yMin;
    const idx = (ix: number, iy: number) => iy * nx + ix;
  
    const hasEmptyNeighbor = (ix: number, iy: number) => {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dy] of dirs) {
        const xx = ix + dx;
        const yy = iy + dy;
        if (xx < 0 || xx >= nx || yy < 0 || yy >= ny) return true;
        if (validMask[idx(xx, yy)] === 0) return true;
      }
      return false;
    };
  
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const k = idx(ix, iy);
        if (validMask[k] === 0) continue;
        if (!hasEmptyNeighbor(ix, iy)) continue;
  
        const u = (ix + 0.5) / nx;
        const v = (iy + 0.5) / ny;
        const x = xMin + u * widthX;
        const y = yMin + v * heightY;
        pts.push({ x, y });
      }
    }
  
    if (pts.length === 0) return [];
  
    // 以几何中心为原点按照极角排序，得到闭合环
    let cx = 0, cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
  
    pts.sort((a, b) => {
      const angA = Math.atan2(a.y - cy, a.x - cx);
      const angB = Math.atan2(b.y - cy, b.x - cx);
      return angA - angB;
    });
  
    return pts;
  }
  
  /**
   * Chaikin 曲线算法，平滑闭合折线
   */
  function smoothClosedPolylineChaikin(loop: Vec2[], iterations: number): Vec2[] {
    if (loop.length < 3) return loop;
  
    let pts = loop.slice();
    for (let it = 0; it < iterations; it++) {
      const newPts: Vec2[] = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % n];
  
        const q: Vec2 = {
          x: 0.75 * p0.x + 0.25 * p1.x,
          y: 0.75 * p0.y + 0.25 * p1.y,
        };
        const r: Vec2 = {
          x: 0.25 * p0.x + 0.75 * p1.x,
          y: 0.25 * p0.y + 0.75 * p1.y,
        };
  
        newPts.push(q, r);
      }
      pts = newPts;
    }
    return pts;
  }
  
  export interface BuildSmoothSkinMeshParams {
    smoothResult: SmoothenResult;
    material?: THREE.Material;
    chaikinIterations?: number;
    transformParams?: TransformParams;
  }
  
  /**
   * 基于平滑轮廓 + heightMap 采样重建皮肤 mesh：
   * - 外轮廓来自 Chaikin 平滑曲线（无锯齿）
   * - 内部 z 形状来自 heightMapFiltered（保持深度轮廓）
   */
  export function buildSmoothSilhouetteSkinMesh(
    params: BuildSmoothSkinMeshParams
  ): THREE.Mesh | null {
    const {
      smoothResult,
      material,
      chaikinIterations = 2,
      transformParams,
    } = params;
  
    const {
      heightMapFiltered,
      validMask,
      nx,
      ny,
      xMin,
      xMax,
      yMin,
      yMax,
      widthX,
      heightY,
    } = smoothResult;
  
    const rawLoop = extractBoundaryLoopFromMask(
      validMask,
      nx,
      ny,
      xMin,
      xMax,
      yMin,
      yMax
    );
  
    console.log("[buildSmoothSilhouetteSkinMesh] rawLoop length:", rawLoop.length);
    if (rawLoop.length < 3) {
      console.warn("[buildSmoothSilhouetteSkinMesh] boundary loop too small, rawLoop.length:", rawLoop.length);
      return null;
    }
  
    const loop = smoothClosedPolylineChaikin(rawLoop, chaikinIterations);
  
    // 中心点
    let cx = 0, cy = 0;
    for (const p of loop) {
      cx += p.x;
      cy += p.y;
    }
    cx /= loop.length;
    cy /= loop.length;
  
    const czRaw = sampleHeightFromGrid(
      heightMapFiltered,
      cx,
      cy,
      nx,
      ny,
      widthX,
      heightY,
      xMin,
      yMin
    );
  
    const vertices: number[] = [];
    const indices: number[] = [];
  
    // 顶点 0：中心
    let cxFinal: number, cyFinal: number, czFinal: number;
    if (transformParams) {
      const centerPoint = new THREE.Vector3(cx, cy, czRaw);
      centerPoint.multiplyScalar(transformParams.scaleFactor);
      centerPoint.sub(transformParams.center);
      cxFinal = centerPoint.x;
      cyFinal = centerPoint.y;
      czFinal = centerPoint.z;
    } else {
      cxFinal = cx;
      cyFinal = cy;
      czFinal = czRaw;
    }
    vertices.push(cxFinal, cyFinal, czFinal);
  
    // 顶点 1..n：轮廓点
    for (const p of loop) {
      const zRaw = sampleHeightFromGrid(
        heightMapFiltered,
        p.x,
        p.y,
        nx,
        ny,
        widthX,
        heightY,
        xMin,
        yMin
      );
      let xFinal: number, yFinal: number, zFinal: number;
      if (transformParams) {
        const point = new THREE.Vector3(p.x, p.y, zRaw);
        point.multiplyScalar(transformParams.scaleFactor);
        point.sub(transformParams.center);
        xFinal = point.x;
        yFinal = point.y;
        zFinal = point.z;
      } else {
        xFinal = p.x;
        yFinal = p.y;
        zFinal = zRaw;
      }
      vertices.push(xFinal, yFinal, zFinal);
    }
  
    const centerIndex = 0;
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const i1 = i + 1;
      const i2 = ((i + 1) % n) + 1;
      indices.push(centerIndex, i1, i2);
    }
  
    console.log("[buildSmoothSilhouetteSkinMesh] vertices count:", vertices.length / 3, "indices count:", indices.length);
    
    if (vertices.length === 0 || indices.length === 0) {
      console.warn("[buildSmoothSilhouetteSkinMesh] no vertices or indices generated");
      return null;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geom.setIndex(indices);
    geom.computeVertexNormals();

    // 计算边界框用于调试
    geom.computeBoundingBox();
    const bbox = geom.boundingBox;
    if (bbox) {
      console.log("[buildSmoothSilhouetteSkinMesh] bounding box:", {
        min: bbox.min,
        max: bbox.max,
        size: bbox.max.clone().sub(bbox.min)
      });
    }

    const skinMaterial =
      material ??
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0xF2CCBE),
        roughness: 0.48,
        metalness: 0.0,
        transmission: 0.25,
        thickness: 0.35,
        attenuationDistance: 0.8,
        attenuationColor: new THREE.Color(1.0, 0.6, 0.5),
        clearcoat: 0.3,
        clearcoatRoughness: 0.65,
        envMapIntensity: 0.75,
      });

    const mesh = new THREE.Mesh(geom, skinMaterial);
    mesh.name = "SmoothSilhouetteSkin";

    console.log("[buildSmoothSilhouetteSkinMesh] mesh created successfully");
    return mesh;
}