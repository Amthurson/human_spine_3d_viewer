import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
// 导入图片 - 如果图片不存在，请将 PointCloud.png 放在 src/assets 目录下
import pointCloudImage from '../assets/PointCloud.png'

interface ImagePointCloudProps {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
}

export default function ImagePointCloud({ scene, camera, controls }: ImagePointCloudProps) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null)

  console.log('ImagePointCloud 组件被渲染')

  useEffect(() => {
    console.log('ImagePointCloud useEffect 被触发')
    console.log('ImagePointCloud: 开始加载图片...')
    console.log('图片路径:', pointCloudImage)
    
    // 创建图片对象
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      console.log('图片加载成功! 图片尺寸:', img.width, 'x', img.height)
      try {
        // 创建 canvas 来读取图片数据
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          console.error('无法获取 canvas 2d 上下文')
          return
        }

        canvas.width = img.width
        canvas.height = img.height
        
        // 确保使用正确的绘制方式
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)

        // 读取像素数据
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        console.log('图片像素数据统计:')
        console.log('总像素数:', data.length / 4)
        console.log('Canvas 尺寸:', canvas.width, 'x', canvas.height)
        console.log('前20个像素的 RGBA 值:')
        for (let i = 0; i < Math.min(80, data.length); i += 4) {
          console.log(`像素 ${i / 4 + 1}: R=${data[i]}, G=${data[i + 1]}, B=${data[i + 2]}, A=${data[i + 3]}`)
        }

        // 统计 RGB 值的分布
        let rgbZeroCount = 0
        let rgbNonZeroCount = 0
        const sampleNonZeroPixels: Array<{ r: number; g: number; b: number; a: number; index: number }> = []
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          
          if (r === 0 && g === 0 && b === 0) {
            rgbZeroCount++
          } else {
            rgbNonZeroCount++
            if (sampleNonZeroPixels.length < 10) {
              sampleNonZeroPixels.push({ r, g, b, a, index: i / 4 })
            }
          }
        }
        
        console.log(`RGB 统计: 全0像素=${rgbZeroCount}, 非0像素=${rgbNonZeroCount}`)
        if (sampleNonZeroPixels.length > 0) {
          console.log('找到的非0像素示例:', sampleNonZeroPixels)
        } else {
          console.warn('警告: 所有像素的 RGB 值都是 0！')
          console.log('检查图片中间区域的像素:')
          // 检查图片中间区域的像素
          const centerX = Math.floor(canvas.width / 2)
          const centerY = Math.floor(canvas.height / 2)
          const centerIndex = (centerY * canvas.width + centerX) * 4
          console.log(`中心像素 (${centerX}, ${centerY}): R=${data[centerIndex]}, G=${data[centerIndex + 1]}, B=${data[centerIndex + 2]}, A=${data[centerIndex + 3]}`)
          
          // 检查几个随机位置的像素
          for (let i = 0; i < 5; i++) {
            const x = Math.floor(Math.random() * canvas.width)
            const y = Math.floor(Math.random() * canvas.height)
            const idx = (y * canvas.width + x) * 4
            console.log(`随机像素 (${x}, ${y}): R=${data[idx]}, G=${data[idx + 1]}, B=${data[idx + 2]}, A=${data[idx + 3]}`)
          }
        }

        // 提取点云数据：R, G, B 分别对应 x, y, z 坐标
        const points: THREE.Vector3[] = []
        const colors: THREE.Color[] = []

        // 计算坐标范围用于归一化
        let minX = Infinity,
          maxX = -Infinity
        let minY = Infinity,
          maxY = -Infinity
        let minZ = Infinity,
          maxZ = -Infinity

        // 第一遍遍历：找到坐标范围
        // 处理所有非全黑的像素（即使 alpha 为 0 也处理，因为可能是图片格式问题）
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] // x 坐标 (0-255)
          const g = data[i + 1] // y 坐标 (0-255)
          const b = data[i + 2] // z 坐标 (0-255)
          // const a = data[i + 3] // alpha 通道 (未使用)

          // 只跳过完全黑色的像素（RGB 全为 0）
          // 不检查 alpha，因为有些图片格式可能 alpha 通道不正确
          if (r === 0 && g === 0 && b === 0) continue

          minX = Math.min(minX, r)
          maxX = Math.max(maxX, r)
          minY = Math.min(minY, g)
          maxY = Math.max(maxY, g)
          minZ = Math.min(minZ, b)
          maxZ = Math.max(maxZ, b)
        }

        console.log('第一遍遍历后的坐标范围:', { minX, maxX, minY, maxY, minZ, maxZ })

        // 第二遍遍历：创建归一化的点
        const normalizedPoints: Array<{ x: number; y: number; z: number; originalR: number; originalG: number; originalB: number }> = []
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          // const a = data[i + 3] // alpha 通道 (未使用)

          // 只跳过完全黑色的像素（RGB 全为 0）
          // 不检查 alpha，因为有些图片格式可能 alpha 通道不正确
          if (r === 0 && g === 0 && b === 0) continue

          // 归一化到 [-1, 1] 范围
          const rangeX = maxX - minX || 1
          const rangeY = maxY - minY || 1
          const rangeZ = maxZ - minZ || 1

          const x = ((r - minX) / rangeX) * 2 - 1
          const y = ((g - minY) / rangeY) * 2 - 1
          const z = ((b - minZ) / rangeZ) * 2 - 1

          points.push(new THREE.Vector3(x, y, z))
          colors.push(new THREE.Color(r / 255, g / 255, b / 255))
          
          // 保存归一化坐标数据用于日志输出
          normalizedPoints.push({
            x,
            y,
            z,
            originalR: r,
            originalG: g,
            originalB: b,
          })
        }

        console.log(`从图片加载了 ${points.length} 个点`)
        console.log('原始坐标范围:', { minX, maxX, minY, maxY, minZ, maxZ })
        
        // 计算归一化后的坐标统计
        const normalizedMinX = Math.min(...normalizedPoints.map(p => p.x))
        const normalizedMaxX = Math.max(...normalizedPoints.map(p => p.x))
        const normalizedMinY = Math.min(...normalizedPoints.map(p => p.y))
        const normalizedMaxY = Math.max(...normalizedPoints.map(p => p.y))
        const normalizedMinZ = Math.min(...normalizedPoints.map(p => p.z))
        const normalizedMaxZ = Math.max(...normalizedPoints.map(p => p.z))
        
        console.log('归一化后的坐标范围:', {
          x: { min: normalizedMinX, max: normalizedMaxX },
          y: { min: normalizedMinY, max: normalizedMaxY },
          z: { min: normalizedMinZ, max: normalizedMaxZ },
        })
        
        // 输出前10个点的归一化坐标
        console.log('前10个点的归一化坐标数据:')
        normalizedPoints.slice(0, 10).forEach((point, index) => {
          console.log(`点 ${index + 1}:`, {
            原始RGB: { r: point.originalR, g: point.originalG, b: point.originalB },
            归一化坐标: { x: point.x.toFixed(6), y: point.y.toFixed(6), z: point.z.toFixed(6) },
          })
        })
        
        // 输出后10个点的归一化坐标
        if (normalizedPoints.length > 10) {
          console.log('后10个点的归一化坐标数据:')
          normalizedPoints.slice(-10).forEach((point, index) => {
            const actualIndex = normalizedPoints.length - 10 + index
            console.log(`点 ${actualIndex + 1}:`, {
              原始RGB: { r: point.originalR, g: point.originalG, b: point.originalB },
              归一化坐标: { x: point.x.toFixed(6), y: point.y.toFixed(6), z: point.z.toFixed(6) },
            })
          })
        }
        
        // 输出所有归一化坐标数据（以数组形式）
        console.log('所有归一化坐标数据 (数组格式):', normalizedPoints.map(p => ({
          x: p.x,
          y: p.y,
          z: p.z,
        })))

        if (points.length === 0) {
          console.warn('没有找到有效的点云数据')
          return
        }

        // 创建球体几何体
        const sphereGeometry = new THREE.SphereGeometry(0.01, 8, 8)

        // 创建材质
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: 0x33aaff,
          metalness: 0.8,
          roughness: 0.5,
          transparent: true,
          opacity: 0.8,
        })

        // 使用 InstancedMesh 高效渲染
        const instancedMesh = new THREE.InstancedMesh(
          sphereGeometry,
          sphereMaterial,
          points.length
        )

        const matrix = new THREE.Matrix4()
        points.forEach((point, i) => {
          matrix.makeTranslation(point.x, point.y, point.z)
          instancedMesh.setMatrixAt(i, matrix)
          instancedMesh.setColorAt(i, colors[i])
        })

        instancedMesh.instanceMatrix.needsUpdate = true
        if (instancedMesh.instanceColor) {
          instancedMesh.instanceColor.needsUpdate = true
        }

        scene.add(instancedMesh)
        meshRef.current = instancedMesh

        // 自动调整相机位置以查看所有点
        const box = new THREE.Box3().setFromPoints(points)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const distance = maxDim * 2

        // 更新相机位置
        camera.position.set(center.x, center.y, center.z + distance)
        camera.lookAt(center)
        controls.target.copy(center)
        controls.update()
      } catch (error) {
        console.error('处理图片点云数据时出错:', error)
      }
    }

    img.onerror = (error) => {
      console.error('加载图片失败:', error)
      console.error('尝试加载的图片路径:', pointCloudImage)
    }

    // 加载图片 - 使用 Vite import 的路径
    console.log('设置图片源:', pointCloudImage)
    img.src = pointCloudImage

    // 清理函数
    return () => {
      if (meshRef.current) {
        scene.remove(meshRef.current)
        meshRef.current.dispose()
        meshRef.current = null
      }
    }
  }, [scene, camera, controls])

  return null
}

