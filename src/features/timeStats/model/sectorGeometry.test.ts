import { describe, expect, it } from 'vitest'
import { buildDonutSectors, donutArcPath, polarPoint } from './sectorGeometry'

const geometry = { cx: 100, cy: 100, rOuter: 90, rInner: 60, gapDeg: 0 }

describe('sectorGeometry：环形扇区', () => {
  it('0° 在 12 点方向', () => {
    const point = polarPoint(100, 100, 50, 0)
    expect(point.x).toBe(100)
    expect(point.y).toBe(50)
  })

  it('两个相等分类各占 180°', () => {
    const sectors = buildDonutSectors([
      { key: 'a', label: 'A', value: 1, color: '#000' },
      { key: 'b', label: 'B', value: 1, color: '#111' },
    ], geometry)
    expect(sectors).toHaveLength(2)
    expect(sectors[0].share).toBeCloseTo(0.5)
    expect(sectors[0].startDeg).toBe(0)
    expect(sectors[0].endDeg).toBe(180)
    expect(sectors[1].startDeg).toBe(180)
    expect(sectors[1].endDeg).toBe(360)
  })

  it('间隙从扇区两端各扣一半', () => {
    const sectors = buildDonutSectors([
      { key: 'a', label: 'A', value: 1, color: '#000' },
      { key: 'b', label: 'B', value: 1, color: '#111' },
    ], { ...geometry, gapDeg: 4 })
    expect(sectors[0].startDeg).toBe(2)
    expect(sectors[0].endDeg).toBe(178)
  })

  it('单分类返回整圆标记', () => {
    const sectors = buildDonutSectors([{ key: 'a', label: 'A', value: 3, color: '#000' }], geometry)
    expect(sectors).toHaveLength(1)
    expect(sectors[0].fullCircle).toBe(true)
    expect(sectors[0].path).toBe('')
  })

  it('空数据与零值返回空数组', () => {
    expect(buildDonutSectors([], geometry)).toEqual([])
    expect(buildDonutSectors([{ key: 'a', label: 'A', value: 0, color: '#000' }], geometry)).toEqual([])
  })

  it('超过 180° 的扇区使用 large-arc', () => {
    const sectors = buildDonutSectors([
      { key: 'a', label: 'A', value: 3, color: '#000' },
      { key: 'b', label: 'B', value: 1, color: '#111' },
    ], geometry)
    expect(sectors[0].endDeg - sectors[0].startDeg).toBe(270)
    expect(sectors[0].path).toContain('A 90 90 0 1 1')
  })

  it('path 闭合且包含内外弧', () => {
    const path = donutArcPath(100, 100, 90, 60, 0, 90)
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path.match(/A /g)).toHaveLength(2)
  })
})
