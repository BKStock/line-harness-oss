'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface UnansweredQuestion {
  id: string
  createdAt: string
  userName: string
  question: string
  status: 'pending' | 'replied' | 'ignored'
}

interface UnansweredResponse {
  success: boolean
  data: {
    items: UnansweredQuestion[]
    total: number
  }
}

const MOCK_QUESTIONS: UnansweredQuestion[] = [
  { id: '1', createdAt: '2026-03-24T09:15:00Z', userName: '田中 さくら', question: '今の彼氏との関係をどうすれば良いですか？もう3年付き合っています。', status: 'pending' },
  { id: '2', createdAt: '2026-03-24T08:42:00Z', userName: '鈴木 太郎', question: '転職活動中ですが、なかなか内定が出ません。どうすれば良いですか？', status: 'pending' },
  { id: '3', createdAt: '2026-03-23T22:18:00Z', userName: '佐藤 花子', question: '副業で月5万円稼ぐにはどんな方法がありますか？', status: 'pending' },
  { id: '4', createdAt: '2026-03-23T19:55:00Z', userName: '山田 健二', question: '最近ずっと眠れないのですが、改善方法を教えてください', status: 'pending' },
  { id: '5', createdAt: '2026-03-23T15:30:00Z', userName: '伊藤 美咲', question: '片思いの相手にどうアプローチすれば良いですか？', status: 'pending' },
]

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2">
      <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  )
}

function ReplyModal({
  question,
  onClose,
  onSend,
}: {
  question: UnansweredQuestion
  onClose: () => void
  onSend: (id: string, message: string) => void
}) {
  const [message, setMessage] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    onSend(question.id, message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">返信する</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4">
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 mb-1">{question.userName} からの質問</p>
            <p className="text-sm text-gray-700">{question.question}</p>
          </div>
          <form onSubmit={handleSubmit}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={4}
              placeholder="返信メッセージを入力..."
              required
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm text-white rounded-lg"
                style={{ backgroundColor: '#06C755' }}
              >
                送信
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: UnansweredQuestion['status'] }) {
  if (status === 'pending') return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">未回答</span>
  if (status === 'replied') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">返信済み</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">無視</span>
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function UnansweredPage() {
  const [questions, setQuestions] = useState<UnansweredQuestion[]>(MOCK_QUESTIONS)
  const [pendingCount, setPendingCount] = useState(MOCK_QUESTIONS.length)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [replyTarget, setReplyTarget] = useState<UnansweredQuestion | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<UnansweredResponse>('/api/unanswered')
      if (res.success) {
        setQuestions(res.data.items)
        setPendingCount(res.data.total)
      }
    } catch {
      // APIが未実装のためモックデータを使用
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleReply = (id: string, _message: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'replied' } : q))
    setPendingCount(prev => Math.max(0, prev - 1))
    setReplyTarget(null)
    setToast('返信を送信しました')
    // TODO: POST /api/unanswered/:id/reply
  }

  const handleIgnore = (id: string) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'ignored' } : q))
    setPendingCount(prev => Math.max(0, prev - 1))
  }

  return (
    <div>
      <Header
        title="未回答質問ボックス"
        description="ファンからの未回答メッセージ一覧"
        action={
          pendingCount > 0 ? (
            <span className="px-3 py-1.5 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: '#EF4444' }}>
              {pendingCount}件未回答
            </span>
          ) : undefined
        }
      />

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">未回答の質問はありません</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日時</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ユーザー</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">質問内容</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ステータス</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {questions.map((q) => (
                <tr key={q.id} className={`hover:bg-gray-50 ${q.status !== 'pending' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{formatDate(q.createdAt)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{q.userName}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                    <p className="truncate">{q.question}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {q.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setReplyTarget(q)}
                          className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                          style={{ backgroundColor: '#06C755' }}
                        >
                          返信する
                        </button>
                        <button
                          onClick={() => handleIgnore(q.id)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          無視する
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {replyTarget && (
        <ReplyModal
          question={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSend={handleReply}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
