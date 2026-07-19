ALTER TABLE [seasons] ADD [league_id] int;--> statement-breakpoint
ALTER TABLE [seasons] ADD CONSTRAINT [seasons_league_id_leagues_id_fk] FOREIGN KEY ([league_id]) REFERENCES [leagues]([id]);