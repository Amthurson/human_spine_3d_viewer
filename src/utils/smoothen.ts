import type { Point3D } from "./pointCloudUtils";

export const getHeightMapByRawPoints = ({rawPoints, humanColors, nx, ny}: {rawPoints: Point3D[], humanColors?: { r: number, g: number, b: number }[], nx: number, ny: number}): { heightMap: Float32Array, validMask: Uint8Array, colorMapR: Float32Array, colorMapG: Float32Array, colorMapB: Float32Array, xMin: number, xMax: number, yMin: number, yMax: number, widthX: number, heightY: number, N: number, zMax: number, zMin: number } => {
    // ======== 3. 将 rawPoints 转为 Float32Array，并计算 XY 范围 ========
    const N = rawPoints.length;

    let xMin = +Infinity, xMax = -Infinity;
    let yMin = +Infinity, yMax = -Infinity;

    for (let i = 0; i < N; i++) {
        const p = rawPoints[i];
        // positionsOriginal[i * 3]     = p.x;
        // positionsOriginal[i * 3 + 1] = p.y;
        // positionsOriginal[i * 3 + 2] = p.z;

        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
    }

    const widthX = xMax - xMin || 1.0;
    const heightY = yMax - yMin || 1.0;

    // 计算中心（用于中心化坐标，与HTML实现保持一致）
    const xCenter = (xMin + xMax) / 2;
    const yCenter = (yMin + yMax) / 2;

    const heightMap = new Float32Array(nx * ny);
    const countGrid = new Uint16Array(nx * ny);
    const validMask = new Uint8Array(nx * ny);
    // 颜色映射：存储每个网格单元的 RGB 累加值
    const colorMapR = new Float32Array(nx * ny);
    const colorMapG = new Float32Array(nx * ny);
    const colorMapB = new Float32Array(nx * ny);

    let zMax = -Infinity, zMin = +Infinity;
    for (let i = 0; i < N; i++) {
        const p = rawPoints[i];
        if (p.z > zMax) zMax = p.z;
        if (p.z < zMin) zMin = p.z;
    }
    for (let i = 0; i < heightMap.length; i++) {
        heightMap[i] = NaN;
        countGrid[i] = 0;
        validMask[i] = 0;
        colorMapR[i] = 0;
        colorMapG[i] = 0;
        colorMapB[i] = 0;
    }

    function gridIndex(ix: number, iy: number) {
        return iy * nx + ix;
    }

    // 把点投射到规则网格（使用中心化后的坐标，与HTML实现保持一致）
    for (let i = 0; i < N; i++) {
        const { x, y, z } = rawPoints[i];
        
        // 中心化坐标
        const cx = x - xCenter;
        const cy = y - yCenter;

        // 使用中心化后的坐标计算网格索引（与HTML实现一致）
        const u = (cx - (xMin - xCenter)) / (widthX || 1.0);
        const v = (cy - (yMin - yCenter)) / (heightY || 1.0);

        const ix = Math.floor(u * (nx - 1));
        const iy = Math.floor(v * (ny - 1));

        if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;

        const idx = gridIndex(ix, iy);
        if (Number.isNaN(heightMap[idx])) {
            heightMap[idx] = z;
            countGrid[idx] = 1;
        } else {
            heightMap[idx] += z;
            countGrid[idx]++;
        }

        // 处理颜色（支持对象格式 {r, g, b} 和数组格式 [r, g, b]）
        const col = humanColors?.[i];
        
        // 调试：检查前几个点的颜色数据
        if (i < 5) {
            console.log(`点[${i}]原始颜色数据:`, { 
                hasHumanColors: !!humanColors, 
                humanColorsLength: humanColors?.length,
                col, 
                colType: typeof col,
                isArray: Array.isArray(col)
            });
        }
        
        let r: number, g: number, b: number;
        if (!col) {
            // 如果没有颜色数据，使用默认白色
            r = g = b = 1;
        } else if (Array.isArray(col)) {
            // 数组格式 [r, g, b]
            r = (col[0] ?? 255) / 255;
            g = (col[1] ?? 255) / 255;
            b = (col[2] ?? 255) / 255;
        } else if (typeof col === 'object' && col !== null) {
            // 对象格式 {r, g, b}
            r = (col.r ?? 255) / 255;
            g = (col.g ?? 255) / 255;
            b = (col.b ?? 255) / 255;
        } else {
            // 其他情况，使用默认白色
            r = g = b = 1;
        }
        
        // 调试：检查处理后的颜色值
        if (i < 5) {
            console.log(`点[${i}]处理后颜色:`, { r, g, b, idx, ix, iy });
        }
        
        colorMapR[idx] += r;
        colorMapG[idx] += g;
        colorMapB[idx] += b;
    }

    // 同一格多点 -> 取平均 z
    let validSum = 0;
    let validCount = 0;
    let colorSampleCount = 0;
    for (let i = 0; i < heightMap.length; i++) {
        if (countGrid[i] > 0) {
            heightMap[i] /= countGrid[i];
            // 计算平均颜色
            colorMapR[i] /= countGrid[i];
            colorMapG[i] /= countGrid[i];
            colorMapB[i] /= countGrid[i];
            // 设置有效掩码
            validMask[i] = 1;
            validSum += heightMap[i];
            validCount++;
            
            // 调试：检查前几个有效网格的颜色
            if (colorSampleCount < 5 && (colorMapR[i] > 0 || colorMapG[i] > 0 || colorMapB[i] > 0)) {
                console.log(`颜色图网格[${i}]:`, { r: colorMapR[i], g: colorMapG[i], b: colorMapB[i], count: countGrid[i] });
                colorSampleCount++;
            }
        }
    }
    console.log(`颜色图统计: 有效网格=${validCount}, 有颜色的网格=${colorSampleCount}`);

    // 填补无数据格子（用全局平均高度）
    const globalMean = validCount > 0 ? validSum / validCount : 0;
    for (let i = 0; i < heightMap.length; i++) {
        if (Number.isNaN(heightMap[i])) {
            heightMap[i] = globalMean;
        }
    }
    return { heightMap, validMask, colorMapR, colorMapG, colorMapB, xMin, xMax, yMin, yMax, widthX, heightY, N, zMax, zMin };
}

