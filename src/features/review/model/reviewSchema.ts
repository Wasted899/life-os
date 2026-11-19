import type { ReviewEntry, ReviewPeriod, ReviewSections } from '../../../core/types'

/** 编辑中的表单模型：mood 只对日复盘生效，sections 只保留字符串值 */
export interface ReviewForm {
  mood: number
  sections: ReviewSections
}

export interface ReviewField {
  key: string
  label: string
  placeholder: string
  rows: number
}

/** 各周期的文本字段模板（旧页面字段保持不变） */
export const REVIEW_FIELDS: Record<ReviewPeriod, readonly ReviewField[]> = {
  daily: [
    { key: 'done', label: '今日完成', placeholder: '今天完成了什么？', rows: 3 },
    { key: 'undone', label: '未完成及原因', placeholder: '什么没完成？为什么？', rows: 3 },
    { key: 'tomorrow', label: '明日计划', placeholder: '明天计划做什么？', rows: 3 },
  ],
  weekly: [
    { key: 'summary', label: '本周总结', placeholder: '本周整体表现、收获、不足…', rows: 5 },
    { key: 'next', label: '下周计划', placeholder: '下周目标和计划…', rows: 5 },
  ],
  monthly: [
    { key: 'summary', label: '月度总结', placeholder: '本月整体回顾…', rows: 6 },
    { key: 'next', label: '下月计划', placeholder: '下月目标和计划…', rows: 6 },
  ],
  yearly: [
    { key: 'summary', label: '年度总结', placeholder: '这一年的整体回顾、最大收获、遗憾…', rows: 8 },
    { key: 'next', label: '新年计划', placeholder: '新一年的目标和计划…', rows: 8 },
  ],
}

export const emptyReviewForm = (): ReviewForm => ({ mood: 3, sections: {} })

export const formFromReview = (review: ReviewEntry | null | undefined): ReviewForm => ({
  mood: review?.mood ?? 3,
  sections: review ? { ...review.sections } : {},
})

/** 表单 → 落库 sections：只保留当前周期模板内的键，避免切换周期时串字段 */
export function formToSections(period: ReviewPeriod, form: ReviewForm): ReviewSections {
  const sections: ReviewSections = {}
  for (const field of REVIEW_FIELDS[period]) {
    const value = form.sections[field.key]
    sections[field.key] = typeof value === 'string' ? value : ''
  }
  return sections
}

/** 是否有未保存内容 */
export function isFormDirty(period: ReviewPeriod, form: ReviewForm, review: ReviewEntry | null | undefined): boolean {
  const saved = review ? formToSections(period, formFromReview(review)) : formToSections(period, emptyReviewForm())
  const current = formToSections(period, form)
  if (JSON.stringify(saved) !== JSON.stringify(current)) return true
  return period === 'daily' ? form.mood !== (review?.mood ?? 3) : false
}
