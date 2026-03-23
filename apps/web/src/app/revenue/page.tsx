'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface PlanBreakdown {
  plan: string
  count: number
  revenue: number
}

interface RevenueSummary {
  mrr: number
  activeMembers: number
  newMembers: number
  churnedMembers: number
  churnRate: number
  planBreakdown: PlanBreakdown[]
}

interface RevenueSummaryResponse {
  success: boolean
  data: RevenueSummary
}

function getMockData(month: string): RevenueSummary {
  const seed = parseInt(month.replace('-', ''), 10) % 100
  return {
    mrr: 1280000 + seed * 1000,
    activeMembers: 342 + seed,
    newMembers: 28 + (seed % 10),
    churnedMembers: 7 + (seed % 5),
    churnRate: 2.1 + (seed % 10) * 0.1,
    planBreakdown: [
      { plan: 'スタンダード', count: 180 + seed, revenue: 540000 + seed * 300 },
      { plan: 'プレミアム', count: 98 + Math.floor(seed / 2), revenue: 588000 + seed * 200 },
      { plan: 'VIP', count: 64 + Math.floor(seed / 3), revenue: 640000 + seed * 400 },
    ],
  }
}

function addMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatYen(n: number) {
  return '¥' + n.toLocaleString('ja-JP')
}

export default function RevenuePage() {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [data, setData] = useState<RevenueSummary>(() => getMockData('2026-03'))
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const res = await fetchApi<RevenueSummaryResponse>(
        `/api/analytics/revenue-summary?month=${m}`
      )
      if (res.success) setData(res.data)
      else setData(getMockData(m))
    } catch {
      // APIが未実装のためモックデータを使用
      setData(getMockData(m))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(month) }, [month, load])

  const maxRevenue = Math.max(...data.planBreakdown.map(p => p.revenue), 1)

  return (
    <div>
      <Header
        title="収益ダッシュボード"
        description="MRR・会員数・解約の月次サマリー"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonth(m => addMonth(m, -1))}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              aria-label="前月"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-gray-900 w-20 text-center">{month}</span>
            <button
              onClick={() => setMonth(m => addMonth(m, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              aria-label="翌月"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        }
      />

      {loading ? (
        <div className="text-center text-gray-400 py-8">読み込み中...</div>
      ) : (
        <>
          {/* KPIカード 4枚 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">MRR</p>
              <p className="text-2xl font-bold text-gray-900">{formatYen(data.mrr)}</p>
              <p className="text-xs text-gray-400 mt-1">月次経常収益</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">アクティブ会員</p>
              <p className="text-2xl font-bold text-gray-900">{data.activeMembers.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">現在の有料会員数</p>
            </div>
            <div className="bg-white rounded-xl border border-green-100 p-5">
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2">新規会員</p>
              <p className="text-2xl font-bold text-green-600">+{data.newMembers}</p>
              <p className="text-xs text-gray-400 mt-1">今月の新規入会</p>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-5">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">解約</p>
              <p className="text-2xl font-bold text-red-500">-{data.churnedMembers}</p>
              <p className="text-xs text-gray-400 mt-1">チャーン率 {data.churnRate.toFixed(1)}%</p>
            </div>
          </div>

          {/* プラン別内訳 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">プラン別内訳</h2>
            <div className="space-y-5">
              {data.planBreakdown.map((plan) => (
                <div key={plan.plan}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{plan.plan}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{plan.count.toLocaleString()}名</span>
                      <span className="text-sm font-semibold text-gray-900 w-28 text-right">{formatYen(plan.revenue)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(plan.revenue / maxRevenue) * 100}%`, backgroundColor: '#06C755' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
