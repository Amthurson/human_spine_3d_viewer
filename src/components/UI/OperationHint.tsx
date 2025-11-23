import './OperationHint.css'

export default function OperationHint() {
  return (
    <div className="operation-hint">
      <div className="operation-hint-content">
        <div className="operation-hint-section">
          3D场景操作：
          右键拖拽移动模型 | 左键拖拽改变视角 | 滚轮缩放 | WASD移动相机
        </div>
        <div className="operation-hint-separator">|</div>
        <div className="operation-hint-section">
          预览图片：
          左键拖拽移动窗口 | 左键拖拽图片内容滚动 | 滚轮缩放 | 最小化到右下角
        </div>
      </div>
    </div>
  )
}

