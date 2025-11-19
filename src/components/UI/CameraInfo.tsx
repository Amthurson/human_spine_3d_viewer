import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './CameraInfo.css'

interface CameraInfoProps {
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
}

export default function CameraInfo({ camera, controls }: CameraInfoProps) {
  const [info, setInfo] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    fov: 45,
    target: { x: 0, y: 0, z: 0 },
  })

  useEffect(() => {
    const updateInfo = () => {
      setInfo({
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        rotation: {
          x: camera.rotation.x * (180 / Math.PI),
          y: camera.rotation.y * (180 / Math.PI),
          z: camera.rotation.z * (180 / Math.PI),
        },
        fov: camera.fov,
        target: {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z,
        },
      })
    }

    const interval = setInterval(updateInfo, 100)
    return () => clearInterval(interval)
  }, [camera, controls])

  return (
    <div id="cameraInfo">
      <h3>镜头参数</h3>
      <div className="param-row">
        <span className="param-label">位置 X:</span>
        <span className="param-value">{info.position.x.toFixed(2)}</span>
      </div>
      <div className="param-row">
        <span className="param-label">位置 Y:</span>
        <span className="param-value">{info.position.y.toFixed(2)}</span>
      </div>
      <div className="param-row">
        <span className="param-label">位置 Z:</span>
        <span className="param-value">{info.position.z.toFixed(2)}</span>
      </div>
      <div className="param-row">
        <span className="param-label">旋转 X:</span>
        <span className="param-value">{info.rotation.x.toFixed(2)}°</span>
      </div>
      <div className="param-row">
        <span className="param-label">旋转 Y:</span>
        <span className="param-value">{info.rotation.y.toFixed(2)}°</span>
      </div>
      <div className="param-row">
        <span className="param-label">旋转 Z:</span>
        <span className="param-value">{info.rotation.z.toFixed(2)}°</span>
      </div>
      <div className="param-row">
        <span className="param-label">FOV:</span>
        <span className="param-value">{info.fov.toFixed(1)}°</span>
      </div>
      <div className="param-row">
        <span className="param-label">目标 X:</span>
        <span className="param-value">{info.target.x.toFixed(2)}</span>
      </div>
      <div className="param-row">
        <span className="param-label">目标 Y:</span>
        <span className="param-value">{info.target.y.toFixed(2)}</span>
      </div>
      <div className="param-row">
        <span className="param-label">目标 Z:</span>
        <span className="param-value">{info.target.z.toFixed(2)}</span>
      </div>
    </div>
  )
}

