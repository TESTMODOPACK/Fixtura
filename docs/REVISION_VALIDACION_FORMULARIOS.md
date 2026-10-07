# Revisión de validación en formularios — LigaPlus

> Estandarización del feedback de error en todos los formularios del sistema +
> revisión exhaustiva de bugs. Junio 2026.
> Commits: `5778f48` (tribunal jugador) → `dc5c60c` (lote ~30 forms) → `724a8a2` (6 fixes de la revisión).

## Objetivo

Que **todo formulario** dé feedback EXPLÍCITO al enviar con campos faltantes o
inválidos: un banner grande arriba del form (`FormErrorBanner`) que lista qué
completar + un toast, en vez de feedback sutil (toast efímero, texto chico) o
ningún feedback ("el botón no hace nada").

---

## 1. Formularios estandarizados en este lote (35)

Leyenda — **Tipo**: RHF (react-hook-form + Zod) · Manual (useState + checks).
**Estado**: ✅ revisado sin cambios · 🔧 se le corrigió un bug en la revisión.

### Tribunal — `admin/torneos/[id]/tribunal/page.tsx`
| Form | Tipo | Cambio aplicado | Estado |
|---|---|---|---|
| NuevaSancionTribunalForm (jugador) | RHF | Banner + `makeRhfErrorHandler` + saneo de `fechasSuspension` (NaN→error claro) | ✅ |
| NuevaSancionEquipoForm | Manual | Banner + toast | 🔧 migrado a patrón derivado + `intentado` (el banner se actualiza en vivo al corregir) |

### Ajustes — `admin/ajustes/page.tsx`
| Form | Tipo | Cambio aplicado | Estado |
|---|---|---|---|
| BrandingTab | RHF | Banner + `makeRhfErrorHandler` (ref + labelMap) | ✅ |
| DominioTab | RHF | Banner + handler | ✅ |
| InvitarMiembroForm | RHF | Banner + handler | ✅ |
| CalendarioTab / Agregar día | RHF | Banner + handler | ✅ |
| PagosTab | Manual | Banner (clientError + apiError) + toast | ✅ |
| WhatsAppTab | Manual | Banner + toast | ✅ |

### Super admin — tenants
| Form | Archivo | Tipo | Cambio | Estado |
|---|---|---|---|---|
| Crear liga | `super/tenants/nuevo/page.tsx` | RHF | Banner + handler | 🔧 `adminPassword` min 10 + label corregido (decía "mín 8", backend exige 10) |
| Editar liga | `super/tenants/[id]/page.tsx` | RHF | Banner + handler | ✅ `apiError`=`update.error` verificado (no el error de carga) |

### Torneos — fixture / equipos
| Form | Archivo | Tipo | Cambio | Estado |
|---|---|---|---|---|
| GenerarFixtureForm | `_generar-fixture-form.tsx` | RHF | Banner + **conectó** `makeRhfErrorHandler` (antes pasaba solo `formName` → no daba feedback) | ✅ |
| SuspenderEquipoModal | `_suspender-equipo-modal.tsx` | RHF | Banner | ✅ |
| SuspenderFechaForm | `fixture/page.tsx` | Manual | Banner + toast (reemplazó `alert()` nativo) | ✅ |

### Designaciones — `admin/torneos/[id]/designaciones/page.tsx`
| Form | Tipo | Cambio | Estado |
|---|---|---|---|
| AsignarForm | Manual | Banner + toast | ✅ |
| AutoAsignarBoton | Manual | Banner + toast (reemplazó `return` silencioso) | 🔧 `key={fechaId}` + `mutation.reset()` al cerrar (evita error/resultado viejo al reabrir/cambiar fecha) |
| RecintoAsignarForm | Manual | Banner + toast | ✅ |

### Partido — `admin/torneos/[id]/partidos/[partidoId]/page.tsx`
| Form | Tipo | Cambio | Estado |
|---|---|---|---|
| ActaSection (cerrar acta) | RHF | Banner | ✅ |
| EditarPartidoCard | RHF | Banner | ✅ |
| ReprogramarForm | Manual | Banner + toast (reemplazó `alert()`) | ✅ |
| WalkoverCard | Manual | Banner + toast (reemplazó `alert()`) | 🔧 reset `intentado`/`perdedor` al cerrar el modal |
| CertificacionSection | Manual | Banner | ✅ (verificado: certificar 0 presentes sigue permitido) |
| IncidenciasSection | RHF | Banner | ✅ |

### Match center y planillero móvil
| Form | Archivo | Tipo | Cambio | Estado |
|---|---|---|---|---|
| IncidenciasPanel | `partidos/[partidoId]/centro/page.tsx` | Manual | Banner + toast | 🔧 reset `intentado` en el éxito (el banner reaparecía tras cada gol OK) |
| IncidenciasMovil | `personal/partido/[partidoId]/page.tsx` | Manual | Banner + toast | 🔧 mismo fix (vista móvil del planillero) |
| CerrarActaMovil | `personal/partido/[partidoId]/page.tsx` | Manual | Banner (apiError) | ✅ |

