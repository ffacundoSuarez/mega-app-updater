# Sincronizar el motor Brand Audit con la versión de Chris

Chris desarrolla el motor por su cuenta, como scripts sueltos que corre a mano en
su máquina. Cada tanto nos pasa una carpeta con sus archivos y hay que traerlos a
`python-scripts/brand_audit/`.

Este documento existe porque **sincronizar es reemplazar archivos**, y hay un
puñado de modificaciones locales que el reemplazo se lleva puestas. Si no se
re-aplican, la app rompe o deja de andar como antes, en general en silencio.

## Cómo sincronizar

1. Dejar la carpeta de Chris en `incoming/`.
2. Comparar antes de copiar, para ver el tamaño del cambio:

   ```powershell
   git --no-pager diff --no-index --stat -- "python-scripts\brand_audit\config.py" "incoming\<carpeta>\config.py"
   ```

3. Copiar los archivos que cambiaron.
4. Re-aplicar los parches de la lista de abajo.
5. Correr las verificaciones del final.

## Filosofía: parchear desde afuera siempre que se pueda

La mayor parte de la integración vive en `python-scripts/run_brand_audit.py`, que
importa el motor y le pisa lo que necesita en caliente. Eso es deliberado: cuanto
menos toquemos los archivos de Chris, más barato es cada sync.

Sólo se edita un archivo del motor cuando no hay forma de hacerlo desde el
wrapper.

## Parches que viven en el wrapper (no requieren acción al sincronizar)

Están todos en `run_brand_audit.py` y sobreviven a cualquier reemplazo de
archivos. Se listan acá para que se entienda qué hacen, no porque haya que
re-aplicarlos.

- **Corte de ola.** El motor tiene dos filtros que se encadenan:
  `APPLY_WAVE_FILTER`/`WAVE_FILTER` en `utils.py`, y `FILTRAR_BASE` +
  `VARIABLE_FILTRO` + `VALOR_FILTRO` en `main.py`. El wrapper usa el primero y
  apaga el segundo. Si se dejan los dos, pedir una ola distinta de la que Chris
  tenga hardcodeada en `config.py` deja la base principal vacía.
- **`STUDY_ID`.** Viene fijo por ola en el config. El wrapper lo deriva del
  nombre de ola que eligió el usuario. Hay que patchearlo **antes** de importar
  `brand_audit.main`, que lo lee a nivel módulo para armar el nombre del caché.
- **`MODO_PRUEBA` y `ONLY_GENERATE_TABLES`.** Modos de desarrollo de Chris que se
  fuerzan a `False`. `MODO_PRUEBA` tabula sólo las variables de
  `VARIABLES_DE_PRUEBA` y `ONLY_GENERATE_TABLES` saltea el PowerPoint entero.
- **`TEMPLATE_PPX`.** Sale del archivo que elige el usuario, no de la carpeta de
  assets. Ver la sección de la plantilla más abajo.
- **API key de Gemini.** Se inyecta por env var envolviendo las funciones de
  `generador_ia`, porque `main.py` tiene la key hardcodeada como variable local.
- **Saltear `process_data`.** Ver la sección de performance.

## Parches que SÍ viven dentro del motor (re-aplicar en cada sync)

### 1. `config.py` — exclusión de PromoTracking

Al final del archivo:

```python
TRACKING_CHARTS = [c for c in TRACKING_CHARTS if not c.get("is_top_n_sync")]
```

Chris mantiene en el mismo config el trabajo de otro estudio (PromoTracking
Pepsico multi-país). Esas entradas apuntan a shapes que no existen en la
plantilla de YPF y su motor (`create_slides.update_top_n_block`) ni siquiera está
cableado en `main.py`.

Se filtra en vez de borrar líneas para que el diff contra las próximas versiones
siga siendo legible.

### 2. `create_slides.py` — ruta de logos

La carpeta de logos venía hardcodeada al escritorio de la máquina de Chris
(`C:\Users\User\Desktop\imagenes\Brasil`), lo que sólo funcionaba ahí. Ahora sale
de `config.LOGOS_DIR`, que el wrapper apunta a `<assets>/logos`:

```python
carpeta_logos = getattr(config, "LOGOS_DIR", None)
if carpeta_logos and os.path.exists(carpeta_logos):
```

### 3. `generador_ia.py` — payload del executive summary

Agregamos `_resumir_para_summary()` y el parámetro `titulos_generados` en
`redactar_executive_summary()`, para no reenviar la mochila de datos completa a
Gemini.

Nota: en el motor de agosto 2026 esta función quedó huérfana (ver abajo), pero el
parche se mantiene por si se reactiva.

## Cosas que hay que mirar en cada sync

### La plantilla `.pptx` es un contrato

`main.py` no crea slides: busca objetos **por nombre** dentro del `.pptx` y les
agrega la columna de la ola nueva. Si un gráfico no se llama exactamente como
dice `chart_name`, esa slide no se actualiza y **falla en silencio**.

