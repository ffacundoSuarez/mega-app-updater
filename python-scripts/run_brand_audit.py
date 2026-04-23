"""
Wrapper del motor Brand Audit para ser invocado desde el backend Rust de Mega App.

Responsabilidades:
  1. Parsear argumentos CLI que vienen desde Rust.
  2. Resolver paths de assets (template .pptx, cuestionario .xlsx, manual_tasks.csv)
     desde una carpeta de assets provista por Rust (convención: por defecto van a
     %USERPROFILE%\\Documents\\MegaApp\\assets\\, Rust los copia ahí desde los resources
     del MSI en el primer run).
  3. Monkey-patchear `brand_audit.config` con los valores dinámicos (SAV files,
     wave filter, wave name, toggles IA).
  4. Cambiar CWD a `output_dir` antes de llamar al motor, porque el motor original
     hace `prs.save("informe_X.pptx")` y `export_to_excel("Tablas_X.xlsx")` contra
     el directorio actual.
  5. Llamar a `brand_audit.main.run_brand_audit()`.
  6. Emitir UNA línea JSON por stdout al final con los paths absolutos de los
     outputs generados (Rust la parsea y la devuelve a React).

Convenciones:
  - stdout: líneas JSON. Sólo la ÚLTIMA línea es el resultado final
    ({"ok": true, "ppt": ..., ...}). El resto son progreso.
  - stderr: logs libres (el logging del motor).
  - exit code: 0 = ok, != 0 = error (Rust devuelve NonZeroExit a React).

Contrato con Rust (args):
  --sav-principal PATH           (obligatorio)
  --sav-secundario PATH          (opcional)
  --wave-filter INT              (obligatorio, ej 48)
  --wave-name STR                (obligatorio, ej "Abr 26")
  --output-dir PATH              (obligatorio, carpeta donde guardar outputs)
  --assets-dir PATH              (obligatorio, carpeta con template + cuestionario + csv)
  --use-ai-insights              (flag, opcional)
  --use-ai-summary               (flag, opcional)

Env vars:
  GEMINI_API_KEY                 (opcional, requerido si se usa IA)
"""

import argparse
import json
import logging
import os
import sys
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Forzar UTF-8 en stdout/stderr ANTES de importar nada del motor.
# El motor original escribe emojis (🧹, 🔄, 🗑️, ⚠️...) en prints y logging.
# En Windows, sys.stdout por defecto usa cp1252, que no puede codificar emojis
# → crashea con UnicodeEncodeError. Esto pasa sí o sí corriendo como subprocess.
# `errors="replace"` es red de seguridad: si aparece algún byte raro, lo
# reemplaza con `?` en vez de tirar la ejecución.
# ---------------------------------------------------------------------------
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    # reconfigure sólo existe en Python 3.7+ y sobre TextIOWrapper real.
    # Si falla (stdout redirigido a algo raro) seguimos igual y ojalá no haya emojis.
    pass


