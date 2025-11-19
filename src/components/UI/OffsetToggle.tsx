import './OffsetToggle.css'

interface OffsetToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export default function OffsetToggle({ enabled, onChange }: OffsetToggleProps) {
  return (
    <div id="offsetToggle">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>应用标记偏移</span>
      </label>
    </div>
  )
}

