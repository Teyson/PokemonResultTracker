CREATE TABLE [seasons] (
	[id] int IDENTITY(1, 1),
	[name] nvarchar(100) NOT NULL,
	[starts_on] date NOT NULL,
	[ends_on] date,
	[created_at] datetime2 NOT NULL CONSTRAINT [seasons_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [seasons_pkey] PRIMARY KEY([id])
);
