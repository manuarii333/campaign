-- Migration 002 — Table marchands multi-tenant
-- Exécuter : npx wrangler d1 execute hcs-orders-db --file=migrations/002_merchants.sql

CREATE TABLE IF NOT EXISTS merchants (
  id              TEXT PRIMARY KEY,       -- 'mrc_abc123xyz' (clé publique widget)
  name            TEXT NOT NULL,          -- Nom de la boutique
  shop_id         TEXT NOT NULL,          -- Shop ID PayZen du marchand
  enc_test_key    TEXT NOT NULL,          -- Clé REST test chiffrée (AES-GCM)
  enc_prod_key    TEXT NOT NULL,          -- Clé REST prod chiffrée (AES-GCM)
  public_test_key TEXT NOT NULL,          -- Clé publique test (non secrète)
  public_prod_key TEXT NOT NULL,          -- Clé publique prod (non secrète)
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT
);

-- Ajouter merchant_id aux commandes existantes (nullable = rétrocompatible HCS)
ALTER TABLE orders ADD COLUMN merchant_id TEXT DEFAULT NULL;
