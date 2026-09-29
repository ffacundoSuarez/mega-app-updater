"""Corrida completa opt-in (madre 1.8GB). No corre en unittest por defecto.

Uso:
  set RUN_UNIFICADOR_FULL=1
  python -m unificador.tests.test_full_run
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

_INCOMING = Path(__file__).resolve().parents[2].parent / "incoming" / "unificacionBases"
_MADRE = _INCOMING / "681-YPF Monitor Institucional_unificada.sav"
_PARCIAL = _INCOMING / "681-BBDD Parcial Septiembre.sav"


@unittest.skipUnless(
    os.environ.get("RUN_UNIFICADOR_FULL") == "1" and _MADRE.exists() and _PARCIAL.exists(),
    "Set RUN_UNIFICADOR_FULL=1 para la corrida completa (varios minutos)",
)
class TestFullRun(unittest.TestCase):
    def test_unificar_septiembre(self):
        from unificador.pipeline import run_pipeline
        from unificador.sav_io import leer_metadata, leer_sav

        out_dir = Path(tempfile.mkdtemp(prefix="unificador_"))
        out_path = out_dir / "unificada_202609_w54.sav"

        stages: list[str] = []

        def progress(stage: str, msg: str) -> None:
            stages.append(stage)
            print(f"[{stage}] {msg}", flush=True)

        report = run_pipeline(
            madre_path=str(_MADRE),
            parcial_path=str(_PARCIAL),
            wave=54,
            output_path=str(out_path),
            progress=progress,
        )

        self.assertTrue(out_path.exists())
        self.assertEqual(report.rows_total, 53161)
        self.assertEqual(report.rows_wave, 232)
        self.assertGreaterEqual(report.align["cols_final"], 1891)
        self.assertTrue(Path(report.mrsets_path).exists())

        # Releer solo metadata del output (barato)
        meta, _ = leer_metadata(str(out_path))
        self.assertEqual(meta.number_rows, 53161)
        self.assertGreaterEqual(meta.number_columns, 1891)

        # Verificar conteo de Wave 54 sin cargar todo: leer solo Wave
        # (pyreadstat usecols)
        import pyreadstat

        df_w, _ = pyreadstat.read_sav(
            str(out_path), usecols=["Wave"], encoding="latin1"
        )
        self.assertEqual(int((df_w["Wave"] == 54).sum()), 232)
        # Olas 1-53 conservan 52929
        self.assertEqual(int((df_w["Wave"] < 54).sum()), 52929)
        self.assertIn("leyendo", stages)
        self.assertIn("escribiendo", stages)


if __name__ == "__main__":
    unittest.main()
