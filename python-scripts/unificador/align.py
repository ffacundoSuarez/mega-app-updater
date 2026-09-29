"""Alineación de esquema madre ↔ parcial y apilado."""

from __future__ import annotations

from collections import defaultdict
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
    collapsed_case_dupes: list[str] = field(default_factory=list)
    alerts: list[str] = field(default_factory=list)


def _case_map(columns: list[str]) -> dict[str, str]:
    return {c.lower(): c for c in columns}


def collapse_case_duplicates(
    df: pd.DataFrame,
    preferred: dict[str, str] | None = None,
) -> tuple[pd.DataFrame, list[str], list[str]]:
    """Colapsa columnas que solo difieren por mayúsculas.

    `preferred` mapea lower → nombre canónico (ej. del motor SPSS / pipeline).
    Si hay varias variantes con datos, se conserva la canónica y se alerta.
    """
    preferred = preferred or {}
    groups: dict[str, list[str]] = defaultdict(list)
    for c in df.columns:
        groups[str(c).lower()].append(str(c))

    drop: list[str] = []
    rename: dict[str, str] = {}
    collapsed: list[str] = []
    alerts: list[str] = []

    for low, names in groups.items():
        if len(names) == 1:
            # Aunque no haya dupe, alinear casing al preferred si aplica.
            pref = preferred.get(low)
            if pref is not None and names[0] != pref:
                rename[names[0]] = pref
                collapsed.append(f"{names[0]}→{pref}")
            continue

        pref = preferred.get(low)
        # Canónica: preferred exacto → preferred case-insensitive → más no-nulos
        canon = None
        if pref is not None:
            for n in names:
                if n == pref:
                    canon = n
                    break
            if canon is None:
                for n in names:
                    if n.lower() == pref.lower():
                        canon = n
                        break
        if canon is None:
            canon = max(names, key=lambda n: int(df[n].notna().sum()))

        final_name = pref if pref is not None else canon
        others = [n for n in names if n != canon]

        for o in others:
            if df[o].notna().any():
                alerts.append(
                    f"Columnas duplicadas por casing '{'/'.join(names)}': "
                    f"se conservó '{final_name}'"
                )
                break
        drop.extend(others)

        if final_name != canon:
            rename[canon] = final_name
        collapsed.append(f"{'/'.join(names)}→{final_name}")

    out = df.drop(columns=drop, errors="ignore")
    if rename:
        out = out.rename(columns=rename)
    return out, collapsed, alerts


def align_and_stack(
    madre: pd.DataFrame,
    parcial: pd.DataFrame,
    preferred_parcial: dict[str, str] | None = None,
) -> tuple[pd.DataFrame, AlignReport]:
    """Alinea la parcial al esquema de la madre y las apila.

    - Columnas de la madre ausentes en la parcial → NaN en la parcial.
    - Columnas nuevas de la parcial → se agregan al final (NaN en madre).
    - Se conserva el orden de columnas de la madre; las nuevas van al final.
    - Nombres se unifican al casing de la madre (Responseid → ResponseId).
    - Antes de apilar se colapsan duplicados que solo difieren en mayúsculas.
    """
    report = AlignReport(
        rows_madre=len(madre),
        rows_parcial=len(parcial),
        cols_madre=len(madre.columns),
        cols_parcial=len(parcial.columns),
    )

    # Colapsar duplicados por casing en ambos lados (madre suele estar limpia).
    madre, madre_collapsed, madre_alerts = collapse_case_duplicates(madre)
    parcial, parcial_collapsed, parcial_alerts = collapse_case_duplicates(
        parcial, preferred=preferred_parcial
    )
    report.collapsed_case_dupes = madre_collapsed + parcial_collapsed
    report.alerts.extend(madre_alerts)
    report.alerts.extend(parcial_alerts)

    # Índices limpios: relleno de NaN se alinea por posición, no por label.
    madre = madre.reset_index(drop=True)
    parcial = parcial.reset_index(drop=True)

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
    # FutureWarning de concat con all-NA. Index alineado al df.
    madre_out = madre.copy()
    for col in report.cols_added_to_madre:
        madre_out[col] = pd.Series(
            [np.nan] * len(madre_out), index=madre_out.index, dtype="object"
        )

    # Preparar parcial con todas las columnas de la madre
    parcial_out = parcial.copy()
    for col in report.cols_missing_in_parcial:
        dtype = madre[col].dtype if col in madre.columns else "object"
        try:
            parcial_out[col] = pd.Series(
                [np.nan] * len(parcial_out),
                index=parcial_out.index,
                dtype=dtype,
            )
        except (TypeError, ValueError):
            parcial_out[col] = np.nan

    parcial_out = parcial_out.reindex(columns=final_cols)
    madre_out = madre_out.reindex(columns=final_cols)

    stacked = pd.concat(
        [madre_out, parcial_out], axis=0, ignore_index=True, sort=False
    )
    report.rows_total = len(stacked)
    report.cols_final = len(stacked.columns)
    return stacked, report
