import './DebugHelpersToggle.css'

interface DebugHelpersToggleProps {
  showBoxHelpers?: boolean
  showMarkers: boolean
  onBoxHelpersChange?: (show: boolean) => void
  onMarkersChange: (show: boolean) => void
}

export default function DebugHelpersToggle({
  // showBoxHelpers,
  showMarkers,
  // onBoxHelpersChange,
  onMarkersChange,
}: DebugHelpersToggleProps) {
  return (
    <div id="debugHelpersToggle">
      {/* <label>
        <input
          type="checkbox"
          checked={showBoxHelpers}
          onChange={(e) => onBoxHelpersChange(e.target.checked)}
        />
        <span>显示模型边界框</span>
      </label> */}
      <label>
        <input
          type="checkbox"
          checked={showMarkers}
          onChange={(e) => onMarkersChange(e.target.checked)}
        />
        <span>显示标记和连线</span>
      </label>
    </div>
  )
}

