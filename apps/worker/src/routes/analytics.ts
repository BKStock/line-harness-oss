import { Hono } from 'hono';
import type { Env } from '../index.js';

const analytics = new Hono<Env>();

// ========== F-01: 悩みランキングAPI ==========

interface MessageRow {
  content: string;
  created_at: string;
}

interface QuestionRankItem {
  rank: number;
  message: string;
  count: number;
  percentage: number;
  category: string;
}

/** キーワードベースのカテゴリ分類 */
function categorizeMessage(text: string): string {
  if (/価格|料金|費用|コスト|いくら|円/.test(text)) return '料金・価格';
  if (/使い方|方法|やり方|手順|操作|どうやって/.test(text)) return '使い方';
  if (/エラー|失敗|できない|おかしい|バグ|問題|動かない/.test(text)) return 'トラブル';
  if (/登録|サインアップ|アカウント|ログイン|パスワード/.test(text)) return 'アカウント';
  if (/解約|キャンセル|退会|停止|やめたい/.test(text)) return '解約・退会';
  if (/配送|到着|いつ|届く|納期/.test(text)) return '配送・納期';
  if (/返品|交換|返金|クーリングオフ/.test(text)) return '返品・返金';
  if (/おすすめ|比較|違い|選び方/.test(text)) return '比較・選択';
  return 'その他';
}

/** テキスト正規化（類似メッセージのグルーピング用） */
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[？！。、,.!?\s]+/g, '')
    .substring(0, 80);
}

/** GET /api/analytics/question-ranking */
analytics.get('/question-ranking', async (c) => {
  try {
    const limit = Math.min(Number(c.req.query('limit') ?? '20'), 100);
    const days = Math.max(1, Number(c.req.query('days') ?? '30'));

    // 集計開始日時（JST近似: UTC+9 → 9時間前をUTCカットオフとして使用）
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().substring(0, 10); // YYYY-MM-DD

    const result = await c.env.DB
      .prepare(
        `SELECT content, created_at
         FROM messages_log
         WHERE direction = 'incoming'
           AND message_type = 'text'
           AND created_at >= ?
         ORDER BY created_at DESC
         LIMIT 2000`,
      )
      .bind(cutoffStr)
      .all<MessageRow>();

    const messages = result.results;

    // キーワード頻度でグルーピング
    const frequencyMap = new Map<string, { original: string; count: number; category: string }>();

    for (const msg of messages) {
      const text = msg.content?.trim();
      if (!text || text.length < 2) continue;

      const key = normalizeText(text);
      const existing = frequencyMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        frequencyMap.set(key, {
          original: text.substring(0, 200),
          count: 1,
          category: categorizeMessage(text),
        });
      }
    }

    // 頻度順ソート → TOP N
    const sorted = Array.from(frequencyMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const totalCounted = sorted.reduce((sum, item) => sum + item.count, 0);

    const ranking: QuestionRankItem[] = sorted.map((item, idx) => ({
      rank: idx + 1,
      message: item.original,
      count: item.count,
      percentage: totalCounted > 0
        ? Math.round((item.count / totalCounted) * 1000) / 10
        : 0,
      category: item.category,
    }));

    return c.json({
      success: true,
      data: {
        ranking,
        totalMessages: messages.length,
        period: { days, from: cutoffStr },
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/question-ranking error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== B-01: 収益ダッシュボードAPI ==========

interface StripeEventRow {
  event_type: string;
  amount: number | null;
  currency: string | null;
  metadata: string | null;
  processed_at: string;
}

interface RevenueByPlan {
  planName: string;
  count: number;
  revenue: number;
}

/** メタデータJSONを安全にパース */
function safeParseMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** GET /api/analytics/revenue-summary?month=YYYY-MM */
analytics.get('/revenue-summary', async (c) => {
  try {
    const monthParam = c.req.query('month');

    let year: number;
    let month: number; // 1-indexed

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      [year, month] = monthParam.split('-').map(Number);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    const mm = String(month).padStart(2, '0');
    const monthStart = `${year}-${mm}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59`;
    const targetMonth = `${year}-${mm}`;

    // 月内のStripeイベントを全件取得
    const result = await c.env.DB
      .prepare(
        `SELECT event_type, amount, currency, metadata, processed_at
         FROM stripe_events
         WHERE processed_at >= ? AND processed_at <= ?
         ORDER BY processed_at ASC`,
      )
      .bind(monthStart, monthEnd)
      .all<StripeEventRow>();

    const events = result.results;

    // 集計
    let newSubscribers = 0;
    let canceledSubscribers = 0;
    let mrr = 0;
    const planMap = new Map<string, { count: number; revenue: number }>();

    // 支払い成功イベントの総額（LTV計算用）
    let totalPayments = 0;
    let paymentCount = 0;

    for (const ev of events) {
      const meta = safeParseMeta(ev.metadata);
      const planName =
        (meta.plan_name as string | undefined) ??
        (meta.price_id as string | undefined) ??
        'Standard';
      const amount = ev.amount ?? 0;

      switch (ev.event_type) {
        case 'customer.subscription.created': {
          newSubscribers++;
          mrr += amount;
          const existing = planMap.get(planName) ?? { count: 0, revenue: 0 };
          planMap.set(planName, { count: existing.count + 1, revenue: existing.revenue + amount });
          break;
        }
        case 'customer.subscription.deleted': {
          canceledSubscribers++;
          break;
        }
        case 'invoice.payment_succeeded':
        case 'payment_intent.succeeded': {
          totalPayments += amount;
          paymentCount++;
          break;
        }
        default:
          break;
      }
    }

    // アクティブ会員数 = 新規 - 解約（月内ネット）
    const activeSubscribers = Math.max(0, newSubscribers - canceledSubscribers);

    // 解約率 (%)
    const baseForChurn = newSubscribers + canceledSubscribers;
    const churnRate =
      baseForChurn > 0
        ? Math.round((canceledSubscribers / baseForChurn) * 1000) / 10
        : 0;

    // 平均LTV = 累計支払い / 支払い回数
    const ltv = paymentCount > 0
      ? Math.round((totalPayments / paymentCount) * 100) / 100
      : 0;

    const revenueByPlan: RevenueByPlan[] = Array.from(planMap.entries()).map(
      ([planName, data]) => ({
        planName,
        count: data.count,
        revenue: data.revenue,
      }),
    );

    return c.json({
      success: true,
      data: {
        mrr,
        activeSubscribers,
        newSubscribers,
        canceledSubscribers,
        churnRate,
        ltv,
        revenueByPlan,
        period: { month: targetMonth },
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/revenue-summary error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { analytics };
