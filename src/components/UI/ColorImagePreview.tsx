import { useState, useRef, useEffect } from 'react'
import './ColorImagePreview.css'

interface SpinePoint2D {
  x: number
  y: number
}

interface ColorImagePreviewProps {
  imageUrl: string | null
  spinePoints2D?: SpinePoint2D[]
}

export default function ColorImagePreview({ imageUrl, spinePoints2D = [] }: ColorImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isMinimized, setIsMinimized] = useState(false)
  const [isScrolling, setIsScrolling] = useState(false)
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })

  // 重置位置和缩放当图片改变时
  useEffect(() => {
    if (imageUrl) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
      setIsMinimized(false)
      setImageLoaded(false)
      setImageSize({ width: 0, height: 0 })
    }
  }, [imageUrl])

  // 监听窗口大小变化，更新图片尺寸
  useEffect(() => {
    if (!imageLoaded || !imageRef.current) return

    const imgElement = imageRef.current // 保存引用

    const updateImageSize = () => {
      if (imgElement) {
        // 获取图片在 scale=1 时的基础尺寸（不考虑用户缩放）
        // 由于图片有 transform: scale(${scale})，需要除以 scale 来获取基础尺寸
        const rect = imgElement.getBoundingClientRect()
        const baseWidth = rect.width / scale
        const baseHeight = rect.height / scale
        setImageSize({ width: baseWidth, height: baseHeight })
      }
    }

    // 初始更新
    updateImageSize()

    // 监听窗口大小变化
    window.addEventListener('resize', updateImageSize)
    
    // 使用 ResizeObserver 监听图片尺寸变化
    let resizeObserver: ResizeObserver | null = null
    if (imgElement && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(updateImageSize)
      resizeObserver.observe(imgElement)
    }

    return () => {
      window.removeEventListener('resize', updateImageSize)
      if (resizeObserver && imgElement) {
        resizeObserver.unobserve(imgElement)
      }
    }
  }, [imageLoaded, scale]) // 当缩放改变时也更新


  // 拖拽功能
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && !isMinimized && !isScrolling) {
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
  }, [isDragging, dragStart, isMinimized, isScrolling])

  // 窗口大小改变时，如果已最小化，位置会自动通过 CSS bottom/right 保持

  // 左键拖拽滚动功能
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrolling && contentRef.current) {
        const deltaX = e.clientX - scrollStart.x
        const deltaY = e.clientY - scrollStart.y
        contentRef.current.scrollLeft = scrollStart.scrollLeft - deltaX
        contentRef.current.scrollTop = scrollStart.scrollTop - deltaY
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      // 左键释放时结束滚动
      if (e.button === 0) {
        setIsScrolling(false)
      }
    }

    if (isScrolling) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isScrolling, scrollStart])

  if (!imageUrl) {
    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    // 如果正在滚动，不启动窗口拖拽
    if (e.button === 0 && !isScrolling) {
      // 检查是否点击在内容区域，如果是则不拖拽窗口
      const target = e.target as HTMLElement
      if (contentRef.current && contentRef.current.contains(target)) {
        return
      }
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      })
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    
    if (!contentRef.current || !imageRef.current) return
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const oldScale = scale
    const newScale = Math.max(0.1, Math.min(5, oldScale * delta))
    
    // 获取内容区域的边界和padding
    const contentRect = contentRef.current.getBoundingClientRect()
    const padding = 8 // CSS中设置的padding值
    
    // 计算鼠标在内容区域内的相对位置
    const mouseX = e.clientX - contentRect.left
    const mouseY = e.clientY - contentRect.top
    
    // 获取当前的滚动位置
    const oldScrollLeft = contentRef.current.scrollLeft
    const oldScrollTop = contentRef.current.scrollTop
    
    // 计算鼠标指向的图片位置（在原始图片坐标系中，考虑padding）
    // 图片的左上角在 (padding, padding)，所以需要减去padding
    const imageX = (oldScrollLeft + mouseX - padding) / oldScale
    const imageY = (oldScrollTop + mouseY - padding) / oldScale
    
    // 计算缩放后，这个图片位置应该对应的新滚动位置
    const newScrollLeft = imageX * newScale - mouseX + padding
    const newScrollTop = imageY * newScale - mouseY + padding
    
    // 更新缩放
    setScale(newScale)
    
    // 在下一帧更新滚动位置，确保DOM已更新
    requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollLeft = newScrollLeft
        contentRef.current.scrollTop = newScrollTop
      }
    })
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
        <div 
          ref={contentRef}
          className="color-image-content"
          style={{
            cursor: isScrolling ? 'grabbing' : 'grab',
          }}
          onMouseDown={(e) => {
            if (e.button === 0 && contentRef.current) { // 左键
              e.preventDefault()
              e.stopPropagation() // 阻止事件冒泡，防止触发窗口拖拽
              setIsScrolling(true)
              setScrollStart({
                x: e.clientX,
                y: e.clientY,
                scrollLeft: contentRef.current.scrollLeft,
                scrollTop: contentRef.current.scrollTop,
              })
            }
          }}
          onWheel={handleWheel}
        >
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              ref={imageRef}
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
              onLoad={() => {
                setImageLoaded(true)
                // 更新图片尺寸（scale=1 时的基础尺寸）
                if (imageRef.current) {
                  // 图片加载时 scale 应该是 1，所以直接使用 offsetWidth/offsetHeight
                  // 或者使用 naturalWidth/naturalHeight 和容器的比例
                  const img = imageRef.current
                  const containerWidth = img.parentElement?.clientWidth || 0
                  const naturalWidth = img.naturalWidth
                  const naturalHeight = img.naturalHeight
                  
                  if (naturalWidth > 0 && containerWidth > 0) {
                    // 计算图片在 maxWidth: 100% 下的实际显示宽度
                    const displayWidth = Math.min(naturalWidth, containerWidth - 16) // 减去 padding
                    const displayHeight = (naturalHeight / naturalWidth) * displayWidth
                    setImageSize({ width: displayWidth, height: displayHeight })
                  } else {
                    // 后备方案：使用 offsetWidth/offsetHeight
                    setImageSize({ width: img.offsetWidth, height: img.offsetHeight })
                  }
                }
              }}
            />
            {/* 绘制脊柱点 */}
            {spinePoints2D.length > 0 && imageLoaded && imageRef.current && imageSize.width > 0 && (() => {
              const img = imageRef.current
              // 获取图片的原始尺寸
              const naturalWidth = img.naturalWidth
              const naturalHeight = img.naturalHeight
              
              // 确保 naturalWidth 和 naturalHeight 有效
              if (naturalWidth === 0 || naturalHeight === 0) {
                return null
              }
              
              // 获取图片在 scale=1 时的显示尺寸（不考虑用户缩放）
              // imageSize 存储的是图片在 scale=1 时的尺寸
              const baseWidth = imageSize.width > 0 ? imageSize.width : img.getBoundingClientRect().width / scale || img.offsetWidth
              const baseHeight = imageSize.height > 0 ? imageSize.height : img.getBoundingClientRect().height / scale || img.offsetHeight
              
              // 计算从原始图片尺寸到基础显示尺寸的缩放比例（不考虑用户缩放）
              const widthScale = baseWidth / naturalWidth
              const heightScale = baseHeight / naturalHeight
              
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${baseWidth}px`,
                    height: `${baseHeight}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: 'top left',
                    pointerEvents: 'none',
                  }}
                >
                  {spinePoints2D.map((point, index) => {
                    const VERTEBRA_NAMES = ['C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5']
                    const vertebraName = VERTEBRA_NAMES[index] || `P${index}`
                    // 将原始坐标（像素坐标）转换为显示坐标
                    // point.x 和 point.y 是图片上的像素坐标
                    // 先转换为基础显示尺寸的坐标，然后通过容器的 scale 变换自动缩放
                    const displayX = point.x * widthScale
                    const displayY = point.y * heightScale
                    return (
                      <div
                        key={index}
                        className="spine-point-marker"
                        style={{
                          position: 'absolute',
                          left: `${displayX}px`,
                          top: `${displayY}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        title={vertebraName}
                      >
                        <div className="spine-point-dot" />
                        <span className="spine-point-label">{vertebraName}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
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
