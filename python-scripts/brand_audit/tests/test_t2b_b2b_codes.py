"""Clasificación T2B/B2B por etiqueta (excluye NS/NC y 'ni…ni')."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

import pandas as pd

from brand_audit import utils
from brand_audit.tabulation_engine import TabulationEngine


def _meta_stub(value_labels: dict) -> SimpleNamespace:
    return SimpleNamespace(
        variable_value_labels=value_labels,
        column_names=[],
        column_names_to_labels={},
        variable_to_label={},
        value_labels={},
    )


class TestResolveT2bB2bCodes(unittest.TestCase):
    """Casos con las etiquetas reales de P146 / P107."""

    def test_p146_no_sabe_al_final_no_entra_al_t2b(self):
        labels = {
            1.0: "Muy Mala",
            2.0: "Mala",
            3.0: "Buena",
            4.0: "Muy buena",
            5.0: "No sabe o no contesta",
        }
        t2b, b2b = utils.resolve_t2b_b2b_codes(labels, "P146")
        self.assertEqual(sorted(t2b), [3.0, 4.0])
        self.assertEqual(sorted(b2b), [1.0, 2.0])
        self.assertNotIn(5.0, t2b)
        self.assertNotIn(5.0, b2b)

    def test_p107_ni_y_no_sabe_fuera_del_box(self):
        labels = {
            1.0: "Muy mala",
            2.0: "Algo mala",
            3.0: "Ni buena ni mala",
            4.0: "Algo buena",
            5.0: "Muy buena",
            6.0: "No sabe",
        }
        t2b, b2b = utils.resolve_t2b_b2b_codes(labels, "P107")
        self.assertEqual(sorted(t2b), [4.0, 5.0])
        self.assertEqual(sorted(b2b), [1.0, 2.0])
        self.assertNotIn(3.0, t2b + b2b)
        self.assertNotIn(6.0, t2b + b2b)

    def test_escala_invertida_1_es_muy_buena(self):
        labels = {
            1.0: "Muy buena",
            2.0: "Algo buena",
            3.0: "Ni buena ni mala",
            4.0: "Algo mala",
            5.0: "Muy mala",
        }
        t2b, b2b = utils.resolve_t2b_b2b_codes(labels, "P107_inv")
        self.assertEqual(sorted(t2b), [1.0, 2.0])
        self.assertEqual(sorted(b2b), [4.0, 5.0])

    def test_acuerdo_desacuerdo(self):
        labels = {
            1.0: "Muy en desacuerdo",
            2.0: "Algo en desacuerdo",
            3.0: "Ni de acuerdo ni en desacuerdo",
            4.0: "Algo de acuerdo",
            5.0: "Muy de acuerdo",
        }
        t2b, b2b = utils.resolve_t2b_b2b_codes(labels, "P142")
        self.assertEqual(sorted(t2b), [4.0, 5.0])
        self.assertEqual(sorted(b2b), [1.0, 2.0])

    def test_is_non_evaluative(self):
        self.assertTrue(utils.is_non_evaluative_label("No sabe o no contesta"))
        self.assertTrue(utils.is_non_evaluative_label("Ni buena ni mala"))
        self.assertTrue(utils.is_non_evaluative_label("Ns/Nc"))
        self.assertFalse(utils.is_non_evaluative_label("Buena"))
        self.assertFalse(utils.is_non_evaluative_label("Muy mala"))


class TestTabulateSrqBoxes(unittest.TestCase):
    """Integra resolve_t2b_b2b_codes con tabulate_srq (TOTAL de P146)."""

    def test_p146_totales_coinciden_con_buena_mas_muy_buena(self):
        # Distribución alineada a la tabla: Buena 44, Muy buena 32, NS 13, …
        # Usamos pesos unitarios y conteos exactos para evitar redondeo opaco.
        rows = (
            [1.0] * 5   # Muy Mala ~5%
            + [2.0] * 7  # Mala ~7%
            + [3.0] * 44 # Buena
            + [4.0] * 32 # Muy buena
            + [5.0] * 12 # No sabe (12 para cerrar en 100)
        )
        df = pd.DataFrame({
            "P146": rows,
            "ponderacion": [1.0] * len(rows),
            "TOTAL": [1] * len(rows),
        })
        labels = {
            "P146": {
                1.0: "Muy Mala",
                2.0: "Mala",
                3.0: "Buena",
                4.0: "Muy buena",
                5.0: "No sabe o no contesta",
            }
        }
        meta = _meta_stub(labels)
        banner, _ = utils.prepare_banner_info(df, [], {})
        engine = TabulationEngine(df, meta, banner)
        res = engine.tabulate_srq("P146", skip_sig=True)
        self.assertIsNotNone(res)
        pct = res["percentages"]["TOTAL"]
        self.assertAlmostEqual(float(pct["T2B"]), 76.0, places=1)
        self.assertAlmostEqual(float(pct["B2B"]), 12.0, places=1)
        # NS queda fuera del T2B
        self.assertAlmostEqual(float(pct["No sabe o no contesta"]), 12.0, places=1)


if __name__ == "__main__":
    unittest.main()
