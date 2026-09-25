"""Pipeline: estandarizar parcial → derivar → alinear → apilar → escribir."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd

from unificador.align import AlignReport, align_and_stack
from unificador.sav_io import escribir_sav, leer_metadata, leer_sav
from unificador.sps_engine import EngineMeta, SpsEngine

ProgressCb = Callable[[str, str], None]

# Extensiones de ola que el Script 2 todavía no cubre (Wave 54+).
_WAVE_LABELS_EXTRA = {
    54: "Septiembre 2026",
}
# Trimestral: Wave 52-53 = 18 (Q3 2026). Wave 54 sigue en 18.
_TRIMESTRAL_EXTRA = {
    54: 18,
}
# YTD: el script deja Wave 53 fuera; Wave 54 entra en YTD 2026 (=5).
_YTD_EXTRA = {
    54: 5,
}


@dataclass
class PipelineReport:
    ok: bool = True
    wave: int = 0
    wave_label: str = ""
    encoding_madre: str = ""
    encoding_parcial: str = ""
    align: dict[str, Any] = field(default_factory=dict)
    alerts: list[str] = field(default_factory=list)
    empty_derived: list[str] = field(default_factory=list)
    output_path: str = ""
    mrsets_path: str = ""
    rows_total: int = 0
    rows_wave: int = 0


def _pkg_sps_dir() -> Path:
    return Path(__file__).resolve().parent / "sps"


def default_sps_paths() -> tuple[Path, Path]:
    d = _pkg_sps_dir()
    return d / "01_renombra_variables.sps", d / "02_arma_variables.sps"


def suggest_next_wave(madre_path: str) -> dict[str, Any]:
    """Lee solo metadata/columna Wave de la madre y sugiere la siguiente ola."""
    meta, enc = leer_metadata(madre_path)
    labels = (meta.variable_value_labels or {}).get("Wave") or {}
    max_wave = 0
    if labels:
        max_wave = int(max(float(k) for k in labels.keys()))
    next_wave = max_wave + 1 if max_wave else 1
    label = _WAVE_LABELS_EXTRA.get(next_wave, f"Wave {next_wave}")
    # Si la madre tiene label para next_wave (no debería), usarlo
    for k, v in labels.items():
        if int(float(k)) == next_wave:
            label = v
            break
    return {
        "encoding": enc,
        "rows": meta.number_rows,
        "columns": meta.number_columns,
        "max_wave": max_wave,
        "suggested_wave": next_wave,
        "suggested_label": label,
        "wave_labels": {int(float(k)): v for k, v in labels.items()},
    }


def _patch_wave_54(df: pd.DataFrame, meta: EngineMeta, wave: int) -> None:
    """Completa labels / Trimestral / YTD solo para la ola nueva."""
    if "Wave" not in df.columns:
        df["Wave"] = float(wave)
    else:
        df["Wave"] = float(wave)

    label = _WAVE_LABELS_EXTRA.get(wave, f"Wave {wave}")
    meta.value_labels.setdefault("Wave", {})
    meta.value_labels["Wave"][float(wave)] = label

    if wave in _TRIMESTRAL_EXTRA:
        tri = float(_TRIMESTRAL_EXTRA[wave])
        if "Trimestral" not in df.columns:
            df["Trimestral"] = np.nan
        df.loc[df["Wave"] == float(wave), "Trimestral"] = tri
        meta.value_labels.setdefault("Trimestral", {})
        meta.value_labels["Trimestral"].setdefault(tri, "Q3 2026-proceso")

    if wave in _YTD_EXTRA:
        ytd = float(_YTD_EXTRA[wave])
        if "YTD" not in df.columns:
            df["YTD"] = np.nan
        df.loc[df["Wave"] == float(wave), "YTD"] = ytd
        meta.value_labels.setdefault("YTD", {})
        meta.value_labels["YTD"].setdefault(ytd, "YTD 2026")


def _vl_has_key(store: dict, k: Any) -> bool:
    """True si el diccionario de value labels ya tiene la clave (int/float equivalentes)."""
    if k in store:
        return True
    try:
        fk = float(k)
    except (TypeError, ValueError):
        return False
    if fk in store:
        return True
    if fk == int(fk) and int(fk) in store:
        return True
    return False


def _merge_meta_into_ref(meta_ref: Any, engine_meta: EngineMeta) -> Any:
    """Fusiona labels del motor sobre la metadata de la madre.

    Medidas y value labels: la madre gana en variables que ya tenía;
    las variables nuevas toman lo de la parcial (vía engine_meta).
    Claves nuevas de value labels (ej. Wave 54) se agregan sin pisar las viejas.
    """

    class MergedMeta:
        pass

    m = MergedMeta()
    base_labels = dict(getattr(meta_ref, "column_names_to_labels", None) or {})
    base_labels.update(engine_meta.column_labels)
    m.column_names_to_labels = base_labels

    madre_vl = getattr(meta_ref, "variable_value_labels", None) or {}
    base_vl: dict[str, dict] = {c: dict(vl) for c, vl in madre_vl.items() if vl}
    for c, vl in engine_meta.value_labels.items():
        if c not in base_vl:
            base_vl[c] = dict(vl)
            continue
        store = base_vl[c]
        for k, v in vl.items():
            if not _vl_has_key(store, k):
                try:
                    store[float(k)] = v
                except (TypeError, ValueError):
                    store[k] = v
    m.variable_value_labels = base_vl

    base_fmt = dict(getattr(meta_ref, "original_variable_types", None) or {})
    base_fmt.update(engine_meta.formats)
    m.original_variable_types = base_fmt

    madre_meas = {
        c: str(v).lower()
        for c, v in (getattr(meta_ref, "variable_measure", None) or {}).items()
        if v and str(v).lower() != "unknown"
    }
    for c, meas in engine_meta.measures.items():
        madre_meas.setdefault(c, meas)
    m.variable_measure = madre_meas
    return m


def _write_mrsets_sps(path: Path, mrsets: list[str]) -> None:
    lines = [
        "* MRSETS re-inyectados por Unificador de Olas.",
        "* Correr este syntax sobre el .sav unificado en SPSS.",
        "",
    ]
    lines.extend(mrsets)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _empty_derived(df: pd.DataFrame, candidates: list[str]) -> list[str]:
    empty = []
    for c in candidates:
        if c in df.columns and df[c].notna().sum() == 0:
            empty.append(c)
    return empty


def run_pipeline(
    madre_path: str,
    parcial_path: str,
    wave: int,
    output_path: str,
    sps1: str | None = None,
    sps2: str | None = None,
    progress: ProgressCb | None = None,
) -> PipelineReport:
    """Ejecuta el pipeline completo. No pisa la madre."""

    def emit(stage: str, msg: str = "") -> None:
        if progress:
            progress(stage, msg)

    d1, d2 = default_sps_paths()
    sps1_path = Path(sps1) if sps1 else d1
    sps2_path = Path(sps2) if sps2 else d2

    report = PipelineReport(wave=wave, wave_label=_WAVE_LABELS_EXTRA.get(wave, f"Wave {wave}"))

    # Leer parcial y madre en paralelo
    emit("leyendo", "Leyendo base parcial…")
    parcial_holder: dict[str, Any] = {}
    madre_holder: dict[str, Any] = {}

    def _read_parcial() -> None:
        df, meta, enc = leer_sav(parcial_path, optimizar=True)
        parcial_holder.update(df=df, meta=meta, enc=enc)

    def _read_madre() -> None:
        emit("leyendo_madre", "Leyendo la base madre, puede tardar varios minutos…")
        df, meta, enc = leer_sav(madre_path, optimizar=True)
        madre_holder.update(df=df, meta=meta, enc=enc)

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_p = pool.submit(_read_parcial)
        f_m = pool.submit(_read_madre)
        f_p.result()
        # Mientras la madre sigue, ya podemos transformar la parcial
        emit("estandarizando", "Estandarizando parcial (Script 1)…")
        eng = SpsEngine(
            parcial_holder["df"],
            meta=EngineMeta.from_sav_meta(parcial_holder["meta"]),
        )
        eng.run_file(str(sps1_path))

        emit("derivando", f"Asignando Wave {wave} y derivadas (Script 2)…")
        eng.df["Wave"] = float(wave)
        eng._cols["wave"] = "Wave"
        eng.run_file(str(sps2_path))
        _patch_wave_54(eng.df, eng.meta, wave)

        f_m.result()

    report.encoding_parcial = parcial_holder["enc"]
    report.encoding_madre = madre_holder["enc"]
    report.alerts.extend(eng.meta.alerts)

    emit("apilando", "Alineando columnas y apilando…")
    stacked, align_rep = align_and_stack(madre_holder["df"], eng.df)
    report.align = asdict(align_rep)
    report.rows_total = align_rep.rows_total
    report.rows_wave = int((stacked["Wave"] == float(wave)).sum()) if "Wave" in stacked.columns else 0
    report.alerts.extend(align_rep.alerts)

    # Alertas de derivadas vacías en la ola nueva
    derived_candidates = [
        "Genero", "Edad", "Edad2", "Region", "Region2", "NSE",
        "Aprobacion", "Auto", "Vinculo", "Trimestral", "YTD",
    ]
    wave_mask = stacked["Wave"] == float(wave) if "Wave" in stacked.columns else slice(None)
    wave_df = stacked.loc[wave_mask]
    report.empty_derived = _empty_derived(wave_df, derived_candidates)
    for c in report.empty_derived:
        report.alerts.append(f"Variable derivada '{c}' quedó 100% vacía en la ola {wave}")

    emit("escribiendo", "Escribiendo .sav unificado…")
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    # Variables scratch de SPSS (@…) no son legales en .sav vía pyreadstat.
    scratch = [c for c in stacked.columns if str(c).startswith("@")]
    if scratch:
        stacked = stacked.drop(columns=scratch)
        report.alerts.append(
            f"Se omitieron variables scratch al escribir: {', '.join(scratch)}"
        )
    merged_meta = _merge_meta_into_ref(madre_holder["meta"], eng.meta)
    escribir_sav(stacked, str(out), meta_ref=merged_meta)
    report.output_path = str(out.resolve())

    mrsets_path = out.with_suffix(".mrsets.sps")
    _write_mrsets_sps(mrsets_path, eng.meta.mrsets)
    report.mrsets_path = str(mrsets_path.resolve())

    emit("listo", f"Listo: {report.rows_total} filas")
    return report


def report_to_dict(report: PipelineReport) -> dict[str, Any]:
    return asdict(report)
