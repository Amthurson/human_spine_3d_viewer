import { useState } from 'react'
import './Sidebar.css'

interface SidebarProps {
  // 文件上传相关
  wasmInitialized: boolean
  isProcessing: boolean
  processingError: string | null
  onPcFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSpineFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onColorFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRunProcessing: () => void
  
  // 点云相关
  humanPoints: number
  spinePoints: number
  opacity: number
  skinOpacity: number
  onOpacityChange: (opacity: number) => void
  onSkinOpacityChange: (skinOpacity: number) => void
  minOffset: number
  onMinOffsetChange: (minOffset: number) => void
  
  // 标记相关
  applyOffset: boolean
  onApplyOffsetChange: (enabled: boolean) => void
  showMarkers: boolean
  onShowMarkersChange: (show: boolean) => void
  
  // 碰撞检测相关
  allowedYOverlapRatio: number
  onAllowedYOverlapRatioChange: (ratio: number) => void
  isOptimizing: boolean // 是否正在优化模型缩放
  
  // 点云类型相关
  pointType: 'sphere' | 'box'
  onPointTypeChange: (type: 'sphere' | 'box') => void
  showPointCloud: boolean
  onShowPointCloudChange: (show: boolean) => void
  showSkin: boolean
  onShowSkinChange: (show: boolean) => void
  pointSize: number
  onPointSizeChange: (size: number) => void
  showOriginalColor: boolean
  onShowOriginalColorChange: (show: boolean) => void
  
  // 皮肤材质参数
  skinColor: string
  onSkinColorChange: (color: string) => void
  skinMetalness: number
  onSkinMetalnessChange: (value: number) => void
  skinRoughness: number
  onSkinRoughnessChange: (value: number) => void
  skinTransmission: number
  onSkinTransmissionChange: (value: number) => void
  skinThickness: number
  onSkinThicknessChange: (value: number) => void
  skinIor: number
  onSkinIorChange: (value: number) => void
  skinClearcoat: number
  onSkinClearcoatChange: (value: number) => void
  skinClearcoatRoughness: number
  onSkinClearcoatRoughnessChange: (value: number) => void
  skinReflectivity: number
  onSkinReflectivityChange: (value: number) => void
  skinAttenuationDistance: number
  onSkinAttenuationDistanceChange: (value: number) => void
  skinAttenuationColor: string
  onSkinAttenuationColorChange: (color: string) => void
  skinEnvMapIntensity: number
  onSkinEnvMapIntensityChange: (value: number) => void
  skinSheen: number
  onSkinSheenChange: (value: number) => void
  skinSheenColor: string
  onSkinSheenColorChange: (color: string) => void
  skinSheenRoughness: number
  onSkinSheenRoughnessChange: (value: number) => void
  skinDepthGapRatio: number
  onSkinDepthGapRatioChange: (value: number) => void
  useVertexColors: boolean
  onUseVertexColorsChange: (value: boolean) => void
  isSmoothed: boolean
  onIsSmoothedChange: (value: boolean) => void
  isSmoothedSkin: boolean
  onIsSmoothedSkinChange: (value: boolean) => void
}

