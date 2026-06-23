# Plan: Re-parsear cuestionario y re-ejecutar QC del Limpiador

> **Tipo:** Documento de PLANIFICACIÓN (idea a futuro, todavía sin implementar).
> Recopila la propuesta, pros/contras y decisiones a tomar antes de codear.
>
> **Estado:** PROPUESTA — pendiente de aprobación de alcance. Verificado el
> 2026-06-23: NADA de este plan está implementado todavía (no hay reparseo,
> reemplazo de archivo ni re-ejecución de QC en el código). Sigue 100% sin codear.
> Creado: 2026-06-17.

---

## Motivación

Hoy, si el usuario quiere reprocesar algo ya cargado, tiene que **crear un
proyecto nuevo y volver a subir el archivo**. Esto genera fricción y proyectos
huérfanos. Pasa en las dos herramientas:

- **Cuestionario:** para reparsear con IA hay que crear otro proyecto y recargar
  el Word.
- **Limpiador:** para re-ejecutar el QC hay que rehacer el flujo.

La idea: permitir **reprocesar in-place** dentro del proyecto existente.

Diferencia conceptual entre ambas herramientas:
- **Limpiador** siempre se basa en su Excel cargado + las reglas actuales del
  usuario (no se cambia el archivo).
- **Cuestionario** puede ser más flexible: permitir incluso **reemplazar el
  archivo** o reparsear el mismo con el prompt mejorado.

---

## Propuesta A — Cuestionario: re-parsear / reemplazar archivo

Dentro del proyecto existente, dos acciones:

1. **Reparsear con IA** — mismo archivo/texto, vuelve a llamar al parser (útil
   cuando mejoramos prompt o extracción).
2. **Reemplazar archivo** — subir otro Word/PDF/texto al mismo proyecto.

Ambas, al confirmarse, **borran las validaciones** asociadas al JSON anterior.

### Pros
- Elimina la fricción y los proyectos basura.
- Loop natural: parsear → ver issues → corregir el Word → reparsear.
- Aprovecha de inmediato las mejoras de prompt + extracción de dos canales.

### Contras / riesgos
1. **Pérdida de ediciones manuales:** si el usuario editó preguntas a mano en el
   editor, reparsear las pisa. Riesgo principal.
2. **Validaciones stale:** hay que borrar limpio las `questionnaire_validations`
   del JSON viejo (cascade).
3. **Divergencia con QuestionPro:** si ya se publicó, reparsear desincroniza la
   app respecto de la encuesta publicada.
4. **Costo/latencia:** la llamada de parseo es larga (ya conocido), pero es UNA
   sola llamada → barato comparado con el Limpiador.

### Mitigaciones
- Confirmación explícita antes de pisar: "esto reemplaza el cuestionario y borra
  sus validaciones, ¿seguro?".
- Guard especial si se detectan ediciones manuales.
- Idealmente, snapshot del JSON anterior por si el usuario se arrepiente.

---

## Propuesta B — Limpiador: re-ejecutar QC

Dentro del proyecto/versión existente, botón "Re-ejecutar QC" que reprocesa el
Excel ya cargado con las **reglas actuales** del usuario.

### Pros
- Caso real y frecuente: el usuario cambia reglas y quiere reevaluar sin re-subir
  el Excel.

### Contras / riesgos
1. **Idempotencia:** el QC escribe en varias tablas (ver
   `docs/LIMPIADOR_QC_CONTRACT.md`). Re-ejecutar EXIGE limpiar primero los
   resultados previos de esa versión, o quedan duplicados/inconsistentes.
2. **Costo real:** es LLM por fila → re-correr un dataset grande cuesta tiempo y
   plata (a diferencia del cuestionario). Amerita aviso "esto reprocesa N filas".
3. **Decisiones del usuario:** keep/reject ya tomados — ¿se pisan o se preservan?
   Hay que decidir.

### Mitigaciones
- Limpieza idempotente previa de los resultados de la versión.
- Aviso de costo/alcance antes de arrancar.
- Definir política sobre decisiones manuales existentes.

---

## Recomendación de orden

1. **Cuestionario primero** (más barato, menor riesgo): "Reparsear con IA" +
   "Reemplazar archivo" in-project, con confirmación que avisa borrado de
   validaciones y guard ante ediciones manuales.
2. **Limpiador después** (esfuerzo aparte): "Re-ejecutar QC" con limpieza
   idempotente + aviso de costo. Más delicado por el contrato de escritura y el
   costo por fila.

---

## Decisiones a tomar (antes de implementar)

- [ ] Cuestionario: ¿reparsear pisa SIEMPRE, o versiona el JSON anterior?
- [ ] Cuestionario: ¿cómo detectar "ediciones manuales" para el guard?
- [ ] Cuestionario: ¿qué hacer si ya se publicó a QuestionPro?
- [ ] Limpiador: ¿preservar o descartar decisiones keep/reject al re-ejecutar?
- [ ] Limpiador: ¿umbral de filas para mostrar aviso de costo?