def emit_progress(stage: str, message: str = "") -> None:
    """Emite una línea JSON de progreso por stdout para que Rust la reenvíe a React."""
    try:
        payload = {"type": "progress", "stage": stage, "message": message}
        print(json.dumps(payload, ensure_ascii=False), flush=True)
    except Exception:
        # Nunca fallar por un progress event.
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Runner del motor Brand Audit desde Mega App",
    )
    parser.add_argument("--sav-principal", required=True, type=Path)
    parser.add_argument("--sav-secundario", default=None, type=Path)
    parser.add_argument("--wave-filter", required=True, type=int)
    parser.add_argument("--wave-name", required=True, type=str)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--assets-dir", required=True, type=Path)
    parser.add_argument("--use-ai-insights", action="store_true")
    parser.add_argument("--use-ai-summary", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    emit_progress("start", "Iniciando Brand Audit")

    # --- Validar inputs --------------------------------------------------
    if not args.sav_principal.is_file():
        print(
            json.dumps({"ok": False, "error": f"No existe el SAV principal: {args.sav_principal}"}),
            flush=True,
        )
        return 2

    if args.sav_secundario is not None and not args.sav_secundario.is_file():
        # Tratamos "no existe" como "no se pasó" para no fallar por un path fantasma.
        logging.warning("SAV secundario no existe, se ignora: %s", args.sav_secundario)
        args.sav_secundario = None

    if not args.assets_dir.is_dir():
        print(
            json.dumps({"ok": False, "error": f"No existe la carpeta de assets: {args.assets_dir}"}),
            flush=True,
        )
        return 2

    # Paths de assets. Los nombres son fijos (hardcoded al estudio YPF, decisión
    # Fase 3). Si alguno no está, el motor original también los busca; dejamos
    # que falle el motor con su mensaje específico.
    template_pptx = args.assets_dir / "INFORME COMPLETO YPF MONITOR.pptx"
    questionnaire_xlsx = args.assets_dir / "cuestionario.xlsx"
    manual_tasks_csv = args.assets_dir / "manual_tasks.csv"  # puede no existir; OK

    # Aseguramos output_dir.
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # --- Importar el paquete y monkey-patch de config -------------------
    # Hay que importar brand_audit como paquete (imports relativos entre módulos),
    # por eso añadimos al sys.path el directorio que contiene a `brand_audit/`
    # (o sea, el dir donde vive este archivo).
    here = Path(__file__).resolve().parent
    if str(here) not in sys.path:
        sys.path.insert(0, str(here))

    emit_progress("load_config", "Cargando configuración del estudio")

    try:
        from brand_audit import config as ba_config  # type: ignore
    except Exception as e:
        tb = traceback.format_exc()
        print(
            json.dumps(
                {"ok": False, "error": f"No se pudo importar brand_audit.config: {e}", "traceback": tb}
            ),
            flush=True,
        )
        return 3

    # Parcheamos los valores dinámicos. Todo lo demás queda tal cual lo trajo
    # el estudio YPF (TRACKING_CHARTS, BASURA_SPSS, etc.).
    ba_config.SAV_FILE = str(args.sav_principal)
    ba_config.TEMPLATE_PPX = str(template_pptx)
    ba_config.QUESTIONNAIRE_EXCEL = str(questionnaire_xlsx)
    ba_config.MANUAL_TASKS_CSV = str(manual_tasks_csv)
    ba_config.WAVE_FILTER = args.wave_filter
    ba_config.NEW_WAVE_NAME = args.wave_name
    ba_config.APPLY_WAVE_FILTER = True

    # Base secundaria: si no se pasa, desactivamos el atributo para que main.py
    # lo trate como "no hay secundaria" (usa getattr con default None).
    if args.sav_secundario is not None:
        ba_config.SAV_FILE_SECUNDARIO = str(args.sav_secundario)
    else:
        ba_config.SAV_FILE_SECUNDARIO = None  # el motor chequea esto con getattr

    # Toggles de IA. La key viene por env var (GEMINI_API_KEY), no la pasamos por
    # argv para evitar que quede en logs de procesos.
    ba_config.USE_AI_INSIGHTS = bool(args.use_ai_insights)
    ba_config.USE_AI_SUMMARY = bool(args.use_ai_summary)

    # El motor original tiene `MI_API_KEY = "MI_API_KEY"` hardcoded en main.py.
    # Lo pisamos inyectando la env var en el módulo main justo antes de correr
    # (ver parche post-import más abajo).

    # --- Cambiar CWD para que los outputs caigan en output_dir ----------
    original_cwd = Path.cwd()
    os.chdir(args.output_dir)
    emit_progress("chdir", f"Working dir: {args.output_dir}")

    # --- Correr el motor -------------------------------------------------
    try:
        from brand_audit import main as ba_main  # type: ignore
        from brand_audit import generador_ia as ba_ia  # type: ignore

        # Parche IA: main.py tiene hardcoded `MI_API_KEY = "MI_API_KEY"` como
        # variable local dentro de run_brand_audit(), y se la pasa a
        # generador_ia.redactar_*. No podemos pisar una variable local desde
        # afuera, así que en su lugar wrappeamos las funciones de generador_ia
        # para que ignoren la key recibida y usen la env var GEMINI_API_KEY.
        if ba_config.USE_AI_INSIGHTS or ba_config.USE_AI_SUMMARY:
            api_key = os.environ.get("GEMINI_API_KEY", "").strip()
            if not api_key:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": (
                                "Los toggles de IA están activos pero no hay "
                                "GEMINI_API_KEY configurada. Configurala en "
                                "Ajustes o apagá los toggles."
                            ),
                        }
                    ),
                    flush=True,
                )
                return 4

            _real_titulos = ba_ia.redactar_titulos_con_gemini
            _real_summary = ba_ia.redactar_executive_summary

            def _titulos_con_env_key(_ignored_key, mochila):
                return _real_titulos(api_key, mochila)

            def _summary_con_env_key(_ignored_key, mochila):
                return _real_summary(api_key, mochila)

            ba_ia.redactar_titulos_con_gemini = _titulos_con_env_key
            ba_ia.redactar_executive_summary = _summary_con_env_key
            # main.py hace `from . import generador_ia` y después usa
            # `generador_ia.redactar_titulos_con_gemini(...)`, así que
            # reemplazando el attr en el módulo alcanza.

        emit_progress("run", "Ejecutando motor (tabulación + PPT + Excel)")
        ba_main.run_brand_audit()

    except SystemExit as e:
        # main.py hace sys.exit(1) en errores fatales. Mapeamos a JSON.
        code = e.code if isinstance(e.code, int) else 1
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"El motor salió con SystemExit({code}). Ver stderr (debug_ejecucion.log en output_dir).",
                }
            ),
            flush=True,
        )
        return code or 1

    except Exception as e:
        tb = traceback.format_exc()
        print(
            json.dumps({"ok": False, "error": str(e), "traceback": tb}, ensure_ascii=False),
            flush=True,
        )
        return 1

    finally:
        # Restauramos CWD por higiene (aunque el proceso muere a continuación).
        try:
            os.chdir(original_cwd)
        except Exception:
            pass

    # --- Resolver paths de outputs --------------------------------------
    # El motor escribe con nombres derivados de STUDY_ID. Lo reconstruimos acá.
    study_id = ba_config.STUDY_ID
    out_ppt = args.output_dir / f"informe_{study_id}.pptx"
    out_xlsx_prin = args.output_dir / f"Tablas_Principal_{study_id}.xlsx"
    out_xlsx_sec = args.output_dir / f"Tablas_Secundaria_{study_id}.xlsx"
    out_log = args.output_dir / "debug_ejecucion.log"

    result = {
        "ok": True,
        "output_dir": str(args.output_dir),
        "ppt": str(out_ppt) if out_ppt.is_file() else None,
        "excel_principal": str(out_xlsx_prin) if out_xlsx_prin.is_file() else None,
        "excel_secundario": str(out_xlsx_sec) if out_xlsx_sec.is_file() else None,
        "log": str(out_log) if out_log.is_file() else None,
        "study_id": study_id,
    }

    # Línea JSON final. Rust lee la ÚLTIMA línea no vacía de stdout.
    print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
