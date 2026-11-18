/**
 * URL 日期参数解析：与日历保持同一份 YYYY-MM-DD 口径。
 *
 * 只做严格校验，不做钳制——非法/越界返回 null，由调用方回落到今天。
 * 页面只读不写 query，因此不存在与本地状态互相覆盖或写回死循环。
 */
export function readDateParam(value: string | null | undefined): string | null {
  if (!value) return null
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1) return null
  // new Date(y, m, 0) = 目标月的最后一天
  const lastDay = new Date(year, month, 0).getDate()
  return day > lastDay ? null : value
}
