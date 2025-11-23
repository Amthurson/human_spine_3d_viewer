import { useState, useRef, useEffect } from 'react'
import './ColorImagePreview.css'

interface ColorImagePreviewProps {
  imageUrl: string | null
}

export default function ColorImagePreview({ imageUrl }: ColorImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // 重置位置和缩放当图片改变时
  useEffect(() => {
    if (imageUrl) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [imageUrl])

  // 拖拽功能
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart])

  if (!imageUrl) {
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // 左键
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      })
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((prev) => Math.max(0.1, Math.min(5, prev * delta)))
  }

  const handleReset = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      className="color-image-preview"
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      <div className="color-image-header">
        <span>Color.png 预览</span>
        <div className="color-image-controls">
          <button
            className="color-image-btn"
            onClick={() => setScale((prev) => Math.max(0.1, prev - 0.1))}
            title="缩小"
          >
            −
          </button>
          <span className="color-image-scale">{Math.round(scale * 100)}%</span>
          <button
            className="color-image-btn"
            onClick={() => setScale((prev) => Math.min(5, prev + 0.1))}
            title="放大"
          >
            +
          </button>
          <button
            className="color-image-btn"
            onClick={handleReset}
            title="重置"
          >
            ↻
          </button>
        </div>
      </div>
      <div className="color-image-content">
        <img
          src={imageUrl}
          alt="Color.png"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            maxWidth: '100%',
            height: 'auto',
            display: 'block',
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}
