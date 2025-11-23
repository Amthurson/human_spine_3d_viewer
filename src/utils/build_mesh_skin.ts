import * as THREE from 'three'
import type { TransformParams } from './pointCloudUtils'

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
    };
    
    // 调试：检查采样结果
    if (ix < 5 && iy < 5) {
        console.log(`sampleColorFromGrid:`, {
            x, y, u, v, fx, fy, ix, iy,
            idx00, idx10, idx01, idx11,
            r00, r10, r01, r11, r,
            result
        });
    }
    
    return result;
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
}): THREE.Mesh | null => {
    // 调试：检查颜色图的前几个值
    let validColorCount = 0;
    for (let i = 0; i < Math.min(100, colorMapR.length); i++) {
        if (validMask[i] && (colorMapR[i] > 0 || colorMapG[i] > 0 || colorMapB[i] > 0)) {
            validColorCount++;
            if (validColorCount <= 5) {
                console.log(`颜色图[${i}]:`, { r: colorMapR[i], g: colorMapG[i], b: colorMapB[i], valid: validMask[i] });
            }
        }
    }
    console.log(`颜色图有效值数量: ${validColorCount}/${colorMapR.length}`);
    const positions = [];
    const colors = [];
    const indices   = [];
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
            
            // 调试：检查前几个顶点的颜色
            if (positions.length / 3 < 5) {
                console.log('采样颜色:', { 
                    cx, cy, 
                    col, 
                    colR: col?.r,
                    colG: col?.g,
                    colB: col?.b,
                    colType: typeof col,
                    colKeys: Object.keys(col || {}),
                    u: (cx - (xMin - xCenter)) / widthX, 
                    v: (cy - (yMin - yCenter)) / heightY 
                });
            }
            
            // 确保颜色值有效（避免变量名冲突，使用不同的变量名）
            const colorR = (col && typeof col.r === 'number' && !Number.isNaN(col.r)) ? col.r : 1;
            const colorG = (col && typeof col.g === 'number' && !Number.isNaN(col.g)) ? col.g : 1;
            const colorB = (col && typeof col.b === 'number' && !Number.isNaN(col.b)) ? col.b : 1;
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
            const z00 = heightMap[g00];
            const zs  = [heightMap[g10], heightMap[g01], heightMap[g11]];
            let maxDz = 0;
            for (const z of zs) maxDz = Math.max(maxDz, Math.abs(z - z00));
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

    if (!positions.length) return null;

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

    const material = new THREE.MeshPhysicalMaterial({
        // color: 0xffffff,
        metalness: 0,
        roughness: 1,
        clearcoat: 0.2,
        clearcoatRoughness: 0.6,
        transparent: true,
        opacity: skinOpacity,
        envMapIntensity: 2,
        side: THREE.BackSide,  // 双面渲染
        vertexColors: true  // 启用顶点颜色
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}