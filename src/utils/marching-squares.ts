// marching_squares.ts
export type Vec2 = { x: number; y: number };

/**
 * 对 validMask 执行 marching-squares 轮廓提取
 * 生成一个连续、有序的多边形（闭合）
 */
export function marchingSquaresContour(
  mask: Uint8Array,
  width: number,
  height: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): Vec2[] {
  const pts: Vec2[] = [];

  const index = (ix: number, iy: number) => iy * width + ix;

  const get = (ix: number, iy: number) => {
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return 0;
    return mask[index(ix, iy)] > 0 ? 1 : 0;
  };

  const visited = new Set<string>();
  const widthX = xMax - xMin;
  const heightY = yMax - yMin;

  // 找到第一个边界格子
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (get(x, y) === 1) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX < 0) return [];

  let cx = startX;
  let cy = startY;

  const dirs = [
    [1, 0],   // 右
    [0, 1],   // 下
    [-1, 0],  // 左
    [0, -1],  // 上
  ];

  let dir = 0; // 从右开始

  while (true) {
    const key = `${cx},${cy}`;
    if (visited.has(key)) break;

    visited.add(key);

    // 转换为世界坐标
    const px = xMin + ((cx + 0.5) / width) * widthX;
    const py = yMin + ((cy + 0.5) / height) * heightY;
    pts.push({ x: px, y: py });

    let found = false;

    for (let i = 0; i < 4; i++) {
      const d = (dir + i) % 4;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (get(nx, ny) === 1) {
        cx = nx;
        cy = ny;
        dir = d;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return pts;
}
