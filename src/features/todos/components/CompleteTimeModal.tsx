import {useEffect,useState} from 'react'
import Modal from '../../../core/ui/Modal'

export interface CompleteTimeModalProps {
  open: boolean
  /** 任务 / 习惯名称，用于标题 */
  title: string
  onCancel: () => void
  /** minutes 为 null 表示不记录时间 */
  onConfirm: (minutes: number | null) => void
}

/**
 * 完成用时弹窗（替代 window.prompt）。
 * 空输入 = 不记录时间；非法输入（非正数）给出内联提示，不关闭弹窗。
 */
export default function CompleteTimeModal({open,title,onCancel,onConfirm}:CompleteTimeModalProps){
  const[value,setValue]=useState('')
  const[error,setError]=useState('')

  useEffect(()=>{
    if(open){setValue('');setError('')}
  },[open])

  const submit=()=>{
    const raw=value.trim()
    if(!raw){onConfirm(null);return}
    const minutes=Number(raw)
    if(!Number.isFinite(minutes)||minutes<=0){setError('请输入大于 0 的分钟数，或留空表示不记录');return}
    onConfirm(minutes)
  }

  return(
    <Modal
      open={open}
      title="记录本次用时"
      onClose={onCancel}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={submit}>确认完成</button>
        </>
      }
    >
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{fontSize:13,color:'#64748b'}}>「{title}」已完成，本次用了多少分钟？</div>
        <input
          className="input"
          type="number"
          min={1}
          placeholder="留空则不记录时间"
          value={value}
          onChange={e=>{setValue(e.target.value);setError('')}}
          onKeyDown={e=>{if(e.key==='Enter')submit()}}
          autoFocus
        />
        {error&&<div style={{fontSize:12,color:'#ef4444'}}>{error}</div>}
      </div>
    </Modal>
  )
}
