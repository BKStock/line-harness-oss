'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface ChurnUser {
  id: string
  name: string
  lastMessageDate: string
  silenceDays: number
  riskScore: number
  riskLevel: 'high' | 'medium' | 'low'
}

interface ChurnRiskResponse {
  success: boolean
  data: {
    highRiskCount: number
    mediumRiskCount: number
    users: ChurnUser[]
  }
}

const MOCK_USERS: ChurnUser[] = [
  { id: '1', name: '田中 さくら', lastMessageDate: '2026-02-10', silenceDays: 42, riskScore: 95, riskLevel: 'high' },
  { id: '2', name: '鈴木 太郎', lastMessageDate: '2026-02-15', silenceDays: 37, riskScore: 88, riskLevel: 'high' },
  { id: '3', name: '佐藤 花子', lastMessageDate: '2026-02-18', silenceDays: 34, riskScore: 85, riskLevel: 'high' },
  { id: '4', name: '山田 健二', lastMessageDate: '2026-02-20', silenceDays: 32, riskScore: 82, riskLevel: 'high' },
  { id: '5', name: '伊藤 美咲', lastMessageDate: '2026-02-22', silenceDays: 30, riskScore: 78, riskLevel: 'high' },
  { id: '6', name: '中村 翔平', lastMessageDate: '2026-02-25', silenceDays: 27, riskScore: 71, riskLevel: 'medium' },
  { id: '7', name: '小林 由美', lastMessageDate: '2026-02-27', silenceDays: 25, riskScore: 65, riskLevel: 'medium' },
  { id: '8', name: '加藤 正樹', lastMessageDate: '2026-03-01', silenceDays: 23, riskScore: 60, riskLevel: 'medium' },
  { id: '9', name: '吉田 奈々', lastMessageDate: '2026-03-03', silenceDays: 21, riskScore: 55, riskLevel: 'medium' },
  { id: '10', name: '渡辺 大輔', lastMessageDate: '2026-03-05', silenceDays: 19, riskScore: 48, riskLevel: 'medium' },
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

function RiskBadge({ level }: { level: ChurnUser['riskLevel'] }) {
  if (level === 'high') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">高リスク</span>
  if (level === 'medium') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">中リスク</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">低リスク</span>
}

export default function ChurnPage() {
  const [users, setUsers] = useState<ChurnUser[]>(MOCK_USERS)
  const [summary, setSummary] = useState({ highRiskCount: 5, mediumRiskCount: 5 })
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    fetchApi<ChurnRiskResponse>('/api/analytics/churn-risk')
      .then((res) => {
        if (res.success) {
          setUsers(res.data.users)
          setSummary({ highRiskCount: res.data.highRiskCount, mediumRiskCount: res.data.mediumRiskCount })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleFollowUp = (user: ChurnUser) => {
    setSentIds(prev => new Set(prev).add(user.id))
    setToast(`${user.name} さんにフォローメッセージを送りました`)
  }

  const scoreBarColor = (level: ChurnUser['riskLevel']) => {
    if (level === 'high') return '#EF4444'
    if (level === 'medium') return '#F59E0B'
    return '#06C755'
  }

  return (
    <div>
      <Header title="ファン離脱予測" description="沈黙日数とリスクスコアに基づく離脱予測" />

      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">高リスク</p>
          <p className="text-3xl font-bold text-red-600">
            {summary.highRiskCount}
            <span className="text-base font-normal text-gray-400 ml-1">名</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">30日以上沈黙</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 p-5">
          <p className="text-xs font-semibold text-yellow-500 uppercase tracking-wide mb-2">中リスク</p>
          <p className="text-3xl font-bold text-yellow-600">
            {summary.mediumRiskCount}
            <span className="text-base font-normal text-gray-400 ml-1">名</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">15〜29日沈黙</p>
        </div>
      </div>

      {/* ユーザー一覧テーブル */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">最終メッセージ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">沈黙日数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">リスクスコア</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">リスク</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{user.lastMessageDate}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-700">{user.silenceDays}日</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${user.riskScore}%`, backgroundColor: scoreBarColor(user.riskLevel) }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{user.riskScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><RiskBadge level={user.riskLevel} /></td>
                  <td className="px-4 py-3 text-right">
                    {sentIds.has(user.id) ? (
                      <span className="text-xs text-green-600 font-medium">送信済み</span>
                    ) : (
                      <button
                        onClick={() => handleFollowUp(user)}
                        className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                        style={{ backgroundColor: '#06C755' }}
                      >
                        フォロー送信
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