export default function Sidebar({
  wasmInitialized,
  isProcessing,
  processingError,
  onPcFileChange,
  onSpineFileChange,
  onColorFileChange,
  onRunProcessing,
  humanPoints,
  spinePoints,
  opacity,
  skinOpacity,
  onOpacityChange,
  onSkinOpacityChange,
  // minOffset,
  // onMinOffsetChange,
  applyOffset,
  onApplyOffsetChange,
  showMarkers,
  onShowMarkersChange,
  allowedYOverlapRatio,
  onAllowedYOverlapRatioChange,
  isOptimizing,
  showPointCloud,
  onShowPointCloudChange,
  showSkin,
  onShowSkinChange,
  pointSize,
  onPointSizeChange,
  showOriginalColor,
  onShowOriginalColorChange,
  useVertexColors,
  onUseVertexColorsChange,
  skinColor,
  onSkinColorChange,
  // skinMetalness,
  // onSkinMetalnessChange,
  // skinRoughness,
  // onSkinRoughnessChange,
  // skinTransmission,
  // onSkinTransmissionChange,
  // skinThickness,
  // onSkinThicknessChange,
  // skinIor,
  // onSkinIorChange,
  // skinClearcoat,
  // onSkinClearcoatChange,
  // skinClearcoatRoughness,
  // onSkinClearcoatRoughnessChange,
  // skinReflectivity,
  // onSkinReflectivityChange,
  // skinAttenuationDistance,
  // onSkinAttenuationDistanceChange,
  // skinAttenuationColor,
  // onSkinAttenuationColorChange,
  // skinEnvMapIntensity,
  // onSkinEnvMapIntensityChange,
  // skinSheen,
  // onSkinSheenChange,
  // skinSheenColor,
  // onSkinSheenColorChange,
  // skinSheenRoughness,
  // onSkinSheenRoughnessChange,
  // skinDepthGapRatio,
  // onSkinDepthGapRatioChange,
  pointType,
  onPointTypeChange,
  isSmoothed,
  onIsSmoothedChange,
  isSmoothedSkin,
  onIsSmoothedSkinChange,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [allowedYOverlapRatioValue, setAllowedYOverlapRatioValue] = useState(allowedYOverlapRatio)
  const handlePointTypeChange = (type: 'sphere' | 'box') => () => {
    onPointTypeChange(type)
  }

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div
        className="sidebar-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? '展开' : '收起'}
      >
        {isCollapsed ? '▶' : '◀'}
      </div>
      
      {!isCollapsed && (
        <div className="sidebar-content" style={{ position: 'relative' }}>
          <h2 className="sidebar-title">控制面板</h2>
          
          {/* Loading 遮罩层 */}
          {isOptimizing && (
            <div className="optimizing-overlay">
              <div className="optimizing-spinner"></div>
              <div className="optimizing-text">正在优化模型缩放...</div>
            </div>
          )}
          
          {/* 文件上传区域 */}
          <section className="sidebar-section">
            <h3 className="section-title">文件上传</h3>
            <div className="form-group">
              <label htmlFor="pc-file-input">PointCloud.png：</label>
              <input
                id="pc-file-input"
                type="file"
                accept=".png"
                onChange={onPcFileChange}
                disabled={!wasmInitialized || isProcessing || isOptimizing}
              />
            </div>
            <div className="form-group">
              <label htmlFor="spine-file-input">point.json：</label>
              <input
                id="spine-file-input"
                type="file"
                accept=".json"
                onChange={onSpineFileChange}
                disabled={!wasmInitialized || isProcessing || isOptimizing}
              />
            </div>
            <div className="form-group">
              <label htmlFor="color-file-input">Color.png：</label>
              <input
                id="color-file-input"
                type="file"
                accept=".png"
                onChange={onColorFileChange}
                disabled={isProcessing || isOptimizing}
              />
            </div>
            <div className="form-group">
              <button
                onClick={onRunProcessing}
                disabled={!wasmInitialized || isProcessing || isOptimizing}
                className="primary-button"
              >
                {isProcessing ? '处理中...' : '人体脊柱建模'}
              </button>
            </div>
            {processingError && (
              <div className="error-message">错误: {processingError}</div>
            )}
            {!wasmInitialized && (
              <div className="warning-message">WASM 模块初始化中...</div>
            )}
          </section>

          {/* 信息显示区域 */}
          <section className="sidebar-section">
            <h3 className="section-title">信息</h3>
            <div className="info-item">
              <span>点云数量:</span>
              <span>{humanPoints}</span>
            </div>
            <div className="info-item">
              <span>脊柱点数量:</span>
              <span>{spinePoints}</span>
            </div>
          </section>

          {/* 点云控制区域 */}
          <section className="sidebar-section">
            <h3 className="section-title">点云控制</h3>
            <div className="form-group">
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={showPointCloud}
                    onChange={(e) => onShowPointCloudChange(e.target.checked)}
                    disabled={isOptimizing}
                  />
                  <span>显示点云</span>
                </label>
              </div>
              <label htmlFor="point-size-slider">
                点云大小: {pointSize}
              </label>
              <input
                id="point-size-slider"
                type="range"
                min="0.001"
                max="1"
                value={pointSize}
                step="0.001"
                onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
                disabled={isOptimizing}
              />
              <label htmlFor="opacity-slider">
                点云透明度: {Math.round(opacity * 100)}%
              </label>
              <input
                id="opacity-slider"
                type="range"
                min="0"
                max="100"
                value={opacity * 100}
                step="1"
                onChange={(e) => onOpacityChange(parseInt(e.target.value) / 100)}
                disabled={humanPoints === 0 || isOptimizing}
              />
              <div className="form-group checkbox-group">
                <label htmlFor="point-color-checkbox"> 点云颜色：</label>
                <label>
                  <input
                    type="radio"
                    checked={showOriginalColor}
                    onChange={() => onShowOriginalColorChange(true)}
                    disabled={isOptimizing}
                  />
                  <span>原始颜色</span>
                </label>
                <label>
                  <input
                    type="radio"
                    checked={!showOriginalColor}
                    onChange={() => onShowOriginalColorChange(false)}
                    disabled={isOptimizing}
                  />
                  <span>灰色</span>
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={isSmoothed}
                    onChange={(e) => onIsSmoothedChange(e.target.checked)}
                  />
                  <span>平滑点云</span>
                </label>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="point-type-radio">
                点云类型
              </label>
              <div className="form-group radio-group">
                <label>
                  <input
                    type="radio"
                    checked={pointType === 'sphere'}
                    onChange={handlePointTypeChange('sphere')}
                    id="smooth-checkbox"
                    disabled={humanPoints === 0 || isOptimizing}
                  />
                  <span>立体</span>
                </label>
                <label>
                  <input
                    type="radio"
                    checked={pointType === 'box'}
                    onChange={handlePointTypeChange('box')}
                    id="box-checkbox"
                    disabled={humanPoints === 0 || isOptimizing}
                  />
                  <span>平面</span>
                </label>
              </div>
            </div>
            {/* <div className="form-group">
              <label htmlFor="min-offset-slider">
                Depth-Brightness Transition: {minOffset.toFixed(2)}
              </label>
              <input
                id="min-offset-slider"
                type="range"
                min="-1.5"
                max="-0.83"
                step="0.01"
                value={minOffset}
                onChange={(e) => onMinOffsetChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
            </div> */}
          </section>

          {/* 皮肤控制区域 */}
          <section className="sidebar-section">
            <h3 className="section-title">皮肤控制</h3>
            <div className="form-group">
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={showSkin}
                    onChange={(e) => onShowSkinChange(e.target.checked)}
                    disabled={isOptimizing}
                  />
                  <span>显示皮肤</span>
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={isSmoothedSkin}
                    onChange={(e) => onIsSmoothedSkinChange(e.target.checked)}
                  />
                  <span>平滑皮肤</span>
                </label>
              </div>
              <label htmlFor="skin-opacity-slider">
                皮肤透明度: {Math.round(skinOpacity * 100)}%
              </label>
              <input
                id="skin-opacity-slider"
                type="range"
                min="0"
                max="100"
                value={skinOpacity * 100}
                step="1"
                onChange={(e) => onSkinOpacityChange(parseInt(e.target.value) / 100)}
                disabled={humanPoints === 0 || isOptimizing}
              />
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={useVertexColors}
                    onChange={(e) => onUseVertexColorsChange(e.target.checked)}
                    disabled={isOptimizing}
                  />
                  <span>使用照片原色</span>
                </label>
              </div>
              <label htmlFor="skin-color-picker">皮肤颜色:</label>
              <input
                id="skin-color-picker"
                type="color"
                value={skinColor}
                onChange={(e) => onSkinColorChange(e.target.value)}
                disabled={humanPoints === 0 || isOptimizing}
                style={{ width: '100%', height: '30px' }}
              />
              
              {/* <label htmlFor="skin-metalness-slider">
                金属度: {skinMetalness.toFixed(2)}
              </label>
              <input
                id="skin-metalness-slider"
                type="range"
                min="0"
                max="1"
                value={skinMetalness}
                step="0.01"
                onChange={(e) => onSkinMetalnessChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-roughness-slider">
                粗糙度: {skinRoughness.toFixed(2)}
              </label>
              <input
                id="skin-roughness-slider"
                type="range"
                min="0"
                max="1"
                value={skinRoughness}
                step="0.01"
                onChange={(e) => onSkinRoughnessChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-transmission-slider">
                透射度: {skinTransmission.toFixed(2)}
              </label>
              <input
                id="skin-transmission-slider"
                type="range"
                min="0"
                max="1"
                value={skinTransmission}
                step="0.01"
                onChange={(e) => onSkinTransmissionChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-thickness-slider">
                厚度: {skinThickness.toFixed(2)}
              </label>
              <input
                id="skin-thickness-slider"
                type="range"
                min="0"
                max="1"
                value={skinThickness}
                step="0.01"
                onChange={(e) => onSkinThicknessChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-ior-slider">
                折射率 (IOR): {skinIor.toFixed(2)}
              </label>
              <input
                id="skin-ior-slider"
                type="range"
                min="1"
                max="2"
                value={skinIor}
                step="0.01"
                onChange={(e) => onSkinIorChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-clearcoat-slider">
                清漆层: {skinClearcoat.toFixed(2)}
              </label>
              <input
                id="skin-clearcoat-slider"
                type="range"
                min="0"
                max="1"
                value={skinClearcoat}
                step="0.01"
                onChange={(e) => onSkinClearcoatChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-clearcoat-roughness-slider">
                清漆粗糙度: {skinClearcoatRoughness.toFixed(2)}
              </label>
              <input
                id="skin-clearcoat-roughness-slider"
                type="range"
                min="0"
                max="1"
                value={skinClearcoatRoughness}
                step="0.01"
                onChange={(e) => onSkinClearcoatRoughnessChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-reflectivity-slider">
                反射率: {skinReflectivity.toFixed(2)}
              </label>
              <input
                id="skin-reflectivity-slider"
                type="range"
                min="0"
                max="1"
                value={skinReflectivity}
                step="0.01"
                onChange={(e) => onSkinReflectivityChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-attenuation-distance-slider">
                衰减距离: {skinAttenuationDistance.toFixed(2)}
              </label>
              <input
                id="skin-attenuation-distance-slider"
                type="range"
                min="0"
                max="5"
                value={skinAttenuationDistance}
                step="0.1"
                onChange={(e) => onSkinAttenuationDistanceChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-attenuation-color-picker">衰减颜色:</label>
              <input
                id="skin-attenuation-color-picker"
                type="color"
                value={skinAttenuationColor}
                onChange={(e) => onSkinAttenuationColorChange(e.target.value)}
                disabled={humanPoints === 0 || isOptimizing}
                style={{ width: '100%', height: '30px' }}
              />
              
              <label htmlFor="skin-envmap-intensity-slider">
                环境光强度: {skinEnvMapIntensity.toFixed(2)}
              </label>
              <input
                id="skin-envmap-intensity-slider"
                type="range"
                min="0"
                max="5"
                value={skinEnvMapIntensity}
                step="0.1"
                onChange={(e) => onSkinEnvMapIntensityChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-sheen-slider">
                光泽度: {skinSheen.toFixed(2)}
              </label>
              <input
                id="skin-sheen-slider"
                type="range"
                min="0"
                max="1"
                value={skinSheen}
                step="0.01"
                onChange={(e) => onSkinSheenChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-sheen-color-picker">光泽颜色:</label>
              <input
                id="skin-sheen-color-picker"
                type="color"
                value={skinSheenColor}
                onChange={(e) => onSkinSheenColorChange(e.target.value)}
                disabled={humanPoints === 0 || isOptimizing}
                style={{ width: '100%', height: '30px' }}
              />
              
              <label htmlFor="skin-sheen-roughness-slider">
                光泽粗糙度: {skinSheenRoughness.toFixed(2)}
              </label>
              <input
                id="skin-sheen-roughness-slider"
                type="range"
                min="0"
                max="1"
                value={skinSheenRoughness}
                step="0.01"
                onChange={(e) => onSkinSheenRoughnessChange(parseFloat(e.target.value))}
                disabled={humanPoints === 0 || isOptimizing}
              />
              
              <label htmlFor="skin-depth-gap-ratio-slider">
                深度间隙比例: {(skinDepthGapRatio * 100).toFixed(0)}%
              </label>
              <input
                id="skin-depth-gap-ratio-slider"
                type="range"
                min="0"
                max="100"
                value={skinDepthGapRatio * 100}
                step="1"
                onChange={(e) => onSkinDepthGapRatioChange(parseInt(e.target.value) / 100)}
                disabled={humanPoints === 0 || isOptimizing}
              /> */}
            </div>
          </section>

          {/* 标记控制区域 */}
          <section className="sidebar-section">
            <h3 className="section-title">标记控制</h3>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={applyOffset}
                  onChange={(e) => onApplyOffsetChange(e.target.checked)}
                  disabled={isOptimizing}
                />
                <span>应用标记偏移</span>
              </label>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={(e) => onShowMarkersChange(e.target.checked)}
                  disabled={isOptimizing}
                />
                <span>显示偏移标记</span>
              </label>
            </div>
          </section>

          {/* 碰撞检测控制区域 */}
          <section className="sidebar-section">
            <h3 className="section-title">碰撞检测</h3>
            <div className="form-group">
              <label htmlFor="overlap-ratio-slider">
                Y轴允许重合比例: {(allowedYOverlapRatioValue * 100).toFixed(0)}%
              </label>
              <input
                id="overlap-ratio-slider"
                type="range"
                min="0"
                max="100"
                value={allowedYOverlapRatioValue * 100}
                step="1"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllowedYOverlapRatioValue(parseInt((e.currentTarget as HTMLInputElement).value) / 100)}
                onMouseUp={(e: React.MouseEvent<HTMLInputElement>) => onAllowedYOverlapRatioChange(parseInt((e.currentTarget as HTMLInputElement).value) / 100)}
                disabled={isOptimizing}
              />
              <div className="slider-hint">
                允许模型在Y轴方向的重合比例，范围: 0% - 100%
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

