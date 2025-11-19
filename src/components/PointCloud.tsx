import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { processPointCloud } from '../utils/pointCloudUtils'
import type { Point3D } from '../utils/pointCloudUtils'

interface PointCloudProps {
  points: Point3D[]
  opacity: number
  scene: THREE.Scene
  minOffset?: number
}

export default function PointCloud({ points, opacity, scene, minOffset = -0.55 }: PointCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null)
  const pointsDataRef = useRef<{ transformedPoints: THREE.Vector3[]; minZ: number; maxZ: number } | null>(null)

  useEffect(() => {
    if (!points || points.length === 0) return

    try {
      // 处理点云数据
      const { transformedPoints } = processPointCloud(points)
      const pointCount = transformedPoints.length

      // 创建 BufferGeometry
      const positions: number[] = []
      let maxZ = 0;
      let minZ = 0;
      transformedPoints.forEach((p) => {
        positions.push(p.x, p.y, p.z)
        if (p.z > maxZ) maxZ = p.z;
        if (p.z < minZ) minZ = p.z;
      })

      // 保存点云数据供后续使用
      pointsDataRef.current = { transformedPoints, minZ, maxZ }

      // 球体材质（半透明，增强反光）
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: 0x33aaff,
        metalness: 0.8, // 从0.7增加到0.8
        roughness: 0.5, // 从0.3降低到0.2，让反光更明显
        transparent: true,
        opacity,
        emissive: 0x001122, // 添加微弱的自发光
        emissiveIntensity: 0.6, // 从0增加到0.2
        envMapIntensity: 2, // 增加环境光反射
      })

      // 创建球体几何体
      const sphereGeometry = new THREE.SphereGeometry(0.008, 8, 8)

      // 使用 InstancedMesh 高效渲染
      const instancedMesh = new THREE.InstancedMesh(
        sphereGeometry,
        sphereMaterial,
        pointCount
      )

      const matrix = new THREE.Matrix4()
      transformedPoints.forEach((point, i) => {
        matrix.makeTranslation(point.x, point.y, point.z)
        const percent = (minOffset - point.z) / (minOffset - minZ);
        // 将 percent 映射到 0.3-1.0 范围，避免过暗的颜色
        const brightness = 0.3 + percent * 0.7;
        instancedMesh.setColorAt(i, new THREE.Color(brightness, brightness, brightness))
        instancedMesh.setMatrixAt(i, matrix)
      })

      instancedMesh.instanceMatrix.needsUpdate = true
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true
      }
      scene.add(instancedMesh)
      meshRef.current = instancedMesh

      return () => {
        if (meshRef.current) {
          scene.remove(meshRef.current)
          meshRef.current.dispose()
          meshRef.current = null
        }
      }
    } catch (error) {
      console.error('Error creating point cloud:', error)
    }
  }, [points, scene, minOffset, opacity])

  // 更新透明度
  useEffect(() => {
    if (meshRef.current && meshRef.current.material) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial
      material.opacity = opacity
    }
  }, [opacity])

  // 更新颜色（当 minOffset 改变时）
  useEffect(() => {
    if (!meshRef.current || !pointsDataRef.current) return

    const instancedMesh = meshRef.current
    const { transformedPoints, minZ } = pointsDataRef.current
    const matrix = new THREE.Matrix4()

    transformedPoints.forEach((point, i) => {
      matrix.makeTranslation(point.x, point.y, point.z)
      const percent = (minOffset - point.z) / (minOffset - minZ)
      // 将 percent 映射到 0.3-1.0 范围，避免过暗的颜色
      const brightness = 0.3 + percent * 0.7;
      instancedMesh.setColorAt(i, new THREE.Color(brightness, brightness, brightness))
      instancedMesh.setMatrixAt(i, matrix)
    })

    if (instancedMesh.instanceColor) {
      instancedMesh.instanceColor.needsUpdate = true
    }
    instancedMesh.instanceMatrix.needsUpdate = true
  }, [minOffset])

  return null
}

