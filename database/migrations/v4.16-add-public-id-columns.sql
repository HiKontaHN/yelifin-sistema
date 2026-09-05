-- ============================================================
-- MIGRACIÓN v4.16: PUBLIC_ID — IDENTIFICADOR EXTERNO NO SECUENCIAL
-- Fecha: 2026-09-04
-- ============================================================
-- Agrega una columna public_id (UUID) a las tablas cuyo id entero
-- secuencial se expone hoy en una URL o en texto visible al usuario.
-- No toca id, FKs ni JOINs existentes — cambio puramente aditivo.
--
-- gen_random_uuid() es nativo desde Postgres 13 (no requiere
-- extensión); el CREATE EXTENSION pgcrypto de abajo es un seguro
-- defensivo sin costo, igual al patrón ya usado 3x en este repo
-- para uuid-ossp (declarado pero nunca invocado).
--
-- DEFAULT gen_random_uuid() es VOLATILE, así que este ALTER reescribe
-- cada tabla para rellenar un valor único por fila existente (no es
-- el fast-path de metadata-only de un default constante). A este
-- tamaño de tablas es cuestión de milisegundos, pero toma un ACCESS
-- EXCLUSIVE lock mientras dura — correrlo fuera de hora pico.
--
-- Ver database/docs/public-id-and-permission-granularity-plan.md
-- (Parte 1) para el contexto completo, el alcance de tablas y los
-- cambios de rutas/tipos que acompañan esta migración.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE purchase_batches ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_batches_public_id ON purchase_batches(public_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_public_id ON sales(public_id);

ALTER TABLE events ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_public_id ON events(public_id);

ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_cards_public_id ON credit_cards(public_id);
