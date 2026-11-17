/** 金额工具：所有汇总先转整数分累加，再转回元，避免浮点误差。 */

/** 四舍五入到 2 位小数（元），负数对称处理 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  const sign = value < 0 ? -1 : 1
  const cents = Math.round((Math.abs(value) + Number.EPSILON) * 100)
  const result = (sign * cents) / 100
  return Object.is(result, -0) ? 0 : result
}

/** 元 → 整数分 */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}

/** 整数分 → 元（保留 2 位小数） */
export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return round2(cents / 100)
}

/** 人民币展示：¥1,234.50 / -¥25.00 */
export function formatCNY(value: number): string {
  const safe = Number.isFinite(value) ? round2(value) : 0
  const sign = safe < 0 ? '-' : ''
  return `${sign}¥${Math.abs(safe).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
