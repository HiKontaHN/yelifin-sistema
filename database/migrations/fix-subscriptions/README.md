# Migraciones de suscripciones

Orden obligatorio para producción: ejecutar `01`, `02`, `03` y `04`, en ese
orden, **antes de desplegar el código** que consume `org_effective_subscriptions`
y las nuevas feature keys.

1. `01-create-free-plan.sql`
2. `02-add-past-due-grace.sql`
3. `03-credit-cards-feature.sql`
4. `04-inventory-movements-categories-features.sql`

Todos los archivos son reejecutables. `01` sincroniza deliberadamente los
límites y permisos del plan Gratis, por lo que sobrescribe ajustes manuales de
ese plan. `02` aborta con una excepción si `free` no existe, mantiene acceso
total para planes no facturables en `PAST_DUE` y calcula los TRIAL vencidos como
Gratis sin persistir el cambio.
