import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { loadModel, createGLTFLoader } from '../utils/modelUtils'
import { applyTransform } from '../utils/pointCloudUtils'
import type { TransformParams, Point3D } from '../utils/pointCloudUtils'
import { VERTEBRA_NAMES } from '../constants/vertebraNames'

interface VertebraModelsProps {
  spinePoints: Point3D[]
  transformParams: TransformParams
  scene: THREE.Object3D
  onModelsLoaded?: (models: THREE.Group[]) => void
  markerOffsets?: Record<string, { x: number; y: number; z: number }>
  showBoxHelpers?: boolean
  showMarkers?: boolean
  reloadKey?: number // 用于触发重新加载
  allowedYOverlapRatio?: number // y轴方向允许的重合比例（0-1之间，默认0.2即20%）
}

export interface VertebraModelsRef {
  optimizeScales: (onComplete?: () => void) => void // 优化模型缩放，完成后调用回调
}


const VertebraModels = forwardRef<VertebraModelsRef, VertebraModelsProps>(({
  spinePoints,
  transformParams,
  scene,
  onModelsLoaded,
  markerOffsets = {},
  showBoxHelpers = false,
  showMarkers = false,
  reloadKey = 0,
  allowedYOverlapRatio = 0.2, // 默认允许20%的y轴重合
}, ref) => {
  const hasLoadedRef = useRef(false)
  const loadingRef = useRef(false)
  const prevReloadKeyRef = useRef(reloadKey)
  const vertebraGroupRef = useRef<THREE.Group | null>(null)
  const originalScalesRef = useRef<Map<THREE.Group, THREE.Vector3>>(new Map())
  const modelsRef = useRef<THREE.Group[]>([]) // 保存所有模型的引用
  const markerOffsetsRef = useRef(markerOffsets) // 保存markerOffsets的引用，避免触发重新加载

  // 更新markerOffsets的引用
  useEffect(() => {
    markerOffsetsRef.current = markerOffsets
  }, [markerOffsets])

  useEffect(() => {
    if (!spinePoints || spinePoints.length === 0) return
    
    // 保存当前ref的引用，用于清理函数
    const scalesMap = originalScalesRef.current
    
    // 当 reloadKey 改变时，先清理旧的模型，然后重置加载状态以触发重新加载
    if (reloadKey !== prevReloadKeyRef.current) {
      // 先清理旧的模型和所有相关对象
      const oldGroup = vertebraGroupRef.current
      const oldModels = [...modelsRef.current]
      
      if (oldGroup || oldModels.length > 0) {
        
        // 清理所有模型相关的对象
        const objectsToRemove: THREE.Object3D[] = []
        const vertebraNamesToClean = new Set<string>()

        const vertebraGroup = scene.children.find((child) => child.userData.isVertebraGroup)
        if (vertebraGroup) {
          scene.remove(vertebraGroup)
        }
        
        oldModels.forEach((model) => {
          if (model.userData && model.userData.vertebraName) {
            vertebraNamesToClean.add(model.userData.vertebraName)
          }
        })
        
        scene.traverse((child) => {
          if (child.userData && child.userData.vertebraName) {
            const vertebraName = child.userData.vertebraName
            if (vertebraNamesToClean.has(vertebraName)) {
              if (child.userData.isBoxHelper && child instanceof THREE.BoxHelper) {
                objectsToRemove.push(child)
              }
              if (child.userData.isMarkerOffsetHelper && child instanceof THREE.Mesh) {
                objectsToRemove.push(child)
              }
              if (child.userData.isMarkerOffsetLine && child instanceof THREE.Line) {
                objectsToRemove.push(child)
              }
            }
          }
        })
        
        objectsToRemove.forEach((obj) => {
          scene.remove(obj)
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.BoxHelper) {
            if (obj.geometry) obj.geometry.dispose()
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((mat) => mat.dispose())
              } else {
                obj.material.dispose()
              }
            }
          }
        })
        
        if (oldGroup) {
          scene.remove(oldGroup)
          oldGroup.children.forEach((child) => {
            if (child instanceof THREE.Group) {
              scalesMap.delete(child)
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
        
        modelsRef.current = []
      }
      
      hasLoadedRef.current = false
      prevReloadKeyRef.current = reloadKey
      // 清理旧的原始缩放记录
      scalesMap.clear()
    }
    
    if (hasLoadedRef.current || loadingRef.current) return

    loadingRef.current = true
    const loader = createGLTFLoader()
    const vertebraGroup = new THREE.Group()
    // 添加一个标识
    vertebraGroup.userData.isVertebraGroup = true
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
      loadingRef.current = true

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
          // 计算模型边界框以确定初始缩放
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxSize = Math.max(size.x, size.y, size.z);

          // 使用统一的初始缩放比例（不再使用bottomSpineOffset和topSpineOffset的差异缩放）
          // 碰撞检测优化会统一调整所有模型的大小
          const initialScale = 0.6 / maxSize; // 统一的初始缩放值
          const baseScale = Math.abs(initialScale); // 保存基础缩放值（正值）
          model.scale.set(initialScale, initialScale, initialScale * -1); // z轴镜像翻转
          
          // 保存原始缩放比例（用于后续碰撞检测优化）
          originalScalesRef.current.set(model, new THREE.Vector3(baseScale, baseScale, baseScale))
          
          // 标记模型尚未进行碰撞优化
          model.userData.collisionOptimized = false

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
          const markerOffset = markerOffsetsRef.current[modelName]
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
          
          // 将BoxHelper引用保存到模型的userData中，方便后续更新
          model.userData.boxHelper = boxHelper

          vertebraGroup.add(model)
          models.push(model)
          modelsRef.current = models // 保存模型引用
          loadedCount++
          if (loadedCount === totalCount) {
            scene.add(vertebraGroup)
            
            if (onModelsLoaded) {
              onModelsLoaded(models)
            }
            hasLoadedRef.current = true
            loadingRef.current = false
            
            // 注意：碰撞检测和缩放优化会在应用偏移后通过handleModelsLoaded触发
            // 如果未应用偏移，会在handleModelsLoaded中处理
          }
        })
        .catch((error) => {
          console.error(`加载 ${modelName}.glb 失败:`, error)
          loadingRef.current = false
        })
    })

    return () => {
      // 清理旧的模型组和所有相关对象
      const oldGroup = vertebraGroupRef.current
      // 保存当前模型列表的副本，避免在清理过程中被修改
      const oldModels = [...modelsRef.current]
      // 清理所有模型相关的对象（BoxHelper、标记偏移点、连线等）
      const objectsToRemove: THREE.Object3D[] = []
      const vertebraNamesToClean = new Set<string>()
      
      // 收集所有需要清理的脊椎名称
      oldModels.forEach((model) => {
        if (model.userData && model.userData.vertebraName) {
          vertebraNamesToClean.add(model.userData.vertebraName)
        }
      })
      
      // 遍历场景，收集所有需要清理的对象
      const historyVertebraGroup = scene.children.find((child) => child.userData.isVertebraGroup)
      if (historyVertebraGroup) {
        objectsToRemove.push(historyVertebraGroup)
      }
      
      // 移除并释放所有收集到的对象
      objectsToRemove.forEach((obj) => {
        scene.remove(obj)
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.BoxHelper) {
          if (obj.geometry) {
            obj.geometry.dispose()
          }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((mat) => mat.dispose())
            } else {
              obj.material.dispose()
            }
          }
        }
      })
      
      // 清理模型组
      if (oldGroup) {
        scene.remove(oldGroup)
        oldGroup.children.forEach((child) => {
          if (child instanceof THREE.Group) {
            // 从originalScalesRef中移除对应的记录
            scalesMap.delete(child)
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
      
      // 清空模型引用
      modelsRef.current = []
      hasLoadedRef.current = false
      loadingRef.current = false
    }
  }, [spinePoints, transformParams, scene, showBoxHelpers, showMarkers, reloadKey, onModelsLoaded, allowedYOverlapRatio])

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

  // 暴露优化函数给父组件
  useImperativeHandle(ref, () => ({
    optimizeScales: (onComplete?: () => void) => {
      const models = modelsRef.current
      if (models.length > 0) {
        // 重新进行碰撞检测和缩放优化
        setTimeout(() => {
          // 需要重新定义优化函数，因为它依赖于allowedYOverlapRatio
          const checkCollision = (model1: THREE.Group, model2: THREE.Group): boolean => {
            const box1 = new THREE.Box3().setFromObject(model1)
            const box2 = new THREE.Box3().setFromObject(model2)
            
            const xOverlap = !(box1.max.x < box2.min.x || box1.min.x > box2.max.x)
            const zOverlap = !(box1.max.z < box2.min.z || box1.min.z > box2.max.z)
            
            if (!xOverlap || !zOverlap) {
              return false
            }
            
            const yOverlapMin = Math.max(box1.min.y, box2.min.y)
            const yOverlapMax = Math.min(box1.max.y, box2.max.y)
            
            if (yOverlapMin >= yOverlapMax) {
              return false
            }
            
            const yOverlapLength = yOverlapMax - yOverlapMin
            const box1Height = box1.max.y - box1.min.y
            const box2Height = box2.max.y - box2.min.y
            const minHeight = Math.min(box1Height, box2Height)
            const overlapRatio = yOverlapLength / minHeight
            
            return overlapRatio > allowedYOverlapRatio
          }

          const hasAnyCollision = (modelsToCheck: THREE.Group[]): boolean => {
            for (let i = 0; i < modelsToCheck.length; i++) {
              for (let j = i + 1; j < modelsToCheck.length; j++) {
                if (checkCollision(modelsToCheck[i], modelsToCheck[j])) {
                  return true
                }
              }
            }
            return false
          }

          const applyScaleToModels = (modelsToScale: THREE.Group[], scaleFactor: number) => {
            modelsToScale.forEach((model) => {
              const originalScale = originalScalesRef.current.get(model)
              if (originalScale) {
                const newScale = originalScale.x * scaleFactor
                model.scale.set(newScale, newScale, -newScale)
              }
            })
          }

          const optimizeModelScales = (modelsToOptimize: THREE.Group[]) => {
            if (modelsToOptimize.length === 0) {
              // 如果没有模型，直接调用完成回调
              if (onComplete) {
                setTimeout(() => onComplete(), 100) // 延迟一点确保状态稳定
              }
              return
            }

            if (!hasAnyCollision(modelsToOptimize)) {
              modelsToOptimize.forEach((model) => {
                model.userData.collisionOptimized = true
              })
              // 优化完成，调用回调
              if (onComplete) {
                setTimeout(() => onComplete(), 100) // 延迟一点确保状态稳定
              }
              return
            }

            let minScale = 0.1
            let maxScale = 1.0
            let bestScale = minScale
            const tolerance = 0.001
            const maxIterations = 50

            let iterations = 0
            while (maxScale - minScale > tolerance && iterations < maxIterations) {
              iterations++
              const testScale = (minScale + maxScale) / 2

              applyScaleToModels(modelsToOptimize, testScale)

              if (hasAnyCollision(modelsToOptimize)) {
                maxScale = testScale
              } else {
                bestScale = testScale
                minScale = testScale
              }
            }

            applyScaleToModels(modelsToOptimize, bestScale)

            if (hasAnyCollision(modelsToOptimize)) {
              bestScale *= 0.99
              applyScaleToModels(modelsToOptimize, bestScale)
            }

            // 标记为已优化，但保持当前位置（偏移后的位置）
            modelsToOptimize.forEach((model) => {
              model.userData.collisionOptimized = true
            })

            // 优化完成，延迟一点确保状态稳定后调用回调
            if (onComplete) {
              setTimeout(() => onComplete(), 200) // 延迟200ms确保状态稳定
            }
          }

          optimizeModelScales(models)
        }, 50)
      } else {
        // 如果没有模型，直接调用完成回调
        if (onComplete) {
          setTimeout(() => onComplete(), 100)
        }
      }
    },
  }))

  return null
})

export default VertebraModels

