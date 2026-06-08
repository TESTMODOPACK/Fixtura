# ADR-0007 — Nómina de pago al personal (pago masivo)

- Estado: Aceptada
- Fecha: 2026-06-07
- Contexto previo: ADR-0006 (pagos a personal / cuentas por pagar, F47).

## Contexto

F47 resolvió el pago **individual** a una persona (una `LiquidacionPersonal`
agrupa designaciones ASISTIO de esa persona). Para operar a escala, la liga
necesita emitir una **nómina de pago**: un lote que paga a varias personas a la
vez por un período, y que produce el archivo que se sube al banco para una
transferencia masiva.

## Decisiones (confirmadas con el usuario)

1. **Período**: rango `desde`/`hasta` con atajos "esta semana" / "semana
   pasada" (lun–dom). El período filtra las asistencias por la **fecha del
   partido** (America/Santiago). Cubre el caso semanal sin perder flexibilidad
   (quincenas, torneos puntuales).

2. **Semántica de emisión = registrar el pago (1 paso)**: emitir la nómina crea
   las liquidaciones (las cuentas por pagar del período quedan saldadas) y
   habilita la descarga del Excel para el banco. Consistente con F47
   (liquidación = pagado). Si una transferencia rebota, se revierte la nómina (o
   a futuro, una persona puntual).

3. **Exportación = Excel (.xlsx)**, generado server-side con SheetJS (ya
   instalado). Columnas estándar de transferencia: RUT, nombre, banco, tipo de
   cuenta, N° de cuenta, monto, asistencias. Re-descargable desde la nómina
   guardada.

4. **Datos bancarios en `Personal`** (aditivo): `banco`, `tipo_cuenta`
   (CORRIENTE/VISTA/AHORRO/CUENTA_RUT), `numero_cuenta`, y titular opcional
   (`titular_nombre`, `titular_rut`) para cuentas de terceros.

## Modelo

```
Designacion (ASISTIO, monto_pago)
   └─ liquidacion_id ─▶ LiquidacionPersonal (pago a UNA persona)
                            └─ nomina_id ─▶ NominaPago (lote del período)
```

- `NominaPago`: cabecera del lote — `periodo_desde`, `periodo_hasta`,
  `fecha_pago`, `metodo_pago`, `total`, `cantidad_personas` (snapshots),
  `created_by`. RLS FORCE + trigger + índice por `tenant_id`.
- `LiquidacionPersonal.nomina_id` (NULL = liquidación individual de F47;
  poblado = parte de una nómina). FK `ON DELETE SET NULL`.

## Flujo

- **Preview (dry-run)**: `GET .../nominas/preview?desde&hasta` agrupa por
  persona las asistencias ASISTIO sin liquidar del período (monto > 0), con sus
  datos bancarios y un flag `tieneCuenta`. No persiste.
- **Emitir**: `POST .../nominas` con las personas seleccionadas. Por cada
  persona crea una `LiquidacionPersonal` (con `nomina_id`) reutilizando el
  helper compartido `crearLiquidacionInterna` — que vincula sus designaciones
  con **guard optimista contra doble pago** (UPDATE condicional sobre
  `estado='ASISTIO' AND liquidacion_id IS NULL` + chequeo de filas afectadas).
  Todo en una `@Transactional`: o se crea la nómina con todas sus liquidaciones,
  o nada.
- **Revertir**: `DELETE .../nominas/:id` borra las liquidaciones del lote
  (liberando las designaciones a "pendiente") y la cabecera. Atómico.

## Notas

- Las personas sin cuenta bancaria completa aparecen en el preview pero quedan
  desmarcadas por defecto (se pueden pagar en efectivo marcándolas, o cargando
  su cuenta en el perfil). El backend no las bloquea.
- `total` y `cantidad_personas` de la nómina son snapshots del momento de
  emisión.
- Aditivo y no destructivo. Reversible. Separado de los cobros (ingresos).

## Hallazgo colateral

Durante F49 se detectó que F47 había dejado `LiquidacionPersonal` importada en
`CompetitionModule` pero **fuera del array `forFeature`** — `nest build` (tsc)
no lo detecta, pero habría hecho crashear el bootstrap del API en runtime
(`@InjectRepository(LiquidacionPersonal)` sin provider). Corregido en este
mismo cambio (se agregaron `LiquidacionPersonal` y `NominaPago` al `forFeature`).
