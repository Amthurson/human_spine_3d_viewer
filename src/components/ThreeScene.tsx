import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { processPointCloud } from '../utils/pointCloudUtils'
import type { Point3D, TransformParams } from '../utils/pointCloudUtils'
import PointCloud from './PointCloud'
import SpinePoints from './SpinePoints'
import VertebraModels, { type VertebraModelsRef } from './VertebraModels'
import MarkersInfo from './UI/MarkersInfo'
import Sidebar from './UI/Sidebar'
import ColorImagePreview from './UI/ColorImagePreview'
import OperationHint from './UI/OperationHint'
import initWasm, { process_point_cloud } from '../assets/wasm/rgb_pointcloud_wasm.js'
// import CameraInfo from './UI/CameraInfo.js'
// import CameraInfo from './UI/CameraInfo.js'

interface Marker {
  position: THREE.Vector3
  vertebraName: string
}

const z_offset_all = 0.05;
const DEFAULT_MARKER_OFFSETS = {"C7":{"x":-0.010264620037538114,"y":-0.019544764034616247,"z":-0.2037936070787124},"T1":{"x":0.0011804996919972388,"y":0.023489402224895706,"z":-0.20319266294499005},"T2":{"x":-0.0020365719138432103,"y":0.0013876434856507913,"z":-0.22469596655004487},"T3":{"x":-0.011810103825779683,"y":-0.009702797368014604,"z":-0.2541427436016169},"T4":{"x":0.0026411327402862395,"y":-0.01297140388768847,"z":-0.2705150312979196},"T5":{"x":0.014765051694224207,"y":-0.022182006503121965,"z":-0.27284428328621935},"T6":{"x":0.007520902595686496,"y":-0.022881017167690754,"z":-0.2756774647119048},"T7":{"x":-0.002319604361232741,"y":-0.04596832291045372,"z":-0.2799130857730781},"T8":{"x":-0.0035561872032147945,"y":-0.06278863634255982,"z":-0.29580365125268326},"T9":{"x":-0.012740966990954866,"y":-0.07569547738919402,"z":-0.28893505909321027},"T10":{"x":0.024146368867932755,"y":-0.08570083283867058,"z":-0.2686049359897124},"T11":{"x":0.028703560403192274,"y":-0.07966029456662782,"z":-0.2643830202215228},"T12":{"x":0.0067152774264817305,"y":-0.06782428902895754,"z":-0.2487016754664949},"L1":{"x":0.009483429275908672,"y":-0.043378890396415626,"z":-0.24399114508554343},"L2":{"x":0.03343240652335859,"y":-0.06575674755856187,"z":-0.26334396972732904},"L3":{"x":0.031740837597671503,"y":-0.0366996224967735,"z":-0.2632297270167586},"L4":{"x":0.008936464705699143,"y":-0.07909721479281728,"z":-0.24567020234020387},"L5":{"x":-0.03218119462482108,"y":-0.09075889149455435,"z":-0.229307243389278}}

/**
 * 统一 point.json 格式，将两种格式转换为 {x, y} 对象数组格式
 * 支持格式：
 * 1. [{x:123, y:123}] - 对象数组格式
 * 2. [[123, 123]] - 二维数组格式
 * @param jsonText - JSON 字符串
 * @returns 统一格式后的 JSON 字符串
 */
function normalizePointJson(jsonText: string): string {
  try {
    const data = JSON.parse(jsonText)
    
    // 如果不是数组，直接返回原数据
    if (!Array.isArray(data)) {
      console.warn('point.json 不是数组格式，保持原样')
      return jsonText
    }
    
    // 检查第一个元素，判断格式类型
    if (data.length === 0) {
      return jsonText
    }
    
    const firstItem = data[0]
    
    // 如果已经是对象格式 {x, y}，直接返回
    if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
      if ('x' in firstItem || 'y' in firstItem) {
        return jsonText
      }
    }
    
    // 如果是数组格式 [[123, 123]]，转换为对象格式
    if (Array.isArray(firstItem)) {
      const normalized = data.map((item: number[]) => {
        if (Array.isArray(item)) {
          return {
            x: item[0] ?? 0,
            y: item[1] ?? 0,
            // 如果有 z 值，也保留
            ...(item[2] !== undefined ? { z: item[2] } : {})
          }
        }
        return item
      })
      return JSON.stringify(normalized)
    }
    
    // 其他情况保持原样
    return jsonText
  } catch (error) {
    console.error('解析 point.json 失败:', error)
    // 解析失败时返回原文本
    return jsonText
  }
}

