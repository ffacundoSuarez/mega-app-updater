"""Base cliente: esqueleto histórico + preguntas nuevas de la ola."""

from __future__ import annotations

import unittest

import pandas as pd

from unificador.pipeline import armar_base_cliente


class _Meta:
    """Metadata mínima, con la forma que espera el merge de labels."""

    def __init__(self) -> None:
        self.column_names: list[str] = []
        self.column_names_to_labels: dict[str, str] = {}
        self.variable_value_labels: dict[str, dict] = {}
        self.original_variable_types: dict[str, str] = {}
        self.variable_measure: dict[str, str] = {}


class TestBaseCliente(unittest.TestCase):
    def test_tira_internas_y_conserva_pregunta_nueva(self):
        """EndDate e Index_YPF se van; P99 queda; las olas viejas del cliente no se pisan."""
        columnas_madre = [
            "Wave",
            "Genero",
            "ResponseId",
            "Abierta",
            "Larga",
            "EndDate",
            "Index_YPF",
        ]
        cliente = pd.DataFrame(
            {
                "Wave": [52.0, 53.0],
                "genero": [1.0, 2.0],
                "ResponseId": ["a", "b"],
                "Abierta": ["hola", "chau"],
                "Larga": ["corto", "medio"],
            }
        )
        unificada = pd.DataFrame(
            {
                "Wave": [52.0, 53.0, 54.0, 54.0],
                "Genero": [9.0, 9.0, 1.0, 2.0],
                "ResponseId": [111.0, 222.0, 12345.0, 67890.0],
                "Abierta": ["x", "y", "nueva", "ola"],
                "Larga": ["x", "y", "z", "texto-de-dieciocho"],
                "EndDate": ["e1", "e2", "e3", "e4"],
                "Index_YPF": [1.0, 2.0, 3.0, 4.0],
                "P99": [pd.NA, pd.NA, 7.0, 8.0],
                "@Scratch": [1, 1, 1, 1],
            }
        )
        meta_cliente = _Meta()
        meta_cliente.variable_value_labels = {"Wave": {52.0: "Julio 2026"}}
        meta_cliente.original_variable_types = {
            "ResponseId": "A40",
            "Abierta": "A10",
            "Larga": "A10",
        }
        meta_uni = _Meta()
        meta_uni.variable_value_labels = {"Wave": {54.0: "Septiembre 2026"}}
        meta_uni.original_variable_types = {"Abierta": "A30", "Larga": "A12"}
        meta_uni.column_names_to_labels = {"P99": "Pregunta nueva"}

        out, nuevas, meta, alerts = armar_base_cliente(
            unificada=unificada,
            columnas_madre=columnas_madre,
            cliente=cliente,
            wave=54,
            wave_label="Wave 54",
            meta_cliente=meta_cliente,
            meta_unificada=meta_uni,
        )

        self.assertEqual(nuevas, ["P99"])
        self.assertNotIn("EndDate", out.columns)
        self.assertNotIn("Index_YPF", out.columns)
        self.assertNotIn("@Scratch", out.columns)
        self.assertIn("P99", out.columns)
        # Casing del cliente, no el de la unificada.
        self.assertIn("genero", out.columns)
        self.assertNotIn("Genero", out.columns)

        self.assertEqual(list(out["Wave"]), [52.0, 53.0, 54.0, 54.0])
        # Filas históricas intactas (la unificada tenía Genero=9 en esas olas).
        self.assertEqual(list(out["genero"].iloc[:2]), [1.0, 2.0])
        self.assertEqual(list(out["ResponseId"].iloc[:2]), ["a", "b"])
        self.assertTrue(pd.isna(out["P99"].iloc[0]))
        self.assertEqual(float(out["P99"].iloc[2]), 7.0)
        self.assertEqual(float(out["P99"].iloc[3]), 8.0)

        # ResponseId de la ola venía numérico.
        self.assertEqual(out["ResponseId"].iloc[2], "12345")
        self.assertEqual(out["ResponseId"].iloc[3], "67890")
        self.assertTrue(any("ResponseId" in a and "texto" in a for a in alerts))

        self.assertEqual(meta.variable_value_labels["Wave"][52.0], "Julio 2026")
        self.assertEqual(
            meta.variable_value_labels["Wave"][54.0], "Septiembre 2026"
        )
        # Ancho: el mayor entre los dos formatos, o el texto si no entra.
        self.assertEqual(meta.original_variable_types["Abierta"], "A30")
        self.assertEqual(meta.original_variable_types["Larga"], "A18")
        self.assertEqual(meta.column_names_to_labels["P99"], "Pregunta nueva")
