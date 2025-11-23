import { useState } from 'react'
import './OpacityControl.css'

interface OpacityControlProps {
  opacity: number
  onChange: (opacity: number) => void
}

export default function OpacityControl({ opacity, onChange }: OpacityControlProps) {
  const [value, setValue] = useState(Math.round(opacity * 100))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value)
    setValue(newValue)
    onChange(newValue / 100)
  }

  return (
    <div id="opacityControl">
      <label>
        透明度: <span id="opacityValue">{value}%</span>
      </label>
      <input
        type="range"
        id="opacitySlider"
        min="0"
        max="100"
        value={value}
        step="1"
        onChange={handleChange}
      />
    </div>
  )
}

