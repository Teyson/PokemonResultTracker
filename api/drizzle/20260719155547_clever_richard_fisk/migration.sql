CREATE TABLE [leagues] (
	[id] int IDENTITY(1, 1),
	[name] nvarchar(100) NOT NULL,
	[archived_at] datetime2,
	[created_at] datetime2 NOT NULL CONSTRAINT [leagues_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [leagues_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
ALTER TABLE [nights] ADD [league_id] int;--> statement-breakpoint
ALTER TABLE [nights] ADD CONSTRAINT [nights_league_id_leagues_id_fk] FOREIGN KEY ([league_id]) REFERENCES [leagues]([id]);