import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { processPointCloud } from '../utils/pointCloudUtils'
import type { Point3D } from '../utils/pointCloudUtils'
import { smoothen } from '@/utils/smoothen'
import { buildHumanPatchMeshFromHeightMap, type SkinMaterialParams } from '@/utils/build_mesh_skin'

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
  skinParams?: SkinMaterialParams & { depthGapRatio?: number }
}

export default function PointCloud({ points, opacity, skinOpacity, scene, pointType, humanColors, showPointCloud, showSkin, pointSize, showOriginalColor, skinParams }: PointCloudProps) {
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
      if (pointType === 'sphere' && showPointCloud) {
        // 球体材质（使用 instanceColor）
        // MeshStandardMaterial 会自动使用 InstancedMesh 的 instanceColor
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff, // 基础颜色为白色，会被 instanceColor 覆盖
          metalness: 0.5,
          roughness: 0.5,
          transparent: true,
          opacity,
          // 添加轻微自发光，确保颜色可见
          emissive: 0x000000,
          emissiveIntensity: 0.1,
        });
        // 球体几何体
        sphereGeometry = new THREE.BoxGeometry(pointSize, pointSize, pointSize);
        // 给几何体每个顶点都复制上colorsSmooth颜色数组（所有顶点都用该点的颜色）
        // BoxGeometry有8个顶点，但我们希望每个实例的“box”颜色由其点的颜色决定
        // 所以仅设置 instanceColor，在 InstancedMesh 渲染时设置每个实例的颜色
        // 而不是在geometry顶点属性上设置
        // 但 THREE.InstancedMesh 只支持 instanceColor

        // 使用 InstancedMesh 高效渲染
        const instancedMesh = new THREE.InstancedMesh(
          sphereGeometry,
          sphereMaterial,
          pointCount
        )
  
        const matrix = new THREE.Matrix4()
        transformedPoints.forEach((point, i) => {
          matrix.makeTranslation(point.x, point.y, point.z)
          instancedMesh.setMatrixAt(i, matrix)
          
          // 使用 humanColors 为每个实例设置颜色
          let r = colorsSmooth[i * 3];
          let g = colorsSmooth[i * 3 + 1];
          let b = colorsSmooth[i * 3 + 2];
          
          // 如果颜色值无效，使用默认白色
          if (r === undefined || isNaN(r) || r < 0) r = 1;
          if (g === undefined || isNaN(g) || g < 0) g = 1;
          if (b === undefined || isNaN(b) || b < 0) b = 1;
          
          // 确保颜色值在有效范围内
          r = Math.max(0, Math.min(1, r));
          g = Math.max(0, Math.min(1, g));
          b = Math.max(0, Math.min(1, b));
          
          // 调试：打印前几个颜色值
          if (i < 3) {
            console.log(`Point ${i} color:`, { r, g, b, humanColor: humanColors?.[i] });
          }
          
          const color = new THREE.Color(r, g, b);
          instancedMesh.setColorAt(i, color)
        })
  
        instancedMesh.instanceMatrix.needsUpdate = true
        if (instancedMesh.instanceColor) {
          instancedMesh.instanceColor.needsUpdate = true
        }
        scene.add(instancedMesh)
        meshRef.current = instancedMesh
      } else if (showPointCloud) {
        const geomSmooth = new THREE.BufferGeometry();
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
        const depthGapRatio = skinParams?.depthGapRatio ?? 0.25
        const humanPatchMesh = buildHumanPatchMeshFromHeightMap({
          heightMap: heightMapFiltered,
          validMask,
          nx, ny, xMin, xMax, yMin, yMax, colorMapR, colorMapG, colorMapB, 
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
  }, [points, scene, opacity, pointType, humanColors, skinOpacity, showPointCloud, showSkin, pointSize, showOriginalColor, skinParams])

  // 更新透明度
  useEffect(() => {
    if (meshRef.current && meshRef.current.material) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial
      material.opacity = opacity
    }
  }, [opacity])

  // 更新皮肤材质参数
  useEffect(() => {
    if (!humanPatchMeshRef.current || !skinParams) return
    const material = humanPatchMeshRef.current.material
    if (!(material instanceof THREE.MeshPhysicalMaterial)) return
    
    // 更新所有材质属性
    if (skinParams.meshColor) material.color.copy(skinParams.meshColor)
    if (skinParams.metalness !== undefined) material.metalness = skinParams.metalness
    if (skinParams.roughness !== undefined) material.roughness = skinParams.roughness
    if (skinParams.transmission !== undefined) material.transmission = skinParams.transmission
    if (skinParams.thickness !== undefined) material.thickness = skinParams.thickness
    if (skinParams.ior !== undefined) material.ior = skinParams.ior
    if (skinParams.clearcoat !== undefined) material.clearcoat = skinParams.clearcoat
    if (skinParams.clearcoatRoughness !== undefined) material.clearcoatRoughness = skinParams.clearcoatRoughness
    if (skinParams.reflectivity !== undefined) material.reflectivity = skinParams.reflectivity
    if (skinParams.attenuationDistance !== undefined) material.attenuationDistance = skinParams.attenuationDistance
    if (skinParams.attenuationColor) material.attenuationColor.copy(skinParams.attenuationColor)
    if (skinParams.envMapIntensity !== undefined) material.envMapIntensity = skinParams.envMapIntensity
    if (skinParams.sheen !== undefined) material.sheen = skinParams.sheen
    if (skinParams.sheenColor) material.sheenColor.copy(skinParams.sheenColor)
    if (skinParams.sheenRoughness !== undefined) material.sheenRoughness = skinParams.sheenRoughness
    material.needsUpdate = true
  }, [skinParams])

  // 更新皮肤透明度
  useEffect(() => {
    if (humanPatchMeshRef.current && humanPatchMeshRef.current.material instanceof THREE.MeshPhysicalMaterial) {
      const material = humanPatchMeshRef.current.material as THREE.MeshPhysicalMaterial
      material.opacity = skinOpacity
      material.needsUpdate = true
    }
  }, [skinOpacity])

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