Después de cada sync conviene cruzar el config contra la plantilla:

```powershell
$rt = "src-tauri\binaries\python-runtime\python.exe"
& $rt -X utf8 -c @"
import re, sys
from pptx import Presentation
sys.path.insert(0, 'python-scripts')
from brand_audit import config as c

prs = Presentation(r'<ruta a la plantilla>')
nombres = set()
def walk(shs):
    for sh in shs:
        nombres.add(sh.name)
        if sh.shape_type == 6:
            try: walk(sh.shapes)
            except: pass
for s in prs.slides: walk(s.shapes)

declarados = sorted({x['chart_name'] for x in c.TRACKING_CHARTS if x.get('chart_name')})
faltan = [n for n in declarados if n not in nombres]
print(f'{len(declarados)} declarados, {len(faltan)} sin shape en la plantilla:')
for n in faltan: print('  -', n)
"@
```

La plantilla **no viene con la app**. En un tracking, el informe de una ola es la
plantilla de la siguiente, así que la elige el usuario en cada corrida. Por eso
no está en `BUNDLED_ASSETS` en `src-tauri/src/commands/brand_audit.rs`.

### Dependencias nuevas

Chris agrega imports sin avisar. Después de sincronizar:

```powershell
Select-String -Path "python-scripts\brand_audit\*.py" -Pattern "^\s*(import|from)\s+\S+" |
  ForEach-Object { $_.Line.Trim() } | Sort-Object -Unique
```

Cualquier paquete de terceros que no esté en `python-scripts/requirements.txt` hay
que agregarlo y correr `npm run bundle:python:force`.

### Funciones que Chris saca

En el sync de agosto 2026 eliminó el bloque de Executive Summary de `main.py`.
Resultó ser código muerto: inyectaba el texto en un shape llamado
`Text_Executive_Summary` que **ninguna plantilla tuvo nunca**, así que gastaba una
llamada a Gemini y tiraba el resultado.

Conviene chequear que los toggles de la UI sigan teniendo efecto después de cada
sync.

## Performance: saltear `process_data`

El súper bucle de `main.py` hace, por cada tarea:

```python
res = process_data.process_single(...)   # o process_scale(...)
...
tab = engine.tabulate_xxx(...)
if tab: resultados.append(tab)
```

`res` **nunca se lee**. Lo único que se acumula es `tab`. Ambas funciones son
puras: sólo leen sus argumentos y arman dataframes locales, sin tocar globals ni
escribir archivos. Su resultado se descarta entero.

Medido sobre la base de agosto 2026 (52.929 casos × 1.892 variables):
`process_single` 94 s + `process_scale` 119 s = **213 s de 725 s totales, el 29%
del tiempo gastado en resultados que se tiran**.

El wrapper las anula:

```python
ba_process_data.process_single = lambda *a, **kw: None
ba_process_data.process_scale = lambda *a, **kw: None
```

**En cada sync hay que verificar que `res` siga sin usarse**, porque si Chris
empieza a leerlo el no-op lo rompe en silencio:

```powershell
Select-String -Path "python-scripts\brand_audit\main.py" -Pattern "(?<![a-zA-Z_])res(?![a-zA-Z_0-9])"
```

Las únicas apariciones esperadas son la inicialización, las dos asignaciones desde
`process_data`, y el loop posterior de auditoría que rebindea `res` sobre
`excel_results_hist`.

## Baseline de tiempos (agosto 2026)

Referencia para detectar regresiones. Base de 1,76 GB, 52.929 casos × 1.892
variables, ola 53, sin IA:

- Total: **725 s**, de los cuales tabulación ~68%, carga del `.sav` 66 s (9%),
  armado del PPT ~89 s (12%), export a Excel 42 s (6%).
- Pico de RAM: ~2,5 GB, por el `df_historico = df.copy()` de `utils.py`.
- La base requiere encoding `latin1`: fallan tanto el default como `cp1252`. Los
  intentos fallidos cuestan ~1 s en total, así que el lector con reintentos no es
  un problema.

## Verificación después de sincronizar

```powershell
# 1. Que todo compile
$rt = "src-tauri\binaries\python-runtime\python.exe"
& $rt -c "import py_compile, pathlib; [py_compile.compile(str(f), doraise=True) for f in pathlib.Path('python-scripts/brand_audit').glob('*.py')]"

# 2. Corrida completa por el wrapper real
& $rt -X utf8 python-scripts\run_brand_audit.py `
  --sav-principal "<base.sav>" --template-pptx "<plantilla.pptx>" `
  --wave-filter <N> --wave-name "<Mes AA>" `
  --output-dir "<salida>" --assets-dir "python-scripts\brand_audit\assets"
```

Si se tiene el informe que generó Chris para la misma ola, sirve como test de
regresión: el motor **reemplaza** la columna del mes si ya existe en el gráfico
(en vez de agregar una nueva), así que correr sobre su propio `.pptx` con la misma
ola tiene que reproducir sus números.
