# Cambios pendientes

> **Qué es esto:** un backlog vivo de cambios por hacer en la app. Es la lista
> rápida de "lo que falta". A medida que se trabajan los ítems, se van **sacando**
> de acá (y, si hace falta, se documentan en detalle en `docs/Plans/`).
>
> **Cómo se usa:**
> - Agregar un ítem nuevo cuando aparece algo por hacer.
> - Cuando un cambio se completa, **borrarlo** de esta lista.
> - Para cosas grandes que necesitan diseño, dejar acá solo el resumen y el
>   detalle en un `.md` aparte dentro de `docs/Plans/`.
>
> Última actualización: 2026-06-23 (verificado contra código: drag & drop sigue
> pendiente, no hay `onDragDropEvent`/`useFileDrop` implementado).

---

## Pendientes

### Drag & drop de archivos en la app

**Problema:** no se pueden arrastrar archivos a ninguna herramienta. En Tauri 2
el webview tiene `dragDropEnabled: true` por defecto, así que el handler nativo
del SO intercepta el drop y el evento HTML5 (`dataTransfer.files`) nunca recibe
los archivos. El cuestionario ya tiene UI/handlers de drag, pero no disparan.

**Enfoque elegido (Opción B):** dejar `dragDropEnabled: true` y escuchar el
evento nativo de Tauri (`onDragDropEvent`), que entrega **rutas de archivo**.
Cada herramienta usa la ruta como ya sabe:
- Limpiador: pasa la ruta a su lector en Rust (igual que hoy; no carga Excels
  grandes en memoria del webview).
- Cuestionario: lee los bytes con `@tauri-apps/plugin-fs` → arma un `Blob` → se
  lo da al parser existente.

**A implementar:**
- Hook compartido (ej. `useFileDrop`) que filtre por extensión por herramienta
  (`.docx/.pdf` cuestionario, `.xlsx/.xls` Limpiador).
- Revisar permisos de `fs` en `src-tauri/capabilities/default.json`.
- Conectar el hook en el cuestionario primero (caso más simple), luego Limpiador.

---

## Notas

- Los planes en detalle viven en `docs/Plans/`.
- El backlog específico de Cuestionarios/Limpiador (con decisiones tomadas) está
  en `docs/cambios-pendientes-cuestionarios-limpiador.md`.
