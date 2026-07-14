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
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_nights_deck FOREIGN KEY (deck_id) REFERENCES dbo.decks(id)
);
GO

-- Whitelist of people allowed to sign in. The admin is defined by the
-- ADMIN_GITHUB_LOGIN app setting, not a row here, so they always have access.
IF OBJECT_ID('dbo.allowed_users', 'U') IS NULL
CREATE TABLE dbo.allowed_users (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    github_login NVARCHAR(100) NOT NULL,
    role         NVARCHAR(20)  NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
    added_by     NVARCHAR(100) NULL,
    created_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_allowed_users_login UNIQUE (github_login)
);
GO

-- ---------------------------------------------------------------------
-- Optional seed: the first logged night carried over from the old tracker.
-- Delete this block if you'd rather start empty.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.decks WHERE name = 'Alakazam')
    INSERT INTO dbo.decks (name, energy_type) VALUES ('Alakazam', 'Psychic');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.nights n JOIN dbo.decks d ON d.id = n.deck_id
               WHERE d.name = 'Alakazam' AND n.played_on = '2026-07-07')
    INSERT INTO dbo.nights (played_on, deck_id, wins, ties, losses)
    SELECT '2026-07-07', id, 0, 2, 2 FROM dbo.decks WHERE name = 'Alakazam';
GO
