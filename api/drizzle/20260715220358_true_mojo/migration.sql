CREATE TABLE [matches] (
	[id] int IDENTITY(1, 1),
	[night_id] int NOT NULL,
	[round_no] int NOT NULL,
	[result] nvarchar(1) NOT NULL,
	[created_at] datetime2 NOT NULL CONSTRAINT [matches_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [matches_pkey] PRIMARY KEY([id])
);
--> statement-breakpoint
ALTER TABLE [matches] ADD CONSTRAINT [matches_night_id_nights_id_fk] FOREIGN KEY ([night_id]) REFERENCES [nights]([id]);