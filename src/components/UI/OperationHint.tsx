import './OperationHint.css'

export default function OperationHint() {
  return (
    <div className="operation-hint">
      <div className="operation-hint-content">
        <span className="operation-hint-section">
          <strong>3D场景操作：</strong>
          右键拖拽移动模型 | 左键拖拽改变视角 | 滚轮缩放 | WASD移动相机
        </span>
        <span className="operation-hint-separator">|</span>
        <span className="operation-hint-section">
          <strong>预览图片：</strong>
          左键拖拽移动窗口 | 左键拖拽图片内容滚动 | 滚轮缩放 | 最小化到右下角
        </span>
      </div>
    </div>
  )
}

