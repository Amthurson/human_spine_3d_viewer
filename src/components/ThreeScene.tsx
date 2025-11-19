import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { processPointCloud } from '../utils/pointCloudUtils'
import type { Point3D, TransformParams } from '../utils/pointCloudUtils'
import PointCloud from './PointCloud'
import SpinePoints from './SpinePoints'
import VertebraModels from './VertebraModels'
import HUD from './UI/HUD'
import OpacityControl from './UI/OpacityControl'
import OffsetToggle from './UI/OffsetToggle'
import MarkersInfo from './UI/MarkersInfo'
import DebugHelpersToggle from './UI/DebugHelpersToggle'
import initWasm, { process_point_cloud } from '../assets/wasm/pointcloud_wasm.js'

interface Marker {
  position: THREE.Vector3
  vertebraName: string
}

const z_offset_all = 0.05;

export default function ThreeScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    labelRenderer: CSS2DRenderer
    controls: OrbitControls
    raycaster: THREE.Raycaster
    mouse: THREE.Vector2
    animationId: number
  } | null>(null)

  // 默认偏移量映射表（在0.7倍scale下记录的偏移量）
  const defaultMarkerOffsets: Record<string, { x: number; y: number; z: number }> = {
    C7: { x: 0.008, y: -0.020, z: -0.151 },
    T1: { x: 0.003, y: -0.001, z: -0.165 },
    T2: { x: 0.006, y: 0.020, z: -0.177 },
    T3: { x: 0.005, y: 0.005, z: -0.197 },
    T4: { x: 0.006, y: 0.010, z: -0.206 },
    T5: { x: 0.009, y: 0.002, z: -0.223 },
    T6: { x: -0.006, y: 0.016, z: -0.232 },
    T7: { x: 0.004, y: 0.030, z: -0.229 },
    T8: { x: -0.004, y: 0.030, z: -0.234 },
    T9: { x: 0.009, y: 0.029, z: -0.233 },
    T10: { x: -0.007, y: 0.035, z: -0.233 },
    T11: { x: -0.000, y: 0.047, z: -0.224 },
    T12: { x: 0.008, y: 0.038, z: -0.226 },
    L1: { x: -0.008, y: 0.012, z: -0.252 },
    L2: { x: 0.005, y: 0.010, z: -0.245 },
    L3: { x: 0.001, y: -0.002, z: -0.256 },
    L4: { x: -0.010, y: 0.028, z: -0.256 },
    L5: { x: 0.017, y: 0.019, z: -0.241 },
  }

  // 从 localStorage 加载标记位置
  const loadMarkersFromStorage = (): Record<string, Marker> => {
    try {
      const stored = localStorage.getItem('markers')
      if (stored) {
        const parsed = JSON.parse(stored)
        console.log('从 localStorage 加载标记:', parsed)
        // 将存储的位置数据转换为 THREE.Vector3
        const markers: Record<string, Marker> = {}
        Object.keys(parsed).forEach((key) => {
          const marker = parsed[key]
          markers[key] = {
            position: new THREE.Vector3(marker.position.x, marker.position.y, marker.position.z),
            vertebraName: marker.vertebraName,
          }
        })
        console.log('转换后的标记:', markers)
        return markers
      }
    } catch (error) {
      console.error('加载标记缓存失败:', error)
    }
    return {}
  }

  // 从 localStorage 加载偏移量，如果没有则使用默认值
  const loadMarkerOffsetsFromStorage = (): Record<string, { x: number; y: number; z: number }> => {
    try {
      const stored = localStorage.getItem('markerOffsets')
      if (stored) {
        const parsed = JSON.parse(stored)
        // 合并默认值和存储的值，确保所有脊椎都有偏移量
        return { ...defaultMarkerOffsets, ...parsed }
      }
    } catch (error) {
      console.error('加载偏移量缓存失败:', error)
    }
    return defaultMarkerOffsets
  }

  // 保存偏移量到 localStorage
  const saveMarkerOffsetsToStorage = (offsets: Record<string, { x: number; y: number; z: number }>) => {
    try {
      localStorage.setItem('markerOffsets', JSON.stringify(offsets))
    } catch (error) {
      console.error('保存偏移量缓存失败:', error)
    }
  }

  // 保存标记位置到 localStorage
  const saveMarkersToStorage = (markers: Record<string, Marker>) => {
    try {
      // 将 THREE.Vector3 转换为可序列化的对象
      const serializable: Record<string, { position: { x: number; y: number; z: number }; vertebraName: string }> =
        {}
      Object.keys(markers).forEach((key) => {
        const marker = markers[key]
        serializable[key] = {
          position: {
            x: marker.position.x,
            y: marker.position.y,
            z: marker.position.z,
          },
          vertebraName: marker.vertebraName,
        }
      })
      localStorage.setItem('markers', JSON.stringify(serializable))
    } catch (error) {
      console.error('保存标记缓存失败:', error)
    }
  }

  // 状态管理
  const [humanPoints, setHumanPoints] = useState<Point3D[]>([])
  const [spinePoints, setSpinePoints] = useState<Point3D[]>([])
  const [transformParams, setTransformParams] = useState<TransformParams | null>(null)
  const [opacity, setOpacity] = useState(0.5)
  const [minOffset, setMinOffset] = useState(-1.5)
  const [models, setModels] = useState<THREE.Group[]>([])
  const [markers, setMarkers] = useState<Record<string, Marker>>(loadMarkersFromStorage)
  const [highlightedVertebra, setHighlightedVertebra] = useState<string | null>(null)
  const [, setIsDragging] = useState(false)
  const [hoveredModel, setHoveredModel] = useState<THREE.Group | null>(null)
  const [applyOffset, setApplyOffset] = useState(true) // 是否应用偏移量
  // const [showBoxHelpers, setShowBoxHelpers] = useState(false) // 是否显示模型边界框
  const [showMarkers, setShowMarkers] = useState(false) // 是否显示标记和连线
  const showMarkersRef = useRef(false) // 使用 ref 来访问最新的 showMarkers 值，默认 false
  const originalMaterialsRef = useRef<Map<THREE.Mesh, { colors: THREE.Color[]; emissives: THREE.Color[] }>>(new Map())
  const markersGroupRef = useRef<THREE.Group | null>(null)
  
  // WASM 相关状态
  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const wasmInitializedRef = useRef(false)
  const [modelReloadKey, setModelReloadKey] = useState(0) // 用于触发模型重新加载
  
  // 更新 ref 以保持最新值
  useEffect(() => {
    showMarkersRef.current = showMarkers
  }, [showMarkers])

  // 初始化 WASM 模块
  useEffect(() => {
    if (wasmInitializedRef.current) return

    const initWasmModule = async () => {
      try {
        console.log('初始化 WASM 模块...')
        await initWasm()
        console.log('WASM 初始化完成')
        setWasmInitialized(true)
        wasmInitializedRef.current = true
      } catch (error) {
        console.error('WASM 初始化失败:', error)
        setProcessingError(`WASM 初始化失败: ${error}`)
      }
    }

    initWasmModule()
  }, [])

  // 处理文件上传和 WASM 处理
  const handleFileProcessing = useCallback(async (pcFile: File, spineFile: File) => {
    if (!wasmInitializedRef.current) {
      setProcessingError('WASM 模块尚未初始化，请稍候...')
      return
    }

    setIsProcessing(true)
    setProcessingError(null)

    try {
      console.log('开始处理文件...')
      console.log(`PointCloud.png 大小: ${pcFile.size} 字节`)
      console.log(`point.json 大小: ${spineFile.size} 字节`)

      // 读取文件
      const pcBytes = new Uint8Array(await pcFile.arrayBuffer())
      const spineText = await spineFile.text()

      // 调用 WASM
      console.log('调用 WASM process_point_cloud...')
      let result = process_point_cloud(pcBytes, spineText)

      // 如果返回的是字符串，尝试解析
      if (typeof result === 'string') {
        console.log('检测到返回值为 string，尝试 JSON.parse...')
        result = JSON.parse(result)
      }

      console.log('WASM 处理完成，结果:', result)

      // 提取 spine 和 human_points
      const spineData = result.spine || []
      const humanPointsData = result.human_points || []

      console.log(`处理完成：spine 点数 = ${spineData.length}，human_points 点数 = ${humanPointsData.length}`)

      // 转换为 Point3D 格式
      const spinePointsArray: Point3D[] = spineData.map((p: { x?: number; y?: number; z?: number } | number[]) => {
        if (Array.isArray(p)) {
          return {
            x: p[0] || 0,
            y: p[1] || 0,
            z: p[2] || 0,
          }
        }
        return {
          x: p.x || 0,
          y: p.y || 0,
          z: p.z || 0,
        }
      })

      const humanPointsArray: Point3D[] = humanPointsData.map((p: { x?: number; y?: number; z?: number } | number[]) => {
        if (Array.isArray(p)) {
          return {
            x: p[0] || 0,
            y: p[1] || 0,
            z: p[2] || 0,
          }
        }
        return {
          x: p.x || 0,
          y: p.y || 0,
          z: p.z || 0,
        }
      })

      // 更新状态
      setSpinePoints(spinePointsArray)
      setHumanPoints(humanPointsArray)

      // 处理点云并获取变换参数
      if (humanPointsArray.length > 0) {
        const { transformParams: params } = processPointCloud(humanPointsArray)
        setTransformParams(params)
      }

      // 触发模型重新加载
      setModelReloadKey(prev => prev + 1)

      console.log('状态更新完成')
    } catch (error) {
      console.error('处理文件时出错:', error)
      setProcessingError(`处理失败: ${error}`)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  // 文件上传处理（仅选择文件，不自动处理）
  const handlePcFileChange = useCallback(() => {
    // 清除之前的错误信息
    setProcessingError(null)
  }, [])

  const handleSpineFileChange = useCallback(() => {
    // 清除之前的错误信息
    setProcessingError(null)
  }, [])

  const handleRunProcessing = useCallback(() => {
    const pcInput = document.getElementById('pc-file-input') as HTMLInputElement
    const spineInput = document.getElementById('spine-file-input') as HTMLInputElement

    const pcFile = pcInput?.files?.[0]
    const spineFile = spineInput?.files?.[0]

    if (!pcFile || !spineFile) {
      setProcessingError('请先选择 PointCloud.png 和 point.json 两个文件')
      return
    }

    handleFileProcessing(pcFile, spineFile)
  }, [handleFileProcessing])

  // 标记偏移量映射表（在0.7倍scale下记录的偏移量）
  const [markerOffsets, setMarkerOffsets] = useState<Record<string, { x: number; y: number; z: number }>>(
    loadMarkerOffsetsFromStorage
  )

  // 当偏移量更新时保存到 localStorage
  useEffect(() => {
    saveMarkerOffsetsToStorage(markerOffsets)
  }, [markerOffsets])

  // 初始化场景
  useEffect(() => {
    const mountElement = mountRef.current
    if (!mountElement) return

    if (sceneRef.current) {
      console.log('Scene already initialized, skipping...')
      return
    }

    console.log('Initializing Three.js scene...')

    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a) // 稍微亮一点的深灰色背景

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      45,
      mountElement.clientWidth / mountElement.clientHeight,
      0.01,
      100
    )
    camera.position.set(1.12, 1.88, -5.61)
    camera.rotation.set(
      (177.79 * Math.PI) / 180,
      (9.23 * Math.PI) / 180,
      (-179.64 * Math.PI) / 180
    )

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)

    // 创建标签渲染器
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.left = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'

    // 确保 canvas 元素有正确的样式
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.touchAction = 'none'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'auto'

    // 禁用右键菜单
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    canvas.addEventListener('contextmenu', handleContextMenu, { passive: false })

    // 添加鼠标样式变化
    canvas.style.cursor = 'grab'

    // 清空容器
    mountElement.innerHTML = ''
    mountElement.appendChild(canvas)
    mountElement.appendChild(labelRenderer.domElement)

    // 添加轨道控制器
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0.15, 2.11, 0.33)
    controls.update()

    // 射线检测器
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    // 创建标记组
    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    markersGroupRef.current = markersGroup

    // 监听控制器事件
    let dragging = false
    controls.addEventListener('start', () => {
      dragging = true
      setIsDragging(true)
    })

    controls.addEventListener('end', () => {
      dragging = false
      setIsDragging(false)
    })

    // 添加坐标轴辅助线
    const axesHelper = new THREE.AxesHelper(1.5)
    scene.add(axesHelper)

    // 添加坐标轴标签
    const createAxisLabel = (text: string, position: [number, number, number], color: string) => {
      const div = document.createElement('div')
      div.textContent = text
      div.style.color = color
      div.style.fontSize = '16px'
      div.style.fontWeight = 'bold'
      div.style.fontFamily = 'Arial, sans-serif'
      div.style.pointerEvents = 'none'
      div.style.userSelect = 'none'
      div.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)'

      const label = new CSS2DObject(div)
      label.position.set(...position)
      return label
    }

    const xLabel = createAxisLabel('X', [1.8, 0, 0], '#ff0000')
    scene.add(xLabel)
    const yLabel = createAxisLabel('Y', [0, 1.8, 0], '#00ff00')
    scene.add(yLabel)
    const zLabel = createAxisLabel('Z', [0, 0, 1.8], '#0000ff')
    scene.add(zLabel)

    // 添加光源（增强亮度）
    const ambientLight = new THREE.AmbientLight(0xffffff, 1) // 从0.5增加到0.8
    scene.add(ambientLight)

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2) // 从1.2增加到1.8
    directionalLight1.position.set(5, 8, 5)
    scene.add(directionalLight1)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 2.0) // 从0.6增加到1.0
    directionalLight2.position.set(-5, 6, 3)
    scene.add(directionalLight2)

    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 1) // 从0.4增加到0.8
    directionalLight3.position.set(0, 2, -8)
    scene.add(directionalLight3)

    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 2.0) // 从0.5增加到1.0
    directionalLight4.position.set(0, 10, 0)
    scene.add(directionalLight4)

    // 键盘控制
    const keys: Record<string, boolean> = {}
    const moveSpeed = 0.1

    const handleKeyDown = (event: KeyboardEvent) => {
      keys[event.code] = true
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      keys[event.code] = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // 动画循环
    const animate = () => {
      const animationId = requestAnimationFrame(animate)

      // 键盘控制相机移动
      if (keys['ArrowUp'] || keys['KeyW']) {
        // 向前移动（沿相机朝向）
        const direction = new THREE.Vector3()
        camera.getWorldDirection(direction)
        camera.position.addScaledVector(direction, moveSpeed)
        controls.target.addScaledVector(direction, moveSpeed)
      }
      if (keys['ArrowDown'] || keys['KeyS']) {
        // 向后移动
        const direction = new THREE.Vector3()
        camera.getWorldDirection(direction)
        camera.position.addScaledVector(direction, -moveSpeed)
        controls.target.addScaledVector(direction, -moveSpeed)
      }
      if (keys['ArrowLeft'] || keys['KeyA']) {
        // 向左移动（垂直于相机朝向）
        const direction = new THREE.Vector3()
        camera.getWorldDirection(direction)
        const left = new THREE.Vector3()
        left.crossVectors(camera.up, direction).normalize()
        camera.position.addScaledVector(left, moveSpeed)
        controls.target.addScaledVector(left, moveSpeed)
      }
      if (keys['ArrowRight'] || keys['KeyD']) {
        // 向右移动
        const direction = new THREE.Vector3()
        camera.getWorldDirection(direction)
        const right = new THREE.Vector3()
        right.crossVectors(direction, camera.up).normalize()
        camera.position.addScaledVector(right, moveSpeed)
        controls.target.addScaledVector(right, moveSpeed)
      }

      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
      return animationId
    }

    const animationId = animate()

    // 处理窗口大小变化
    const handleResize = () => {
      if (!mountElement) return
      camera.aspect = mountElement.clientWidth / mountElement.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
      labelRenderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
      controls.update()
    }
    window.addEventListener('resize', handleResize)

    // 鼠标事件处理
    let mouseDownPos: { x: number; y: number } | null = null

    const handleMouseMove = (event: MouseEvent) => {
      // 检测鼠标悬停（只有在没有拖拽时才检测）
      if (!dragging && mouseDownPos === null) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(mouse, camera)

        const objectsToCheck: THREE.Mesh[] = []
        const meshToModelMap = new Map<THREE.Mesh, string>()

        scene.traverse((object) => {
          if (object.userData && object.userData.vertebraName) {
            const vertebraName = object.userData.vertebraName
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                objectsToCheck.push(child)
                meshToModelMap.set(child, vertebraName)
              }
            })
          }
        })

        const intersects = raycaster.intersectObjects(objectsToCheck, false)
        let currentHoveredModel: THREE.Group | null = null
        let currentHoveredName: string | null = null

        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh
          currentHoveredName = meshToModelMap.get(mesh) || null

          if (currentHoveredName) {
            scene.traverse((obj) => {
              if (obj.userData && obj.userData.vertebraName === currentHoveredName) {
                currentHoveredModel = obj as THREE.Group
              }
            })
          }
        }

        if (currentHoveredModel !== hoveredModel) {
          if (hoveredModel) {
            restoreModelColor(hoveredModel)
            setHighlightedVertebra(null)
          }
          if (currentHoveredModel) {
            highlightModelColor(currentHoveredModel)
            setHighlightedVertebra(currentHoveredName)
          }
          setHoveredModel(currentHoveredModel)
        }
      }
    }

    const handleMouseDown = (event: MouseEvent) => {
      canvas.style.cursor = 'grabbing'
      if (event.button === 0) {
        mouseDownPos = { x: event.clientX, y: event.clientY }
      }
    }

    const handleMouseUp = (event: MouseEvent) => {
      canvas.style.cursor = 'grab'
      if (event.button === 0) {
        // 单击不触发标记，只重置状态
        mouseDownPos = null
      }
    }

    // 双击事件处理（用于标记）
    const handleDoubleClick = (event: MouseEvent) => {
      event.preventDefault()
      if (event.button === 0) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(mouse, camera)

        const objectsToCheck: THREE.Mesh[] = []
        const meshToModelMap = new Map<THREE.Mesh, string>()

        scene.traverse((object) => {
          if (object.userData && object.userData.vertebraName) {
            const vertebraName = object.userData.vertebraName
            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                objectsToCheck.push(child)
                meshToModelMap.set(child, vertebraName)
              }
            })
          }
        })

        const intersects = raycaster.intersectObjects(objectsToCheck, false)
        if (intersects.length > 0) {
          const intersect = intersects[0]
          const mesh = intersect.object as THREE.Mesh
          const vertebraName = meshToModelMap.get(mesh)

          if (vertebraName) {
            const hitPoint = intersect.point
            createOrUpdateMarker(vertebraName, hitPoint, scene)
          }
        }
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('dblclick', handleDoubleClick)

    canvas.addEventListener('mouseleave', () => {
      if (hoveredModel) {
        restoreModelColor(hoveredModel)
        setHighlightedVertebra(null)
        setHoveredModel(null)
      }
    })

    // 高亮模型颜色
    const highlightModelColor = (model: THREE.Group) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          // 保存原始材质（只在第一次高亮时保存）
          if (!originalMaterialsRef.current.has(child)) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            const original = {
              colors: materials.map((mat) => (mat as THREE.MeshStandardMaterial).color.clone()),
              emissives: materials.map((mat) =>
                (mat as THREE.MeshStandardMaterial).emissive
                  ? (mat as THREE.MeshStandardMaterial).emissive.clone()
                  : new THREE.Color(0x000000)
              ),
            }
            originalMaterialsRef.current.set(child, original)
          }

          // 可选：设置为蓝色高亮（HTML demo中被注释的功能）
          // if (Array.isArray(child.material)) {
          //   child.material.forEach((mat) => {
          //     ;(mat as THREE.MeshStandardMaterial).color.set(0x0000ff) // 蓝色
          //     if ((mat as THREE.MeshStandardMaterial).emissive) {
          //       ;(mat as THREE.MeshStandardMaterial).emissive.set(0x000033) // 微弱的蓝色自发光
          //     }
          //   })
          // } else {
          //   ;(child.material as THREE.MeshStandardMaterial).color.set(0x0000ff) // 蓝色
          //   if ((child.material as THREE.MeshStandardMaterial).emissive) {
          //     ;(child.material as THREE.MeshStandardMaterial).emissive.set(0x000033) // 微弱的蓝色自发光
          //   }
          // }
        }
      })
    }

    // 恢复模型颜色
    const restoreModelColor = (model: THREE.Group) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material && originalMaterialsRef.current.has(child)) {
          const original = originalMaterialsRef.current.get(child)!
          if (Array.isArray(child.material)) {
            child.material.forEach((mat, index) => {
              if (original.colors[index]) {
                ;(mat as THREE.MeshStandardMaterial).color.copy(original.colors[index])
              }
              if (original.emissives[index]) {
                ;(mat as THREE.MeshStandardMaterial).emissive.copy(original.emissives[index])
              }
            })
          } else {
            if (original.colors[0]) {
              ;(child.material as THREE.MeshStandardMaterial).color.copy(original.colors[0])
            }
            if (original.emissives[0]) {
              ;(child.material as THREE.MeshStandardMaterial).emissive.copy(original.emissives[0])
            }
          }
        }
      })
    }

    // 创建或更新标记
    const createOrUpdateMarker = (vertebraName: string, position: THREE.Vector3, scene: THREE.Scene) => {
      setMarkers((prev) => {
        const newMarkers = { ...prev }

        // 如果已存在标记，清除它（第二次双击清除标记）
        if (newMarkers[vertebraName] && markersGroupRef.current) {
          // 收集需要移除的子对象（避免在遍历时修改数组）
          const toRemove: THREE.Object3D[] = []
          markersGroupRef.current.children.forEach((child) => {
            if (child.userData.vertebraName === vertebraName) {
              toRemove.push(child)
            }
          })

          // 移除所有相关的标记对象
          toRemove.forEach((child) => {
            markersGroupRef.current!.remove(child)
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
          })

          // 恢复模型位置到原始spinePoint位置
          let targetModel: THREE.Group | null = null
          let spinePoint: THREE.Vector3 | null = null
          scene.traverse((obj) => {
            if (obj.userData && obj.userData.vertebraName === vertebraName) {
              if (obj.userData.spinePoint) {
                spinePoint = obj.userData.spinePoint as THREE.Vector3
              }
              targetModel = obj as THREE.Group
            }
          })
          if (targetModel && spinePoint) {
            const validTargetModel = targetModel as THREE.Group
            const validSpinePoint = spinePoint as THREE.Vector3
            validTargetModel.position.copy(validSpinePoint)
          }

          // 从状态中移除标记
          delete newMarkers[vertebraName]

          return newMarkers
        }

        // 如果不存在标记，创建新标记
        // 查找对应的模型以获取spinePoint
        let spinePoint: THREE.Vector3 | null = null
        let targetModel: THREE.Group | null = null
        scene.traverse((obj) => {
          if (obj.userData && obj.userData.vertebraName === vertebraName) {
            if (obj.userData.spinePoint) {
              spinePoint = obj.userData.spinePoint as THREE.Vector3
            }
            targetModel = obj as THREE.Group
          }
        })

        // 应用偏移量到模型位置（基于原始spinePoint位置）
        if (targetModel && spinePoint) {
          // 类型断言确保 TypeScript 正确识别类型
          const validSpinePoint = spinePoint as THREE.Vector3
          const validTargetModel = targetModel as THREE.Group
          
          // 根据当前标记位置计算新的偏移量
          // 偏移量 = 原始spinePoint位置 - 标记位置（反向计算）
          // 注意：z轴需要翻转，因为模型z轴是镜像的（scale: [0.7, 0.7, -0.7]）
          const actualOffset = {
            x: validSpinePoint.x - position.x,
            y: validSpinePoint.y - position.y,
            z: (validSpinePoint.z - position.z) * -1, // z轴翻转（因为模型z轴是镜像的）
          }

          // 更新偏移量缓存
          setMarkerOffsets((prev) => {
            const updated = {
              ...prev,
              [vertebraName]: actualOffset,
            }
            // 保存到 localStorage
            saveMarkerOffsetsToStorage(updated)
            return updated
          })

          // 根据开关状态应用偏移量
          if (applyOffset) {
            // 应用偏移量到模型位置
            // 模型新位置 = 原始spinePoint位置 - 偏移量（因为偏移量是反向计算的）
            // 注意：z轴需要再次翻转，因为应用偏移时需要考虑模型的z轴镜像
            const markerOffsetPoint = new THREE.Vector3(
              validSpinePoint.x - actualOffset.x,
              validSpinePoint.y - actualOffset.y,
              validSpinePoint.z - actualOffset.z * -1 // z轴翻转（因为模型z轴是镜像的）
            )
            // 应用偏移到模型位置
            validTargetModel.position.copy(markerOffsetPoint)
          } else {
            // 如果不应用偏移，保持模型在原始spinePoint位置
            validTargetModel.position.copy(validSpinePoint)
          }
        }

        // 创建新的红色标记点
        const markerGeometry = new THREE.SphereGeometry(0.015, 16, 16)
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
        const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial)
        markerMesh.position.copy(position)
        markerMesh.userData.vertebraName = vertebraName
        markerMesh.userData.isMarker = true
        markerMesh.visible = showMarkersRef.current // 使用 ref 获取最新值

        // 创建从spinePoint到标记点的连线
        if (spinePoint && markersGroupRef.current) {
          const validSpinePoint = spinePoint as THREE.Vector3
          const lineGeometry = new THREE.BufferGeometry().setFromPoints([validSpinePoint.clone(), position.clone()])
          const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 2 })
          const line = new THREE.Line(lineGeometry, lineMaterial)
          line.userData.vertebraName = vertebraName
          line.userData.isMarkerLine = true
          line.visible = showMarkersRef.current // 使用 ref 获取最新值
          markersGroupRef.current.add(line)
        }

        if (markersGroupRef.current) {
          markersGroupRef.current.add(markerMesh)
        }

        newMarkers[vertebraName] = {
          position: position.clone(),
          vertebraName,
        }

        return newMarkers
      })
    }

    // 保存引用
    sceneRef.current = {
      scene,
      camera,
      renderer,
      labelRenderer,
      controls,
      raycaster,
      mouse,
      animationId,
    }

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('dblclick', handleDoubleClick)
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId)
        const canvas = sceneRef.current.renderer.domElement
        canvas.removeEventListener('contextmenu', handleContextMenu)
        canvas.removeEventListener('mousedown', handleMouseDown)
        canvas.removeEventListener('mouseup', handleMouseUp)
        canvas.removeEventListener('dblclick', handleDoubleClick)
        sceneRef.current.controls.dispose()
        sceneRef.current.renderer.dispose()
        if (mountElement) {
          if (canvas.parentNode === mountElement) {
            mountElement.removeChild(canvas)
          }
          if (sceneRef.current.labelRenderer.domElement.parentNode === mountElement) {
            mountElement.removeChild(sceneRef.current.labelRenderer.domElement)
          }
        }
        sceneRef.current = null
      }
    }
  }, [])

  // 加载人体点云数据
  // useEffect(() => {
  //   fetch('/src/assets/human_points.json')
  //     .then((response) => response.json())
  //     .then((data: Point3D[]) => {
  //       console.log('加载人体点云 JSON 成功:', data.length, '个点')
  //       setHumanPoints(data)

  //       // 处理点云并获取变换参数
  //       const { transformParams: params } = processPointCloud(data)
  //       setTransformParams(params)

  //       // 加载脊柱点
  //       fetch('/src/assets/spine.json')
  //         .then((response) => response.json())
  //         .then((spineData: Point3D[]) => {
  //           console.log('加载脊柱点 JSON 成功:', spineData.length, '个点')
  //           setSpinePoints(spineData)
  //         })
  //         .catch((error) => {
  //           console.error('加载 spine_points_pca.json 失败:', error)
  //         })
  //     })
  //     .catch((error) => {
  //       console.error('加载 human_points_pca.json 失败:', error)
  //     })
  // }, [])

  // 处理模型加载完成
  const handleModelsLoaded = useCallback(
    (loadedModels: THREE.Group[]) => {
      setModels(loadedModels)
      // 保持初始镜头位置，不自动调整相机
      // 根据开关状态应用或恢复偏移量
      if (sceneRef.current) {
        const scene = sceneRef.current.scene

        loadedModels.forEach((model) => {
          if (model.userData && model.userData.vertebraName && model.userData.spinePoint) {
            const vertebraName = model.userData.vertebraName
            const spinePoint = model.userData.spinePoint as THREE.Vector3

            if (applyOffset && markerOffsets[vertebraName]) {
              // 应用偏移量
              const offset = markerOffsets[vertebraName]
              const markerOffsetPoint = new THREE.Vector3(
                spinePoint.x + offset.x,
                spinePoint.y + offset.y,
                spinePoint.z + offset.z * -1 + z_offset_all // z轴翻转
              )
              model.position.copy(markerOffsetPoint)
            } else {
              // 恢复到原始spinePoint位置
              model.position.copy(spinePoint)
            }
          }
        })

        // 从缓存恢复标记位置（使用当前的 markers 状态）
        // 注意：这里需要延迟执行，确保 markers 状态已经更新
        setTimeout(() => {
          if (sceneRef.current && markersGroupRef.current) {
            const currentMarkers = loadMarkersFromStorage()
            console.log('恢复标记，当前缓存中的标记:', currentMarkers)
            
            Object.keys(currentMarkers).forEach((vertebraName) => {
              const marker = currentMarkers[vertebraName]
              if (marker) {
                // 查找对应的模型以获取spinePoint
                let spinePoint: THREE.Vector3 | null = null
                let targetModel: THREE.Group | null = null

                scene.traverse((obj) => {
                  if (obj.userData && obj.userData.vertebraName === vertebraName) {
                    if (obj.userData.spinePoint) {
                      spinePoint = obj.userData.spinePoint as THREE.Vector3
                    }
                    targetModel = obj as THREE.Group
                  }
                })

                if (targetModel && spinePoint) {
                  // 类型断言确保 TypeScript 正确识别类型
                  const validSpinePoint = spinePoint as THREE.Vector3
                  const validTargetModel = targetModel as THREE.Group
                  
                  // 应用偏移量到模型位置（如果需要）
                  if (applyOffset && markerOffsets[vertebraName]) {
                    const offset = markerOffsets[vertebraName]
                    const markerOffsetPoint = new THREE.Vector3(
                      validSpinePoint.x + offset.x,
                      validSpinePoint.y + offset.y,
                      validSpinePoint.z + offset.z * -1 + z_offset_all
                    )
                    validTargetModel.position.copy(markerOffsetPoint)
                  } else {
                    validTargetModel.position.copy(validSpinePoint)
                  }

                  // 创建红色标记点
                  const markerGeometry = new THREE.SphereGeometry(0.015, 16, 16)
                  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
                  const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial)
                  markerMesh.position.copy(marker.position)
                  markerMesh.userData.vertebraName = vertebraName
                  markerMesh.userData.isMarker = true
                  markerMesh.visible = showMarkersRef.current // 使用 ref 获取最新值
                  markersGroupRef.current!.add(markerMesh)

                  // 创建从spinePoint到标记点的连线
                  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                    validSpinePoint.clone(),
                    marker.position.clone(),
                  ])
                  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 2 })
                  const line = new THREE.Line(lineGeometry, lineMaterial)
                  line.userData.vertebraName = vertebraName
                  line.userData.isMarkerLine = true
                  line.visible = showMarkersRef.current // 使用 ref 获取最新值
                  markersGroupRef.current!.add(line)
                  
                  console.log(`恢复标记: ${vertebraName}`, marker.position)
                }
              }
            })
            
            // 更新 markers 状态以反映恢复的标记
            if (Object.keys(currentMarkers).length > 0) {
              setMarkers(currentMarkers)
            }
          }
        }, 100)
      }
    },
    [applyOffset, markerOffsets]
  )

  // 当开关状态改变时，更新所有模型的位置
  useEffect(() => {
    if (!sceneRef.current) return
    const scene = sceneRef.current.scene
    // 遍历所有模型，更新它们的位置
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.vertebraName && obj.userData.spinePoint) {
        const vertebraName = obj.userData.vertebraName
        const spinePoint = obj.userData.spinePoint as THREE.Vector3
        const targetModel = obj as THREE.Group

        if (applyOffset && markerOffsets[vertebraName]) {
          // 应用偏移量
          const offset = markerOffsets[vertebraName]
          const markerOffsetPoint = new THREE.Vector3(
            spinePoint.x + offset.x,
            spinePoint.y + offset.y,
            spinePoint.z + offset.z * -1 + z_offset_all // z轴翻转
          )
          console.log(`开关切换时应用偏移到 ${vertebraName}:`, {
            spinePoint: { x: spinePoint.x, y: spinePoint.y, z: spinePoint.z },
            offset: { x: offset.x, y: offset.y, z: offset.z },
            result: { x: markerOffsetPoint.x, y: markerOffsetPoint.y, z: markerOffsetPoint.z },
          })
          targetModel.position.copy(markerOffsetPoint)
        } else {
          // 恢复到原始spinePoint位置
          targetModel.position.copy(spinePoint)
        }
      }
    })
  }, [applyOffset, markerOffsets])

  // 当标记更新时保存到 localStorage
  useEffect(() => {
    saveMarkersToStorage(markers)
  }, [markers])

  // 控制标记和连线的显示/隐藏
  useEffect(() => {
    if (!markersGroupRef.current) return
    markersGroupRef.current.children.forEach((child) => {
      if (child.userData.isMarker || child.userData.isMarkerLine) {
        child.visible = showMarkers
      }
    })
  }, [showMarkers])

  const scene = sceneRef.current?.scene

  return (
    <>
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100vh',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      />
      {/* 文件上传 UI */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '16px',
          borderRadius: '8px',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          minWidth: '300px',
        }}
      >
        <div style={{ marginBottom: '12px' }}>
          <label
            htmlFor="pc-file-input"
            style={{ display: 'inline-block', width: '140px', marginBottom: '8px' }}
          >
            PointCloud.png：
          </label>
          <input
            id="pc-file-input"
            type="file"
            accept=".png"
            onChange={handlePcFileChange}
            disabled={!wasmInitialized || isProcessing}
            style={{ color: '#fff' }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label
            htmlFor="spine-file-input"
            style={{ display: 'inline-block', width: '140px', marginBottom: '8px' }}
          >
            point.json：
          </label>
          <input
            id="spine-file-input"
            type="file"
            accept=".json"
            onChange={handleSpineFileChange}
            disabled={!wasmInitialized || isProcessing}
            style={{ color: '#fff' }}
          />
        </div>
        <div style={{ marginBottom: '12px' }}>
          <button
            onClick={handleRunProcessing}
            disabled={!wasmInitialized || isProcessing}
            style={{
              padding: '6px 14px',
              marginRight: '8px',
              cursor: !wasmInitialized || isProcessing ? 'not-allowed' : 'pointer',
              opacity: !wasmInitialized || isProcessing ? 0.5 : 1,
            }}
          >
            {isProcessing ? '处理中...' : '点云建模'}
          </button>
        </div>
        {processingError && (
          <div
            style={{
              marginTop: '12px',
              padding: '8px',
              background: 'rgba(255, 0, 0, 0.2)',
              borderRadius: '4px',
              color: '#ff6b6b',
              fontSize: '12px',
            }}
          >
            错误: {processingError}
          </div>
        )}
        {!wasmInitialized && (
          <div
            style={{
              marginTop: '12px',
              padding: '8px',
              background: 'rgba(255, 255, 0, 0.2)',
              borderRadius: '4px',
              color: '#ffd93d',
              fontSize: '12px',
            }}
          >
            WASM 模块初始化中...
          </div>
        )}
      </div>
      {/* Min Offset 控制 */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '16px',
          borderRadius: '8px',
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          minWidth: '250px',
        }}
      >
        <div style={{ marginBottom: '12px' }}>
          <label
            htmlFor="min-offset-slider"
            style={{ display: 'block', marginBottom: '8px' }}
          >
            Depth-Brightness Transition: {minOffset.toFixed(2)}
          </label>
          <input
            id="min-offset-slider"
            type="range"
            min="-1.5"
            max="-0.83"
            step="0.01"
            value={minOffset}
            onChange={(e) => setMinOffset(parseFloat(e.target.value))}
            disabled={humanPoints.length === 0}
            style={{
              width: '100%',
              cursor: humanPoints.length > 0 ? 'pointer' : 'not-allowed',
              opacity: humanPoints.length > 0 ? 1 : 0.5,
            }}
          />
        </div>
      </div>
      <HUD pointCount={humanPoints.length} spinePointCount={spinePoints.length} />
      <OpacityControl opacity={opacity} onChange={setOpacity} />
      <OffsetToggle enabled={applyOffset} onChange={setApplyOffset} />
      <DebugHelpersToggle
        // showBoxHelpers={showBoxHelpers}
        showMarkers={showMarkers}
        // onBoxHelpersChange={setShowBoxHelpers}
        onMarkersChange={setShowMarkers}
      />
      {sceneRef.current && (
        <>
          {/* <CameraInfo camera={sceneRef.current.camera} controls={sceneRef.current.controls} /> */}
          {showMarkers && <MarkersInfo
            markers={markers}
              models={models}
              highlightedVertebra={highlightedVertebra}
            />
          }
        </>
      )}
      {transformParams && scene && (
        <>
          <PointCloud points={humanPoints} opacity={opacity} scene={scene} minOffset={minOffset} />
          <SpinePoints points={spinePoints} transformParams={transformParams} scene={scene} />
          <VertebraModels
            spinePoints={spinePoints}
            transformParams={transformParams}
            scene={scene}
            onModelsLoaded={handleModelsLoaded}
            markerOffsets={markerOffsets}
            // showBoxHelpers={showBoxHelpers}
            showMarkers={showMarkers}
            reloadKey={modelReloadKey}
          />
        </>
      )}
    </>
  )
}