### Resto de áreas
| Form | Archivo | Tipo | Cambio | Estado |
|---|---|---|---|---|
| MiembroFormInline (directiva) | `clubes/[id]/[catId]/_directiva-categoria-form.tsx` | RHF | Banner + handler | ✅ (el error de API lo muestra el padre vía toast) |
| LoginModal | `components/login-modal.tsx` | RHF | Banner (reemplazó error inline chico) + toast | ✅ |
| SponsorForm (crear+editar) | `sponsors/page.tsx` | RHF | Banner (apiError según modo create/update) | 🔧 `prioridad` saneo NaN |
| NuevoPersonalForm | `personal/page.tsx` | RHF | Banner | ✅ |
| EditarPersonalForm | `personal/page.tsx` | RHF | Banner (apiError=update) | ✅ |
| AusenciasPanel | `personal/page.tsx` | Manual | Banner + toast (con `intentado`, reseteado en éxito) | ✅ |
| CobroForm | `finanzas/page.tsx` | RHF | Banner | ✅ |
| MarcarPagadoForm | `finanzas/page.tsx` | Manual | Banner (apiError) | ✅ (verificado: pago sin referencia sigue permitido) |
| NuevoJugadorForm | `equipos/[equipoId]/page.tsx` | RHF | Banner | 🔧 `numeroCamiseta` saneo NaN (campo opcional) |
| ImportCsvForm | `equipos/[equipoId]/page.tsx` | Manual | Banner + toast | ✅ |

## 2. Formularios que YA cumplían el patrón (7, no requirieron cambios)

`clubes/nuevo` (NuevoClubPage), `clubes/[id]/_nuevo-jugador-form`,
`clubes/[id]/_editar-jugador-modal`, `clubes/[id]/[catId]/_editar-club-drawer`,
`torneos/nuevo` (NuevoTorneoPage), `torneos/[id]/_nuevo-equipo-form`,
`vetados` (VetadoForm). Sirvieron de referencia del patrón.

**Total cubierto: ~42 formularios.**

---

## 3. Bugs encontrados y corregidos

### Durante el lote inicial (modales que no avisaban nada)
1. **ReprogramarForm**, **WalkoverCard**, **SuspenderFechaForm** usaban `alert()` nativo → reemplazado por banner + toast, y ya no disparan la mutación si falta el dato.
2. **AutoAsignarBoton** hacía `return` silencioso sin roles → feedback explícito.

### En la revisión exhaustiva (4 revisores adversariales)
| # | Sev. | Form | Problema | Fix |
|---|---|---|---|---|
| 1 | ALTA | IncidenciasPanel + IncidenciasMovil | El banner "Elige el jugador" reaparecía tras CADA gol registrado con éxito (`intentado` no se reseteaba) | reset `intentado` en el éxito |
| 2 | ALTA | WalkoverCard | El banner salía de entrada al reabrir el modal (`intentado`/`perdedor` persistían) | reset al cerrar |
| 3 | ALTA | AutoAsignarBoton | Error/resultado de una corrida previa persistían al reabrir o cambiar de fecha | `key={fechaId}` + `mutation.reset()` |
| 4 | MEDIA | NuevaSancionEquipoForm (tribunal) | Errores obsoletos hasta el próximo submit | patrón derivado + `intentado` |
| 5 | MEDIA | numeroCamiseta / prioridad | `valueAsNumber` daba NaN al vaciar un campo opcional y bloqueaba el submit | `z.preprocess` (NaN→undefined) |
| 6 | MEDIA | Crear liga (super admin) | Label "mín 8" vs backend exige 10 | label + validación cliente min 10 |

### Falsos positivos descartados (verificación de primera mano)
- "Certificar 0 jugadores bloqueado" → **no**, sigue permitido.
- "Marcar pago sin referencia bloqueado" → **no**, referencia es opcional.
- "Suspender partido/fecha exige campo con default" → **no**, los selects tienen default válido.
- "Doble feedback en Ajustes": de los 8 bloques candidatos, **2 NO eran duplicados** (error del toggle ANFA y del botón "quitar miembro") — borrarlos habría roto feedback legítimo. Por eso se dejó como pulido cosmético opcional, no se tocó.

---

## 4. Validaciones realizadas

| Validación | Comando | Resultado |
|---|---|---|
| Tipos | `pnpm -C apps/web typecheck` (`tsc --noEmit`) | **0 errores** (corrido 3 veces: lote, fixes, fixes finales) |
| Lint | `pnpm -C apps/web lint` (`next lint`) | Solo 3 warnings **preexistentes y ajenos** (`<img>`, exhaustive-deps) |
| Build | `pnpm -C apps/web build` | **Compiled successfully** (todas las páginas) |
| Revisión adversarial 1ª pasada | 1 agente sobre los diffs | 0 ALTA, hallazgos menores |
| Revisión adversarial 2ª pasada | 4 agentes, cada form completo + hook + schema, simulando 3 escenarios (vacío / válido / error de API) + reseteo de estado en modales | 6 bugs reales (corregidos) |
| Verificación de primera mano | Lectura directa del código de cada hallazgo ALTA antes de tocarlo | Confirmados 3/3 |

### Cómo se validó cada form (los 3 escenarios)
1. **Envío vacío/ inválido** → aparece el banner con los campos correctos y NO se dispara la mutación.
2. **Envío válido** → se envía y el flujo de éxito (reset / cierre de modal / redirect) queda intacto.
3. **Error de API** → el banner muestra el error de la MUTACIÓN del form (no un error de carga de página).
Más: en forms manuales, que el banner NO aparezca antes del primer submit y que el estado se resetee en éxito y al cerrar/reabrir modales.

---

## 5. Pendiente menor (opcional)

**Doble feedback cosmético** en 6 forms de Ajustes: el error de API se ve en el
banner (arriba) y en un bloque inline (abajo). No es un bug funcional; el
feedback es explícito. Quitar los inline es pulido opcional — requiere precisión
(2 de los bloques cercanos NO son duplicados).
