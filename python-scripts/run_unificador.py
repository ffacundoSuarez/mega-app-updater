"""
Runner del Unificador de Olas desde el backend Rust de Mega App.

Contrato:
  stdout: líneas JSON. La ÚLTIMA es el resultado final.
  stderr: logs libres.
  exit code: 0 = ok.

Args:
  --madre PATH
  --parcial PATH
  --wave INT
  --output PATH          (archivo .sav de salida; no pisa la madre)
  --sps1 PATH            (opcional)
  --sps2 PATH            (opcional)
  --preview-only         (solo metadata de la madre + sugerencia de wave)
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Asegurar que python-scripts/ esté en el path (sidecar y tests).
_SCRIPTS_ROOT = Path(__file__).resolve().parent
if str(_SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_ROOT))


def emit_progress(stage: str, message: str = "") -> None:
    try:
        print(
            json.dumps(
                {"type": "progress", "stage": stage, "message": message},
                ensure_ascii=False,
            ),
            flush=True,
        )
    except Exception:
        pass


def emit_result(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Unificador de Olas SPSS")
    p.add_argument("--madre", type=Path, default=None)
    p.add_argument("--parcial", type=Path, default=None)
    p.add_argument("--wave", type=int, default=None)
    p.add_argument("--output", type=Path, default=None)
    p.add_argument("--sps1", type=Path, default=None)
    p.add_argument("--sps2", type=Path, default=None)
    p.add_argument("--preview-only", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    try:
        from unificador.pipeline import report_to_dict, run_pipeline, suggest_next_wave
        from unificador.sav_io import leer_metadata

        if args.preview_only:
            if not args.madre:
                emit_result({"ok": False, "error": "Falta --madre para preview"})
                return 1
            info = suggest_next_wave(str(args.madre))
            parcial_info = None
            if args.parcial and args.parcial.exists():
                meta_p, enc_p = leer_metadata(str(args.parcial))
                parcial_info = {
                    "rows": meta_p.number_rows,
                    "columns": meta_p.number_columns,
                    "encoding": enc_p,
                }
            emit_result({"ok": True, "preview": True, "madre": info, "parcial": parcial_info})
            return 0

        if not args.madre or not args.parcial or args.wave is None or not args.output:
            emit_result(
                {
                    "ok": False,
                    "error": "Faltan argumentos: --madre --parcial --wave --output",
                }
            )
            return 1

        if not args.madre.exists():
            emit_result({"ok": False, "error": f"No existe la madre: {args.madre}"})
            return 1
        if not args.parcial.exists():
            emit_result({"ok": False, "error": f"No existe la parcial: {args.parcial}"})
            return 1
        # Nunca pisar la madre
        if args.output.resolve() == args.madre.resolve():
            emit_result(
                {
                    "ok": False,
                    "error": "El archivo de salida no puede ser la misma madre de entrada",
                }
            )
            return 1

        report = run_pipeline(
            madre_path=str(args.madre),
            parcial_path=str(args.parcial),
            wave=int(args.wave),
            output_path=str(args.output),
            sps1=str(args.sps1) if args.sps1 else None,
            sps2=str(args.sps2) if args.sps2 else None,
            progress=emit_progress,
        )
        payload = report_to_dict(report)
        payload["ok"] = True
        emit_result(payload)
        return 0
    except Exception as e:
        emit_result(
            {
                "ok": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
            }
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
