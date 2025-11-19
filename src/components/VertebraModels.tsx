import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { loadModel, createGLTFLoader } from '../utils/modelUtils'
import { applyTransform } from '../utils/pointCloudUtils'
import type { TransformParams, Point3D } from '../utils/pointCloudUtils'
import { VERTEBRA_NAMES } from '../constants/vertebraNames'

interface VertebraModelsProps {
  spinePoints: Point3D[]
  transformParams: TransformParams
  scene: THREE.Scene
  onModelsLoaded?: (models: THREE.Group[]) => void
  markerOffsets?: Record<string, { x: number; y: number; z: number }>
  showBoxHelpers?: boolean
  showMarkers?: boolean
  reloadKey?: number // 用于触发重新加载
}


export default function VertebraModels({
  spinePoints,
  transformParams,
  scene,
  onModelsLoaded,
  markerOffsets = {},
  showBoxHelpers = false,
  showMarkers = false,
  reloadKey = 0,
}: VertebraModelsProps) {
  const hasLoadedRef = useRef(false)
  const loadingRef = useRef(false)
  const prevReloadKeyRef = useRef(reloadKey)
  const vertebraGroupRef = useRef<THREE.Group | null>(null)

  useEffect(() => {
    if (!spinePoints || spinePoints.length === 0) return
    
    // 当 reloadKey 改变时，重置加载状态以触发重新加载
    if (reloadKey !== prevReloadKeyRef.current) {
      hasLoadedRef.current = false
      prevReloadKeyRef.current = reloadKey
    }
    
    if (hasLoadedRef.current || loadingRef.current) return

    loadingRef.current = true
    const loader = createGLTFLoader()
    const vertebraGroup = new THREE.Group()
    vertebraGroupRef.current = vertebraGroup
    const models: THREE.Group[] = []
    let loadedCount = 0
    const totalCount = Math.min(spinePoints.length, VERTEBRA_NAMES.length)

    // 应用变换到脊柱点
    const transformedPoints = spinePoints.map((p) => applyTransform(p, transformParams))

    // 加载所有模型
    transformedPoints.forEach((point, index) => {
      const modelName = VERTEBRA_NAMES[index]
      const modelPath = `/models/${modelName}.glb`

      loadModel(loader, modelPath, {
        position: [point.x, point.y, point.z],
        rotation: [0, 0, 0],
        scale: [1, 1, -1], // z轴镜像反转
        centerToOrigin: true,
        autoAdjustCamera: false,
        userData: {
          vertebraName: modelName,
          spineIndex: index,
          spinePoint: point.clone(),
        },
      })
        .then((model) => {
          // 计算模型边界框以确定缩放
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxSize = Math.max(size.x, size.y, size.z);

          // 根据点云大小调整模型缩放（假设每个脊椎模型应该大约0.1单位大小）
          // 调整模型朝向，Z轴镜面翻转
          const bottomSpineOffset = 0.6;
          const topSpineOffset = 0.6;
          const targetSize = bottomSpineOffset - (VERTEBRA_NAMES.length - index) * (bottomSpineOffset - topSpineOffset) / VERTEBRA_NAMES.length;
          const scale = targetSize / maxSize;
          model.scale.set(scale, scale, scale * -1);

          // 增强模型材质的反光效果
          model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial) {
                  // 增加金属度，降低粗糙度，让反光更明显
                  mat.metalness = Math.max(mat.metalness || 0, 0.2)
                  mat.roughness = Math.min(mat.roughness || 0.8, 0.5)
                  // 增加环境光反射
                  mat.envMapIntensity = 1.5
                }
              })
            }
          })

          // 计算模型边界框以确定缩放
          // 应用标记偏移量显示（绿色点和连线）
          const markerOffset = markerOffsets[modelName]
          const z_offset_all = 0.2;
          if (markerOffset) {
            // 计算标记偏移点位置（注意z轴是翻转的，所以z的偏移需要取反）
            const markerOffsetPoint = new THREE.Vector3(
              model.position.x + markerOffset.x,
              model.position.y + markerOffset.y,
              model.position.z + markerOffset.z * -1 + z_offset_all // z轴翻转
            )

            // 创建绿色点（标记偏移点）
            const markerOffsetPointHelper = new THREE.Mesh(
              new THREE.SphereGeometry(0.01, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0x00ff00 })
            )
            markerOffsetPointHelper.position.copy(markerOffsetPoint)
            markerOffsetPointHelper.userData.isMarkerOffsetHelper = true
            markerOffsetPointHelper.userData.vertebraName = modelName
            markerOffsetPointHelper.visible = showMarkers
            scene.add(markerOffsetPointHelper)

            // 创建从point到标记偏移点的连线
            const markerOffsetLine = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([point.clone(), markerOffsetPoint]),
              new THREE.LineBasicMaterial({ color: 0x00ff00 })
            )
            markerOffsetLine.userData.isMarkerOffsetLine = true
            markerOffsetLine.userData.vertebraName = modelName
            markerOffsetLine.visible = showMarkers
            scene.add(markerOffsetLine)

            // 注意：不在加载时应用偏移，而是在双击标记时应用
            // model.position.copy(markerOffsetPoint)
          }

          // 创建绿色边界框
          const boxHelper = new THREE.BoxHelper(model, 0x00ff00)
          boxHelper.userData.isBoxHelper = true
          boxHelper.userData.vertebraName = modelName
          boxHelper.visible = showBoxHelpers
          scene.add(boxHelper)

          // // 可选：在模型z轴最大值位置添加黄色点（调试用）
          // // 计算模型的局部边界框（在模型的局部坐标系中）
          // const localBox = new THREE.Box3()
          // model.traverse((child) => {
          //   if (child instanceof THREE.Mesh && child.geometry) {
          //     // 获取几何体的位置属性
          //     const position = child.geometry.attributes.position
          //     if (position) {
          //       // 获取子对象的局部变换矩阵
          //       const matrix = new THREE.Matrix4()
          //       matrix.compose(child.position, child.quaternion, child.scale)
                
          //       // 将每个顶点转换到模型的局部坐标系
          //       for (let i = 0; i < position.count; i++) {
          //         const vertex = new THREE.Vector3()
          //         vertex.fromBufferAttribute(position, i)
          //         // 应用子对象的变换
          //         vertex.applyMatrix4(matrix)
          //         localBox.expandByPoint(vertex)
          //       }
          //     }
          //   }
          // })

          // // 如果边界框有效，计算z轴最大值位置
          // if (!localBox.isEmpty()) {
          //   const localCenter = localBox.getCenter(new THREE.Vector3())
          //   const localSize = localBox.getSize(new THREE.Vector3())
          //   // z轴最大值位置（局部坐标系）
          //   const localZMax = localCenter.z + localSize.z / 2

          //   // 创建黄色点（z轴最大值位置）
          //   const pointHelper = new THREE.Mesh(
          //     new THREE.SphereGeometry(0.01, 8, 8),
          //     new THREE.MeshBasicMaterial({ color: 0xffff00 })
          //   )
          //   // 将点添加到模型内部作为子对象，使用局部坐标系
          //   pointHelper.position.set(localCenter.x, localCenter.y, localZMax)
          //   pointHelper.userData.isZMaxHelper = true
          //   model.add(pointHelper)

          //   // 保存pointHelper引用到userData，方便后续查找
          //   model.userData.pointHelper = pointHelper
          // }

          vertebraGroup.add(model)
          models.push(model)
          loadedCount++

          // console.log(`加载脊椎模型 ${modelName} (${loadedCount}/${totalCount})`)

          if (loadedCount === totalCount) {
            scene.add(vertebraGroup)
            if (onModelsLoaded) {
              onModelsLoaded(models)
            }
            console.log('所有脊椎模型已加载完成')
            hasLoadedRef.current = true
            loadingRef.current = false
          }
        })
        .catch((error) => {
          console.error(`加载 ${modelName}.glb 失败:`, error)
          loadingRef.current = false
        })
    })

    return () => {
      // 清理旧的模型组
      const oldGroup = vertebraGroupRef.current
      if (oldGroup) {
        // 移除标记偏移量的绿色点和连线
        scene.children.forEach((child) => {
          if (
            (child instanceof THREE.Mesh && child.userData.isMarkerOffsetHelper) ||
            (child instanceof THREE.Line && child.userData.isMarkerOffsetLine)
          ) {
            scene.remove(child)
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              if (child.material instanceof THREE.Material) {
                child.material.dispose()
              }
            } else if (child instanceof THREE.Line) {
              child.geometry.dispose()
              if (child.material instanceof THREE.Material) {
                child.material.dispose()
              }
            }
          }
        })

        scene.remove(oldGroup)
        oldGroup.children.forEach((child) => {
          if (child instanceof THREE.Group) {
            child.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose()
                if (obj.material) {
                  if (Array.isArray(obj.material)) {
                    obj.material.forEach((mat) => mat.dispose())
                  } else {
                    obj.material.dispose()
                  }
                }
              }
            })
          }
        })
        vertebraGroupRef.current = null
      }
      hasLoadedRef.current = false
      loadingRef.current = false
    }
  }, [spinePoints.length, transformParams.scaleFactor, scene, markerOffsets, showBoxHelpers, showMarkers, reloadKey])

  // 控制box helper和绿色标记偏移点/连线的显示/隐藏
  useEffect(() => {
    scene.children.forEach((child) => {
      if (child.userData.isBoxHelper) {
        child.visible = showBoxHelpers
      }
      if (child.userData.isMarkerOffsetHelper || child.userData.isMarkerOffsetLine) {
        child.visible = showMarkers
      }
    })
  }, [showBoxHelpers, showMarkers, scene])

  return null
}

