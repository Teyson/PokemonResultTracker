ALTER TABLE [decks] DROP CONSTRAINT [decks_name_key];--> statement-breakpoint
ALTER TABLE [decks] ADD [owner_id] int;--> statement-breakpoint
ALTER TABLE [decks] ADD CONSTRAINT [decks_owner_id_users_id_fk] FOREIGN KEY ([owner_id]) REFERENCES [users]([id]);--> statement-breakpoint
ALTER TABLE [decks] ADD CONSTRAINT [decks_owner_id_name_unique] UNIQUE([owner_id],[name]);--> statement-breakpoint
-- Hand-written data backfill (not drizzle-generated): assign each existing
-- deck to whichever user logged the most nights with it. Ties, and decks
-- only ever used as an opponent, are left unowned (NULL).
WITH counts AS (
  SELECT deck_id, owner_id, COUNT(*) AS cnt
  FROM nights
  GROUP BY deck_id, owner_id
),
maxed AS (
  SELECT deck_id, MAX(cnt) AS max_cnt
  FROM counts
  GROUP BY deck_id
),
winners AS (
  SELECT c.deck_id, c.owner_id,
         COUNT(*) OVER (PARTITION BY c.deck_id) AS num_winners
  FROM counts c
  JOIN maxed m ON m.deck_id = c.deck_id AND c.cnt = m.max_cnt
)
UPDATE d
SET d.owner_id = w.owner_id
FROM decks d
JOIN winners w ON w.deck_id = d.id
WHERE w.num_winners = 1;