export default function ThreeScene() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    rootGroup: THREE.Group
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    labelRenderer: CSS2DRenderer
    controls: OrbitControls
    raycaster: THREE.Raycaster
    mouse: THREE.Vector2
    animationId: number
  } | null>(null)

  // 从 localStorage 加载标记位置
  const loadMarkersFromStorage = (): Record<string, Marker> => {
    try {
      const stored = localStorage.getItem('markers')
      if (stored) {
        const parsed = JSON.parse(stored)
        // 将存储的位置数据转换为 THREE.Vector3
        const markers: Record<string, Marker> = {}
        Object.keys(parsed).forEach((key) => {
          const marker = parsed[key]
          markers[key] = {
            position: new THREE.Vector3(marker.position.x, marker.position.y, marker.position.z),
            vertebraName: marker.vertebraName,
          }
        })
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
        return { ...parsed }
      } else {
        localStorage.setItem('markerOffsets', JSON.stringify(DEFAULT_MARKER_OFFSETS))
        return DEFAULT_MARKER_OFFSETS
      }
    } catch (error) {
      console.error('加载偏移量缓存失败:', error)
    }
    return {}
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
  const [opacity, setOpacity] = useState(0.9)
  const [minOffset, setMinOffset] = useState(-0.91)
  const [models, setModels] = useState<THREE.Group[]>([])
  const [markers, setMarkers] = useState<Record<string, Marker>>(loadMarkersFromStorage)
  const [highlightedVertebra, setHighlightedVertebra] = useState<string | null>(null)
  const [, setIsDragging] = useState(false)
  const [hoveredModel, setHoveredModel] = useState<THREE.Group | null>(null)
  const [applyOffset, setApplyOffset] = useState(true) // 是否应用偏移量
  // const [showBoxHelpers, setShowBoxHelpers] = useState(false) // 是否显示模型边界框
  const [showMarkers, setShowMarkers] = useState(false) // 是否显示标记和连线
  const [allowedYOverlapRatio, setAllowedYOverlapRatio] = useState(0.69) // Y轴允许重合比例，默认20%
  const [isOptimizing, setIsOptimizing] = useState(false) // 是否正在优化模型缩放
  const [colorImageUrl, setColorImageUrl] = useState<string | null>(null) // Color.png 图片 URL
  const [rawSpinePoints2D, setRawSpinePoints2D] = useState<Array<{ x: number; y: number }>>([]) // 原始的 point.json 2D 坐标
  const showMarkersRef = useRef(false) // 使用 ref 来访问最新的 showMarkers 值，默认 false
  const originalMaterialsRef = useRef<Map<THREE.Mesh, { colors: THREE.Color[]; emissives: THREE.Color[] }>>(new Map())
  const markersGroupRef = useRef<THREE.Group | null>(null)
  const vertebraModelsRef = useRef<VertebraModelsRef>(null) // VertebraModels组件的ref
  const modelsRef = useRef<THREE.Group[]>([]) // 保存模型的引用，避免依赖项变化导致重复执行
  const applyOffsetRef = useRef(applyOffset) // 保存applyOffset的引用
  const [colorData, setColorData] = useState<{ r: number, g: number, b: number }[]>([])
  // WASM 相关状态
  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const wasmInitializedRef = useRef(false)
  const [pointType, setPointType] = useState<'sphere' | 'box'>('box')
  const [modelReloadKey, setModelReloadKey] = useState(0) // 用于触发模型重新加载
  const [selectedLight, setSelectedLight] = useState<THREE.DirectionalLight | null>(null) // 选中的光源
  const [showLightHelpers] = useState(false) // 是否显示光源辅助器
  const selectedLightRef = useRef<THREE.DirectionalLight | null>(null)
  const lightHelpersRef = useRef<THREE.DirectionalLightHelper[]>([])
  const lightSpheresRef = useRef<THREE.Mesh[]>([]) // 光源位置球体
  const isDraggingLightRef = useRef(false) // 是否正在拖动光源
  const transformControlsRef = useRef<TransformControls | null>(null) // TransformControls引用
  const [skinOpacity, setSkinOpacity] = useState(1)
  const [showPointCloud, setShowPointCloud] = useState(true)
  const [showSkin, setShowSkin] = useState(false)
  const [pointSize, setPointSize] = useState(0.038)
  const [showOriginalColor, setShowOriginalColor] = useState(true)
  // 更新 ref 以保持最新值
  useEffect(() => {
    showMarkersRef.current = showMarkers
  }, [showMarkers])

  // 更新 selectedLight ref
  useEffect(() => {
    selectedLightRef.current = selectedLight
  }, [selectedLight])

  // 更新 applyOffset ref
  useEffect(() => {
    applyOffsetRef.current = applyOffset
  }, [applyOffset])

  // 初始化 WASM 模块
  useEffect(() => {
    if (wasmInitializedRef.current) return

    const initWasmModule = async () => {
      try {
        await initWasm()
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
  const handleFileProcessing = useCallback(async (pcFile: File, spineFile: File, colorFile: File) => {
    if (!wasmInitializedRef.current) {
      setProcessingError('WASM 模块尚未初始化，请稍候...')
      return
    }

    setIsProcessing(true)
    setProcessingError(null)

    try {
      // 读取文件
      const pcBytes = new Uint8Array(await pcFile.arrayBuffer())
      const colorBytes = new Uint8Array(await colorFile.arrayBuffer())
      let spineText = await spineFile.text()

      // 统一 point.json 格式，兼容两种格式：[{x,y}] 和 [[x,y]]
      spineText = normalizePointJson(spineText)
      
      // 解析并保存原始的 2D 坐标点（用于图片预览）
      try {
        const rawSpineData = JSON.parse(spineText)
        const rawPoints2D: Array<{ x: number; y: number }> = rawSpineData.map((p: { x?: number; y?: number } | number[]) => {
          if (Array.isArray(p)) {
            return {
              x: p[0] ?? 0,
              y: p[1] ?? 0,
            }
          }
          return {
            x: p.x ?? 0,
            y: p.y ?? 0,
          }
        })
        setRawSpinePoints2D(rawPoints2D)
      } catch (error) {
        console.error('解析原始 point.json 失败:', error)
        setRawSpinePoints2D([])
      }

      // 调用 WASM
      let result = process_point_cloud(pcBytes, spineText, colorBytes)

      // 如果返回的是字符串，尝试解析
      if (typeof result === 'string') {
        result = JSON.parse(result)
      }

      // 提取 spine 和 human_points
      const spineData = result.spine || []
      const humanPointsData = result.human_points || []
      const rawColorData = result.color || result.human_points_colors || []
      
      // 转换颜色数据格式，支持多种格式：{r,g,b}[] 或 [r,g,b][] 或 {r:255, g:255, b:255}[]
      const colorData: { r: number, g: number, b: number }[] = rawColorData.map((col: { r?: number, g?: number, b?: number, [key: number]: number | undefined } | number[]) => {
        if (Array.isArray(col)) {
          // 数组格式 [r, g, b]
          return { r: col[0] ?? 255, g: col[1] ?? 255, b: col[2] ?? 255 }
        } else if (col && typeof col === 'object') {
          // 对象格式，可能已经是 {r, g, b} 或 {r: 255, g: 255, b: 255}
          return {
            r: col.r ?? col[0] ?? 255,
            g: col.g ?? col[1] ?? 255,
            b: col.b ?? col[2] ?? 255
          }
        }
        // 默认白色
        return { r: 255, g: 255, b: 255 }
      })

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
      setColorData(colorData)
      // 处理点云并获取变换参数
      if (humanPointsArray.length > 0) {
        const { transformParams: params } = processPointCloud(humanPointsArray)
        setTransformParams(params)
      }

      // 触发模型重新加载
      setModelReloadKey(prev => prev + 1)
    } catch (error) {
      console.error('处理文件时出错:', error)
      setProcessingError(`处理失败: ${error}`)
      setRawSpinePoints2D([]) // 清除原始数据
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

  const handleColorFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 创建新的图片 URL
      const url = URL.createObjectURL(file)
      setColorImageUrl((prevUrl) => {
        // 清除之前的图片 URL
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl)
        }
        return url
      })
    } else {
      // 如果没有选择文件，清除图片
      setColorImageUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl)
        }
        return null
      })
    }
  }, [])

  const handleRunProcessing = useCallback(() => {
    const pcInput = document.getElementById('pc-file-input') as HTMLInputElement
    const spineInput = document.getElementById('spine-file-input') as HTMLInputElement
    const colorInput = document.getElementById('color-file-input') as HTMLInputElement

    const pcFile = pcInput?.files?.[0]
    const spineFile = spineInput?.files?.[0]
    const colorFile = colorInput?.files?.[0]
    if (!pcFile || !spineFile || !colorFile) {
      setProcessingError('请先选择 PointCloud.png 和 point.json 、Color.png 三个文件')
      return
    }

    handleFileProcessing(pcFile, spineFile, colorFile)
  }, [handleFileProcessing])

  // 标记偏移量映射表（在0.7倍scale下记录的偏移量）
  const [markerOffsets, setMarkerOffsets] = useState<Record<string, { x: number; y: number; z: number }>>(
    loadMarkerOffsetsFromStorage
  )
  const markerOffsetsRef = useRef(markerOffsets) // 保存markerOffsets的引用

  // 当偏移量更新时保存到 localStorage
  useEffect(() => {
    saveMarkerOffsetsToStorage(markerOffsets)
    markerOffsetsRef.current = markerOffsets // 更新ref
  }, [markerOffsets])

  // 初始化场景
  useEffect(() => {
    const mountElement = mountRef.current
    if (!mountElement) return

    if (sceneRef.current) {
      return
    }

    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a) // 稍微亮一点的深灰色背景

    // 创建根容器组，用于翻转整个场景的 x 轴
    const rootGroup = new THREE.Group()
    rootGroup.scale.x = -1 // 翻转 x 轴
    scene.add(rootGroup)

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      45,
      mountElement.clientWidth / mountElement.clientHeight,
      0.01,
      10000
    )
    // 设置初始相机位置
    camera.position.set(0.61, 2.86, -7.40)
    // 设置初始相机旋转（角度转弧度）
    camera.rotation.set(
      (-171.27 * Math.PI) / 180,
      (-0.19 * Math.PI) / 180,
      (-179.97 * Math.PI) / 180
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
    // 设置初始控制器目标位置
    controls.target.set(0.64, 1.68, 0.29)
    controls.update()

    // 射线检测器
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    // 创建标记组
    const markersGroup = new THREE.Group()
    rootGroup.add(markersGroup)
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
    rootGroup.add(axesHelper)

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
    rootGroup.add(xLabel)
    const yLabel = createAxisLabel('Y', [0, 1.8, 0], '#00ff00')
    rootGroup.add(yLabel)
    const zLabel = createAxisLabel('Z', [0, 0, 1.8], '#0000ff')
    rootGroup.add(zLabel)

    // 添加光源（增强亮度）
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3) // 从0.5增加到0.8
    rootGroup.add(ambientLight)

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1) // 从1.2增加到1.8
    directionalLight1.position.set(5, 8, 5)
    rootGroup.add(directionalLight1)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0) // 从0.6增加到1.0
    directionalLight2.position.set(-5, 6, 3)
    rootGroup.add(directionalLight2)

    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 1) // 从0.4增加到0.8
    directionalLight3.position.set(0, 2, -8)
    rootGroup.add(directionalLight3)

    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 1.0) // 从0.5增加到1.0
    directionalLight4.position.set(0, 10, 0)
    rootGroup.add(directionalLight4)

    // 创建两个侧向直射光源，用于显示z深度阴影轮廓
    const sideLight1 = new THREE.DirectionalLight(0xffffff, 1.2) // 左侧光源
    sideLight1.position.set(-10, 2, 0) // 从左侧照射
    sideLight1.castShadow = true
    rootGroup.add(sideLight1)

    const sideLight2 = new THREE.DirectionalLight(0xffffff, 1.2) // 右侧光源
    sideLight2.position.set(10, 2, 0) // 从右侧照射
    sideLight2.castShadow = true
    rootGroup.add(sideLight2)

    // 创建光源辅助器
    const helper1 = new THREE.DirectionalLightHelper(sideLight1, 1, 0xffff00)
    helper1.visible = showLightHelpers
    rootGroup.add(helper1)
    lightHelpersRef.current.push(helper1)

    const helper2 = new THREE.DirectionalLightHelper(sideLight2, 1, 0xffff00)
    helper2.visible = showLightHelpers
    rootGroup.add(helper2)
    lightHelpersRef.current.push(helper2)

    // 创建光源位置球体（用于显示和拖动）
    const createLightSphere = (light: THREE.DirectionalLight, color: number) => {
      const geometry = new THREE.SphereGeometry(0.15, 16, 16)
      const material = new THREE.MeshBasicMaterial({ 
        color,
        transparent: true,
        opacity: 0.8
      })
      const sphere = new THREE.Mesh(geometry, material)
      sphere.position.copy(light.position)
      sphere.userData.light = light
      sphere.userData.isLightSphere = true
      sphere.visible = showLightHelpers
      rootGroup.add(sphere)
      return sphere
    }

    const lightSphere1 = createLightSphere(sideLight1, 0xffff00) // 黄色
    const lightSphere2 = createLightSphere(sideLight2, 0x00ffff) // 青色
    lightSpheresRef.current = [lightSphere1, lightSphere2]

    // 创建TransformControls用于拖动光源
    const transformControls = new TransformControls(camera, renderer.domElement)
    transformControls.setMode('translate') // 设置为移动模式
    transformControls.setSpace('world') // 使用世界坐标系
    transformControls.showX = true
    transformControls.showY = true
    transformControls.showZ = true
    transformControls.enabled = false // 初始禁用
    
    // TransformControls 在某些版本的 Three.js 中可以直接添加到场景
    // 尝试添加到场景，如果失败则使用替代方案
    // try {
    //   // 检查 TransformControls 是否是 Object3D 的实例
    //   if ('isObject3D' in transformControls && transformControls.isObject3D) {
    //     scene.add(transformControls as unknown as THREE.Object3D)
    //   } else {
    //     // 如果不是 Object3D，尝试直接添加（某些版本可能支持）
    //     // 使用类型断言绕过类型检查
    //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //     const sceneAny = scene as any
    //     if (typeof sceneAny.add === 'function') {
    //       sceneAny.add(transformControls)
    //     }
    //   }
    // } catch (error) {
    //   console.warn('无法将 TransformControls 添加到场景，使用替代方案:', error)
    //   // 如果添加失败，TransformControls 仍然可以工作，只是不会在场景中显示
    //   // 我们需要手动在渲染循环中更新它
    // }
    transformControlsRef.current = transformControls

    // 监听TransformControls的拖动事件
    transformControls.addEventListener('dragging-changed', (event) => {
      // 拖动时禁用OrbitControls
      const isDragging = event.value as boolean
      controls.enabled = !isDragging
      isDraggingLightRef.current = isDragging
    })

    // 监听TransformControls的位置变化
    transformControls.addEventListener('change', () => {
      if (selectedLightRef.current) {
        const light = selectedLightRef.current
        // 更新光源球体位置
        lightSpheresRef.current.forEach((sphere) => {
          if (sphere.userData.light === light) {
            sphere.position.copy(light.position)
          }
        })
        // 更新光源辅助器
        lightHelpersRef.current.forEach((helper) => {
          if (helper.light === light) {
            helper.update()
          }
        })
      }
    })



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
      
      // 更新TransformControls（TransformControls会在change事件中自动更新，这里不需要手动调用update）
      
      // 优化：使用模型到BoxHelper的映射，避免双重遍历和频繁创建对象
      // 只在模型加载后更新一次映射，然后直接通过映射更新
      if (modelsRef.current.length > 0) {
        modelsRef.current.forEach((model) => {
          if (model.userData && model.userData.boxHelper && model.userData.vertebraName) {
            const boxHelper = model.userData.boxHelper as THREE.BoxHelper
            if (boxHelper && boxHelper.visible) {
              // 更新模型的变换矩阵
              model.updateMatrixWorld(true)
              
              // 使用BoxHelper的update方法，它会自动重新计算边界框
              // 这比手动创建Box3和Float32Array更高效，避免内存泄漏
              boxHelper.update()
            }
          }
        })
      }
      
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
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
      raycaster.setFromCamera(mouse, camera)

      // TransformControls会自己处理拖动，这里不需要手动处理

      // 检测鼠标悬停（只有在没有拖拽时才检测）
      if (!dragging && mouseDownPos === null && !isDraggingLightRef.current) {
        // 先检查是否悬停在光源球体上
        const lightSpheres = lightSpheresRef.current.filter(s => s.visible)
        const lightIntersects = raycaster.intersectObjects(lightSpheres, false)
        
        if (lightIntersects.length > 0) {
          const sphere = lightIntersects[0].object as THREE.Mesh
          const light = sphere.userData.light as THREE.DirectionalLight
          canvas.style.cursor = 'pointer'
          // 高亮选中的光源球体
          if (selectedLightRef.current !== light) {
            // 重置之前选中的球体
            const prevLight = selectedLightRef.current
            if (prevLight) {
              lightSpheresRef.current.forEach((s) => {
                if (s.userData.light === prevLight) {
                  (s.material as THREE.MeshBasicMaterial).opacity = 0.8
                  s.scale.set(1, 1, 1)
                }
              })
            }
            // 高亮当前球体
            (sphere.material as THREE.MeshBasicMaterial).opacity = 1.0
            sphere.scale.set(1.2, 1.2, 1.2)
            setSelectedLight(light)
            // 将TransformControls附加到选中的光源
            if (transformControlsRef.current) {
              transformControlsRef.current.attach(light)
              transformControlsRef.current.enabled = true
            }
          }
          return
        } else {
          // 检查是否点击了空白区域，取消选中
          // 重置所有光源球体
          lightSpheresRef.current.forEach((s) => {
            (s.material as THREE.MeshBasicMaterial).opacity = 0.8
            s.scale.set(1, 1, 1)
          })
          if (selectedLightRef.current && !isDraggingLightRef.current) {
            setSelectedLight(null)
            // 隐藏TransformControls
            if (transformControlsRef.current) {
              transformControlsRef.current.detach()
              transformControlsRef.current.enabled = false
            }
          }
          canvas.style.cursor = 'grab'
        }

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
      if (event.button === 0) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
        raycaster.setFromCamera(mouse, camera)

        // 检查是否点击了光源球体
        const lightSpheres = lightSpheresRef.current.filter(s => s.visible)
        const lightIntersects = raycaster.intersectObjects(lightSpheres, false)
        
        if (lightIntersects.length > 0) {
          const sphere = lightIntersects[0].object as THREE.Mesh
          const light = sphere.userData.light as THREE.DirectionalLight
          setSelectedLight(light)
          // 将TransformControls附加到选中的光源
          if (transformControlsRef.current) {
            transformControlsRef.current.attach(light)
            transformControlsRef.current.enabled = true
          }
          return
        }

        // 检查是否点击了空白区域，取消选中
        if (selectedLightRef.current && transformControlsRef.current) {
          // 检查是否点击了空白区域，取消选中
          // 如果点击了空白区域（没有点击到任何可交互对象），取消选中
          const allObjects: THREE.Object3D[] = []
          scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
              // 排除光源球体
              if (!obj.userData.isLightSphere) {
                allObjects.push(obj)
              }
            }
          })
          const allIntersects = raycaster.intersectObjects(allObjects, false)
          
          // 如果没有点击到任何对象，取消选中
          if (allIntersects.length === 0) {
            setSelectedLight(null)
            transformControlsRef.current.detach()
            transformControlsRef.current.enabled = false
          }
        }

        canvas.style.cursor = 'grabbing'
        mouseDownPos = { x: event.clientX, y: event.clientY }
      }
    }

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 0) {
        canvas.style.cursor = 'grab'
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
            
            // 应用偏移后，重新进行碰撞检测和缩放优化
            setTimeout(() => {
              if (vertebraModelsRef.current) {
                setIsOptimizing(true) // 开始优化
                vertebraModelsRef.current.optimizeScales(() => {
                  setIsOptimizing(false) // 优化完成
                })
              }
            }, 100)
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
      rootGroup,
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
      
      // 清理TransformControls
      if (transformControlsRef.current) {
        scene.remove(transformControlsRef.current as unknown as THREE.Object3D)
        transformControlsRef.current.dispose()
        transformControlsRef.current = null
      }
      
      // 清理光源辅助器
      lightHelpersRef.current.forEach((helper) => {
        rootGroup.remove(helper)
        helper.dispose()
      })
      lightHelpersRef.current = []
      
      // 清理光源球体
      lightSpheresRef.current.forEach((sphere) => {
        rootGroup.remove(sphere)
        sphere.geometry.dispose()
        if (sphere.material instanceof THREE.Material) {
          sphere.material.dispose()
        }
      })
      lightSpheresRef.current = []
      
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 处理模型加载完成
  const handleModelsLoaded = useCallback(
    (loadedModels: THREE.Group[]) => {
      setModels(loadedModels)
      modelsRef.current = loadedModels // 保存模型引用
      // 保持初始镜头位置，不自动调整相机
      
      // 第一步：根据当前的applyOffset状态应用偏移
      const currentApplyOffset = applyOffsetRef.current
      const currentMarkerOffsets = markerOffsetsRef.current
      
      if (currentApplyOffset) {
        // 先应用偏移，调整位置
        loadedModels.forEach((model) => {
          if (model.userData && model.userData.vertebraName && model.userData.spinePoint) {
            const vertebraName = model.userData.vertebraName
            const spinePoint = model.userData.spinePoint as THREE.Vector3
            
            if (currentMarkerOffsets[vertebraName]) {
              const offset = currentMarkerOffsets[vertebraName]
              const markerOffsetPoint = new THREE.Vector3(
                spinePoint.x + offset.x,
                spinePoint.y + offset.y,
                spinePoint.z + offset.z * -1 + z_offset_all // z轴翻转
              )
              model.position.copy(markerOffsetPoint)
            }
          }
        })
      }
      
        // 第二步：等待位置调整完成，然后进行碰撞检测和缩放优化
        // 无论是否应用偏移，都需要进行碰撞检测和缩放优化
        setTimeout(() => {
          if (vertebraModelsRef.current) {
            setIsOptimizing(true) // 开始优化
            vertebraModelsRef.current.optimizeScales(() => {
              setIsOptimizing(false) // 优化完成
            })
          }
        }, 200) // 延迟确保位置调整完成

      // 从缓存恢复标记位置（使用当前的 markers 状态）
      // 注意：这里需要延迟执行，确保 markers 状态已经更新
      setTimeout(() => {
        if (sceneRef.current && markersGroupRef.current) {
          const currentMarkers = loadMarkersFromStorage()
          const scene = sceneRef.current.scene
          
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
              }
            }
          })
          
          // 更新 markers 状态以反映恢复的标记
          if (Object.keys(currentMarkers).length > 0) {
            setMarkers(currentMarkers)
          }
        }
      }, 100)
    },
    [] // 移除applyOffset和markerOffsets依赖，避免回调重新创建
  )

  // 当开关状态改变时，先清除当前GLB模型，然后重新加载
  useEffect(() => {
    // 切换applyOffset时，触发模型重新加载（清除并重新加载）
    setModelReloadKey(prev => prev + 1)
  }, [applyOffset])

  // 当开关状态改变时，更新所有模型的位置
  useEffect(() => {
    if (!sceneRef.current || modelsRef.current.length === 0) return
    
    // 只处理已加载的模型，避免重复处理
    // 注意：当applyOffset改变时，会触发模型重新加载，所以这里不需要处理
    // 位置更新会在模型加载完成后通过handleModelsLoaded处理
  }, [applyOffset, markerOffsets, modelReloadKey]) // 添加modelReloadKey依赖，确保模型重新加载后更新位置

  // 当 allowedYOverlapRatio 改变时，使用防抖机制延迟触发碰撞检测和缩放优化
  useEffect(() => {
    // 如果模型还没有加载，不执行优化
    if (!vertebraModelsRef.current || modelsRef.current.length === 0) return

    // 设置防抖定时器，延迟 1 秒后执行优化
    const debounceTimer = setTimeout(() => {
      if (vertebraModelsRef.current) {
        setIsOptimizing(true) // 开始优化
        vertebraModelsRef.current.optimizeScales(() => {
          setIsOptimizing(false) // 优化完成
        })
      }
    }, 1000) // 1秒延迟

    // 清理函数：如果 allowedYOverlapRatio 在 1 秒内再次改变，取消之前的定时器
    return () => {
      clearTimeout(debounceTimer)
    }
  }, [allowedYOverlapRatio])

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

  // 控制光源辅助器的显示/隐藏
  useEffect(() => {
    lightHelpersRef.current.forEach((helper) => {
      helper.visible = showLightHelpers
    })
    lightSpheresRef.current.forEach((sphere) => {
      sphere.visible = showLightHelpers
    })
  }, [showLightHelpers])

  // 当选中光源变化时，更新TransformControls
  useEffect(() => {
    if (transformControlsRef.current) {
      if (selectedLight) {
        transformControlsRef.current.attach(selectedLight)
        transformControlsRef.current.enabled = true
      } else {
        transformControlsRef.current.detach()
        transformControlsRef.current.enabled = false
      }
    }
  }, [selectedLight])

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
      {/* 侧边栏 - 整合所有 UI 组件 */}
      <Sidebar
        wasmInitialized={wasmInitialized}
        isProcessing={isProcessing}
        processingError={processingError}
        onPcFileChange={handlePcFileChange}
        onSpineFileChange={handleSpineFileChange}
        onColorFileChange={handleColorFileChange}
        onRunProcessing={handleRunProcessing}
        humanPoints={humanPoints.length}
        spinePoints={spinePoints.length}
        opacity={opacity}
        skinOpacity={skinOpacity}
        onOpacityChange={setOpacity}
        onSkinOpacityChange={setSkinOpacity}
        minOffset={minOffset}
        onMinOffsetChange={setMinOffset}
        applyOffset={applyOffset}
        onApplyOffsetChange={setApplyOffset}
        showMarkers={showMarkers}
        onShowMarkersChange={setShowMarkers}
        allowedYOverlapRatio={allowedYOverlapRatio}
        onAllowedYOverlapRatioChange={setAllowedYOverlapRatio}
        isOptimizing={isOptimizing}
        pointType={pointType}
        onPointTypeChange={setPointType}
        showPointCloud={showPointCloud}
        onShowPointCloudChange={setShowPointCloud}
        showSkin={showSkin}
        onShowSkinChange={setShowSkin}
        pointSize={pointSize}
        onPointSizeChange={setPointSize}
        showOriginalColor={showOriginalColor}
        onShowOriginalColorChange={setShowOriginalColor}
      />
      {/* Color.png 预览窗口 */}
      <ColorImagePreview imageUrl={colorImageUrl} spinePoints2D={rawSpinePoints2D} />
      {/* 操作提示 */}
      <OperationHint />
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
      {transformParams && scene && sceneRef.current && (
        <>
          <PointCloud points={humanPoints} opacity={opacity} skinOpacity={skinOpacity} scene={sceneRef.current.rootGroup} minOffset={minOffset} pointType={pointType} humanColors={colorData} showPointCloud={showPointCloud} showSkin={showSkin} pointSize={pointSize} showOriginalColor={showOriginalColor}/>
          <SpinePoints points={spinePoints} transformParams={transformParams} scene={sceneRef.current.rootGroup} />
          <VertebraModels
            ref={vertebraModelsRef}
            spinePoints={spinePoints}
            transformParams={transformParams}
            scene={sceneRef.current.rootGroup}
            onModelsLoaded={handleModelsLoaded}
            markerOffsets={markerOffsets}
            // showBoxHelpers={showBoxHelpers}
            allowedYOverlapRatio={allowedYOverlapRatio}
            showMarkers={showMarkers}
            reloadKey={modelReloadKey}
          />
        </>
      )}
    </>
  )
}
