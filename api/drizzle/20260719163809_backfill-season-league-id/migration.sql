-- Custom SQL migration file, put your code below! --
UPDATE [seasons]
SET [league_id] = (SELECT TOP 1 [id] FROM [leagues] WHERE [name] = N'Spilforsyningen Tirsdag')
WHERE [league_id] IS NULL;
