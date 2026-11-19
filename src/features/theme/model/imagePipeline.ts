/**
 * 背景图压缩与 localStorage 防爆（M3-4）
 *
 * 预算按 UTF-16 字符数（string.length）计，因为 localStorage 配额按字符而非字节。
 * 纯函数便于单测；真正的 Canvas 压缩只在浏览器里执行。
 */
import type { Theme } from '../../../core/types'

/** 单图上限：90 万字符（约 675KB 二进制） */
export const THEME_IMAGE_MAX_CHARS = 900_000
/** 单套主题 JSON 上限（含背景图） */
export const THEME_SET_MAX_CHARS = 1_000_000
/** 全部自定义主题 + 背景图总额 */
export const THEME_TOTAL_MAX_CHARS = 2_500_000
/** 给 13 域 / 复盘预留的安全余量 */
export const THEME_RESERVED_CHARS = 1_500_000
/** 原始文件解码前的硬上限，避免手机原图把内存打爆 */
export const THEME_RAW_FILE_MAX_BYTES = 20 * 1024 * 1024
/** 配额探针 key（写入后立即删除） */
export const THEME_PROBE_KEY = '__theme_probe'

export interface CompressionStep {
  maxEdge: number
  quality: number
}

/** 五档递减：每档输出后测体积，达标即停 */
export const COMPRESSION_STEPS: readonly CompressionStep[] = [
  { maxEdge: 1920, quality: 0.82 },
  { maxEdge: 1600, quality: 0.75 },
  { maxEdge: 1280, quality: 0.68 },
  { maxEdge: 1024, quality: 0.6 },
  { maxEdge: 800, quality: 0.55 },
]

export interface PixelSize {
  width: number
  height: number
}

/** 等比缩放到长边不超过 maxEdge */
export function scaledSize(width: number, height: number, maxEdge: number): PixelSize {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge || longEdge <= 0) return { width: Math.max(1, width), height: Math.max(1, height) }
  const ratio = maxEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

export const dataUrlChars = (value: string): number => value.length

/** 按顺序取第一个不超预算的压缩结果 */
export function pickWithinBudget(
  candidates: readonly string[],
  limit = THEME_IMAGE_MAX_CHARS,
): { value: string; step: number } | null {
  for (let index = 0; index < candidates.length; index += 1) {
    if (dataUrlChars(candidates[index]) <= limit) return { value: candidates[index], step: index }
  }
  return null
}

export const themeSetChars = (themes: readonly Theme[]): number => JSON.stringify(themes).length

/** 单套主题的背景图字符数（无图按 0 计） */
export const themeImageChars = (theme: Theme): number =>
  theme.bgImage ? dataUrlChars(theme.bgImage) : 0

/** 历史数据里超过单图上限的主题 id：只用于标红提示，不自动改写 */
export function oversizeThemeIds(
  themes: readonly Theme[],
  limit = THEME_IMAGE_MAX_CHARS,
): string[] {
  return themes.filter(theme => themeImageChars(theme) > limit).map(theme => theme.id)
}

export interface ThemeSetCheck {
  ok: boolean
  size: number
  reason?: string
}

/** 新增/更新一套主题前的总额校验（不含配额探针） */
export function checkThemeSetBudget(themes: readonly Theme[], next: Theme): ThemeSetCheck {
  const nextList = themes.some(item => item.id === next.id)
    ? themes.map(item => (item.id === next.id ? next : item))
    : [...themes, next]
  const size = themeSetChars(nextList)
  if (themeSetChars([next]) > THEME_SET_MAX_CHARS) {
    return { ok: false, size, reason: '单套主题超过 100 万字符，请换一张更小的背景图' }
  }
  if (size > THEME_TOTAL_MAX_CHARS) {
    return { ok: false, size, reason: '自定义主题总额超过 250 万字符，请先删除旧主题或压缩背景图' }
  }
  return { ok: true, size }
}

/**
 * 写入前探针：往临时 key 写一段与目标体积相当的数据。
 * 抛 QuotaExceededError 说明剩余空间不足，避免真写 p_themes 时才失败。
 */
export function probeQuota(extraChars: number): boolean {
  if (typeof localStorage === 'undefined') return false
  const key = `planner:${THEME_PROBE_KEY}`
  const size = Math.max(1, Math.round(extraChars) + 262_144)
  try {
    localStorage.setItem(key, 'x'.repeat(size))
    localStorage.removeItem(key)
    return true
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      // 清理失败不影响结论
    }
    return false
  }
}

export type CompressFailure = 'type' | 'size' | 'decode' | 'oversize'

export interface CompressedImage {
  dataUrl: string
  width: number
  height: number
  step: number
  chars: number
}

export type CompressResult =
  | { ok: true; image: CompressedImage }
  | { ok: false; reason: CompressFailure; message: string }

const fail = (reason: CompressFailure, message: string): CompressResult => ({ ok: false, reason, message })

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // 某些浏览器不支持 imageOrientation 参数，回落普通解码
      try {
        return await createImageBitmap(file)
      } catch {
        return null
      }
    }
  }
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

const bitmapSize = (source: ImageBitmap | HTMLImageElement): PixelSize =>
  source instanceof HTMLImageElement
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height }

/**
 * 文件 → 压缩后的 data URL。
 * 五档全部超预算时返回 oversize，由调用方降级为「只保存配色」。
 */
export async function compressImageFile(file: File): Promise<CompressResult> {
  if (!file.type.startsWith('image/')) {
    return fail('type', '只支持图片文件')
  }
  if (file.size > THEME_RAW_FILE_MAX_BYTES) {
    return fail('size', '图片超过 20MB，请先裁剪后再上传')
  }

  const source = await loadBitmap(file)
  if (!source) return fail('decode', '图片解码失败，请换一张图片')

  const original = bitmapSize(source)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    if (!(source instanceof HTMLImageElement)) source.close()
    return fail('decode', '当前浏览器无法压缩图片')
  }

  try {
    for (let step = 0; step < COMPRESSION_STEPS.length; step += 1) {
      const config = COMPRESSION_STEPS[step]
      const size = scaledSize(original.width, original.height, config.maxEdge)
      canvas.width = size.width
      canvas.height = size.height
      context.clearRect(0, 0, size.width, size.height)
      context.drawImage(source, 0, 0, size.width, size.height)

      let dataUrl = canvas.toDataURL('image/webp', config.quality)
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', config.quality)
      }
      if (dataUrlChars(dataUrl) <= THEME_IMAGE_MAX_CHARS) {
        return {
          ok: true,
          image: { dataUrl, width: size.width, height: size.height, step, chars: dataUrlChars(dataUrl) },
        }
      }
    }
    return fail('oversize', '图片压缩后仍超过 90 万字符，已仅保存配色，建议换用更小的图片')
  } finally {
    canvas.width = 0
    canvas.height = 0
    if (!(source instanceof HTMLImageElement)) source.close()
  }
}
