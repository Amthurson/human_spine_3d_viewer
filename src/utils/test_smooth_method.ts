import * as THREE from 'three';

/**
 * 从点云xy中心点开始，在xy平面上进行圆形扩散
 * @param transformedPoints 变换后的点云数据
 * @param scene Three.js 场景对象
 * @param onProgress 进度回调函数（可选）
 */
export const testSmoothMethod = (
  transformedPoints: THREE.Vector3[],
  scene: THREE.Scene | THREE.Object3D,
  onProgress?: (progress: number) => void
) => {
  if (!transformedPoints || transformedPoints.length === 0) {
    console.warn('点云数据为空');
    return;
  }

  // 1. 计算点云的xy边界和中心点
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  transformedPoints.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  });

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const center = new THREE.Vector3(centerX, centerY, centerZ);

  // 2. 计算初始半径：max_x - min_x 的 0.5%
  // 如果初始半径太小，至少保证能找到一些点
  const baseRadius = (maxX - minX) * 0.001;
  const minInitialRadius = Math.max(baseRadius, (maxX - minX) * 0.0005); // 至少0.1%
  const initialRadius = minInitialRadius;

  // 3. 创建高亮点组
  const highlightGroup = new THREE.Group();
  scene.add(highlightGroup);

  // 4. 使用 THREE.Points 来高效标记点
  // 4a. 红色点（采样点）的几何体和材质
  const redPointsGeometry = new THREE.BufferGeometry();
  const redPointsPositions = new Float32Array(transformedPoints.length * 3);
  const redPointsColors = new Float32Array(transformedPoints.length * 3);
  let redPointsCount = 0;
  redPointsGeometry.setAttribute('position', new THREE.BufferAttribute(redPointsPositions, 3));
  redPointsGeometry.setAttribute('color', new THREE.BufferAttribute(redPointsColors, 3));

  // 4b. 黄色点（范围点）的几何体和材质
  const yellowPointsGeometry = new THREE.BufferGeometry();
  const yellowPointsPositions = new Float32Array(transformedPoints.length * 3);
  const yellowPointsColors = new Float32Array(transformedPoints.length * 3);
  let yellowPointsCount = 0;
  yellowPointsGeometry.setAttribute('position', new THREE.BufferAttribute(yellowPointsPositions, 3));
  yellowPointsGeometry.setAttribute('color', new THREE.BufferAttribute(yellowPointsColors, 3));

  // 4c. 创建 Points 材质
  const redPointsMaterial = new THREE.PointsMaterial({
    color: 0xff0000,
    size: 0.002,
    sizeAttenuation: true,
    vertexColors: true, // 启用顶点颜色
  });

  const yellowPointsMaterial = new THREE.PointsMaterial({
    color: 0xffff00,
    size: 0.001,
    sizeAttenuation: true,
    vertexColors: true, // 启用顶点颜色
  });

  // 4d. 创建 Points 对象
  const redPoints = new THREE.Points(redPointsGeometry, redPointsMaterial);
  const yellowPoints = new THREE.Points(yellowPointsGeometry, yellowPointsMaterial);
  highlightGroup.add(redPoints);
  highlightGroup.add(yellowPoints);

  // 5. 用于存储已覆盖的点索引（红色高亮的点）
  const coveredIndices = new Set<number>();
  // 5b. 用于存储半径范围内但未被选中的点索引（黄色高亮的点）
  const rangeHighlightedIndices = new Set<number>();
  // 5c. 用于跟踪点的索引映射（避免重复）
  const pointIndexToRedIndex = new Map<number, number>(); // 原索引 -> 红色点数组索引
  const pointIndexToYellowIndex = new Map<number, number>(); // 原索引 -> 黄色点数组索引

  // 6. 定义8个方向，每个方向45度
  const directions = [
    0,      // 0° (右)
    Math.PI / 4,   // 45°
    Math.PI / 2,   // 90° (上)
    3 * Math.PI / 4,  // 135°
    Math.PI,       // 180° (左)
    5 * Math.PI / 4,  // 225°
    3 * Math.PI / 2,  // 270° (下)
    7 * Math.PI / 4,  // 315°
  ];

  // 7. 每个方向的角度范围（±22.5度）
  const angleRange = Math.PI / 8; // 22.5度

  // 8. Z变化阈值（用于检测突变）
  const zThreshold = (maxZ - minZ) * 0.1; // 10%的z范围作为阈值

  // 9. 为每个方向创建扩散路径
  interface DirectionState {
    direction: number;
    currentPoint: THREE.Vector3 | null;
    currentIndex: number | null;
    lastZ: number;
    isActive: boolean;
    searchRadius: number; // 当前搜索半径
    currentColor: THREE.Color; // 当前迭代的随机颜色
  }

  // 9a. 生成随机颜色
  const generateRandomColor = (): THREE.Color => {
    const hue = Math.random(); // 0-1
    const saturation = 0.7 + Math.random() * 0.3; // 0.7-1.0
    const lightness = 0.5 + Math.random() * 0.3; // 0.5-0.8
    return new THREE.Color().setHSL(hue, saturation, lightness);
  };

  const maxRadius = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2); // 最大可能半径
  const radiusStep = Math.max(initialRadius * 50, maxRadius * 0.02); // 每次扩大搜索范围的步长

  const directionStates: DirectionState[] = directions.map((dir) => ({
    direction: dir,
    currentPoint: center.clone(),
    currentIndex: -1, // -1 表示中心点
    lastZ: centerZ,
    isActive: true,
    searchRadius: initialRadius, // 初始搜索半径
    currentColor: generateRandomColor(), // 初始随机颜色
  }));

  // 10. 计算点到中心的角度（在xy平面）
  const getAngle = (point: THREE.Vector3): number => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return Math.atan2(dy, dx);
  };

  // 11. 计算点到中心的距离（在xy平面）
  const getDistance = (point: THREE.Vector3): number => {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 12. 检查点是否在指定方向的角度范围内
  const isInDirection = (point: THREE.Vector3, targetDir: number): boolean => {
    const angle = getAngle(point);
    let diff = angle - targetDir;
    // 归一化到 [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= angleRange;
  };

  // 13. 检查点是否超出边界
  const isOutOfBounds = (point: THREE.Vector3): boolean => {
    return point.x < minX || point.x > maxX || point.y < minY || point.y > maxY;
  };

  // 14. 更新 Points 几何体
  const updatePointsGeometry = () => {
    // 更新红色点
    const redPositionAttr = redPointsGeometry.getAttribute('position') as THREE.BufferAttribute;
    const redColorAttr = redPointsGeometry.getAttribute('color') as THREE.BufferAttribute;
    if (redPositionAttr) redPositionAttr.needsUpdate = true;
    if (redColorAttr) redColorAttr.needsUpdate = true;
    redPointsGeometry.setDrawRange(0, redPointsCount);

    // 更新黄色点
    const yellowPositionAttr = yellowPointsGeometry.getAttribute('position') as THREE.BufferAttribute;
    const yellowColorAttr = yellowPointsGeometry.getAttribute('color') as THREE.BufferAttribute;
    if (yellowPositionAttr) yellowPositionAttr.needsUpdate = true;
    if (yellowColorAttr) yellowColorAttr.needsUpdate = true;
    yellowPointsGeometry.setDrawRange(0, yellowPointsCount);
  };

  // 14a. 高亮一个点（红色，采样的点）
  const highlightPoint = (point: THREE.Vector3, index: number) => {
    if (coveredIndices.has(index)) return;
    
    // 如果这个点之前被黄色高亮，需要从黄色点中移除
    if (rangeHighlightedIndices.has(index)) {
      const yellowIndex = pointIndexToYellowIndex.get(index);
      if (yellowIndex !== undefined) {
        // 移除黄色点：将最后一个点移到这个位置
        const lastIndex = yellowPointsCount - 1;
        if (yellowIndex < lastIndex) {
          // 复制最后一个点的数据到当前位置
          yellowPointsPositions[yellowIndex * 3] = yellowPointsPositions[lastIndex * 3];
          yellowPointsPositions[yellowIndex * 3 + 1] = yellowPointsPositions[lastIndex * 3 + 1];
          yellowPointsPositions[yellowIndex * 3 + 2] = yellowPointsPositions[lastIndex * 3 + 2];
          yellowPointsColors[yellowIndex * 3] = yellowPointsColors[lastIndex * 3];
          yellowPointsColors[yellowIndex * 3 + 1] = yellowPointsColors[lastIndex * 3 + 1];
          yellowPointsColors[yellowIndex * 3 + 2] = yellowPointsColors[lastIndex * 3 + 2];
          
          // 更新最后一个点的索引映射
          // 需要找到最后一个点对应的原索引
          for (const [origIndex, idx] of pointIndexToYellowIndex.entries()) {
            if (idx === lastIndex) {
              pointIndexToYellowIndex.set(origIndex, yellowIndex);
              break;
            }
          }
        }
        yellowPointsCount--;
        pointIndexToYellowIndex.delete(index);
      }
      rangeHighlightedIndices.delete(index);
    }

    // 添加到红色点
    coveredIndices.add(index);
    const redIndex = redPointsCount++;
    pointIndexToRedIndex.set(index, redIndex);
    
    redPointsPositions[redIndex * 3] = point.x;
    redPointsPositions[redIndex * 3 + 1] = point.y;
    redPointsPositions[redIndex * 3 + 2] = point.z;
    
    redPointsColors[redIndex * 3] = 1.0; // R
    redPointsColors[redIndex * 3 + 1] = 0.0; // G
    redPointsColors[redIndex * 3 + 2] = 0.0; // B

    updatePointsGeometry();
  };

  // 14b. 高亮半径范围内的点（使用随机颜色，未被选中的点）
  const highlightRangePoint = (point: THREE.Vector3, index: number, color: THREE.Color) => {
    // 如果已经被红色高亮，跳过
    if (coveredIndices.has(index)) return;
    // 如果已经被黄色高亮，跳过（避免重复标记）
    if (rangeHighlightedIndices.has(index)) return;
    
    rangeHighlightedIndices.add(index);
    const yellowIndex = yellowPointsCount++;
    pointIndexToYellowIndex.set(index, yellowIndex);
    
    yellowPointsPositions[yellowIndex * 3] = point.x;
    yellowPointsPositions[yellowIndex * 3 + 1] = point.y;
    yellowPointsPositions[yellowIndex * 3 + 2] = point.z;
    
    // 使用传入的随机颜色
    yellowPointsColors[yellowIndex * 3] = color.r;
    yellowPointsColors[yellowIndex * 3 + 1] = color.g;
    yellowPointsColors[yellowIndex * 3 + 2] = color.b;

    updatePointsGeometry();
  };

  // 15. 高亮中心点
  highlightPoint(center, -1);

  // 16. 找到每个方向的下一个点，并高亮半径范围内的点
  const findNextPoint = (state: DirectionState): { point: THREE.Vector3 | null; index: number | null; shouldExpand: boolean } => {
    if (!state.isActive) return { point: null, index: null, shouldExpand: false };

    // 如果是第一次迭代（从中心点开始），在初始半径范围内找点
    const isFirstIteration = state.currentIndex === -1;
    const currentRadius = isFirstIteration ? 0 : getDistance(state.currentPoint!);
    
    // 每次迭代生成新的随机颜色（每个扩散圆使用不同颜色）
    state.currentColor = generateRandomColor();
    
    // 计算搜索半径：逐步扩大搜索范围
    const searchMinRadius = isFirstIteration ? 0 : currentRadius + 0.0001; // 必须比当前点更远（小误差）
    const searchMaxRadius = state.searchRadius; // 使用该方向的当前搜索半径

    let bestPoint: THREE.Vector3 | null = null;
    let bestIndex: number | null = null;
    let bestDistance = searchMinRadius;

    // 用于收集半径范围内但未被选中的点
    const rangePoints: Array<{ point: THREE.Vector3; index: number }> = [];

    for (let i = 0; i < transformedPoints.length; i++) {
      // 如果已经被红色高亮，跳过
      if (coveredIndices.has(i)) continue;

      const point = transformedPoints[i];
      const dist = getDistance(point);

      // 必须在搜索半径范围内
      if (dist < searchMinRadius) continue;
      if (dist > searchMaxRadius) continue;

      // 必须在正确的方向角度范围内
      if (!isInDirection(point, state.direction)) continue;

      // 检查是否超出边界
      if (isOutOfBounds(point)) continue;

      // 检查z变化是否突变（如果不是第一次迭代）
      if (!isFirstIteration) {
        const zDiff = Math.abs(point.z - state.lastZ);
        if (zDiff > zThreshold) {
          // z变化突变，添加到范围高亮点（使用随机颜色）
          rangePoints.push({ point, index: i });
          continue;
        }
      }

      // 选择离圆心最远的点（在该方向的45度范围内，且在搜索半径内）
      if (dist > bestDistance) {
        bestDistance = dist;
        bestPoint = point;
        bestIndex = i;
      } else {
        // 其他在半径范围内但未被选中的点，添加到范围高亮点
        rangePoints.push({ point, index: i });
      }
    }

    // 高亮半径范围内但未被选中的点（使用当前迭代的随机颜色）
    rangePoints.forEach(({ point, index }) => {
      highlightRangePoint(point, index, state.currentColor);
    });

    // 如果没找到点，需要扩大搜索半径
    const shouldExpand = !bestPoint && state.searchRadius < maxRadius;

    return { point: bestPoint, index: bestIndex, shouldExpand };
  };

  // 17. 扩散迭代函数
  let iteration = 0;
  const maxIterations = 10000; // 防止无限循环

  const spreadIteration = () => {
    let hasProgress = false;

    // 每次迭代处理所有方向
    directionStates.forEach((state) => {
      if (!state.isActive) return;

      const { point, index, shouldExpand } = findNextPoint(state);

      if (point && index !== null) {
        // 找到下一个点
        state.currentPoint = point;
        state.currentIndex = index;
        state.lastZ = point.z;
        // 扩大搜索半径，为下次迭代做准备
        state.searchRadius = Math.min(getDistance(point) + radiusStep, maxRadius);
        highlightPoint(point, index);
        hasProgress = true;
      } else if (shouldExpand) {
        // 没找到点，但可以扩大搜索半径
        state.searchRadius = Math.min(state.searchRadius + radiusStep, maxRadius);
        // 如果搜索半径已经达到最大，停止该方向
        if (state.searchRadius >= maxRadius - 0.0001) {
          state.isActive = false;
        } else {
          hasProgress = true; // 继续尝试
        }
      } else {
        // 该方向没有更多点，停止
        state.isActive = false;
      }
    });

    // 检查是否所有方向都停止
    const activeCount = directionStates.filter((s) => s.isActive).length;

    if (onProgress) {
      const totalPoints = transformedPoints.length;
      const coveredCount = coveredIndices.size;
      onProgress(coveredCount / totalPoints);
    }

    iteration++;

    if (hasProgress && iteration < maxIterations && activeCount > 0) {
      // 使用 requestAnimationFrame 实现实时渲染
      requestAnimationFrame(spreadIteration);
    } else {
      const activeCount = directionStates.filter((s) => s.isActive).length;
      console.log(`扩散完成，共覆盖 ${coveredIndices.size} 个点，迭代 ${iteration} 次，活跃方向 ${activeCount} 个`);
      console.log(`初始半径: ${initialRadius.toFixed(6)}, 最大半径: ${maxRadius.toFixed(6)}, 半径步长: ${radiusStep.toFixed(6)}`);
    }
  };

  // 18. 开始扩散
  spreadIteration();

  // 19. 返回清理函数
  return () => {
    redPointsGeometry.dispose();
    yellowPointsGeometry.dispose();
    if (redPointsMaterial instanceof THREE.Material) {
      redPointsMaterial.dispose();
    }
    if (yellowPointsMaterial instanceof THREE.Material) {
      yellowPointsMaterial.dispose();
    }
    scene.remove(highlightGroup);
  };
};