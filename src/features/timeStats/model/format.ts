/**
 * 时间显示与输入解析（统计页专用）。
 * - 存储仍是十进制小时
 * - 展示/输入统一 HH:mm
 * - 异常数据允许 end > 24，因此 raw 版本不做截断
 */

const pad2 = (value: number): string => String(value).padStart(2, '0')

const toClock = (hours: number): { hour: number; minute: number } => {
  const totalMinutes = Math.round(Math.abs(hours) * 60)
  return { hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 }
}

/** 0..24 内的正常时间：24 显示为 24:00 */
export function formatHourValue(hours: number): string {
  const safe = Math.min(24, Math.max(0, Number.isFinite(hours) ? hours : 0))
  const { hour, minute } = toClock(safe)
  return `${pad2(hour)}:${pad2(minute)}`
}

/** 原始时间：允许 >24 / 负数，用于异常记录展示 */
export function formatRawHour(hours: number): string {
  if (!Number.isFinite(hours)) return '—'
  const { hour, minute } = toClock(hours)
  const sign = hours < 0 ? '-' : ''
  return `${sign}${pad2(hour)}:${pad2(minute)}`
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours)) return '—'
  if (hours === 0) return '0h'
  const sign = hours < 0 ? '-' : ''
  const rounded = Math.round(Math.abs(hours) * 10) / 10
  return `${sign}${rounded}h`
}

/** HH:mm / H:mm → 十进制小时；非法返回 null */
export function parseHourInput(text: string): number | null {
  const trimmed = (text ?? '').trim()
  if (!/^\d{1,2}:\d{1,2}$/.test(trimmed)) return null
  const [hourText, minuteText] = trimmed.split(':')
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (minute < 0 || minute > 59) return null
  return hour + minute / 60
}
