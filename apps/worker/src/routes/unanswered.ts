import { Hono } from 'hono';
import { LineClient } from '@line-crm/line-sdk';
import { jstNow } from '@line-crm/db';
import type { Env } from '../index.js';

const unanswered = new Hono<Env>();

type UnansweredQuestion = {
  id: string;
  friend_id: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  answered_at: string | null;
};

// GET /api/unanswered — pending 一覧
unanswered.get('/api/unanswered', async (c) => {
  try {
    const status = c.req.query('status') ?? 'pending';
    const result = await c.env.DB
      .prepare(
        `SELECT uq.*, f.display_name, f.line_user_id
         FROM unanswered_questions uq
         LEFT JOIN friends f ON uq.friend_id = f.id
         WHERE uq.status = ?
         ORDER BY uq.created_at DESC`,
      )
      .bind(status)
      .all<UnansweredQuestion & { display_name: string | null; line_user_id: string }>();

    return c.json({
      success: true,
      data: result.results.map((q) => ({
        id: q.id,
        friendId: q.friend_id,
        friendName: q.display_name ?? '名前なし',
        message: q.message,
        status: q.status,
        adminReply: q.admin_reply,
        createdAt: q.created_at,
        answeredAt: q.answered_at,
      })),
    });
  } catch (err) {
    console.error('GET /api/unanswered error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/unanswered/:id/answer — 回答登録 + LINE送信
unanswered.post('/api/unanswered/:id/answer', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ reply: string }>();
    if (!body.reply) return c.json({ success: false, error: 'reply is required' }, 400);

    const question = await c.env.DB
      .prepare(`SELECT * FROM unanswered_questions WHERE id = ?`)
      .bind(id)
      .first<UnansweredQuestion>();
    if (!question) return c.json({ success: false, error: 'Not found' }, 404);
    if (question.status !== 'pending') {
      return c.json({ success: false, error: 'Question already processed' }, 400);
    }

    // 友だちの LINE user ID を取得
    const friend = await c.env.DB
      .prepare(`SELECT line_user_id FROM friends WHERE id = ?`)
      .bind(question.friend_id)
      .first<{ line_user_id: string }>();
    if (!friend) return c.json({ success: false, error: 'Friend not found' }, 404);

    // LINE でユーザーに送信
    const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);
    await lineClient.pushTextMessage(friend.line_user_id, body.reply);

    // DB 更新
    const now = jstNow();
    await c.env.DB
      .prepare(
        `UPDATE unanswered_questions
         SET status = 'answered', admin_reply = ?, answered_at = ?
         WHERE id = ?`,
      )
      .bind(body.reply, now, id)
      .run();

    return c.json({ success: true, data: { id, status: 'answered', answeredAt: now } });
  } catch (err) {
    console.error('POST /api/unanswered/:id/answer error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/unanswered/:id/ignore — 無視
unanswered.post('/api/unanswered/:id/ignore', async (c) => {
  try {
    const id = c.req.param('id');

    const question = await c.env.DB
      .prepare(`SELECT id, status FROM unanswered_questions WHERE id = ?`)
      .bind(id)
      .first<{ id: string; status: string }>();
    if (!question) return c.json({ success: false, error: 'Not found' }, 404);

    await c.env.DB
      .prepare(`UPDATE unanswered_questions SET status = 'ignored' WHERE id = ?`)
      .bind(id)
      .run();

    return c.json({ success: true, data: { id, status: 'ignored' } });
  } catch (err) {
    console.error('POST /api/unanswered/:id/ignore error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { unanswered };
