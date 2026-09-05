# SGC - Sistema de Gestión de Citas

Monorepo con todos los componentes del SGC (clonado y renombrado desde globalpro/*).

## Estructura

```
sgc/
├── apps/
│   ├── citas-worker/          # Chat IA + agendamiento de citas (Worker TS)
│   ├── ordenes-pages/         # Calendario + OT + panel admin original (Pages Functions)
│   ├── recordatorios-worker/  # Sistema de recordatorios vía WhatsApp (Worker TS, cron)
│   └── admin-panel/           # ⭐ NUEVO: Panel admin unificado (Citas + OT + Técnicos + Dashboard)
├── packages/
│   └── db-schema/             # Schemas SQL de las 3 D1 databases
└── scripts/                   # Scripts de despliegue y migración
```

## Credenciales y recursos

### Cloudflare (cuenta: correo36000@gmail.com)

| Recurso | Nombre | UUID |
|---|---|---|
| D1 | sgc_citas_db | 1dc3a88b-7ab1-4e57-99c0-325ac003b193 |
| D1 | sgc_ordenes_db | 5c1ef5cd-a0ea-4720-aba2-c660ec125dd2 |
| D1 | sgc_recordatorios_db | c3a773f0-9411-4a20-a030-de22523104fd |
| Account ID | — | 08c16b2ef77f748599f3ff7db1e28e94 |

### URLs de producción (después del deploy)

- **Panel admin nuevo:** https://sgc-admin.pages.dev
- **Calendario + OT:** https://sgc-ordenes.pages.dev
- **Chat IA citas:** https://sgc-citas.workers.dev
- **Recordatorios cron:** https://sgc-recordatorios.workers.dev

### Credenciales de admin (por defecto)

- Usuario: `admin`
- Contraseña: `admin123` (hash SHA-256 preconfigurado)
- ⚠️ Cambiar inmediatamente después del primer login

## Despliegue

### Opción A: Deploy manual via wrangler

```bash
cd apps/citas-worker
npx wrangler deploy --name sgc-citas

cd ../recordatorios-worker
npx wrangler deploy --name sgc-recordatorios

cd ../admin-panel
npx wrangler pages deploy . --project-name sgc-admin

cd ../ordenes-pages
npx wrangler pages deploy . --project-name sgc-ordenes
```

### Opción B: Deploy via Git (Cloudflare Pages)

1. Conectar este repo a Cloudflare Pages
2. Para cada app, configurar:
   - Build command: (vacío)
   - Build output dir: `.` (raíz del repo o carpeta de la app)
3. Bindings de D1 se configuran via Dashboard

## Diferencias con el sistema original (GlobalPro)

| Aspecto | Antes (GlobalPro) | Ahora (SGC) |
|---|---|---|
| D1 databases | globalpro_citas, tallerv2_db | sgc_citas_db, sgc_ordenes_db, sgc_recordatorios_db |
| Workers | globalpro-citas, globalprov3 | sgc-citas, sgc-recordatorios |
| Pages | globalprov2 | sgc-ordenes, sgc-admin (nuevo) |
| Auth admin | Solo endpoint login | JWT + middleware en todas las rutas |
| Panel admin | Solo calendario + OT | Dashboard + Citas CRUD + OT CRUD + Técnicos CRUD |
| Schema DB | Migraciones automáticas | Schema SQL inicial en packages/db-schema |

## Notas técnicas

- **Timezone:** Chile (UTC-3) — `datetime('now', '-3 hours')` en SQL
- **Schema compartido:** AdminUsers existe en sgc_citas_db Y sgc_ordenes_db (mismas credenciales)
- **Aprobar cita** automáticamente crea OT Express en sgc-ordenes y agenda en AgendaTecnicos
- **Compatibilidad:** Las APIs siguen el mismo contrato que globalpro/* para no romper integraciones existentes
