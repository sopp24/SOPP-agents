-- À exécuter UNE SEULE FOIS si le Worker avait déjà été déployé avec l'ancien schéma
-- (une seule clé autorisée, colonne `slot`) :
--   npx wrangler d1 execute sopp-agents-auth --remote --file=./migrations/0002_multi_device.sql
-- Les clés déjà enregistrées sont conservées.
CREATE TABLE credentials_new (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
INSERT INTO credentials_new (id, public_key, counter, transports, device_type, backed_up, created_at)
  SELECT id, public_key, counter, transports, device_type, backed_up, created_at FROM credentials;
DROP TABLE credentials;
ALTER TABLE credentials_new RENAME TO credentials;
