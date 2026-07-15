-- =====================================================================
-- Pokémon Result Tracker — database schema (Azure SQL)
-- Run this once against your database (Query editor in the Azure portal,
-- or Azure Data Studio / sqlcmd). Safe to re-run: it only creates objects
-- that don't already exist.
-- =====================================================================

-- Decks Teis (and friends) play. Normalized so deck-level stats and
-- future per-deck attributes have a home.
IF OBJECT_ID('dbo.decks', 'U') IS NULL
CREATE TABLE dbo.decks (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(100) NOT NULL,
    energy_type NVARCHAR(50)  NULL,
    created_at  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_decks_name UNIQUE (name)
);
GO

-- Identity directory for everyone who has actually signed in. Keyed on the
-- immutable Static Web Apps user id; github_login is a display name refreshed on
-- each login. Nights reference this table, so renaming a GitHub account updates
-- the owner name everywhere automatically.
IF OBJECT_ID('dbo.users', 'U') IS NULL
CREATE TABLE dbo.users (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    user_id      NVARCHAR(200) NOT NULL,   -- immutable Static Web Apps userId
    github_login NVARCHAR(100) NOT NULL,   -- current display login (refreshed on login)
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_users_user_id UNIQUE (user_id)
);
GO

-- One league night = one deck played, with an aggregate W/T/L record.
-- The obvious future expansion is a `matches` table (one row per round with
-- opponent deck + result); wins/ties/losses would then become a rollup.
IF OBJECT_ID('dbo.nights', 'U') IS NULL
CREATE TABLE dbo.nights (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    played_on  DATE NOT NULL,
    deck_id    INT  NOT NULL,
    wins       INT  NOT NULL DEFAULT 0,
    ties       INT  NOT NULL DEFAULT 0,
    losses     INT  NOT NULL DEFAULT 0,
    notes      NVARCHAR(500) NULL,
    owner_id   INT  NOT NULL,              -- FK into users; the night's owner
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_nights_deck  FOREIGN KEY (deck_id)  REFERENCES dbo.decks(id),
    CONSTRAINT FK_nights_owner FOREIGN KEY (owner_id) REFERENCES dbo.users(id)
);
GO

-- Access policy / invite whitelist. The admin is defined by the ADMIN_USER_ID
-- app setting, not a row here, so they always have access. Invites are created
-- by github_login and bound to the immutable user_id on first login, so access
-- survives a GitHub rename.
IF OBJECT_ID('dbo.allowed_users', 'U') IS NULL
CREATE TABLE dbo.allowed_users (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    github_login NVARCHAR(100) NOT NULL,
    user_id      NVARCHAR(200) NULL,       -- bound on first login; matched by this thereafter
    role         NVARCHAR(20)  NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
    added_by     NVARCHAR(100) NULL,
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_allowed_users_login UNIQUE (github_login)
);
GO

-- ---------------------------------------------------------------------
-- Optional seed: the first logged night carried over from the old tracker.
-- Delete this block if you'd rather start empty. The owner is the local
-- dev-login admin (user_id `dev-Teyson`, see src/lib/devAuth.ts); a real
-- deployment gets its user rows created automatically on first sign-in.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.decks WHERE name = 'Alakazam')
    INSERT INTO dbo.decks (name, energy_type) VALUES ('Alakazam', 'Psychic');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE user_id = 'dev-Teyson')
    INSERT INTO dbo.users (user_id, github_login) VALUES ('dev-Teyson', 'Teyson');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.nights n JOIN dbo.decks d ON d.id = n.deck_id
               WHERE d.name = 'Alakazam' AND n.played_on = '2026-07-07')
    INSERT INTO dbo.nights (played_on, deck_id, wins, ties, losses, owner_id)
    SELECT '2026-07-07', d.id, 0, 2, 2, u.id
    FROM dbo.decks d CROSS JOIN dbo.users u
    WHERE d.name = 'Alakazam' AND u.user_id = 'dev-Teyson';
GO
