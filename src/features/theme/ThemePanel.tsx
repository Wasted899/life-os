import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { sanitizeBackgroundImage } from '../../core/theme'
import type { Theme } from '../../core/types'
import { applyTheme } from './applyTheme'
import {
  compressImageFile,
  oversizeThemeIds,
  themeImageChars,
  THEME_IMAGE_MAX_CHARS,
} from './model/imagePipeline'
import {
  buildThemeFromDraft,
  createThemeDraft,
  themePreviewBackground,
} from './model/themeSchema'
import type { ThemeDraft } from './model/themeSchema'
import './theme.css'

type Notice = { type: 'ok' | 'warn' | 'error'; text: string }

const TEXTURES = [
  { value: 'none', label: '无' },
  { value: 'grid', label: '网格' },
  { value: 'noise', label: '噪点' },
  { value: 'both', label: '网格 + 噪点' },
  { value: 'stripes', label: '斜纹（斑马线）' },
] as const

const MOTIONS = [
  { value: 'snappy', label: '利落' },
  { value: 'calm', label: '沉稳' },
] as const

const formatK = (chars: number): string => `${Math.round(chars / 1000)}k`

const createFromCurrent = (current: Theme): ThemeDraft => ({
  ...createThemeDraft(),
  primary: current.primary,
  sidebar: current.sidebar,
  bg: current.bg || '#f0f4f8',
  overlay: current.overlay ?? 0.88,
  blur: current.blur ?? 12,
  vars: { ...(current.vars ?? {}) },
})

