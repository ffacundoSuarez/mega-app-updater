"""Tests de alineación / apilado / MRSETS (dataframes chicos)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from unificador.align import align_and_stack
from unificador.pipeline import _patch_wave_54, _write_mrsets_sps
from unificador.sps_engine import EngineMeta


class TestAlign(unittest.TestCase):
    def test_orden_madre_y_columnas_nuevas(self):
        madre = pd.DataFrame(
            {"ResponseId": ["a", "b"], "Wave": [1.0, 2.0], "X": [1.0, 2.0]}
        )
        parcial = pd.DataFrame(
            {"Responseid": ["c"], "Wave": [3.0], "X": [9.0], "Nueva": [1.0]}
        )
        stacked, rep = align_and_stack(madre, parcial)
        self.assertEqual(list(stacked.columns), ["ResponseId", "Wave", "X", "Nueva"])
        self.assertEqual(len(stacked), 3)
        self.assertEqual(rep.cols_added_to_madre, ["Nueva"])
        # Filas viejas: Nueva es NaN
        self.assertTrue(pd.isna(stacked.loc[0, "Nueva"]))
        self.assertEqual(stacked.loc[2, "Nueva"], 1.0)
        # Casing unificado
        self.assertTrue(any("Responseid→ResponseId" in r for r in rep.renamed_to_madre_casing))

    def test_faltantes_en_parcial_son_nan(self):
        madre = pd.DataFrame({"A": [1.0], "B": [2.0], "C": [3.0]})
        parcial = pd.DataFrame({"A": [9.0]})
        stacked, rep = align_and_stack(madre, parcial)
        self.assertEqual(set(rep.cols_missing_in_parcial), {"B", "C"})
        self.assertTrue(pd.isna(stacked.loc[1, "B"]))
        self.assertEqual(stacked.loc[1, "A"], 9.0)


class TestWavePatch(unittest.TestCase):
    def test_patch_54(self):
        df = pd.DataFrame({"Wave": [54.0, 54.0]})
        meta = EngineMeta()
        _patch_wave_54(df, meta, 54)
        self.assertTrue((df["Trimestral"] == 18).all())
        self.assertTrue((df["YTD"] == 5).all())
        self.assertEqual(meta.value_labels["Wave"][54.0], "Septiembre 2026")


class TestMergeMeta(unittest.TestCase):
    def test_madre_gana_medida_nueva_toma_parcial(self):
        from unificador.pipeline import _merge_meta_into_ref

        class MadreMeta:
            column_names_to_labels = {"F1": "Género madre", "Nueva": None}
            variable_value_labels = {"F1": {1.0: "M", 2.0: "F"}}
            original_variable_types = {"F1": "F8.0"}
            variable_measure = {"F1": "nominal"}

        engine = EngineMeta(
            column_labels={"Nueva": "Pregunta nueva"},
            value_labels={
                "F1": {1.0: "Masculino parcial", 3.0: "Otro"},
                "Nueva": {1.0: "Sí", 2.0: "No"},
                "Wave": {54.0: "Septiembre 2026"},
            },
            measures={"F1": "ordinal", "Nueva": "nominal"},
        )
        merged = _merge_meta_into_ref(MadreMeta(), engine)
        self.assertEqual(merged.variable_measure["F1"], "nominal")  # madre gana
        self.assertEqual(merged.variable_measure["Nueva"], "nominal")  # parcial
        self.assertEqual(merged.variable_value_labels["F1"][1.0], "M")  # madre
        self.assertIn(3.0, merged.variable_value_labels["F1"])  # clave nueva
        self.assertEqual(merged.variable_value_labels["Nueva"][1.0], "Sí")
        self.assertEqual(
            merged.variable_value_labels["Wave"][54.0], "Septiembre 2026"
        )

    def test_rename_arrastra_medida_y_value_labels(self):
        from unificador.sps_engine import SpsEngine

        class SavMeta:
            column_names_to_labels = {"F1": "Género:"}
            variable_value_labels = {"F1": {1.0: "M", 2.0: "F"}}
            original_variable_types = {"F1": "F8.0"}
            variable_measure = {"F1": "nominal"}

        df = pd.DataFrame({"F1": [1.0, 2.0]})
        eng = SpsEngine(df, meta=EngineMeta.from_sav_meta(SavMeta()))
        eng.run_source("RENAME VARIABLES F1 = Genero.")
        self.assertEqual(eng.meta.measures.get("Genero"), "nominal")
        self.assertNotIn("F1", eng.meta.measures)
        self.assertEqual(eng.meta.value_labels["Genero"][1.0], "M")


class TestMrsets(unittest.TestCase):
    def test_escribe_sps(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "out.mrsets.sps"
            _write_mrsets_sps(
                path,
                [
                    "MRSETS /MDGROUP NAME=$P125 VARIABLES=P125_1 P125_2 VALUE=1.",
                    "MRSETS /MCGROUP NAME=$P110 VARIABLES=P110_1.",
                ],
            )
            text = path.read_text(encoding="utf-8")
            self.assertIn("NAME=$P125", text)
            self.assertIn("NAME=$P110", text)


if __name__ == "__main__":
    unittest.main()
