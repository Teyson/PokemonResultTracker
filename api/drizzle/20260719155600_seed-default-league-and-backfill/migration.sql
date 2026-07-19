-- Data migration for idea #79 (leagues): seed the league that every night
-- logged before this feature implicitly belonged to, then backfill league_id
-- for existing league nights. Casual nights (is_league_night = 0) are left
-- with league_id NULL, matching the feature's null = casual semantics.
--
-- The `IS NULL` guard on the UPDATE makes this migration safe to re-run.
INSERT INTO [leagues] ([name]) VALUES (N'Spilforsyningen Tirsdag');
--> statement-breakpoint
UPDATE [nights]
SET [league_id] = (SELECT TOP 1 [id] FROM [leagues] WHERE [name] = N'Spilforsyningen Tirsdag')
WHERE [is_league_night] = 1 AND [league_id] IS NULL;
