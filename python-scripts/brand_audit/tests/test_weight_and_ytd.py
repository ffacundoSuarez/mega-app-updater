"""Tests de ponderación y banner YTD mensual, sin abrir .sav ni armar PPT."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

import pandas as pd

from brand_audit import utils
from brand_audit.tabulation_engine import TabulationEngine


def _meta_stub(value_labels: dict | None = None) -> SimpleNamespace:
    """Metadata mínima compatible con TabulationEngine / prepare_banner_info."""
    return SimpleNamespace(
        variable_value_labels=value_labels or {},
        column_names=[],
        column_names_to_labels={},
        variable_to_label={},
        value_labels={},
    )


def _banner_total_only(df: pd.DataFrame) -> dict:
    info, _ = utils.prepare_banner_info(df, [], {})
    return info


class TestEnsureWeightColumn(unittest.TestCase):
    def test_renombra_ponderacion_case_insensitive(self):
        df = pd.DataFrame({"Ponderacion": [1.0, 2.0], "Wave": [1, 1]})
        out = utils.ensure_weight_column(df, var_peso="ponderacion", require=True)
        self.assertIn("ponderacion", out.columns)
        self.assertNotIn("Ponderacion", out.columns)
        self.assertEqual(list(out["ponderacion"]), [1.0, 2.0])

    def test_falla_si_no_hay_columna_de_peso(self):
        df = pd.DataFrame({"Wave": [1, 2]})
        with self.assertRaises(ValueError) as ctx:
            utils.ensure_weight_column(df, var_peso="ponderacion", require=True)
        self.assertIn("ponderacion", str(ctx.exception).lower())

    def test_nan_se_rellena_con_uno(self):
        df = pd.DataFrame({"ponderacion": [1.5, None]})
        out = utils.ensure_weight_column(df, require=True)
        self.assertEqual(out["ponderacion"].iloc[1], 1.0)


class TestResolveYtdBannerVar(unittest.TestCase):
    def test_encuentra_ytd_septiembre(self):
        df = pd.DataFrame({"YTD_SEPTIEMBRE": [5, 5], "Wave": [54, 54]})
        col = utils.resolve_ytd_banner_var(df, "YTD_SEPTIEMBRE")
        self.assertEqual(col, "YTD_SEPTIEMBRE")

    def test_encuentra_sin_importar_mayusculas(self):
        df = pd.DataFrame({"ytd_agosto": [5], "Wave": [53]})
        col = utils.resolve_ytd_banner_var(df, "YTD_AGOSTO")
        self.assertEqual(col, "ytd_agosto")

    def test_falla_si_falta_la_variable_del_mes(self):
        df = pd.DataFrame({"YTD_AGOSTO": [5], "Wave": [53]})
        with self.assertRaises(ValueError) as ctx:
            utils.resolve_ytd_banner_var(df, "YTD_SEPTIEMBRE")
        msg = str(ctx.exception)
        self.assertIn("YTD_SEPTIEMBRE", msg)
        self.assertIn("unificación", msg.lower())

    def test_falla_si_ytd_var_vacia(self):
        df = pd.DataFrame({"YTD_AGOSTO": [5]})
        with self.assertRaises(ValueError):
            utils.resolve_ytd_banner_var(df, "")


class TestBannerYtdMensual(unittest.TestCase):
    """El banner histórico usa la columna del mes, no un recode de Wave."""

    def _df_hist(self) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "Wave": [46, 47, 53, 54],
                "YTD_AGOSTO": [5, 5, 5, 5],
                "YTD_SEPTIEMBRE": [5, 5, 5, 5],
                "ponderacion": [1.0, 1.0, 1.0, 1.0],
                "P01": [1, 2, 1, 2],
            }
        )

    def test_septiembre_usa_ytd_septiembre(self):
        df = self._df_hist()
        col = utils.resolve_ytd_banner_var(df, "YTD_SEPTIEMBRE")
        self.assertEqual(col, "YTD_SEPTIEMBRE")
        self.assertNotEqual(col, "YTD_AGOSTO")
        labels = {5.0: "YTD 2026"}
        banner, _ = utils.prepare_banner_info(df, [col], {"YTD_SEPTIEMBRE": labels})
        # El banner debe segmentar por la variable del mes, no por Wave.
        self.assertTrue(
            any("YTD" in str(k) or k == col for k in banner.get("segment_keys", {}).keys())
            or col in str(banner),
        )
        # segment_keys: claves TOTAL + segmentos de la var YTD
        segs = banner.get("segment_keys", {})
        self.assertIn("TOTAL", segs)

    def test_agosto_usa_ytd_agosto(self):
        df = self._df_hist()
        col = utils.resolve_ytd_banner_var(df, "YTD_AGOSTO")
        self.assertEqual(col, "YTD_AGOSTO")


class TestTabulacionPonderada(unittest.TestCase):
    """SRQ con pesos ≠ 1 debe dar % ponderados, no el conteo de casos."""

    def test_srq_porcentaje_ponderado(self):
        # 2 casos en cat 1 (peso 1) + 2 casos en cat 2 (peso 3)
        # Sin ponderar: 50/50. Con ponderar: 2/8=25% y 6/8=75%.
        df = pd.DataFrame(
            {
                "P01": [1.0, 1.0, 2.0, 2.0],
                "ponderacion": [1.0, 1.0, 3.0, 3.0],
                "TOTAL": [1, 1, 1, 1],
            }
        )
        labels = {1.0: "Si", 2.0: "No"}
        meta = _meta_stub({"P01": labels})
        banner = _banner_total_only(df)
        engine = TabulationEngine(df, meta, banner)
        tab = engine.tabulate_srq("P01", skip_sig=True)
        self.assertIsNotNone(tab)
        pct = tab["percentages"]
        total_col = [c for c in pct.columns if "total" in str(c).lower()]
        self.assertTrue(total_col, f"columnas: {list(pct.columns)}")
        col = total_col[0]

        def pct_of(label: str) -> float:
            if label in pct.index:
                return float(pct.loc[label, col])
            for idx in pct.index:
                if str(idx).strip().lower() == label.lower():
                    return float(pct.loc[idx, col])
            self.fail(f"No está '{label}' en {list(pct.index)}")

        self.assertAlmostEqual(pct_of("Si"), 25.0, places=1)
        self.assertAlmostEqual(pct_of("No"), 75.0, places=1)


if __name__ == "__main__":
    unittest.main()
