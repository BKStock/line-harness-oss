import { Hono } from 'hono';
import { verifySignature, LineClient } from '@line-crm/line-sdk';
import type { WebhookRequestBody, WebhookEvent, TextEventMessage } from '@line-crm/line-sdk';
import {
  upsertFriend,
  updateFriendFollowStatus,
  getFriendByLineUserId,
  getScenarios,
  enrollFriendInScenario,
  getScenarioSteps,
  advanceFriendScenario,
  completeFriendScenario,
  upsertChatOnMessage,
  jstNow,
} from '@line-crm/db';
import { fireEvent } from '../services/event-bus.js';
import { buildMessage } from '../services/step-delivery.js';
import type { Env } from '../index.js';

const webhook = new Hono<Env>();

webhook.post('/webhook', async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;
  const signature = c.req.header('X-Line-Signature') ?? '';
  const rawBody = await c.req.text();

  // Always return 200 to LINE, but verify signature first
  const valid = await verifySignature(channelSecret, rawBody, signature);
  if (!valid) {
    console.error('Invalid LINE signature');
    return c.json({ status: 'ok' }, 200);
  }

  let body: WebhookRequestBody;
  try {
    body = JSON.parse(rawBody) as WebhookRequestBody;
  } catch {
    console.error('Failed to parse webhook body');
    return c.json({ status: 'ok' }, 200);
  }

  const db = c.env.DB;
  const lineClient = new LineClient(c.env.LINE_CHANNEL_ACCESS_TOKEN);

  // 非同期処理 — LINE は ~1s 以内のレスポンスを要求
  const lineAccessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN;
  const processingPromise = (async () => {
    for (const event of body.events) {
      try {
        await handleEvent(db, lineClient, event, lineAccessToken, c.env.ANTHROPIC_API_KEY, c.env.AI_AUTO_REPLY_ENABLED);
      } catch (err) {
        console.error('Error handling webhook event:', err);
      }
    }
  })();

  c.executionCtx.waitUntil(processingPromise);

  return c.json({ status: 'ok' }, 200);
});

const AI_SYSTEM_PROMPT = `あなたは「KK」というモメンタム投資の専門家のLINEアシスタントです。

【あなたの役割】
- モメンタム投資法に関する質問に丁寧に答える
- 投資初心者にも分かりやすく説明する
- KKの人柄（フレンドリー・誠実・実績重視）を体現する

【回答ルール】
- 100文字以内で簡潔に答える
- 具体的な銘柄名・投資アドバイスは「詳細は講座でお伝えします」と言う
- 医療・法律・税務の相談は専門家への相談を促す
- 質問が投資と無関係な場合は「投資に関するご質問をどうぞ」と返す
- 返信の最後に必ず絵文字を1つつける`;