// ======== 5. 双边滤波（简化版，JS 实现） ========
function bilateralFilterHeight(heightIn: Float32Array, nx: number, ny: number, radius: number, sigmaSpace: number, sigmaDepth: number, iterations: number) {
    iterations = iterations || 1;
    const out = new Float32Array(nx * ny);
    const twoSigmaSpace2 = 2 * sigmaSpace * sigmaSpace;
    const twoSigmaDepth2 = 2 * sigmaDepth * sigmaDepth;
    const heightOut = heightIn;

    function idx(ix: number, iy: number) {
        return iy * nx + ix;
    }

    let src = heightOut;
    let dst: Float32Array = out;

    for (let it = 0; it < iterations; it++) {
        for (let iy = 0; iy < ny; iy++) {
            for (let ix = 0; ix < nx; ix++) {
                const centerIdx = idx(ix, iy);
                const centerZ = src[centerIdx];
                let sumW = 0;
                let sumZ = 0;
                for (let dy = -radius; dy <= radius; dy++) {
                    const yy = iy + dy;
                    if (yy < 0 || yy >= ny) continue;

                    for (let dx = -radius; dx <= radius; dx++) {
                    const xx = ix + dx;
                    if (xx < 0 || xx >= nx) continue;

                    const nIdx = idx(xx, yy);
                    const nZ = src[nIdx];

                    const ds2 = dx * dx + dy * dy;
                    const dz = nZ - centerZ;
                    const dd2 = dz * dz;

                    const wSpace = Math.exp(-ds2 / twoSigmaSpace2);
                    const wDepth = Math.exp(-dd2 / twoSigmaDepth2);
                    const w = wSpace * wDepth;

                    sumW += w;
                    sumZ += w * nZ;
                    }
                }
                dst[centerIdx] = sumW > 0 ? sumZ / sumW : centerZ;
            }
        }

        // 交换输入/输出，进行下一轮迭代
        const tmp = src;
        src = dst;
        dst = tmp;
    }

    // 如果最后结果不在原数组上，拷回去
    if (src !== heightOut) {
        heightOut.set(src);
    }

    return heightOut;
}



