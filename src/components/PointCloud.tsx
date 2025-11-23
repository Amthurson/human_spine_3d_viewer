import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { processPointCloud } from '../utils/pointCloudUtils'
import type { Point3D } from '../utils/pointCloudUtils'
import { smoothen } from '@/utils/smoothen'
import { buildHumanPatchMeshFromHeightMap } from '@/utils/build_mesh_skin'

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
}

export default function PointCloud({ points, opacity, skinOpacity, scene, pointType, humanColors, showPointCloud, showSkin, pointSize, showOriginalColor }: PointCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh | THREE.Points | null>(null)
  const humanPatchMeshRef = useRef<THREE.Mesh | null>(null)
  const pointsDataRef = useRef<{ transformedPoints: THREE.Vector3[]; minZ: number; maxZ: number } | null>(null)

  useEffect(() => {
    if (!points || points.length === 0) return

    const { smoothed: smoothedPoints, heightMapFiltered, validMask, colorMapR, colorMapG, colorMapB, nx, ny, xMin, xMax, yMin, yMax, zMax, zMin } = smoothen({rawPoints: points, humanColors})
    // 处理点云数据
    const { transformedPoints, transformParams } = processPointCloud(smoothedPoints)
    const N = transformedPoints.length;
    const positionsSmooth = new Float32Array(N * 3);
    const colorsSmooth    = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      // 平滑点云整体向右平移一点，方便对比
      positionsSmooth[i * 3]     = transformedPoints[i].x; // X 方向偏移
      positionsSmooth[i * 3 + 1] = transformedPoints[i].y;
      positionsSmooth[i * 3 + 2] = transformedPoints[i].z;

      const col = humanColors?.[i] || { r: 255, g: 255, b: 255 };
      const r = (col.r !== undefined ? col.r : 255) / 255;
      const g = (col.g !== undefined ? col.g : 255) / 255;
      const b = (col.b !== undefined ? col.b : 255) / 255;

      colorsSmooth[i * 3]     = r;
      colorsSmooth[i * 3 + 1] = g;
      colorsSmooth[i * 3 + 2] = b;
    }

    try {
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

      // 创建球体几何体
      let sphereGeometry: THREE.BufferGeometry
      if (pointType === 'sphere') {
        console.log('创建球体几何体')
        // 球体材质（半透明，增强反光）
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.8, // 从0.7增加到0.8
          roughness: 0.45, // 从0.3降低到0.2，让反光更明显
          transparent: true,
          opacity,
          emissiveIntensity: 1, // 从0增加到0.2
          envMapIntensity: 2, // 增加环境光反射
        })
        // sphereGeometry = new THREE.SphereGeometry(0.005, 8, 8)
        sphereGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01)
        // 使用 InstancedMesh 高效渲染
        const instancedMesh = new THREE.InstancedMesh(
          sphereGeometry,
          sphereMaterial,
          pointCount
        )
  
        const matrix = new THREE.Matrix4()
        transformedPoints.forEach((point, i) => {
          matrix.makeTranslation(point.x, point.y, point.z)
          // const percent = (minOffset - point.z) / (minOffset - minZ);
          // 将 percent 映射到 0.3-1.0 范围，避免过暗的颜色
          // const brightness = 0.3 + percent * 0.7;
          // instancedMesh.setColorAt(i, new THREE.Color(brightness, brightness, brightness))
          instancedMesh.setMatrixAt(i, matrix)
        })
  
        instancedMesh.instanceMatrix.needsUpdate = true
        if (instancedMesh.instanceColor) {
          instancedMesh.instanceColor.needsUpdate = true
        }
        scene.add(instancedMesh)
        meshRef.current = instancedMesh
      } else if (showPointCloud) {
        const geomSmooth = new THREE.BufferGeometry();
        console.log({colorsSmooth})
        geomSmooth.setAttribute(
            "position",
            new THREE.BufferAttribute(positionsSmooth, 3)
        );
        geomSmooth.setAttribute(
          "color",
          new THREE.BufferAttribute(colorsSmooth, 3)
        );
  
        const matSmooth = new THREE.PointsMaterial({
            color: showOriginalColor ? undefined : 0xcccccc,
            vertexColors: showOriginalColor,
            size: pointSize,
            sizeAttenuation: true,
            transparent: true,
            opacity,
        });
  
        const pointsSmoothObj = new THREE.Points(geomSmooth, matSmooth);
        scene.add(pointsSmoothObj);
        meshRef.current = pointsSmoothObj;
      }

      if (showSkin) {
        const humanPatchMesh = buildHumanPatchMeshFromHeightMap({
          heightMap: heightMapFiltered,
          validMask,
          nx, ny, xMin, xMax, yMin, yMax, colorMapR, colorMapG, colorMapB, 
          depthGap: (zMax - zMin) * 0.25,
          transformParams,
          skinOpacity
        })
        if (humanPatchMesh) {
          humanPatchMesh.receiveShadow = true;
          humanPatchMesh.castShadow = true;
          humanPatchMesh.renderOrder = 2;
          scene.add(humanPatchMesh)
          humanPatchMeshRef.current = humanPatchMesh
        }
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
  }, [points, scene, opacity, pointType, humanColors, skinOpacity, showPointCloud, showSkin, pointSize, showOriginalColor])

  // 更新透明度
  useEffect(() => {
    if (meshRef.current && meshRef.current.material) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial
      material.opacity = opacity
    }
  }, [opacity])

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