async function handleEvent(
  db: D1Database,
  lineClient: LineClient,
  event: WebhookEvent,
  lineAccessToken: string,
  anthropicKey?: string,
  aiEnabledStr?: string,
): Promise<void> {
  if (event.type === 'follow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    // プロフィール取得 & 友だち登録/更新
    let profile;
    try {
      profile = await lineClient.getProfile(userId);
    } catch (err) {
      console.error('Failed to get profile for', userId, err);
    }

    const friend = await upsertFriend(db, {
      lineUserId: userId,
      displayName: profile?.displayName ?? null,
      pictureUrl: profile?.pictureUrl ?? null,
      statusMessage: profile?.statusMessage ?? null,
    });

    // friend_add シナリオに登録
    const scenarios = await getScenarios(db);
    for (const scenario of scenarios) {
      if (scenario.trigger_type === 'friend_add' && scenario.is_active) {
        try {
          const existing = await db
            .prepare(`SELECT id FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?`)
            .bind(friend.id, scenario.id)
            .first<{ id: string }>();
          if (!existing) {
            const friendScenario = await enrollFriendInScenario(db, friend.id, scenario.id);

            // Immediate delivery: if the first step has delay=0, send it now
            // instead of waiting for the next cron run (up to 5 minutes)
            // NOTE: Uses pushMessage (not replyMessage) because replyToken can only be used once
            // and may be needed for competing immediate deliveries. Future optimization could
            // prioritize reply if available and only one step is due immediately.
            const steps = await getScenarioSteps(db, scenario.id);
            const firstStep = steps[0];
            if (firstStep && firstStep.delay_minutes === 0 && friendScenario.status === 'active') {
              try {
                const message = buildMessage(firstStep.message_type, firstStep.message_content);
                await lineClient.pushMessage(userId, [message]);
                console.log(`Immediate delivery: sent step ${firstStep.id} to ${userId}`);

                // Log outgoing message
                const logId = crypto.randomUUID();
                await db
                  .prepare(
                    `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
                     VALUES (?, ?, 'outgoing', ?, ?, NULL, ?, ?)`,
                  )
                  .bind(logId, friend.id, firstStep.message_type, firstStep.message_content, firstStep.id, jstNow())
                  .run();

                // Advance or complete the friend_scenario
                const secondStep = steps[1] ?? null;
                if (secondStep) {
                  const nextDeliveryDate = new Date(Date.now() + 9 * 60 * 60_000);
                  nextDeliveryDate.setMinutes(nextDeliveryDate.getMinutes() + secondStep.delay_minutes);
                  await advanceFriendScenario(db, friendScenario.id, firstStep.step_order, nextDeliveryDate.toISOString().slice(0, -1) + '+09:00');
                } else {
                  await completeFriendScenario(db, friendScenario.id);
                }
              } catch (err) {
                console.error('Failed immediate delivery for scenario', scenario.id, err);
              }
            }
          }
        } catch (err) {
          console.error('Failed to enroll friend in scenario', scenario.id, err);
        }
      }
    }

    // イベントバス発火: friend_add
    await fireEvent(db, 'friend_add', { friendId: friend.id, eventData: { displayName: friend.display_name } }, lineAccessToken);
    return;
  }

  if (event.type === 'unfollow') {
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    await updateFriendFollowStatus(db, userId, false);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const textMessage = event.message as TextEventMessage;
    const userId =
      event.source.type === 'user' ? event.source.userId : undefined;
    if (!userId) return;

    const friend = await getFriendByLineUserId(db, userId);
    if (!friend) return;

    const incomingText = textMessage.text;
    const now = jstNow();
    const logId = crypto.randomUUID();

    // 受信メッセージをログに記録
    await db
      .prepare(
        `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
         VALUES (?, ?, 'incoming', 'text', ?, NULL, NULL, ?)`,
      )
      .bind(logId, friend.id, incomingText, now)
      .run();

    // チャットを作成/更新（オペレーター機能連携）
    await upsertChatOnMessage(db, friend.id);

    // 自動返信チェック
    // NOTE: Auto-replies use replyMessage (free, no quota) instead of pushMessage
    // The replyToken is only valid for ~1 minute after the message event
    const autoReplies = await db
      .prepare(`SELECT * FROM auto_replies WHERE is_active = 1 ORDER BY created_at ASC`)
      .all<{
        id: string;
        keyword: string;
        match_type: 'exact' | 'contains';
        response_type: string;
        response_content: string;
        is_active: number;
        created_at: string;
      }>();

    let matched = false;
    for (const rule of autoReplies.results) {
      const isMatch =
        rule.match_type === 'exact'
          ? incomingText === rule.keyword
          : incomingText.includes(rule.keyword);

      if (isMatch) {
        try {
          if (rule.response_type === 'text') {
            await lineClient.replyMessage(event.replyToken, [
              { type: 'text', text: rule.response_content },
            ]);
          } else if (rule.response_type === 'image') {
            const parsed = JSON.parse(rule.response_content) as {
              originalContentUrl: string;
              previewImageUrl: string;
            };
            await lineClient.replyMessage(event.replyToken, [
              { type: 'image', originalContentUrl: parsed.originalContentUrl, previewImageUrl: parsed.previewImageUrl },
            ]);
          } else if (rule.response_type === 'flex') {
            const contents = JSON.parse(rule.response_content);
            await lineClient.replyMessage(event.replyToken, [
              { type: 'flex', altText: 'Message', contents },
            ]);
          }

          // 送信ログ
          const outLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', ?, ?, NULL, NULL, ?)`,
            )
            .bind(outLogId, friend.id, rule.response_type, rule.response_content, jstNow())
            .run();
        } catch (err) {
          console.error('Failed to send auto-reply', err);
        }

        matched = true;
        break;
      }
    }

    // マッチしなかった場合 → Claude AI 自動応答を試みる
    const aiEnabled = aiEnabledStr === 'true';
    if (!matched && aiEnabled && anthropicKey) {
      try {
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-3-5',
            max_tokens: 200,
            system: AI_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: incomingText }],
          }),
        });

        const aiData = await aiResponse.json() as { content: [{ text: string }] };
        const aiText = aiData.content?.[0]?.text;

        if (aiText) {
          await lineClient.replyMessage(event.replyToken, [{ type: 'text', text: aiText }]);

          // AI応答ログ
          const aiLogId = crypto.randomUUID();
          await db
            .prepare(
              `INSERT INTO messages_log (id, friend_id, direction, message_type, content, broadcast_id, scenario_step_id, created_at)
               VALUES (?, ?, 'outgoing', 'text', ?, NULL, NULL, ?)`,
            )
            .bind(aiLogId, friend.id, aiText, jstNow())
            .run();

          matched = true;
        }
      } catch (err) {
        console.error('AI auto-reply error:', err);
      }
    }

    // まだマッチしなかった場合 → 未回答質問として登録
    if (!matched) {
      try {
        const uqId = crypto.randomUUID().replace(/-/g, '');
        await db
          .prepare(
            `INSERT INTO unanswered_questions (id, friend_id, message, status, created_at)
             VALUES (?, ?, ?, 'pending', ?)`,
          )
          .bind(uqId, friend.id, incomingText, now)
          .run();
      } catch (err) {
        console.error('Failed to register unanswered question:', err);
      }
    }

    // イベントバス発火: message_received
    await fireEvent(db, 'message_received', {
      friendId: friend.id,
      eventData: { text: incomingText, matched },
    }, lineAccessToken);

    return;
  }
}

export { webhook };