export default function ThemePanel() {
  const { themes, theme: current, hiddenPresets, setTheme, addTheme, updateTheme, deleteTheme, restorePreset } =
    useTheme()
  const [draft, setDraft] = useState<ThemeDraft>(() => createThemeDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** 实时预览：只改变量、不写盘；退出面板/取消时回滚到进来前的正式主题 */
  const [previewing, setPreviewing] = useState(false)
  const previewingRef = useRef(false)
  const currentRef = useRef(current)
  currentRef.current = current

  const previewTheme = useMemo(() => {
    const safeImage = draft.bgImage ? sanitizeBackgroundImage(draft.bgImage) : null
    return buildThemeFromDraft({ ...draft, bgImage: safeImage || '' }, { id: '__preview__' })
  }, [draft])

  useLayoutEffect(() => {
    if (!previewing) return
    applyTheme(previewTheme)
  }, [previewing, previewTheme])

  useEffect(
    () => () => {
      if (previewingRef.current) applyTheme(currentRef.current)
    },
    [],
  )

  const stopPreview = () => {
    if (!previewingRef.current) return
    previewingRef.current = false
    setPreviewing(false)
    applyTheme(currentRef.current)
  }

  const oversize = useMemo(() => new Set(oversizeThemeIds(themes)), [themes])
  const customCount = themes.filter(item => item.custom).length
  const imageChars = draft.bgImage ? draft.bgImage.length : 0

  const patch = (next: Partial<ThemeDraft>) => {
    previewingRef.current = true
    setPreviewing(true)
    setDraft(value => ({ ...value, ...next }))
  }
  const patchVars = (next: ThemeDraft['vars']) => {
    previewingRef.current = true
    setPreviewing(true)
    setDraft(value => ({ ...value, vars: { ...value.vars, ...next } }))
  }

  const resetEditor = () => {
    stopPreview()
    setEditingId(null)
    setDraft(createThemeDraft())
  }

  const beginCreate = () => {
    stopPreview()
    setNotice(null)
    setEditingId(null)
    setDraft(createFromCurrent(current))
  }

  const beginEdit = (theme: Theme) => {
    stopPreview()
    setNotice(null)
    setEditingId(theme.id)
    setDraft(createThemeDraft(theme))
  }

  const onPickFile = async (file: File) => {
    setBusy(true)
    setNotice(null)
    try {
      const result = await compressImageFile(file)
      if (!result.ok) {
        setNotice({ type: 'warn', text: 'message' in result ? result.message : '图片处理失败' })
        return
      }
      patch({ bgImage: result.image.dataUrl })
      setNotice({
        type: 'ok',
        text: `已压缩至 ${result.image.width}×${result.image.height}，${formatK(result.image.chars)} 字符`,
      })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = () => {
    if (!draft.name.trim()) {
      setNotice({ type: 'error', text: '请先填写主题名称' })
      return
    }
    const safeImage = draft.bgImage ? sanitizeBackgroundImage(draft.bgImage) : null
    if (draft.bgImage && !safeImage) {
      setNotice({ type: 'error', text: '背景图只支持 http/https 链接或本地图片' })
      return
    }

    const existing = editingId ? themes.find(item => item.id === editingId) : undefined
    const id = editingId ?? `c-${Date.now()}`
    let next = buildThemeFromDraft(
      { ...draft, bgImage: safeImage || '' },
      { id, createdAt: existing?.createdAt },
    )

    // 入口压缩已挡住 90 万字符；这里兜住超长外链与历史草稿
    let degraded = false
    if (next.bgImage && themeImageChars(next) > THEME_IMAGE_MAX_CHARS) {
      next = { ...next, bgImage: undefined }
      degraded = true
    }

    let result = editingId ? updateTheme(next) : addTheme(next)

    // 写失败（总额 / 配额）时降级为「只存配色丢图」，再失败才报错
    if (!result.ok && next.bgImage) {
      const fallback = { ...next, bgImage: undefined }
      result = editingId ? updateTheme(fallback) : addTheme(fallback)
      if (result.ok) degraded = true
    }

    if (!result.ok) {
      setNotice({ type: 'error', text: result.reason || '保存失败' })
      return
    }

    setNotice({
      type: degraded ? 'warn' : 'ok',
      text: degraded
        ? '背景图超出存储预算，已仅保存配色'
        : editingId
          ? '已保存修改'
          : '已创建并切换到新主题',
    })
    // 已落库并切换，预览使命结束；不再回滚旧主题
    previewingRef.current = false
    setPreviewing(false)
    if (editingId) {
      setDraft(createThemeDraft(next))
    } else {
      resetEditor()
    }
  }

  const remove = (theme: Theme) => {
    const isPreset = theme.custom === false
    const message = isPreset
      ? `删除内置预设「${theme.name}」？删除后可在下方「已隐藏的预设」里恢复。`
      : `删除主题「${theme.name}」？`
    if (!window.confirm(message)) return
    stopPreview()
    const result = deleteTheme(theme.id)
    if (!result.ok) {
      setNotice({ type: 'error', text: result.reason || '删除失败' })
      return
    }
    if (editingId === theme.id) resetEditor()
    setNotice({ type: 'ok', text: isPreset ? '已隐藏该预设，可随时恢复' : '已删除' })
  }

  const restore = (theme: Theme) => {
    const result = restorePreset(theme.id)
    setNotice(
      result.ok
        ? { type: 'ok', text: `已恢复「${theme.name}」` }
        : { type: 'error', text: result.reason || '恢复失败' },
    )
  }

  return (
    <div className="theme-panel">
      {oversize.size > 0 && (
        <div className="theme-alert" role="status">
          有 {oversize.size} 套历史主题的背景图超过 90 万字符，仅作提示，不会自动修改。
        </div>
      )}

      <div className="theme-grid">
        {themes.map(theme => {
          const active = current.id === theme.id
          const over = oversize.has(theme.id)
          return (
            <div
              key={theme.id}
              className={`theme-card${active ? ' theme-card-active' : ''}`}
              onClick={() => {
                stopPreview()
                setTheme(theme.id)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  stopPreview()
                  setTheme(theme.id)
                }
              }}
            >
              <div
                className="theme-thumb"
                style={{ background: themePreviewBackground(theme) }}
                aria-hidden="true"
              >
                <span className="theme-thumb-side" style={{ background: theme.sidebar }} />
                <span
                  className="theme-thumb-card"
                  style={{
                    background: theme.vars?.surface || '#ffffff',
                    opacity: Math.max(0.62, theme.vars?.cardAlpha ?? theme.overlay ?? 0.88),
                  }}
                />
                <span className="theme-thumb-accent" style={{ background: theme.primary }} />
              </div>

              <div className="theme-card-head">
                <span className="theme-name">{theme.name}</span>
                {active && <span className="theme-badge">当前</span>}
                {over && <span className="theme-badge theme-badge-danger">图片超限</span>}
              </div>

              <div className="theme-actions">
                {theme.custom !== false && (
                  <button
                    type="button"
                    className="theme-link"
                    onClick={event => {
                      event.stopPropagation()
                      beginEdit(theme)
                    }}
                  >
                    编辑
                  </button>
                )}
                <button
                  type="button"
                  className="theme-link theme-link-danger"
                  onClick={event => {
                    event.stopPropagation()
                    remove(theme)
                  }}
                >
                  {theme.custom === false ? '删除预设' : '删除'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {hiddenPresets.length > 0 && (
        <div className="theme-hidden">
          <span className="theme-meta">已隐藏 {hiddenPresets.length} 个内置预设</span>
          <div className="theme-hidden-list">
            {hiddenPresets.map(theme => (
              <button
                key={theme.id}
                type="button"
                className="theme-link"
                onClick={() => restore(theme)}
              >
                恢复「{theme.name}」
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="theme-editor">
        <div className="theme-editor-head">
          <span className="theme-editor-title">{editingId ? '编辑主题' : '新建主题'}</span>
          <span className="theme-meta">改动即时预览（不写盘）· 已保存 {customCount} 套自定义</span>
        </div>

        <div className="theme-form">
          <label className="theme-field">
            <span>名称</span>
            <input
              className="input"
              value={draft.name}
              placeholder="例如：夜航霓虹"
              onChange={event => patch({ name: event.target.value })}
            />
          </label>

          <div className="theme-field-row">
            <label className="theme-field">
              <span>主色</span>
              <input
                type="color"
                value={draft.primary}
                onChange={event => patch({ primary: event.target.value })}
              />
            </label>
            <label className="theme-field">
              <span>侧栏</span>
              <input
                type="color"
                value={draft.sidebar}
                onChange={event => patch({ sidebar: event.target.value })}
              />
            </label>
            <label className="theme-field">
              <span>底色</span>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(draft.bg) ? draft.bg : '#f0f4f8'}
                onChange={event => patch({ bg: event.target.value })}
              />
            </label>
          </div>

          <div className="theme-field">
            <span>背景图</span>
            <div className="theme-image-row">
              <input
                className="input"
                placeholder="粘贴 http/https 图片地址"
                value={draft.bgImage.startsWith('data:') ? '' : draft.bgImage}
                disabled={draft.bgImage.startsWith('data:')}
                onChange={event => patch({ bgImage: event.target.value })}
              />
              <button
                type="button"
                className="btn btn-outline theme-file-btn"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? '压缩中…' : '本地图片'}
              </button>
              {draft.bgImage && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => patch({ bgImage: '' })}
                >
                  清除
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) void onPickFile(file)
                }}
              />
            </div>
            {imageChars > 0 && (
              <span className={`theme-meta${imageChars > THEME_IMAGE_MAX_CHARS ? ' theme-meta-danger' : ''}`}>
                当前图片 {formatK(imageChars)} 字符 / 上限 {formatK(THEME_IMAGE_MAX_CHARS)}
              </span>
            )}
          </div>

          <label className="theme-field">
            <span>卡片不透明度 {Math.round((draft.vars.cardAlpha ?? draft.overlay) * 100)}%</span>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.02"
              value={draft.vars.cardAlpha ?? draft.overlay}
              onChange={event => patchVars({ cardAlpha: Number(event.target.value) })}
            />
          </label>

          <label className="theme-field">
            <span>毛玻璃 {draft.blur}px</span>
            <input
              type="range"
              min="0"
              max="24"
              step="1"
              value={draft.blur}
              onChange={event => patch({ blur: Number(event.target.value) })}
            />
          </label>

          <label className="theme-field">
            <span>斜切角 {draft.vars.cut ?? 0}px（0 = 直角零裁剪）</span>
            <input
              type="range"
              min="0"
              max="24"
              step="1"
              value={draft.vars.cut ?? 0}
              onChange={event => patchVars({ cut: Number(event.target.value) })}
            />
          </label>

          <div className="theme-field-row">
            <label className="theme-field">
              <span>质感</span>
              <select
                className="select"
                value={draft.vars.texture ?? 'none'}
                onChange={event => patchVars({ texture: event.target.value as ThemeDraft['vars']['texture'] })}
              >
                {TEXTURES.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="theme-field">
              <span>动效</span>
              <select
                className="select"
                value={draft.vars.motion ?? 'snappy'}
                onChange={event => patchVars({ motion: event.target.value as ThemeDraft['vars']['motion'] })}
              >
                {MOTIONS.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="theme-switch">
              <input
                type="checkbox"
                checked={!!draft.vars.monoNumbers}
                onChange={event => patchVars({ monoNumbers: event.target.checked })}
              />
              <span>等宽数字</span>
            </label>
            <label className="theme-switch">
              <input
                type="checkbox"
                checked={draft.vars.heading === 'impact'}
                onChange={event => patchVars({ heading: event.target.checked ? 'impact' : 'system' })}
              />
              <span>Impact 标题</span>
            </label>
            <label className="theme-switch">
              <input
                type="checkbox"
                checked={!!draft.vars.glitch}
                onChange={event => patchVars({ glitch: event.target.checked })}
              />
              <span>Glitch 标题</span>
            </label>
          </div>
        </div>

        {notice && <div className={`theme-notice theme-notice-${notice.type}`}>{notice.text}</div>}

        <div className="theme-editor-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {editingId ? '保存修改' : '保存为新主题'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetEditor}>
            {editingId ? '取消编辑' : '重置'}
          </button>
          {!editingId && (
            <button type="button" className="btn btn-outline" onClick={beginCreate}>
              以当前配色为底
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
