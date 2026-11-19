import { useState, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { CONFIGURABLE_MODULES, MODULE_META, writeDisabledModules } from '../../core/modules'
import { useDisabledModules } from '../../app/useDisabledModules'
import type { ModuleId } from '../../core/types'
import ThemePanel from '../theme/ThemePanel'

const TABS = ['profile', 'theme', 'modules', 'data', 'about'] as const
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  profile: '个人资料',
  theme: '主题皮肤',
  modules: '功能管理',
  data: '数据管理',
  about: '关于',
}

export default function Settings() {
  const { exportAll, importAll, resetAll } = useData()
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]>('profile')
  const disabled = useDisabledModules()
  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem('p_nick') || '同学'
    } catch {
      return '同学'
    }
  })
  const fileRef = useRef<HTMLInputElement>(null)

  const tm = (id: ModuleId) => {
    writeDisabledModules(disabled.includes(id) ? disabled.filter(x => x !== id) : [...disabled, id])
  }
  const sn = () => {
    try {
      localStorage.setItem('p_nick', nick)
    } catch {}
    alert('已保存')
  }
  const ex = () => {
    const blob = new Blob([exportAll()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `planner-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const im = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => importAll(r.result as string)
    r.readAsText(f)
  }

  return (
    <div className="card">
      <div className="card-title">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t}
              className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' && (
        <div style={{ maxWidth: 400 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>昵称</label>
            <input
              className="input"
              value={nick}
              onChange={e => setNick(e.target.value)}
              style={{ marginTop: 4 }}
            />
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={sn}>
              保存
            </button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>头像</label>
            <div style={{ marginTop: 4 }}>
              <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>
                更换头像
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const r = new FileReader()
                  r.onload = () => {
                    try {
                      localStorage.setItem('p_avatar', r.result as string)
                    } catch {}
                    alert('头像已保存，刷新生效')
                  }
                  r.readAsDataURL(f)
                }}
              />
            </div>
          </div>
          {user && (
            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
              <div>已登录：{user.email}</div>
              <button
                className="btn btn-outline"
                style={{ marginTop: 8 }}
                onClick={() => signOut().catch(() => alert('退出失败，请检查网络后重试'))}
              >
                退出登录
              </button>
            </div>
          )}
          {!user && (
            <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: '#0369a1', marginBottom: 8 }}>
                未登录，数据仅保存在本机
              </div>
              <a
                href="#/login"
                className="btn btn-outline"
                style={{ display: 'inline-block', textDecoration: 'none' }}
              >
                登录 / 云同步
              </a>
            </div>
          )}
        </div>
      )}

      {tab === 'theme' && <ThemePanel />}

      {tab === 'modules' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            关闭后侧边栏隐藏该入口，数据保留不删除
          </div>
          {CONFIGURABLE_MODULES.map(id => {
            const m = MODULE_META[id]
            const off = disabled.includes(id)
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--hairline)',
                }}
              >
                <div>
                  <span style={{ marginRight: 8 }}>{m.icon}</span>
                  {m.label}
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                  <input
                    type="checkbox"
                    checked={!off}
                    onChange={() => tm(id)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      inset: 0,
                      background: off ? '#cbd5e1' : '#22c55e',
                      borderRadius: 24,
                      transition: '.3s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        height: 18,
                        width: 18,
                        left: off ? 3 : 23,
                        top: 3,
                        background: '#fff',
                        borderRadius: '50%',
                        transition: '.3s',
                      }}
                    />
                  </span>
                </label>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'data' && (
        <div style={{ maxWidth: 400 }}>
          <div className="card" style={{ background: '#f8fafc', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>导出数据</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              导出所有数据为JSON备份
            </div>
            <button className="btn btn-primary" onClick={ex}>
              导出备份
            </button>
          </div>
          <div className="card" style={{ background: '#f8fafc', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>导入数据</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              从JSON备份恢复（自动兼容旧数据）
            </div>
            <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
              选择文件
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={im} />
            </label>
          </div>
          <div className="card" style={{ background: '#fef2f2' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#991b1b' }}>重置数据</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              清空所有数据，不可恢复
            </div>
            <button className="btn btn-danger" onClick={resetAll}>
              重置全部
            </button>
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <h2>个人规划助手</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
            待办 · 目标 · 习惯 · 重要日子 · 日历 · 时间统计 · 番茄钟 · 复盘 · 备忘录 · 记账 · 指南
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 16 }}>
            版本 5.0.0 · 支持本地存储和Supabase云同步
          </p>
        </div>
      )}
    </div>
  )
}
