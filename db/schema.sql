-- Studbook F2-01 — global schema (draft for review; NOT applied anywhere).
-- Target: PostgreSQL 15+. Provider, region and budget for F2-02 still need owner approval.
-- Keys are deterministic UUIDv5 values from server/domain/ids.mjs, so the import is repeatable.
-- Money is whole guineas (bigint). The ledger is append-only double entry.

BEGIN;

CREATE TABLE account (
  id              uuid PRIMARY KEY,
  legacy_id       text UNIQUE NOT NULL,            -- u… from users.json
  email           text UNIQUE NOT NULL CHECK (email = lower(email) AND length(email) <= 160),
  password_salt   text NOT NULL,
  password_hash   text NOT NULL,                   -- scrypt N=16384 r=8 p=1, hex
  verified        boolean NOT NULL DEFAULT false,
  wallet_address  text CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE room (
  id          uuid PRIMARY KEY,
  legacy_id   text UNIQUE NOT NULL,                -- r…
  code        text UNIQUE NOT NULL,
  season      integer NOT NULL CHECK (season >= 1),
  meeting     integer NOT NULL CHECK (meeting >= 1),
  closes_at   timestamptz NOT NULL,
  version     bigint NOT NULL CHECK (version >= 1), -- optimistic concurrency / fencing
  archived    boolean NOT NULL DEFAULT false
);

CREATE TABLE stable (
  id          uuid PRIMARY KEY,
  account_id  uuid REFERENCES account(id),         -- NULL = house (AI) yard
  room_id     uuid NOT NULL REFERENCES room(id),
  legacy_id   text NOT NULL,                       -- st… / ai…, unique per room
  name        text NOT NULL,
  UNIQUE (room_id, legacy_id)
);
-- G1: one human stable per account across the whole game.
CREATE UNIQUE INDEX stable_one_per_account ON stable (account_id) WHERE account_id IS NOT NULL;

CREATE TABLE horse (
  id                uuid PRIMARY KEY,              -- uuidv5(origin room, local id): identity forever
  legacy_id         text NOT NULL,
  origin_room_id    uuid NOT NULL REFERENCES room(id),
  owner_stable_id   uuid REFERENCES stable(id),    -- G2: exactly one owner while alive
  name              text NOT NULL,
  sex               char(1) NOT NULL CHECK (sex IN ('M','F')),
  lineage           text NOT NULL,
  born_season       integer NOT NULL,
  genome            jsonb NOT NULL,                -- hidden genotype; never served to clients
  sire_id           uuid REFERENCES horse(id) DEFERRABLE INITIALLY DEFERRED,
  dam_id            uuid REFERENCES horse(id) DEFERRABLE INITIALLY DEFERRED,
  breeder_stable_id uuid REFERENCES stable(id),    -- royalty beneficiary, fixed at foaling; NULL for pre-F2 horses
  archived          boolean NOT NULL DEFAULT false,
  UNIQUE (origin_room_id, legacy_id)
);

-- Genetics and pedigree are immutable once written.
CREATE FUNCTION horse_identity_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.genome IS DISTINCT FROM OLD.genome OR NEW.sire_id IS DISTINCT FROM OLD.sire_id
     OR NEW.dam_id IS DISTINCT FROM OLD.dam_id OR NEW.origin_room_id IS DISTINCT FROM OLD.origin_room_id
     OR NEW.born_season IS DISTINCT FROM OLD.born_season
     OR (OLD.breeder_stable_id IS NOT NULL AND NEW.breeder_stable_id IS DISTINCT FROM OLD.breeder_stable_id) THEN
    RAISE EXCEPTION 'horse identity, genome, pedigree and breeder are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER horse_identity_frozen BEFORE UPDATE ON horse FOR EACH ROW EXECUTE FUNCTION horse_identity_frozen();

-- ---------------------------------------------------------------- ledger
CREATE TABLE ledger_account (
  id      text PRIMARY KEY CHECK (id ~ '^(house:[a-z]+|stable:[0-9a-f-]{36})$'),
  stable_id uuid UNIQUE REFERENCES stable(id),
  balance bigint NOT NULL DEFAULT 0,               -- cache of SUM(posting.amount); audited
  CHECK (id LIKE 'house:%' OR balance >= 0)        -- L2: stables never go negative
);
INSERT INTO ledger_account (id) VALUES ('house:treasury'), ('house:fees'), ('house:sink');

CREATE TABLE ledger_entry (
  id               uuid PRIMARY KEY,
  idempotency_key  text UNIQUE NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200), -- L3
  kind             text NOT NULL,                  -- opening_balance, market_sale, prize, purchase…
  fingerprint      text NOT NULL,                  -- sha256 of the request body, for replay checks
  meta             jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_posting (
  entry_id   uuid NOT NULL REFERENCES ledger_entry(id),
  account_id text NOT NULL REFERENCES ledger_account(id),
  amount     bigint NOT NULL CHECK (amount <> 0),
  PRIMARY KEY (entry_id, account_id)
);

-- L1: every entry balances, checked at commit so multi-row inserts are allowed.
CREATE FUNCTION ledger_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total bigint; n integer;
BEGIN
  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO total, n FROM ledger_posting WHERE entry_id = NEW.entry_id;
  IF total <> 0 OR n < 2 THEN
    RAISE EXCEPTION 'ledger entry % does not balance (sum %, postings %)', NEW.entry_id, total, n;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ledger_entry_balanced AFTER INSERT ON ledger_posting
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_entry_balanced();

CREATE FUNCTION ledger_apply_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE ledger_account SET balance = balance + NEW.amount WHERE id = NEW.account_id;
  RETURN NEW;
END $$;
CREATE TRIGGER ledger_apply_posting AFTER INSERT ON ledger_posting FOR EACH ROW EXECUTE FUNCTION ledger_apply_posting();

-- L4: append-only.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ledger rows are append-only; post a reversing entry'; END $$;
CREATE TRIGGER ledger_entry_append_only BEFORE UPDATE OR DELETE ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER ledger_posting_append_only BEFORE UPDATE OR DELETE ON ledger_posting FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- ---------------------------------------------------------------- outbox
-- Side effects (mail, mint intents, chain calls) are written in the same transaction as the
-- state change and delivered later, at least once, by a worker that is idempotent per id.
CREATE TABLE outbox (
  id            uuid PRIMARY KEY,
  topic         text NOT NULL,                     -- mail.verify, mint.intent, …
  payload       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  attempts      integer NOT NULL DEFAULT 0
);
CREATE INDEX outbox_pending ON outbox (created_at) WHERE delivered_at IS NULL;

COMMIT;
