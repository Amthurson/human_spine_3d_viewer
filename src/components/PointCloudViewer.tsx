import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import ImagePointCloud from './ImagePointCloud'

export default function PointCloudViewer() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    animationId: number
  } | null>(null)
  const [isReady, setIsReady] = useState(false)

  // 初始化场景
  useEffect(() => {
    const mountElement = mountRef.current
    if (!mountElement) return

    if (sceneRef.current) {
      console.log('Scene already initialized, skipping...')
      return
    }

    console.log('Initializing empty Three.js scene...')

    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)

    // 创建相机
    const camera = new THREE.PerspectiveCamera(
      45,
      mountElement.clientWidth / mountElement.clientHeight,
      0.01,
      100
    )
    camera.position.set(0, 0, 5)

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)

    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.touchAction = 'none'

    // 清空容器
    mountElement.innerHTML = ''
    mountElement.appendChild(canvas)

    // 添加轨道控制器
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 0, 0)
    controls.update()

    // 添加坐标轴辅助线
    const axesHelper = new THREE.AxesHelper(1)
    scene.add(axesHelper)

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 5, 5)
    scene.add(directionalLight)

    // 动画循环
    const animate = () => {
      const animationId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      return animationId
    }

    const animationId = animate()

    // 处理窗口大小变化
    const handleResize = () => {
      if (!mountElement) return
      camera.aspect = mountElement.clientWidth / mountElement.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountElement.clientWidth, mountElement.clientHeight)
      controls.update()
    }
    window.addEventListener('resize', handleResize)

    // 保存引用
    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      animationId,
    }
    
    // 触发重新渲染，使 ImagePointCloud 组件能够接收到 scene、camera 和 controls
    setIsReady(true)

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize)
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId)
        sceneRef.current.controls.dispose()
        sceneRef.current.renderer.dispose()
        if (mountElement) {
          if (canvas.parentNode === mountElement) {
            mountElement.removeChild(canvas)
          }
        }
        sceneRef.current = null
      }
    }
  }, [])

  const scene = sceneRef.current?.scene
  const camera = sceneRef.current?.camera
  const controls = sceneRef.current?.controls

  console.log('PointCloudViewer render:', {
    isReady,
    hasScene: !!scene,
    hasCamera: !!camera,
    hasControls: !!controls,
  })

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
      />
      {isReady && scene && camera && controls ? (
        <ImagePointCloud scene={scene} camera={camera} controls={controls} />
      ) : (
        <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', zIndex: 1000 }}>
          等待场景初始化...
        </div>
      )}
    </>
  )
}

