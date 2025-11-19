import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

/**
 * 模型加载选项
 */
export interface ModelLoadOptions {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number] | number
  centerToOrigin?: boolean
  autoAdjustCamera?: boolean
  userData?: Record<string, unknown>
}

/**
 * 创建GLTF加载器（带DRACO支持）
 */
export function createGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.181.1/examples/jsm/libs/draco/gltf/')
  loader.setDRACOLoader(dracoLoader)
  return loader
}

/**
 * 加载GLB/GLTF模型
 */
export async function loadModel(
  loader: GLTFLoader,
  modelPath: string,
  options: ModelLoadOptions = {}
): Promise<THREE.Group> {
  const {
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = 1,
    centerToOrigin = true,
    userData = {},
  } = options

  return new Promise((resolve, reject) => {
    loader.load(
      modelPath,
      (gltf) => {
        const model = gltf.scene

        // 计算模型的边界框
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        // const size = box.getSize(new THREE.Vector3())

        // 将模型中心对齐到原点（如果需要）
        if (centerToOrigin) {
          model.position.sub(center)
        }

        // 设置位置
        model.position.set(
          model.position.x + position[0],
          model.position.y + position[1],
          model.position.z + position[2]
        )

        // 设置旋转（弧度）
        model.rotation.set(rotation[0], rotation[1], rotation[2])

        // 设置缩放
        if (typeof scale === 'number') {
          model.scale.set(scale, scale, scale)
        } else {
          model.scale.set(scale[0], scale[1], scale[2])
        }

        // 设置用户数据
        Object.assign(model.userData, userData)

        resolve(model)
      },
      () => {
        // const percent = ((progress.loaded / progress.total) * 100).toFixed(1)
        // console.log(`Loading ${modelPath}: ${percent}%`)
      },
      (error) => {
        console.error(`Error loading model ${modelPath}:`, error)
        reject(error)
      }
    )
  })
}

/**
 * 计算模型的边界框
 */
export function getModelBoundingBox(model: THREE.Group): {
  box: THREE.Box3
  center: THREE.Vector3
  size: THREE.Vector3
} {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  return { box, center, size }
}

/**
 * 计算多个模型的整体边界框
 */
export function getModelsBoundingBox(models: THREE.Group[]): {
  box: THREE.Box3
  center: THREE.Vector3
  size: THREE.Vector3
} {
  const boundingBox = new THREE.Box3()
  models.forEach((model) => {
    const box = new THREE.Box3().setFromObject(model)
    boundingBox.union(box)
  })

  const center = boundingBox.getCenter(new THREE.Vector3())
  const size = boundingBox.getSize(new THREE.Vector3())
  return { box: boundingBox, center, size }
}

