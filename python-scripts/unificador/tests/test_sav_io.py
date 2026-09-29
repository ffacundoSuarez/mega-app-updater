"""Tests de sav_io: roundtrip chico + lectura de la parcial real."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import pandas as pd

from unificador.sav_io import (
    escribir_sav,
    fix_mojibake,
    leer_metadata,
    leer_sav,
    optimizar_tipos,
)

# Paths de insumos de referencia (solo lectura; no se modifican).
_INCOMING = Path(__file__).resolve().parents[2].parent / "incoming" / "unificacionBases"
_PARCIAL = _INCOMING / "681-BBDD Parcial Septiembre.sav"


class TestOptimizarTipos(unittest.TestCase):
    def test_enteros_disfrazados_bajan_a_int(self):
        df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [1.5, 2.5, None]})
        out = optimizar_tipos(df.copy())
        self.assertTrue(str(out["a"].dtype).startswith("Int"))
        self.assertEqual(out["b"].dtype, "float32")


class TestMojibake(unittest.TestCase):
    def test_repara_utf8_leido_como_latin1(self):
        broken = "Latitud de la ubicaci\xc3\xb3n"
        self.assertEqual(fix_mojibake(broken), "Latitud de la ubicación")

    def test_deja_texto_ya_correcto(self):
        ok = "Latitud de la ubicación"
        self.assertEqual(fix_mojibake(ok), ok)

    def test_none_queda_none(self):
        self.assertIsNone(fix_mojibake(None))


class TestRoundtrip(unittest.TestCase):
    def test_roundtrip_con_value_labels_float(self):
        df = pd.DataFrame(
            {
                "id": ["a", "b", "c"],
                "sexo": [1.0, 2.0, 1.0],
                "nota": [7.5, 8.0, None],
            }
        )

        class Meta:
            column_names_to_labels = {"id": "Identificador", "sexo": "Sexo"}
            variable_value_labels = {"sexo": {1.0: "Masc", 2.0: "Fem"}}
            original_variable_types = {"sexo": "F8.0", "nota": "F8.2"}
            variable_measure = {"sexo": "nominal", "nota": "scale"}

        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "toy.sav")
            escribir_sav(df, path, meta_ref=Meta())
            df2, meta, enc = leer_sav(path, optimizar=False)
            self.assertEqual(len(df2), 3)
            self.assertIn("sexo", df2.columns)
            self.assertIn(enc, ("auto", "UTF-8", "WINDOWS-1252", "latin1"))
            labels = meta.variable_value_labels.get("sexo", {})
            self.assertTrue(any("Masc" in str(v) for v in labels.values()))
            self.assertEqual((meta.variable_measure or {}).get("sexo"), "nominal")
            self.assertEqual((meta.variable_measure or {}).get("nota"), "scale")

    def test_repara_etiquetas_mojibake_al_escribir(self):
        df = pd.DataFrame({"lat": [1.0, 2.0]})

        class Meta:
            column_names_to_labels = {"lat": "Latitud de la ubicaci\xc3\xb3n"}
            variable_value_labels = {"lat": {1.0: "Norte", 2.0: "Sur"}}
            original_variable_types = {"lat": "F8.2"}
            variable_measure = {"lat": "scale"}

        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "moji.sav")
            escribir_sav(df, path, meta_ref=Meta())
            _, meta, _ = leer_sav(path, optimizar=False)
            lab = (meta.column_names_to_labels or {}).get("lat", "")
            self.assertIn("ubicación", lab)
            self.assertNotIn("Ã", lab)

    def test_value_label_corrupto_no_borra_los_demas(self):
        """Una variable con VL inválidos no debe tirar todos los value labels."""
        df = pd.DataFrame(
            {
                "sexo": [1.0, 2.0],
                "basura": ["a", "b"],
            }
        )

        class Meta:
            column_names_to_labels = {
                "sexo": "G\xc3\xa9nero:",
                "basura": "Texto",
            }
            variable_value_labels = {
                "sexo": {1.0: "Masculino", 2.0: "Femenino"},
                # Claves no numéricas (como P08A en la madre): se omiten.
                "basura": {
                    "0       xx": "AnswerCode",
                    "NA      yy": "N/A",
                },
            }
            original_variable_types = {"sexo": "F8.0", "basura": "A8"}
            variable_measure = {"sexo": "nominal", "basura": "nominal"}

        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "vl.sav")
            escribir_sav(df, path, meta_ref=Meta())
            _, meta, _ = leer_sav(path, optimizar=False)
            sexo_vl = meta.variable_value_labels.get("sexo", {})
            self.assertTrue(any("Masculino" in str(v) for v in sexo_vl.values()))
            self.assertEqual((meta.variable_measure or {}).get("sexo"), "nominal")
            lab = (meta.column_names_to_labels or {}).get("sexo", "")
            self.assertIn("énero", lab)

    def test_metadata_only_es_rapido(self):
        df = pd.DataFrame({"x": [1.0, 2.0]})
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "m.sav")
            escribir_sav(df, path)
            meta, enc = leer_metadata(path)
            self.assertEqual(meta.number_rows, 2)
            self.assertEqual(meta.number_columns, 1)


@unittest.skipUnless(_PARCIAL.exists(), "parcial de referencia no disponible")
class TestParcialReal(unittest.TestCase):
    def test_leer_parcial_septiembre(self):
        df, meta, enc = leer_sav(str(_PARCIAL), optimizar=True)
        self.assertEqual(len(df), 232)
        self.assertEqual(meta.number_columns, 819)
        self.assertIn("Response_ID", df.columns)
        self.assertNotIn("Wave", df.columns)
        self.assertIsInstance(enc, str)


if __name__ == "__main__":
    unittest.main()
