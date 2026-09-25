"""Alineación de esquema madre ↔ parcial y apilado."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class AlignReport:
    """Resumen de la alineación / apilado."""

    rows_madre: int = 0
    rows_parcial: int = 0
    rows_total: int = 0
    cols_madre: int = 0
    cols_parcial: int = 0
    cols_final: int = 0
    cols_added_to_madre: list[str] = field(default_factory=list)
    cols_missing_in_parcial: list[str] = field(default_factory=list)
    renamed_to_madre_casing: list[str] = field(default_factory=list)
    alerts: list[str] = field(default_factory=list)


def _case_map(columns: list[str]) -> dict[str, str]:
    return {c.lower(): c for c in columns}


def align_and_stack(
    madre: pd.DataFrame,
    parcial: pd.DataFrame,
) -> tuple[pd.DataFrame, AlignReport]:
    """Alinea la parcial al esquema de la madre y las apila.

    - Columnas de la madre ausentes en la parcial → NaN en la parcial.
    - Columnas nuevas de la parcial → se agregan al final (NaN en madre).
    - Se conserva el orden de columnas de la madre; las nuevas van al final.
    - Nombres se unifican al casing de la madre (Responseid → ResponseId).
    """
    report = AlignReport(
        rows_madre=len(madre),
        rows_parcial=len(parcial),
        cols_madre=len(madre.columns),
        cols_parcial=len(parcial.columns),
    )

    madre_map = _case_map(list(madre.columns))
    parcial_map = _case_map(list(parcial.columns))

    # Renombrar columnas de la parcial al casing de la madre cuando coinciden.
    rename_parcial: dict[str, str] = {}
    for low, p_name in list(parcial_map.items()):
        if low in madre_map and p_name != madre_map[low]:
            rename_parcial[p_name] = madre_map[low]
            report.renamed_to_madre_casing.append(f"{p_name}→{madre_map[low]}")
    parcial = parcial.rename(columns=rename_parcial)
    parcial_map = _case_map(list(parcial.columns))

    # Columnas de la madre que faltan en la parcial
    for col in madre.columns:
        if col.lower() not in parcial_map:
            report.cols_missing_in_parcial.append(col)

    # Columnas de la parcial que no están en la madre
    for col in parcial.columns:
        if col.lower() not in madre_map:
            report.cols_added_to_madre.append(col)

    # Orden final: columnas madre + nuevas
    final_cols = list(madre.columns) + report.cols_added_to_madre

    # Preparar madre con columnas nuevas (NaN) — dtype object para evitar
    # FutureWarning de concat con all-NA.
    madre_out = madre.copy()
    for col in report.cols_added_to_madre:
        madre_out[col] = pd.Series([np.nan] * len(madre_out), dtype="object")

    # Preparar parcial con todas las columnas de la madre
    parcial_out = parcial.copy()
    for col in report.cols_missing_in_parcial:
        # Heredar dtype de la madre si es posible
        dtype = madre[col].dtype if col in madre.columns else "object"
        try:
            parcial_out[col] = pd.Series(
                [np.nan] * len(parcial_out), dtype=dtype
            )
        except (TypeError, ValueError):
            parcial_out[col] = np.nan

    parcial_out = parcial_out.reindex(columns=final_cols)
    madre_out = madre_out.reindex(columns=final_cols)

    stacked = pd.concat([madre_out, parcial_out], axis=0, ignore_index=True, sort=False)
    report.rows_total = len(stacked)
    report.cols_final = len(stacked.columns)
    return stacked, report
