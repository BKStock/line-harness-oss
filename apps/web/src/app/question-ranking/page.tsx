'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/layout/header'
import { fetchApi } from '@/lib/api'

interface QuestionRankingItem {
  rank: number
  question: string
  count: number
  category: string
}

interface QuestionRankingResponse {
  success: boolean
  data: QuestionRankingItem[]
}

// モックデータ（API実装後に差し替え）
const MOCK_QUESTIONS: QuestionRankingItem[] = [
  { rank: 1, question: '片思いの相手に気持ちを伝えるべきですか？', count: 342, category: '恋愛' },
  { rank: 2, question: '職場の人間関係でストレスを感じています', count: 289, category: '仕事' },
  { rank: 3, question: '副業を始めたいのですがどうすれば良いですか？', count: 256, category: 'お金' },
  { rank: 4, question: '元彼/彼女と復縁できますか？', count: 234, category: '恋愛' },
  { rank: 5, question: '転職を考えていますが踏み切れません', count: 198, category: '仕事' },
  { rank: 6, question: '借金を早く返済する方法はありますか？', count: 187, category: 'お金' },
  { rank: 7, question: '最近眠れないのですが原因は何ですか？', count: 176, category: '健康' },
  { rank: 8, question: '好きな人が自分のことをどう思っているか知りたい', count: 165, category: '恋愛' },
  { rank: 9, question: '上司との関係を改善したいです', count: 154, category: '仕事' },
  { rank: 10, question: '投資を始めるタイミングはいつが良いですか？', count: 143, category: 'お金' },
  { rank: 11, question: '結婚相手として相性が良い人の特徴は？', count: 132, category: '恋愛' },
  { rank: 12, question: 'ダイエットが続かないのはなぜですか？', count: 121, category: '健康' },
  { rank: 13, question: '起業するリスクについて教えてください', count: 115, category: 'お金' },
  { rank: 14, question: '人生の目標が見つかりません', count: 108, category: 'その他' },
  { rank: 15, question: '職場でのパワハラに悩んでいます', count: 97, category: '仕事' },
  { rank: 16, question: 'パートナーとの価値観の違いを乗り越えるには？', count: 89, category: '恋愛' },
  { rank: 17, question: '老後の資金はいくら必要ですか？', count: 82, category: 'お金' },
  { rank: 18, question: 'ストレスで食べ過ぎてしまいます', count: 76, category: '健康' },
  { rank: 19, question: '自分に自信が持てません', count: 71, category: 'その他' },
  { rank: 20, question: '友人関係がうまく続きません', count: 65, category: 'その他' },
]

const CATEGORIES = ['全て', '恋愛', '仕事', 'お金', '健康', 'その他']
const PERIODS = [
  { label: '7日', value: '7' },
  { label: '30日', value: '30' },
  { label: '90日', value: '90' },
]

const CATEGORY_COLORS: Record<string, string> = {
  '恋愛': 'bg-pink-100 text-pink-700',
  '仕事': 'bg-blue-100 text-blue-700',
  'お金': 'bg-yellow-100 text-yellow-700',
  '健康': 'bg-green-100 text-green-700',
  'その他': 'bg-gray-100 text-gray-700',
}

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

export default function QuestionRankingPage() {
  const [questions, setQuestions] = useState<QuestionRankingItem[]>(MOCK_QUESTIONS)
  const [category, setCategory] = useState('全て')
  const [days, setDays] = useState('30')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetchApi<QuestionRankingResponse>(
        `/api/analytics/question-ranking?days=${d}`
      )
      if (res.success && res.data.length > 0) setQuestions(res.data)
    } catch {
      // APIが未実装のためモックデータを使用
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(days) }, [days, load])

  const filtered = category === '全て' ? questions : questions.filter(q => q.category === category)
  const maxCount = questions[0]?.count ?? 1

  return (
    <div>
      <Header title="視聴者の悩みランキング" description="よく寄せられる質問のトップ20" />

      {/* フィルター & 期間選択 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === cat
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={category === cat ? { backgroundColor: '#06C755' } : {}}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex gap-1 sm:ml-auto">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                days === p.value
                  ? 'border-green-500 text-green-600 bg-green-50'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ランキングリスト */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">読み込み中...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {filtered.map((item, idx) => (
            <div
              key={item.rank}
              className={`px-4 py-4 flex items-center gap-4 ${idx < filtered.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50`}
            >
              {/* ランク */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                item.rank === 1 ? 'bg-yellow-400 text-white' :
                item.rank === 2 ? 'bg-gray-300 text-white' :
                item.rank === 3 ? 'bg-amber-600 text-white' :
                'bg-gray-100 text-gray-500'
              }`}>
                {item.rank}
              </div>

              {/* 質問内容 & 割合バー */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.question}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(item.count / maxCount) * 100}%`, backgroundColor: '#06C755' }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{item.count}回</span>
                </div>
              </div>

              {/* カテゴリ */}
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category] ?? 'bg-gray-100 text-gray-600'}`}>
                {item.category}
              </span>

              {/* 動画作成ボタン（将来用） */}
              <button
                onClick={() => setToast('この機能は近日公開予定です。お楽しみに！')}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                動画を作る
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400">該当する質問がありません</div>
          )}
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
