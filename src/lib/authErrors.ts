/**
 * Supabase Auth 错误 → 中文文案（M1-5）
 *
 * 纯函数：不依赖 React / supabase / 浏览器，入参就是 error 对象。
 * 优先按 error.code 匹配（GoTrue 的错误码更稳定），其次按 message 正则兜底。
 */

export interface AuthErrorLike {
  code?: string
  message?: string
}

/** 网络异常统一文案：强调本机数据未改动，避免用户恐慌 */
export const NETWORK_ERROR_TEXT = '网络异常，请检查网络后重试（本机数据未改动）'

const BY_CODE: Record<string, string> = {
  invalid_credentials: '邮箱或密码不正确',
  email_not_confirmed: '邮箱尚未验证，请先点击验证邮件中的链接',
  email_exists: '该邮箱已注册，请直接登录或找回密码',
  user_already_exists: '该邮箱已注册，请直接登录或找回密码',
  weak_password: '密码强度不足，请至少输入 6 位',
  same_password: '新密码不能与旧密码相同',
  over_email_send_rate_limit: '发送过于频繁，请稍后再试',
  over_request_rate_limit: '操作过于频繁，请稍后再试',
  email_address_invalid: '邮箱格式不正确',
  invalid_email: '邮箱格式不正确',
  email_provider_disabled: '当前项目未开启邮箱登录',
  signup_disabled: '当前项目已关闭注册',
  otp_expired: '链接已失效，请重新获取',
  session_expired: '登录状态已失效，请重新登录',
  reauthentication_needed: '为了安全，请重新登录后再操作',
}

const BY_MESSAGE: {pattern: RegExp; text: string}[] = [
  {pattern: /invalid login credentials/i, text: BY_CODE.invalid_credentials},
  {pattern: /email not confirmed/i, text: BY_CODE.email_not_confirmed},
  {pattern: /already registered|user already exists|already been registered/i, text: BY_CODE.user_already_exists},
  {pattern: /password should be at least|weak password|password is too short/i, text: BY_CODE.weak_password},
  {pattern: /different from the old password/i, text: BY_CODE.same_password},
  {pattern: /rate limit|too many requests/i, text: BY_CODE.over_email_send_rate_limit},
  {pattern: /unable to validate email|invalid email|email address .* is invalid/i, text: BY_CODE.email_address_invalid},
  {pattern: /token has expired or is invalid|invalid or expired|otp.*expired/i, text: BY_CODE.otp_expired},
  {pattern: /signups not allowed|signup is disabled/i, text: BY_CODE.signup_disabled},
  {pattern: /failed to fetch|networkerror|network error|load failed|fetch failed/i, text: NETWORK_ERROR_TEXT},
]

export function mapAuthError(error: AuthErrorLike | null | undefined, fallback = '操作失败，请稍后重试'): string {
  const code = String(error?.code || '').toLowerCase()
  if (code && BY_CODE[code]) return BY_CODE[code]

  const message = String(error?.message || '').trim()
  if (!message) return fallback
  for (const rule of BY_MESSAGE) {
    if (rule.pattern.test(message)) return rule.text
  }
  return `操作失败：${message}`
}
