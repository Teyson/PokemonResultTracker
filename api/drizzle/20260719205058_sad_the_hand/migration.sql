CREATE TABLE [events] (
	[id] int IDENTITY(1, 1),
	[name] nvarchar(100),
	[played_on] date NOT NULL,
	[best_of] int NOT NULL CONSTRAINT [events_best_of_default] DEFAULT ((1)),
	[round_length_min] int NOT NULL CONSTRAINT [events_round_length_min_default] DEFAULT ((30)),
	[status] nvarchar(10) NOT NULL CONSTRAINT [events_status_default] DEFAULT ('setup'),
	[league_id] int NOT NULL,
	[created_by] int NOT NULL,
	[created_at] datetime2 NOT NULL CONSTRAINT [events_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [events_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
ALTER TABLE [events] ADD CONSTRAINT [events_league_id_leagues_id_fk] FOREIGN KEY ([league_id]) REFERENCES [leagues]([id]);--> statement-breakpoint
ALTER TABLE [events] ADD CONSTRAINT [events_created_by_users_id_fk] FOREIGN KEY ([created_by]) REFERENCES [users]([id]);