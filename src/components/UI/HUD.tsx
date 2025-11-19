import './HUD.css'

interface HUDProps {
  pointCount?: number
  spinePointCount?: number
}

export default function HUD({ pointCount, spinePointCount }: HUDProps) {
  return (
    <>
      <div id="hud">
        {pointCount !== undefined ? (
          <>
            人体点云 3D 查看器
            <br />
            点数：{pointCount}
            {spinePointCount !== undefined && (
              <>
                <br />
                脊柱点：{spinePointCount} 个
              </>
            )}
          </>
        ) : (
          '加载中…'
        )}
      </div>
      {/* <div id="axesInfo">
        <div>
          <span className="axis-label axis-x"></span> X轴 (红色)
        </div>
        <div>
          <span className="axis-label axis-y"></span> Y轴 (绿色)
        </div>
        <div>
          <span className="axis-label axis-z"></span> Z轴 (蓝色)
        </div>
      </div> */}
    </>
  )
}

