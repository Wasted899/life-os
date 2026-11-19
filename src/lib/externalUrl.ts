/**
 * 外链归一：指南只放行可真正跳转的 http/https 绝对地址。
 *
 * 相对路径、javascript:、data:、mailto: 等一律拒绝并返回 null，
 * 由调用方决定丢弃或提示，渲染层不再承担协议安全兜底。
 */
export function sanitizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  return parsed.toString()
}

/** 展示用域名：去掉 www. 前缀；非法地址返回空串 */
export function externalDomain(url: string): string {
  const safe = sanitizeExternalUrl(url)
  if (!safe) return ''
  return new URL(safe).hostname.replace(/^www\./i, '')
}
