/**
 * 环形图扇区几何（纯函数，SVG 与 24h 轮盘共用）。
 *
 * 角度约定：0° 在 12 点方向，顺时针增长。
 */

export interface SectorSpec {
  key: string
  label: string
  value: number
  color: string
}

export interface SectorGeom extends SectorSpec {
  share: number
  startDeg: number
  endDeg: number
  midDeg: number
  path: string
  /** 只有一个分类时用整圆描边渲染，path 为空 */
  fullCircle: boolean
}

export interface DonutGeometry {
  cx: number
  cy: number
  rOuter: number
  rInner: number
  /** 扇区间隙（度），默认 0 */
  gapDeg?: number
  /** 起始角度（度），默认 0 = 12 点 */
  startDeg?: number
}

const round = (value: number): number => Math.round(value * 1000) / 1000

export function polarPoint(cx: number, cy: number, radius: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180
  return {
    x: round(cx + radius * Math.cos(rad)),
    y: round(cy + radius * Math.sin(rad)),
  }
}

/** 单条环形扇区 path（外弧顺时针、内弧逆时针） */
export function donutArcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number,
): string {
  const outerStart = polarPoint(cx, cy, rOuter, startDeg)
  const outerEnd = polarPoint(cx, cy, rOuter, endDeg)
  const innerEnd = polarPoint(cx, cy, rInner, endDeg)
  const innerStart = polarPoint(cx, cy, rInner, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

/** 按 value 占比生成扇区；调用方负责先排序与合并「其他」 */
export function buildDonutSectors(
  specs: readonly SectorSpec[],
  geometry: DonutGeometry,
): SectorGeom[] {
  const positive = specs.filter(spec => Number.isFinite(spec.value) && spec.value > 0)
  const total = positive.reduce((sum, spec) => sum + spec.value, 0)
  if (total <= 0) return []

  const startBase = geometry.startDeg ?? 0

  if (positive.length === 1) {
    const only = positive[0]
    return [{
      ...only,
      share: 1,
      startDeg: startBase,
      endDeg: startBase + 360,
      midDeg: startBase + 180,
      path: '',
      fullCircle: true,
    }]
  }

  const gap = Math.max(0, geometry.gapDeg ?? 0)
  let cursor = startBase
  const sectors: SectorGeom[] = []

  for (const spec of positive) {
    const angle = (spec.value / total) * 360
    const effectiveGap = Math.min(gap, angle * 0.25)
    const startDeg = cursor + effectiveGap / 2
    const endDeg = cursor + angle - effectiveGap / 2
    cursor += angle

    if (endDeg - startDeg <= 0.01) continue

    sectors.push({
      ...spec,
      share: spec.value / total,
      startDeg: round(startDeg),
      endDeg: round(endDeg),
      midDeg: round((startDeg + endDeg) / 2),
      path: donutArcPath(geometry.cx, geometry.cy, geometry.rOuter, geometry.rInner, startDeg, endDeg),
      fullCircle: false,
    })
  }

  return sectors
}
