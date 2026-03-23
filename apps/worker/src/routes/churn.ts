import { Hono } from 'hono';
import type { Env } from '../index.js';

const churn = new Hono<Env>();

type FriendMessageStats = {
  friend_id: string;
  display_name: string | null;
  last_message_at: string | null;
  // 先月のメッセージ数
  prev_month_count: number;
  // 今月のメッセージ数
  curr_month_count: number;
};

type ChurnRiskEntry = {
  friendId: string;
  name: string;
  lastMessageAt: string | null;
  daysSilent: number;
  riskScore: number;
  reason: string;
};

// GET /api/analytics/churn-risk — ファン離脱予測
churn.get('/api/analytics/churn-risk', async (c) => {
  try {
    const now = new Date();
    const nowIso = now.toISOString().slice(0, 19);

    // 各友だちの最終受信メッセージ日時 + 月別メッセージ数を取得
    const result = await c.env.DB
      .prepare(
        `SELECT
           f.id AS friend_id,
           f.display_name,
           MAX(CASE WHEN ml.direction = 'incoming' THEN ml.created_at END) AS last_message_at,
           SUM(CASE
             WHEN ml.direction = 'incoming'
               AND ml.created_at >= datetime('now', '-60 days', 'localtime')
               AND ml.created_at <  datetime('now', '-30 days', 'localtime')
             THEN 1 ELSE 0
           END) AS prev_month_count,
           SUM(CASE
             WHEN ml.direction = 'incoming'
               AND ml.created_at >= datetime('now', '-30 days', 'localtime')
             THEN 1 ELSE 0
           END) AS curr_month_count
         FROM friends f
         LEFT JOIN messages_log ml ON f.id = ml.friend_id
         WHERE f.is_following = 1
         GROUP BY f.id, f.display_name`,
      )
      .all<FriendMessageStats>();

    const highRisk: ChurnRiskEntry[] = [];
    const mediumRisk: ChurnRiskEntry[] = [];

    for (const row of result.results) {
      let riskScore = 0;
      const reasons: string[] = [];

      // 無言日数を計算
      let daysSilent = 0;
      if (row.last_message_at) {
        const lastDate = new Date(row.last_message_at);
        daysSilent = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        // メッセージ履歴がない = 最大リスク
        daysSilent = 999;
      }

      // 無言日数によるスコア
      if (daysSilent >= 14) {
        riskScore += 70;
        reasons.push(`${daysSilent}日間メッセージなし`);
      } else if (daysSilent >= 7) {
        riskScore += 40;
        reasons.push(`${daysSilent}日間メッセージなし`);
      }

      // メッセージ頻度の低下チェック（先月比50%以上減少）
      if (row.prev_month_count > 0 && row.curr_month_count < row.prev_month_count * 0.5) {
        riskScore += 20;
        reasons.push(`メッセージ頻度が先月比${Math.round((1 - row.curr_month_count / row.prev_month_count) * 100)}%減少`);
      }

      if (riskScore <= 0) continue;

      const entry: ChurnRiskEntry = {
        friendId: row.friend_id,
        name: row.display_name ?? '名前なし',
        lastMessageAt: row.last_message_at,
        daysSilent,
        riskScore,
        reason: reasons.join('、'),
      };

      if (riskScore >= 70) {
        highRisk.push(entry);
      } else {
        mediumRisk.push(entry);
      }
    }

    // riskScore 降順にソート
    highRisk.sort((a, b) => b.riskScore - a.riskScore);
    mediumRisk.sort((a, b) => b.riskScore - a.riskScore);

    return c.json({
      success: true,
      data: {
        highRisk,
        summary: {
          highRiskCount: highRisk.length,
          mediumRiskCount: mediumRisk.length,
        },
        // medium も含めて返す（フロントで任意利用）
        mediumRisk,
        generatedAt: nowIso,
      },
    });
  } catch (err) {
    console.error('GET /api/analytics/churn-risk error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { churn };
