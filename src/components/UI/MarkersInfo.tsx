import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { VERTEBRA_NAMES } from '../../constants/vertebraNames'
import './MarkersInfo.css'

interface Marker {
  position: THREE.Vector3
  vertebraName: string
}

interface MarkersInfoProps {
  markers: Record<string, Marker>
  models: THREE.Group[]
  highlightedVertebra?: string | null
}

export default function MarkersInfo({
  markers,
  models,
  highlightedVertebra,
}: MarkersInfoProps) {
  const [markerList, setMarkerList] = useState<Array<{
    name: string
    marker?: Marker
    offset?: { x: number; y: number; z: number; distance: number }
  }>>([])

  useEffect(() => {
    const list = VERTEBRA_NAMES.map((name) => {
      const marker = markers[name]
      const model = models.find((m) => m.userData.vertebraName === name)

      let offset
      if (marker && model) {
        const offsetVec = new THREE.Vector3().subVectors(marker.position, model.position)
        offset = {
          x: offsetVec.x,
          y: offsetVec.y,
          z: offsetVec.z,
          distance: offsetVec.length(),
        }
      }

      return {
        name,
        marker,
        offset,
      }
    })

    setMarkerList(list)
  }, [markers, models])

  const markedCount = Object.keys(markers).length

  return (
    <div id="markersInfo">
      <h3>标记位置 ({markedCount}/18)</h3>
      <div id="markersList">
        {markerList.map((item) => (
          <div
            key={item.name}
            className={`marker-item ${highlightedVertebra === item.name ? 'highlighted' : ''}`}
            data-vertebra={item.name}
          >
            <span className="marker-name">{item.name}:</span>
            {item.marker ? (
              <>
                <span className="marker-coords">
                  ({item.marker.position.x.toFixed(3)}, {item.marker.position.y.toFixed(3)},{' '}
                  {item.marker.position.z.toFixed(3)})
                </span>
                {item.offset && (
                  <span className="marker-offset">
                    偏移: ({item.offset.x.toFixed(3)}, {item.offset.y.toFixed(3)},{' '}
                    {item.offset.z.toFixed(3)}) 距离: {item.offset.distance.toFixed(3)}
                  </span>
                )}
              </>
            ) : (
              <span className="marker-status">未标记</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

