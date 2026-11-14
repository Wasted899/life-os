import dayjs from 'dayjs'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** YYYY-MM-DD 加减天数，跨月/跨年交给 dayjs */
export const shiftDate = (date: string, days: number): string =>
  dayjs(date).add(days, 'day').format('YYYY-MM-DD')

export const todayISO = (): string => dayjs().format('YYYY-MM-DD')

/** 例：2026年11月14日 周六 */
export const formatDateLabel = (date: string): string => {
  const value = dayjs(date)
  return `${value.format('YYYY年M月D日')} ${WEEKDAYS[value.day()]}`
}
