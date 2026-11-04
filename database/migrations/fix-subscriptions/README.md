# Migraciones de suscripciones

Orden obligatorio para producción: ejecutar `01`, `02`, `03`, `04` y `05`, en ese
orden, **antes de desplegar el código** que consume `org_effective_subscriptions`
y las nuevas feature keys.

1. `01-create-free-plan.sql`
2. `02-add-past-due-grace.sql`
3. `03-credit-cards-feature.sql`
4. `04-inventory-movements-categories-features.sql`
5. `05-trial-expiry-only-trial-plan.sql`

## Prerrequisitos

Estas migraciones asumen que ya se aplicaron las migraciones de columnas
`v4.6`, `v4.7`, `v4.19` y `v4.20` (límites de plan como `max_warehouses`,
`max_supplies`, `max_transactions_per_month`, `max_users`, y la columna
`organizations.timezone` que usa la vista). Si falta alguna, `01` o `02`
fallarán por columnas inexistentes.

## Notas

Todos los archivos son reejecutables y transaccionales (`BEGIN`/`COMMIT`).
`01` sincroniza deliberadamente los límites y permisos del plan Gratis, por lo
que sobrescribe ajustes manuales de ese plan. `02` aborta con una excepción si
`free` no existe, mantiene acceso total para planes no facturables en
`PAST_DUE` y calcula los TRIAL vencidos como Gratis sin persistir el cambio.
`05` redefine la vista de `02` (mismas columnas y orden) para que el
vencimiento de prueba aplique **solo** cuando el plan contratado tiene slug
`trial`; es la definición final de `org_effective_subscriptions`.
