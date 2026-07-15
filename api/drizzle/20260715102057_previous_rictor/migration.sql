CREATE TABLE [users] (
	[id] int IDENTITY(1, 1),
	[user_id] nvarchar(200) NOT NULL,
	[github_login] nvarchar(100) NOT NULL,
	[created_at] datetime2 NOT NULL CONSTRAINT [users_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [users_pkey] PRIMARY KEY([id]),
	CONSTRAINT [users_user_id_key] UNIQUE([user_id])
);
--> statement-breakpoint
ALTER TABLE [allowed_users] ADD [user_id] nvarchar(200);--> statement-breakpoint
ALTER TABLE [nights] ADD [owner_id] int NOT NULL;--> statement-breakpoint
ALTER TABLE [nights] ADD CONSTRAINT [nights_owner_id_users_id_fk] FOREIGN KEY ([owner_id]) REFERENCES [users]([id]);