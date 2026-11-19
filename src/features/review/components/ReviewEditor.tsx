import type { ReviewPeriod } from '../../../core/types'
import { REVIEW_FIELDS } from '../model/reviewSchema'
import type { ReviewForm } from '../model/reviewSchema'

export interface ReviewEditorProps {
  period: ReviewPeriod
  form: ReviewForm
  dirty: boolean
  hasSaved: boolean
  onChange: (next: ReviewForm) => void
  onSave: () => void
  onDelete: () => void
}

const MOOD_LABEL = ['', '很差', '较差', '一般', '不错', '很好']

export default function ReviewEditor({ period, form, dirty, hasSaved, onChange, onSave, onDelete }: ReviewEditorProps) {
  const setSection = (key: string, value: string) => {
    onChange({ ...form, sections: { ...form.sections, [key]: value } })
  }

  return (
    <section className="rv-editor">
      {period === 'daily' && (
        <div className="rv-mood">
          <span>今日心情</span>
          <div className="rv-mood-stars" role="radiogroup" aria-label="今日心情">
            {[1, 2, 3, 4, 5].map(score => (
              <button
                key={score}
                type="button"
                role="radio"
                aria-checked={form.mood === score}
                className={form.mood >= score ? 'rv-star is-on' : 'rv-star'}
                onClick={() => onChange({ ...form, mood: score })}
                title={MOOD_LABEL[score]}
              >
                ★
              </button>
            ))}
          </div>
          <span className="rv-muted">{MOOD_LABEL[form.mood]}</span>
        </div>
      )}

      {REVIEW_FIELDS[period].map(field => (
        <label key={field.key} className="rv-field">
          <span className="rv-field-label">{field.label}</span>
          <textarea
            className="textarea rv-textarea"
            rows={field.rows}
            value={form.sections[field.key] || ''}
            placeholder={field.placeholder}
            onChange={event => setSection(field.key, event.target.value)}
          />
        </label>
      ))}

      <div className="rv-editor-actions">
        {hasSaved && (
          <button type="button" className="btn btn-outline rv-danger" onClick={onDelete}>删除本篇</button>
        )}
        <span className="rv-muted">{dirty ? '有未保存的修改' : hasSaved ? '已保存' : '尚未填写'}</span>
        <button type="button" className="btn btn-primary" disabled={!dirty} onClick={onSave}>保存复盘</button>
      </div>
    </section>
  )
}
