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
  const [isMinimized, setIsMinimized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 重置位置和缩放当图片改变时
  useEffect(() => {
    if (imageUrl) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      setIsMinimized(false)
    }
  }, [imageUrl])


  // 拖拽功能
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isMinimized) {
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
  }, [isDragging, dragStart, isMinimized])

  // 窗口大小改变时，如果已最小化，位置会自动通过 CSS bottom/right 保持

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

  const handleMinimize = () => {
    setIsMinimized(true)
  }

  const handleRestore = () => {
    setIsMinimized(false)
    setPosition({ x: 0, y: 0 }) // 恢复时重置到初始位置
  }

  return (
    <div
      ref={containerRef}
      className={`color-image-preview ${isMinimized ? 'minimized' : ''}`}
      style={
        isMinimized 
          ? { 
              right: '20px', 
              bottom: '20px', 
              top: 'auto',
              transform: 'none'
            }
          : { 
              transform: `translate(${position.x}px, ${position.y}px)` 
            }
      }
      onMouseDown={!isMinimized ? handleMouseDown : undefined}
      onWheel={!isMinimized ? handleWheel : undefined}
      onClick={isMinimized ? handleRestore : undefined}
    >
      <div className="color-image-header">
        <span>Color.png 预览</span>
        <div className="color-image-controls">
          {!isMinimized && (
            <>
              <button
                className="color-image-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setScale((prev) => Math.max(0.1, prev - 0.1))
                }}
                title="缩小"
              >
                −
              </button>
              <span className="color-image-scale">{Math.round(scale * 100)}%</span>
              <button
                className="color-image-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setScale((prev) => Math.min(5, prev + 0.1))
                }}
                title="放大"
              >
                +
              </button>
              <button
                className="color-image-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  handleReset()
                }}
                title="重置"
              >
                ↻
              </button>
            </>
          )}
          <button
            className="color-image-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (isMinimized) {
                handleRestore()
              } else {
                handleMinimize()
              }
            }}
            title={isMinimized ? "恢复" : "最小化"}
          >
            {isMinimized ? '□' : '−'}
          </button>
        </div>
      </div>
      {!isMinimized && (
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
      )}
      {isMinimized && (
        <div className="color-image-minimized-preview">
          <img
            src={imageUrl}
            alt="Color.png 预览"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  )
}
