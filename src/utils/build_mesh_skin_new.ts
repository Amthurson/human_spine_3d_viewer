// build_mesh_skin.ts
import * as THREE from "three";
import {
  type SmoothenResult,
  sampleHeightFromGrid,
} from "./smoothen_new";

type Vec2 = { x: number; y: number };

/**
 * 1. 从 validMask 中收集所有「边界格子中心点」(未排序)
 */
function collectBoundaryPoints(
  validMask: Uint8Array,
  nx: number,
  ny: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): Vec2[] {
  const pts: Vec2[] = [];
  const widthX = xMax - xMin;
  const heightY = yMax - yMin;

  const idx = (ix: number, iy: number) => iy * nx + ix;

  const hasEmptyNeighbor = (ix: number, iy: number) => {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (const [dx, dy] of dirs) {
      const xx = ix + dx;
      const yy = iy + dy;
      if (xx < 0 || xx >= nx || yy < 0 || yy >= ny) return true;
      if (validMask[idx(xx, yy)] === 0) return true;
    }
    return false;
  };

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const k = idx(ix, iy);
      if (validMask[k] === 0) continue;
      if (!hasEmptyNeighbor(ix, iy)) continue;

      const u = (ix + 0.5) / nx;
      const v = (iy + 0.5) / ny;
      const x = xMin + u * widthX;
      const y = yMin + v * heightY;
      pts.push({ x, y });
    }
  }

  return pts;
}

/**
 * 2. 把边界点按几何中心的极角排序 → 得到一个环
 */
function sortBoundaryLoop(pts: Vec2[]): Vec2[] {
  if (pts.length === 0) return [];

  let cx = 0,
    cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  return pts
    .slice()
    .sort((a, b) => {
      const angA = Math.atan2(a.y - cy, a.x - cx);
      const angB = Math.atan2(b.y - cy, b.x - cx);
      return angA - angB;
    });
}

/**
 * 3. Chaikin 曲线平滑闭合多边形
 */
function smoothClosedPolylineChaikin(loop: Vec2[], iterations: number): Vec2[] {
  if (loop.length < 3) return loop;

  let pts = loop.slice();
  for (let it = 0; it < iterations; it++) {
    const newPts: Vec2[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];

      const q: Vec2 = {
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      };
      const r: Vec2 = {
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      };

      newPts.push(q, r);
    }
    pts = newPts;
  }
  return pts;
}

export interface BuildSmoothSkinMeshParams {
  smoothResult: SmoothenResult;
  material?: THREE.Material;
  chaikinIterations?: number;
}

/**
 * 核心函数：基于平滑轮廓 + heightMap 重建皮肤 Mesh
 *
 * - 外轮廓：collectBoundaryPoints → sortBoundaryLoop → Chaikin 平滑
 * - 三角化：Three.ShapeUtils.triangulateShape（内部是 earcut）
 * - Z：每个顶点的 z 来自 heightMapFiltered 采样
 */
export function buildSmoothSilhouetteSkinMesh(
  params: BuildSmoothSkinMeshParams
): THREE.Mesh | null {
  const {
    smoothResult,
    material,
    chaikinIterations = 2,
  } = params;

  const {
    heightMapFiltered,
    validMask,
    nx,
    ny,
    xMin,
    xMax,
    yMin,
    yMax,
    widthX,
    heightY,
  } = smoothResult;

  // 1. 边界点 → 排序 → 平滑
  const boundaryPts = collectBoundaryPoints(
    validMask,
    nx,
    ny,
    xMin,
    xMax,
    yMin,
    yMax
  );

  if (boundaryPts.length < 3) {
    console.warn("[buildSmoothSilhouetteSkinMesh] boundary too small");
    return null;
  }

  const loopSorted = sortBoundaryLoop(boundaryPts);
  const loop = smoothClosedPolylineChaikin(loopSorted, chaikinIterations);

  // 2. 转成 Vector2，调用 earcut 做三角化
  const shape2D = loop.map((p) => new THREE.Vector2(p.x, p.y));
  const triangles = THREE.ShapeUtils.triangulateShape(shape2D, []); // 返回 [ [a,b,c], ... ]

  // 3. 构建顶点位置（x,y 从 loop 来；z 从 heightMap 采样）
  const vertexCount = loop.length;
  const positions = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const p = loop[i];
    const z = sampleHeightFromGrid(
      heightMapFiltered,
      p.x,
      p.y,
      nx,
      ny,
      widthX,
      heightY,
      xMin,
      yMin
    );

    positions[3 * i + 0] = p.x;
    positions[3 * i + 1] = p.y;
    positions[3 * i + 2] = z;
  }

  const indices: number[] = [];
  for (const tri of triangles) {
    indices.push(tri[0], tri[1], tri[2]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const skinMaterial =
    material ??
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xF2CCBE),
      roughness: 0.48,
      metalness: 0.0,
      transmission: 0.25,
      thickness: 0.35,
      attenuationDistance: 0.8,
      attenuationColor: new THREE.Color(1.0, 0.6, 0.5),
      clearcoat: 0.3,
      clearcoatRoughness: 0.65,
      envMapIntensity: 0.75,
    });

  const mesh = new THREE.Mesh(geom, skinMaterial);
  mesh.name = "SmoothSilhouetteSkin";

  return mesh;
}
