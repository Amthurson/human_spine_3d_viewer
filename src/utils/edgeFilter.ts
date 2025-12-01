export interface Point3D {
    x: number
    y: number
    z: number
  }
  
  export interface EdgeFilterOptions {
    /**
     * 在 XY 平面划分的网格分辨率（gridSize x gridSize）
     * 越大越精细，越小越快。128~256 一般够用。
     */
    gridSize?: number
  
    /**
     * 搜索邻居的网格半径（以 cell 为单位）
     * 1 表示 3x3 区域，2 表示 5x5。
     */
    radiusCells?: number
  
    /**
     * Z 方向的阈值，单位用你当前坐标系的米/毫米
     * 例如点云是“米”为单位，0.01 = 1cm。
     */
    dzThreshold?: number
  
    /**
     * 判断“不是孤立边缘点”所需的最小邻居数量
     */
    minNeighbors?: number
  }
  
  export interface EdgeFilterResult {
    /** 长度 = 点数，true 表示保留，false 表示剔除 */
    keepMask: Uint8Array
    /** 被剔除点的索引列表（方便你调试画出来） */
    removedIndices: number[]
  }
  
  /**
   * 标记“平滑后在边缘乱飞”的异常点
   *
   * rawPoints    : 原始点云（未平滑）
   * smoothPoints : 平滑后的点云（和 rawPoints 一一对应）
   */
  export function markEdgeOutliers(
    rawPoints: Point3D[],
    smoothPoints: Point3D[],
    options: EdgeFilterOptions = {}
  ): EdgeFilterResult {
    const N = rawPoints.length
    if (smoothPoints.length !== N) {
      throw new Error('rawPoints 和 smoothPoints 长度不一致')
    }
  
    const gridSize = options.gridSize ?? 128
    const radiusCells = options.radiusCells ?? 1
    const dzThreshold = options.dzThreshold ?? 0.015 // 默认 1.5cm
    const minNeighbors = options.minNeighbors ?? 8
  
    if (N === 0) {
      return { keepMask: new Uint8Array(0), removedIndices: [] }
    }
  
    // 1. 计算 XY 的边界框
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (let i = 0; i < N; i++) {
      const p = rawPoints[i]
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const widthX = maxX - minX || 1
    const heightY = maxY - minY || 1
  
    // 2. 建一个 grid，把每个点的索引丢到对应的 cell 里
    // oxlint-disable-next-line no-new-array
    const cellPoints: number[][] = new Array(gridSize * gridSize)
    for (let i = 0; i < cellPoints.length; i++) cellPoints[i] = []
  
    const cellIndexOf = (ix: number, iy: number) => iy * gridSize + ix
  
    const pointCellX = new Int16Array(N)
    const pointCellY = new Int16Array(N)
  
    for (let i = 0; i < N; i++) {
      const p = rawPoints[i]
      const u = (p.x - minX) / widthX
      const v = (p.y - minY) / heightY
      const ix = Math.min(gridSize - 1, Math.max(0, Math.floor(u * gridSize)))
      const iy = Math.min(gridSize - 1, Math.max(0, Math.floor(v * gridSize)))
      pointCellX[i] = ix
      pointCellY[i] = iy
      cellPoints[cellIndexOf(ix, iy)].push(i)
    }
  
    // 3. 遍历每个点，检查它周围邻居的“原始 z”情况
    const keepMask = new Uint8Array(N)
    keepMask.fill(1)
  
    const removed: number[] = []
  
    const neighborIndices: number[] = []
  
    for (let i = 0; i < N; i++) {
      const ix0 = pointCellX[i]
      const iy0 = pointCellY[i]
  
      neighborIndices.length = 0
  
      for (let dy = -radiusCells; dy <= radiusCells; dy++) {
        const iy = iy0 + dy
        if (iy < 0 || iy >= gridSize) continue
        for (let dx = -radiusCells; dx <= radiusCells; dx++) {
          const ix = ix0 + dx
          if (ix < 0 || ix >= gridSize) continue
          const cellIdx = cellIndexOf(ix, iy)
          const arr = cellPoints[cellIdx]
          for (let k = 0; k < arr.length; k++) {
            const idx = arr[k]
            // 不要把自己也算进去的话可以加一个判断（一般问题不大）
            neighborIndices.push(idx)
          }
        }
      }
  
      const neighborCount = neighborIndices.length
  
      // 邻居很多，说明这是"内部点"，基本不可能错到飞出去，直接保留
      if (neighborCount >= minNeighbors * 3) {
        continue
      }
  
      if (neighborCount < minNeighbors) {
        // 典型边缘/稀疏区域 —— 我们在这里更严格地检查 dz
        // 统计邻居原始 z 的均值（或者中位数）
        let sumZ = 0
        for (let n = 0; n < neighborCount; n++) {
          sumZ += rawPoints[neighborIndices[n]].z
        }
        const meanZ = sumZ / (neighborCount || 1)
  
        // const zRaw = rawPoints[i].z
        const zSmooth = smoothPoints[i].z
        const dz = zSmooth - meanZ
  
        // 绝对差值太大，并且方向和“本地均值”相反，就认为是“翻过去”的异常点
        if (Math.abs(dz) > dzThreshold) {
          keepMask[i] = 0
          removed.push(i)
        }
  
        continue
      }
  
      // 中间状态：邻居数量适中，查一下 dz 是否超级离谱
      let sumZ = 0
      for (let n = 0; n < neighborCount; n++) {
        sumZ += rawPoints[neighborIndices[n]].z
      }
      const meanZ = sumZ / neighborCount
  
      const zSmooth = smoothPoints[i].z
      const dz = zSmooth - meanZ
  
      // 在内部区域阈值可以宽一点
      if (Math.abs(dz) > dzThreshold * 2.0) {
        keepMask[i] = 0
        removed.push(i)
      }
    }
  
    console.log('[edgeFilter] removed points:', removed.length, '/', N)
  
    return { keepMask, removedIndices: removed }
  }

  export function markEdgeOutliersSimple(
    rawPoints: Point3D[],
    smoothPoints: Point3D[],
    options: EdgeFilterOptions = {}
  ): EdgeFilterResult {
    const N = rawPoints.length
    if (smoothPoints.length !== N) {
      throw new Error('rawPoints 和 smoothPoints 长度不一致')
    }
    const dzThreshold = options.dzThreshold ?? 0.015 // 默认 1.5cm
    // 直接比较原始点云和平滑后的点云的z值，如果z值相差太大，则认为是异常点
    const keepMask = new Uint8Array(N)
    keepMask.fill(1)
    const removed: number[] = []
    for (let i = 0; i < N; i++) {
      const zRaw = rawPoints[i].z
      const zSmooth = smoothPoints[i].z
      if (Math.abs(zRaw - zSmooth) > dzThreshold) {
        keepMask[i] = 0
        removed.push(i)
      }
    }
    console.log('[edgeFilter2] removed points:', removed.length, '/', N)
    return { keepMask, removedIndices: removed }
  }