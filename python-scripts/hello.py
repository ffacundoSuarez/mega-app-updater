"""Script de prueba del sidecar Python de Mega App.

Se ejecuta desde Rust para verificar en Fase 2 que:
  - El runtime de Python embebido arranca correctamente.
  - Las dependencias instaladas (openpyxl, python-pptx) son importables.
  - El protocolo "respuesta JSON por stdout" funciona end-to-end.

Uso (lo llama Rust, no el usuario):
    python-runtime/python.exe python-scripts/hello.py [nombre_opcional]
"""

import json
import platform
import sys
from datetime import datetime, timezone


def _check_dependency(module_name: str) -> dict:
    """Importa un módulo opcional y devuelve info sobre su disponibilidad."""
    try:
        module = __import__(module_name)
        version = getattr(module, "__version__", "desconocida")
        return {"name": module_name, "ok": True, "version": version}
    except ImportError as exc:
        return {"name": module_name, "ok": False, "error": str(exc)}


def main() -> int:
    # Argumento opcional: nombre a saludar (default "mundo").
    name = sys.argv[1] if len(sys.argv) > 1 else "mundo"

    payload = {
        "ok": True,
        "message": f"Hola, {name}! Desde el sidecar Python.",
        "python": {
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
            "executable": sys.executable,
        },
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
        },
        "dependencies": [
            _check_dependency("openpyxl"),
            _check_dependency("pptx"),
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Contrato con Rust: una sola línea JSON por stdout.
    # Los errores internos del script se reportarían por stderr.
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
