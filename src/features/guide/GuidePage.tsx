import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { GuideEntry, GuideLink } from '../../core/types'
import { uid } from '../../core/storage'
import { Modal } from '../../core/ui/Modal'
import { externalDomain } from '../../lib/externalUrl'
import {
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_IDS,
  OTHER_CATEGORY,
  buildGuideFromDraft,
  categoryLabelOf,
  categoryOf,
  draftFromGuide,
  emptyGuideDraft,
  guideDomains,
  guideIntro,
  guidePrimaryLink,
  type GuideDraft,
} from './model/guideSchema'
import { readStoredGuides, removeGuide, upsertGuide, writeStoredGuides } from './model/guideStorage'
import './guide.css'

const isOtherCategory = (id: string) => id === OTHER_CATEGORY

export default function GuidePage() {
  const { type } = useParams()
  const [guides, setGuides] = useState<GuideEntry[]>(readStoredGuides)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [draft, setDraft] = useState<GuideDraft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<GuideEntry | null>(null)

  const hasOther = guides.some(item => isOtherCategory(categoryOf(item)))
  const active = type === OTHER_CATEGORY
    ? OTHER_CATEGORY
    : type && GUIDE_CATEGORY_IDS.includes(type)
      ? type
      : GUIDE_CATEGORIES[0].id
  const activeMeta = GUIDE_CATEGORIES.find(item => item.id === active)
  const visible = guides.filter(item => categoryOf(item) === active)
  const detail = detailId ? guides.find(item => item.id === detailId) ?? null : null

  const persist = (next: GuideEntry[]) => {
    writeStoredGuides(next)
    setGuides(next)
  }

  const openNew = () => {
    setEditingId(null)
    setDraft(emptyGuideDraft(active))
    setError('')
    setDetailId(null)
  }

  const openEdit = (entry: GuideEntry) => {
    setEditingId(entry.id)
    setDraft(draftFromGuide(entry))
    setError('')
    setDetailId(null)
  }

  const closeEditor = () => {
    setDraft(null)
    setEditingId(null)
    setError('')
  }

  const saveEditor = () => {
    if (!draft) return
    const result = buildGuideFromDraft(draft, editingId ?? uid())
    if (!result.entry) {
      setError(result.error)
      return
    }
    persist(upsertGuide(guides, result.entry))
    closeEditor()
  }

  const updateDraft = (patch: Partial<GuideDraft>) =>
    setDraft(current => (current ? { ...current, ...patch } : current))

  const updateLink = (index: number, patch: Partial<GuideLink>) =>
    setDraft(current => current
      ? { ...current, links: current.links.map((link, i) => (i === index ? { ...link, ...patch } : link)) }
      : current)

  const addLink = () => setDraft(current => current
    ? { ...current, links: [...current.links, { label: '', url: '' }] }
    : current)

  const removeLink = (index: number) => setDraft(current => current
    ? { ...current, links: current.links.filter((_, i) => i !== index) }
    : current)

  const confirmDelete = () => {
    if (!pendingDelete) return
    persist(removeGuide(guides, pendingDelete.id))
    setPendingDelete(null)
    setDetailId(null)
  }

  return (
    <div className="guide-page">
      <div className="gd-layout">
        <aside className="gd-side">
          <div className="card gd-side-card">
            <div className="gd-side-title">📚 指南分类</div>
            <nav className="gd-nav">
              {GUIDE_CATEGORIES.map(item => (
                <Link
                  key={item.id}
                  to={`/guide/${item.id}`}
                  className={`gd-nav-item${active === item.id ? ' is-active' : ''}`}
                >
                  <span className="gd-nav-icon">{item.icon}</span>
                  <span className="gd-nav-text">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </Link>
              ))}
              {hasOther && (
                <Link
                  to={`/guide/${OTHER_CATEGORY}`}
                  className={`gd-nav-item${active === OTHER_CATEGORY ? ' is-active' : ''}`}
                >
                  <span className="gd-nav-icon">📁</span>
                  <span className="gd-nav-text">
                    <strong>其他</strong>
                    <small>旧分类条目原样保留</small>
                  </span>
                </Link>
              )}
            </nav>
          </div>
        </aside>

        <section className="gd-main">
          <div className="gd-head">
            <div>
              <h1 className="gd-title">
                {activeMeta ? `${activeMeta.icon} ${activeMeta.label}` : '📁 其他'}
              </h1>
              <p className="gd-sub">
                {activeMeta?.hint ?? '旧分类条目原样保留，编辑时可选择归入四个主分类'}
              </p>
            </div>
            <button className="btn btn-primary" type="button" onClick={openNew}>新建条目</button>
          </div>

          {visible.length === 0 ? (
            <div className="card gd-empty">
              <div className="gd-empty-title">这里还没有条目</div>
              <p>把常用的官网、B 站、知乎等外部入口收进来，标题 + 一句话简介 + 外链即可。</p>
              <button className="btn btn-outline" type="button" onClick={openNew}>添加第一条</button>
            </div>
          ) : (
            <div className="gd-grid">
              {visible.map(item => {
                const primary = guidePrimaryLink(item)
                const domains = guideDomains(item)
                const intro = guideIntro(item)
                const inner = (
                  <>
                    <div className="gd-card-title">
                      {item.icon ? <span className="gd-card-icon">{item.icon}</span> : null}
                      <span>{item.title}</span>
                    </div>
                    <p className="gd-card-intro">{intro || '暂无简介'}</p>
                    <div className="gd-card-domains">
                      {domains.length
                        ? domains.slice(0, 3).map(domain => (
                          <span className="gd-domain" key={domain}>{domain}</span>
                        ))
                        : <span className="gd-hint">暂无外链</span>}
                      {domains.length > 3 ? <span className="gd-hint">+{domains.length - 3}</span> : null}
                    </div>
                  </>
                )
                return (
                  <article className="gd-card" key={item.id}>
                    {primary ? (
                      <a
                        className="gd-card-main"
                        href={primary.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={primary.url}
                      >
                        {inner}
                      </a>
                    ) : (
                      <div className="gd-card-main">{inner}</div>
                    )}
                    <div className="gd-card-foot">
                      <span className="gd-badge">{categoryLabelOf(categoryOf(item))}</span>
                      <div className="gd-actions">
                        <button className="gd-mini" type="button" onClick={() => setDetailId(item.id)}>详情</button>
                        <button className="gd-mini" type="button" onClick={() => openEdit(item)}>编辑</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={!!detail}
        title={detail ? `${detail.icon ?? ''} ${detail.title}`.trim() : ''}
        onClose={() => setDetailId(null)}
        actions={detail ? (
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setDetailId(null)}>关闭</button>
            <button className="btn btn-danger" type="button" onClick={() => setPendingDelete(detail)}>删除</button>
            <button className="btn btn-primary" type="button" onClick={() => openEdit(detail)}>编辑</button>
          </>
        ) : null}
      >
        {detail ? (
          <div className="gd-detail">
            <div className="gd-detail-meta">
              <span className="gd-badge">{categoryLabelOf(categoryOf(detail))}</span>
            </div>
            {detail.body.some(line => line.trim()) ? (
              detail.body.filter(line => line.trim()).map((line, index) => (
                <p className="gd-detail-line" key={index}>{line}</p>
              ))
            ) : (
              <p className="gd-hint">暂无简介</p>
            )}
            {detail.links?.length ? (
              <ul className="gd-links">
                {detail.links.map((link, index) => (
                  <li key={`${link.url}-${index}`}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
                    <span className="gd-link-domain">{externalDomain(link.url)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="gd-hint">暂无外链</p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={draft !== null}
        title={editingId ? '编辑条目' : '新建条目'}
        onClose={closeEditor}
        actions={(
          <>
            <button className="btn btn-ghost" type="button" onClick={closeEditor}>取消</button>
            <button className="btn btn-primary" type="button" onClick={saveEditor}>保存</button>
          </>
        )}
      >
        {draft ? (
          <div className="gd-form">
            <label className="gd-field">
              <span>标题</span>
              <input
                className="input"
                value={draft.title}
                onChange={event => updateDraft({ title: event.target.value })}
                placeholder="例如：中国研究生招生信息网"
              />
            </label>
            <div className="gd-field-row">
              <label className="gd-field">
                <span>分类</span>
                <select
                  className="select"
                  value={draft.category}
                  onChange={event => updateDraft({ category: event.target.value })}
                >
                  {GUIDE_CATEGORIES.map(item => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                  {!GUIDE_CATEGORY_IDS.includes(draft.category) ? (
                    <option value={draft.category}>其他（{draft.category}）</option>
                  ) : null}
                </select>
              </label>
              <label className="gd-field gd-field-icon">
                <span>图标</span>
                <input
                  className="input"
                  value={draft.icon}
                  onChange={event => updateDraft({ icon: event.target.value })}
                  placeholder="🎓"
                  maxLength={4}
                />
              </label>
            </div>
            <label className="gd-field">
              <span>一句话简介</span>
              <textarea
                className="textarea"
                value={draft.intro}
                onChange={event => updateDraft({ intro: event.target.value })}
                placeholder="这个入口能解决什么问题？"
              />
            </label>
            <div className="gd-field">
              <span>外链（仅支持 http/https 绝对地址）</span>
              {draft.links.map((link, index) => (
                <div className="gd-link-row" key={index}>
                  <input
                    className="input"
                    value={link.label}
                    onChange={event => updateLink(index, { label: event.target.value })}
                    placeholder="链接名称"
                  />
                  <input
                    className="input"
                    value={link.url}
                    onChange={event => updateLink(index, { url: event.target.value })}
                    placeholder="https://"
                  />
                  <button className="gd-mini gd-mini-danger" type="button" onClick={() => removeLink(index)}>
                    移除
                  </button>
                </div>
              ))}
              <button className="btn btn-outline" type="button" onClick={addLink}>+ 添加外链</button>
            </div>
            {error ? <div className="gd-error">{error}</div> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!pendingDelete}
        title="删除条目"
        onClose={() => setPendingDelete(null)}
        actions={(
          <>
            <button className="btn btn-ghost" type="button" onClick={() => setPendingDelete(null)}>取消</button>
            <button className="btn btn-danger" type="button" onClick={confirmDelete}>删除</button>
          </>
        )}
      >
        <p>确定删除「{pendingDelete?.title ?? ''}」？删除后不会自动恢复，需要时请重新新建。</p>
      </Modal>
    </div>
  )
}