// ======== 6. 将平滑后的高度图采样回原始点云，得到 smoothed positions ========
function sampleHeightFromGrid(heightMapFiltered: Float32Array, x: number, y: number, nx: number, ny: number, widthX: number, heightY: number, xMin: number, yMin: number) {
        // 归一化到 [0, 1]
        const u = (x - xMin) / widthX;
        const v = (y - yMin) / heightY;

        // 映射到 [0, nx-1], [0, ny-1] 的连续坐标
        const fx = u * (nx - 1);
        const fy = v * (ny - 1);

        let ix = Math.floor(fx);
        let iy = Math.floor(fy);
        const tx = fx - ix;   // x 方向插值因子 [0,1)
        const ty = fy - iy;   // y 方向插值因子 [0,1)

        // 边界 clamp
        ix = Math.max(0, Math.min(nx - 1, ix));
        iy = Math.max(0, Math.min(ny - 1, iy));
        const ix1 = Math.min(ix + 1, nx - 1);
        const iy1 = Math.min(iy + 1, ny - 1);

        const idx00 = iy  * nx + ix;
        const idx10 = iy  * nx + ix1;
        const idx01 = iy1 * nx + ix;
        const idx11 = iy1 * nx + ix1;

        const h00 = heightMapFiltered[idx00];
        const h10 = heightMapFiltered[idx10];
        const h01 = heightMapFiltered[idx01];
        const h11 = heightMapFiltered[idx11];

        // 先在 x 方向插值，再在 y 方向插值
        const h0 = h00 * (1 - tx) + h10 * tx;
        const h1 = h01 * (1 - tx) + h11 * tx;
        const h  = h0 * (1 - ty) + h1 * ty;

        return h;
}

/**
 * 平滑点云，使用双边滤波算法
 * @param rawPoints 原始点云
 * @returns 平滑后的点云
 */
export const smoothen = ({rawPoints, humanColors}: {rawPoints: Point3D[], humanColors?: { r: number, g: number, b: number }[]}): { smoothed: Point3D[], heightMapFiltered: Float32Array, validMask: Uint8Array, colorMapR: Float32Array, colorMapG: Float32Array, colorMapB: Float32Array, nx: number, ny: number, xMin: number, xMax: number, yMin: number, yMax: number, zMax: number, zMin: number } => {
    const nx = 128; // 网格分辨率，可视点数多时可改为 256
    const ny = 128;
    const radius = 1;               // 邻域半径（3~5）
    const sigmaSpace = 1.5;         // 空间距离权重
    const iterations = 1;           // 迭代次数，1~2 一般够

    // ======== 4. 构建 2.5D 高度图 height(x, y) ========
    const {heightMap, validMask, colorMapR, colorMapG, colorMapB, widthX, heightY, xMin, xMax, yMin, yMax, N, zMax, zMin} = getHeightMapByRawPoints({rawPoints, humanColors, nx, ny});

    // 估计高度范围，用于 sigmaDepth
    let hMin = +Infinity, hMax = -Infinity;
    for (let i = 0; i < heightMap.length; i++) {
        if (heightMap[i] < hMin) hMin = heightMap[i];
        if (heightMap[i] > hMax) hMax = heightMap[i];
    }
    const hRange = hMax - hMin || 1.0;

    // 双边滤波参数：可以根据效果调整
    const sigmaDepth = hRange * 0.06; // 深度差权重（0.05~0.2 * hRange 试试）

    const heightMapFiltered = bilateralFilterHeight(heightMap, nx, ny, radius, sigmaSpace, sigmaDepth, iterations);
    
    const smoothed: Point3D[] = [];
    for (let i = 0; i < N; i++) {
      const { x, y } = rawPoints[i];
      const zSmooth = sampleHeightFromGrid(heightMapFiltered, x, y, nx, ny, widthX, heightY, xMin, yMin);
      smoothed.push({ x, y, z: zSmooth });
    }

    return { smoothed, heightMapFiltered, validMask, colorMapR, colorMapG, colorMapB,nx, ny, xMin, xMax, yMin, yMax, zMax, zMin };
}