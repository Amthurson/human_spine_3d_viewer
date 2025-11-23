import { useEffect } from 'react'
import * as THREE from 'three'
import { applyTransform } from '../utils/pointCloudUtils'
import type { TransformParams, Point3D } from '../utils/pointCloudUtils'

interface SpinePointsProps {
  points: Point3D[]
  transformParams: TransformParams
  scene: THREE.Object3D
}

export default function SpinePoints({ points, transformParams, scene }: SpinePointsProps) {
  useEffect(() => {
    if (!points || points.length === 0) return

    // 应用变换
    const transformedPoints = points.map((p) => applyTransform(p, transformParams))

    // 创建红色球体材质（增强反光）
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      metalness: 0.6, // 从0.3增加到0.6
      roughness: 0.3, // 从0.7降低到0.3，让反光更明显
      emissive: 0x440000, // 从0x330000增加到0x440000
      emissiveIntensity: 0.4, // 从0.3增加到0.4
      envMapIntensity: 1.5, // 增加环境光反射
    })

    // 创建较大的球体几何体
    const spineSphereGeometry = new THREE.SphereGeometry(0.02, 16, 16)

    // 创建脊柱点组
    const spineGroup = new THREE.Group()

    // 为每个脊柱点创建球体
    transformedPoints.forEach((point, index) => {
      const sphere = new THREE.Mesh(spineSphereGeometry, spineMaterial)
      sphere.position.copy(point)
      sphere.userData.index = index
      spineGroup.add(sphere)
    })

    scene.add(spineGroup)

    // 创建连接线
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff6600,
      linewidth: 2,
    })

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(transformedPoints)
    const line = new THREE.Line(lineGeometry, lineMaterial)
    scene.add(line)

    return () => {
      scene.remove(spineGroup)
      scene.remove(line)
      spineGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) {
            child.material.dispose()
          }
        }
      })
      lineGeometry.dispose()
      lineMaterial.dispose()
    }
  }, [points, transformParams, scene])

  return null
}

