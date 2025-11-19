import * as THREE from 'three'

/**
 * 点云数据接口
 */
export type Point3D = {
  x: number
  y: number
  z: number
}

/**
 * 变换参数接口
 */
export type TransformParams = {
  scaleFactor: number
  center: THREE.Vector3
}

/**
 * 处理点云数据，计算变换参数
 * @param points 原始点云数据
 * @param targetSize 目标尺寸（默认10）
 * @returns 变换参数和变换后的点
 */
export function processPointCloud(
  points: Point3D[],
  targetSize: number = 10
): { transformParams: TransformParams; transformedPoints: THREE.Vector3[] } {
  if (!points || points.length === 0) {
    throw new Error('点云数据为空')
  }

  // 转换为 THREE.Vector3 数组
  const threePoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z))

  // 计算边界框
  const box = new THREE.Box3()
  threePoints.forEach(p => box.expandByPoint(p))

  const size = new THREE.Vector3()
  box.getSize(size)
  const maxSide = Math.max(size.x, size.y, size.z)
  const scaleFactor = targetSize / maxSide

  const center = new THREE.Vector3()
  box.getCenter(center)

  // 应用缩放和居中变换
  const transformedPoints = threePoints.map(p => {
    const point = p.clone()
    point.multiplyScalar(scaleFactor)
    point.sub(center.clone().multiplyScalar(scaleFactor))
    return point
  })

  return {
    transformParams: {
      scaleFactor,
      center: center.clone().multiplyScalar(scaleFactor),
    },
    transformedPoints,
  }
}

/**
 * 应用变换到点
 * @param point 原始点
 * @param transformParams 变换参数
 * @returns 变换后的点
 */
export function applyTransform(
  point: Point3D,
  transformParams: TransformParams
): THREE.Vector3 {
  const threePoint = new THREE.Vector3(point.x, point.y, point.z)
  threePoint.multiplyScalar(transformParams.scaleFactor)
  threePoint.sub(transformParams.center)
  return threePoint
}
