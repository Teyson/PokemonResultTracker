CREATE TABLE [audit_log] (
	[id] int IDENTITY(1, 1),
	[actor_user_id] nvarchar(200) NOT NULL,
	[actor_login] nvarchar(100),
	[action] nvarchar(50) NOT NULL,
	[detail] nvarchar(500),
	[created_at] datetime2 NOT NULL CONSTRAINT [audit_log_created_at_default] DEFAULT (SYSUTCDATETIME()),
	CONSTRAINT [audit_log_pkey] PRIMARY KEY([id])
);
