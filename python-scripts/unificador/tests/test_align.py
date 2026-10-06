"""Tests de alineación / apilado / MRSETS (dataframes chicos)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import pandas as pd

from unificador.align import align_and_stack, collapse_case_duplicates
from unificador.pipeline import (
    _merge_meta_into_ref,
    _patch_wave_54,
    _stamp_wave_column,
    _write_mrsets_sps,
)
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
        self.assertTrue(
            any("Responseid→ResponseId" in r for r in rep.renamed_to_madre_casing)
        )

    def test_faltantes_en_parcial_son_nan(self):
        madre = pd.DataFrame({"A": [1.0], "B": [2.0], "C": [3.0]})
        parcial = pd.DataFrame({"A": [9.0]})
        stacked, rep = align_and_stack(madre, parcial)
        self.assertEqual(set(rep.cols_missing_in_parcial), {"B", "C"})
        self.assertTrue(pd.isna(stacked.loc[1, "B"]))
        self.assertEqual(stacked.loc[1, "A"], 9.0)

    def test_wave_casing_dupe_conserva_canonica(self):
        """Parcial con wave=49 (Abril) y Wave=54: gana Wave=54 y el id no se mezcla."""
        madre = pd.DataFrame(
            {
                "ResponseId": ["old1"],
                "Wave": [49.0],
                "P01_A1": [5.0],
            }
        )
        # Simula export Qpro con columna wave vieja + Wave estampada por el pipeline
        parcial = pd.DataFrame(
            {
                "ResponseId": ["232565294"],
                "wave": [49.0],  # Abril residual
                "Wave": [54.0],  # estampada
                "P01_A1": [4.0],
            }
        )
        stacked, rep = align_and_stack(
            madre, parcial, preferred_parcial={"wave": "Wave"}
        )
        self.assertEqual(list(stacked.columns).count("Wave"), 1)
        self.assertNotIn("wave", stacked.columns)
        sept = stacked[stacked["ResponseId"] == "232565294"].iloc[0]
        self.assertEqual(sept["Wave"], 54.0)
        self.assertEqual(sept["P01_A1"], 4.0)
        # Fila madre intacta
        self.assertEqual(stacked.loc[0, "Wave"], 49.0)
        self.assertTrue(any("Wave" in c for c in rep.collapsed_case_dupes))

    def test_p01_casing_dupe_gana_recodificada(self):
        """Colisión P01_a1 (crudo) vs P01_A1 (recodificado): gana la canónica."""
        madre = pd.DataFrame({"P01_A1": [1.0, 2.0], "Wave": [1.0, 2.0]})
        parcial = pd.DataFrame(
            {
                "P01_a1": [1.0],  # código crudo Qpro
                "P01_A1": [5.0],  # invertido por script 1
                "Wave": [54.0],
            }
        )
        stacked, rep = align_and_stack(
            madre, parcial, preferred_parcial={"p01_a1": "P01_A1"}
        )
        self.assertEqual(list(stacked.columns).count("P01_A1"), 1)
        self.assertNotIn("P01_a1", list(stacked.columns))
        self.assertEqual(stacked.loc[2, "P01_A1"], 5.0)
        self.assertTrue(rep.alerts)  # avisó del dupe con datos

    def test_nan_fill_no_se_corre_con_indice_raro(self):
        """Relleno de faltantes respeta posición aunque el índice no sea 0..n-1."""
        madre = pd.DataFrame({"A": [1.0], "B": [2.0]}, index=[10])
        parcial = pd.DataFrame({"A": [9.0]}, index=[99])
        stacked, _ = align_and_stack(madre, parcial)
        self.assertEqual(stacked.loc[1, "A"], 9.0)
        self.assertTrue(pd.isna(stacked.loc[1, "B"]))


class TestCollapse(unittest.TestCase):
    def test_collapse_preferido(self):
        df = pd.DataFrame({"wave": [49.0], "Wave": [54.0]})
        out, collapsed, alerts = collapse_case_duplicates(
            df, preferred={"wave": "Wave"}
        )
        self.assertEqual(list(out.columns), ["Wave"])
        self.assertEqual(out["Wave"].iloc[0], 54.0)
        self.assertTrue(alerts)
        self.assertTrue(any("Wave" in c for c in collapsed))


class TestWavePatch(unittest.TestCase):
    def test_patch_54(self):
        df = pd.DataFrame({"Wave": [54.0, 54.0]})
        meta = EngineMeta()
        _patch_wave_54(df, meta, 54)
        self.assertTrue((df["Trimestral"] == 18).all())
        self.assertNotIn("YTD", df.columns)
        self.assertEqual(meta.value_labels["Wave"][54.0], "Septiembre 2026")
        self.assertEqual(meta.value_labels["Trimestral"][18.0], "Q3 2026")

    def test_stamp_elimina_wave_minuscula(self):
        df = pd.DataFrame({"wave": [49.0], "X": [1.0]})
        _stamp_wave_column(df, 54)
        self.assertNotIn("wave", df.columns)
        self.assertEqual(df["Wave"].iloc[0], 54.0)


class TestMergeMeta(unittest.TestCase):
    def test_madre_gana_medida_nueva_toma_parcial(self):
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

    def test_labels_remapean_al_casing_madre(self):
        """Etiquetas del motor con casing distinto llegan al nombre de la madre."""

        class MadreMeta:
            column_names_to_labels = {"P01_A1": "Conocimiento YPF"}
            variable_value_labels = {"P01_A1": {1.0: "Nada", 5.0: "Mucho"}}
            original_variable_types = {}
            variable_measure = {"P01_A1": "ordinal"}

        engine = EngineMeta(
            value_labels={
                "p01_a1": {1.0: "Nada", 5.0: "Mucho", 11.0: "T2B"},
            },
        )
        merged = _merge_meta_into_ref(
            MadreMeta(), engine, final_columns=["P01_A1", "Wave"]
        )
        self.assertIn("P01_A1", merged.variable_value_labels)
        self.assertNotIn("p01_a1", merged.variable_value_labels)
        self.assertEqual(merged.variable_value_labels["P01_A1"][1.0], "Nada")
        self.assertEqual(merged.variable_value_labels["P01_A1"][11.0], "T2B")

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
