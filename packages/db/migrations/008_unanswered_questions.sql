CREATE TABLE IF NOT EXISTS unanswered_questions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  friend_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT "pending",  -- pending/answered/ignored
  admin_reply TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime("now", "localtime")),
  answered_at TEXT,
  FOREIGN KEY (friend_id) REFERENCES friends(id)
);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_friend ON unanswered_questions (friend_id);
CREATE INDEX IF NOT EXISTS idx_unanswered_questions_status ON unanswered_questions (status);
