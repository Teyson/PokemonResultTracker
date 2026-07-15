-- Custom SQL migration file, put your code below! --
UPDATE [nights] SET [created_by] = 'Teyson' WHERE [created_by] IS NULL;
