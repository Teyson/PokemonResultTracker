CREATE TABLE [allowed_users] (
	[id] int IDENTITY(1, 1),
	[github_login] nvarchar(100) NOT NULL,
	[role] nvarchar(20) NOT NULL CONSTRAINT [allowed_users_role_default] DEFAULT ('member'),
	[added_by] nvarchar(100),
	[created_at] datetime2 NOT NULL CONSTRAINT [allowed_users_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [allowed_users_pkey] PRIMARY KEY([id]),
	CONSTRAINT [allowed_users_github_login_key] UNIQUE([github_login])
);
--> statement-breakpoint
CREATE TABLE [decks] (
	[id] int IDENTITY(1, 1),
	[name] nvarchar(100) NOT NULL,
	[energy_type] nvarchar(50),
	[created_at] datetime2 NOT NULL CONSTRAINT [decks_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [decks_pkey] PRIMARY KEY([id]),
	CONSTRAINT [decks_name_key] UNIQUE([name])
);
--> statement-breakpoint
CREATE TABLE [nights] (
	[id] int IDENTITY(1, 1),
	[played_on] date NOT NULL,
	[deck_id] int NOT NULL,
	[wins] int NOT NULL CONSTRAINT [nights_wins_default] DEFAULT ((0)),
	[ties] int NOT NULL CONSTRAINT [nights_ties_default] DEFAULT ((0)),
	[losses] int NOT NULL CONSTRAINT [nights_losses_default] DEFAULT ((0)),
	[notes] nvarchar(500),
	[created_at] datetime2 NOT NULL CONSTRAINT [nights_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [nights_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
ALTER TABLE [nights] ADD CONSTRAINT [nights_deck_id_decks_id_fk] FOREIGN KEY ([deck_id]) REFERENCES [decks]([id]);