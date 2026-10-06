"""Pipeline: estandarizar parcial → derivar → alinear → apilar → escribir.

Si se pasa una base cliente, después de escribir la unificada interna se arma
una segunda salida: la ola actual apilada sobre el esqueleto de esa base.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
import pyreadstat

from unificador.align import align_and_stack, collapse_case_duplicates
from unificador.sav_io import escribir_sav, leer_metadata, leer_sav
from unificador.sps_engine import EngineMeta, SpsEngine

ProgressCb = Callable[[str, str], None]

# Respaldo si el Script 2 no dejó el label de una ola nueva.
_WAVE_LABELS_EXTRA = {
    54: "Septiembre 2026",
}
# Trimestral: el script mapea Wave 52-54 a 18 (Q3 2026). El parche lo refuerza.
_TRIMESTRAL_EXTRA = {
    54: 18,
}
_TRIMESTRAL_LABEL = "Q3 2026"


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
    # Segunda salida, solo si se cargó la base histórica de cliente.
    client_output_path: str = ""
    client_rows_total: int = 0
    client_new_columns: list[str] = field(default_factory=list)


def _pkg_sps_dir() -> Path:
    return Path(__file__).resolve().parent / "sps"


def default_sps_paths() -> tuple[Path, Path]:
    d = _pkg_sps_dir()
    return d / "01_renombra_variables.sps", d / "02_arma_variables.sps"


def _max_wave_en_datos(path: str, encoding: str, column_names: list[str] | None) -> int:
    """Máximo de Wave con casos. Los value labels pueden adelantar olas todavía vacías."""
    wave_col = next(
        (c for c in (column_names or []) if str(c).lower() == "wave"),
        None,
    )
    if wave_col is None:
        return 0
    enc = None if encoding in (None, "", "auto") else encoding
    df, _ = pyreadstat.read_sav(path, usecols=[wave_col], encoding=enc)
    vals = pd.to_numeric(df[wave_col], errors="coerce").dropna()
    if vals.empty:
        return 0
    return int(vals.max())


def suggest_next_wave(madre_path: str) -> dict[str, Any]:
    """Sugiere la ola siguiente según los casos de Wave, no solo los value labels.

    La madre puede traer el label de la ola nueva (ej. 54) antes de tener filas.
    Si se usara el máximo de labels, la UI propondría 55.
    """
    meta, enc = leer_metadata(madre_path)
    labels = (meta.variable_value_labels or {}).get("Wave") or {}
    max_wave = _max_wave_en_datos(madre_path, enc, list(meta.column_names or []))
    next_wave = max_wave + 1 if max_wave else 1
    label = _WAVE_LABELS_EXTRA.get(next_wave, f"Wave {next_wave}")
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


def _stamp_wave_column(df: pd.DataFrame, wave: int) -> None:
    """Asigna Wave=ola por posición, eliminando variantes de casing previas."""
    drop = [c for c in df.columns if str(c).lower() == "wave" and c != "Wave"]
    if drop:
        df.drop(columns=drop, inplace=True)
    df["Wave"] = float(wave)


def _patch_wave_54(df: pd.DataFrame, meta: EngineMeta, wave: int) -> None:
    """Refuerza label de Wave y Trimestral de la ola nueva.

    El YTD anual ya no se deriva: el Script 2 arma YTD_ENERO…YTD_DICIEMBRE.
    """
    _stamp_wave_column(df, wave)

    label = _WAVE_LABELS_EXTRA.get(wave, f"Wave {wave}")
    meta.value_labels.setdefault("Wave", {})
    meta.value_labels["Wave"][float(wave)] = label

    if wave in _TRIMESTRAL_EXTRA:
        tri = float(_TRIMESTRAL_EXTRA[wave])
        if "Trimestral" not in df.columns:
            df["Trimestral"] = np.nan
        df.loc[df["Wave"] == float(wave), "Trimestral"] = tri
        meta.value_labels.setdefault("Trimestral", {})
        meta.value_labels["Trimestral"].setdefault(tri, _TRIMESTRAL_LABEL)


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


def _remap_meta_keys_to_casing(
    store: dict[str, Any],
    casing: dict[str, str],
) -> dict[str, Any]:
    """Reescribe claves de metadata al casing canónico (madre / final)."""
    out: dict[str, Any] = {}
    for c, val in store.items():
        target = casing.get(c.lower(), c)
        if target in out and target != c:
            # Ya hay entrada con el casing canónico: no pisar.
            continue
        out[target] = val
    return out


def _merge_meta_into_ref(
    meta_ref: Any,
    engine_meta: EngineMeta,
    final_columns: list[str] | None = None,
) -> Any:
    """Fusiona labels del motor sobre la metadata de la madre.

    Medidas y value labels: la madre gana en variables que ya tenía;
    las variables nuevas toman lo de la parcial (vía engine_meta).
    Claves nuevas de value labels (ej. Wave 54, P161=6) se agregan sin pisar.
    Las claves del motor se remapean al casing de las columnas finales.
    """

    class MergedMeta:
        pass

    casing = {c.lower(): c for c in (final_columns or [])}
    # Incluir nombres de la madre por si final_columns es None
    for c in (getattr(meta_ref, "column_names", None) or []):
        casing.setdefault(str(c).lower(), str(c))
    for c in (getattr(meta_ref, "column_names_to_labels", None) or {}):
        casing.setdefault(c.lower(), c)

    eng_labels = _remap_meta_keys_to_casing(engine_meta.column_labels, casing)
    eng_vl = _remap_meta_keys_to_casing(engine_meta.value_labels, casing)
    eng_fmt = _remap_meta_keys_to_casing(engine_meta.formats, casing)
    eng_meas = _remap_meta_keys_to_casing(engine_meta.measures, casing)

    m = MergedMeta()
    base_labels = dict(getattr(meta_ref, "column_names_to_labels", None) or {})
    for c, lab in eng_labels.items():
        base_labels.setdefault(c, lab)
    m.column_names_to_labels = base_labels

    madre_vl = getattr(meta_ref, "variable_value_labels", None) or {}
    base_vl: dict[str, dict] = {c: dict(vl) for c, vl in madre_vl.items() if vl}
    for c, vl in eng_vl.items():
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
    for c, fmt in eng_fmt.items():
        base_fmt.setdefault(c, fmt)
    m.original_variable_types = base_fmt

    madre_meas = {
        c: str(v).lower()
        for c, v in (getattr(meta_ref, "variable_measure", None) or {}).items()
        if v and str(v).lower() != "unknown"
    }
    for c, meas in eng_meas.items():
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


_RE_ANCHO_A = re.compile(r"^A(\d+)", re.IGNORECASE)


def _ancho_formato_a(fmt: str | None) -> int:
    """Ancho de un formato SPSS de texto (A2000). 0 si no es texto."""
    if not fmt:
        return 0
    m = _RE_ANCHO_A.match(str(fmt).strip())
    return int(m.group(1)) if m else 0


def _formatos_por_lower(meta: Any) -> dict[str, str]:
    raw = getattr(meta, "original_variable_types", None) or {}
    return {str(k).lower(): str(v) for k, v in raw.items() if v}


def _es_texto(series: pd.Series, fmt: str | None) -> bool:
    """True si la columna es texto en SPSS o ya viene como string en pandas."""
    if fmt and str(fmt).strip().upper().startswith("A"):
        return True
    if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        return False
    if pd.api.types.is_string_dtype(series):
        return True
    if pd.api.types.is_object_dtype(series):
        nn = series.dropna()
        if len(nn) == 0:
            return False
        return bool(nn.map(lambda v: isinstance(v, str)).all())
    return False


def _num_a_texto(series: pd.Series) -> pd.Series:
    """Pasa un numérico de SPSS a texto, sin el '.0' de los floats enteros."""

    def uno(v: Any) -> Any:
        if v is None or v is pd.NA:
            return pd.NA
        try:
            if pd.isna(v):
                return pd.NA
        except (TypeError, ValueError):
            pass
        if isinstance(v, (bool, np.bool_)):
            return str(int(v))
        if isinstance(v, (int, np.integer)):
            return str(int(v))
        if isinstance(v, (float, np.floating)):
            fv = float(v)
            if np.isnan(fv):
                return pd.NA
            if fv.is_integer():
                return str(int(fv))
            return format(fv, "g")
        return str(v)

    return series.map(uno).astype("object")


def _forzar_tipo_cliente(
    ola: pd.DataFrame,
    cliente: pd.DataFrame,
    meta_cliente: Any,
) -> list[str]:
    """Iguala el tipo de la ola al de la base cliente cuando no coinciden.

    El caso típico es ResponseId numérico en la ola y texto en el cliente.
    Wave no se toca: tiene que seguir siendo numérica para apilar.
    """
    alerts: list[str] = []
    fmt_por_lower = _formatos_por_lower(meta_cliente)
    cliente_por_lower = {str(c).lower(): c for c in cliente.columns}
    for col in list(ola.columns):
        if str(col).lower() == "wave":
            continue
        dest = cliente_por_lower.get(str(col).lower())
        if dest is None:
            continue
        fmt = fmt_por_lower.get(str(col).lower())
        dest_s = cliente[dest]
        src_s = ola[col]
        dest_txt = _es_texto(dest_s, fmt)
        src_txt = _es_texto(src_s, None)
        if dest_txt and not src_txt and pd.api.types.is_numeric_dtype(src_s):
            ola[col] = _num_a_texto(src_s)
            alerts.append(
                f"'{dest}' pasó de numérico a texto para coincidir con la base cliente"
            )
        elif (not dest_txt) and pd.api.types.is_numeric_dtype(dest_s) and src_txt:
            ola[col] = pd.to_numeric(src_s, errors="coerce")
            alerts.append(
                f"'{dest}' pasó de texto a numérico para coincidir con la base cliente"
            )
    return alerts


def _columnas_ola_cliente(
    columnas_ola: list[str],
    columnas_cliente: list[str],
    columnas_madre: list[str],
) -> tuple[list[str], list[str]]:
    """Elige qué columnas de la ola entran a la base cliente.

    Queda el esqueleto del cliente (sin importar mayúsculas) y las columnas
    que no existían en la madre interna: esas son preguntas nuevas.
    Lo que está en la madre y no en el cliente se venía descartando y se tira.
    """
    cliente_l = {c.lower() for c in columnas_cliente}
    madre_l = {c.lower() for c in columnas_madre}
    keep: list[str] = []
    nuevas: list[str] = []
    for c in columnas_ola:
        low = str(c).lower()
        if low == "wave" or low in cliente_l:
            keep.append(str(c))
            continue
        # Scratch de SPSS: no es una pregunta nueva y no entra al .sav.
        if str(c).startswith("@"):
            continue
        if low not in madre_l:
            keep.append(str(c))
            nuevas.append(str(c))
    return keep, nuevas


def _label_de_wave(meta: Any, wave: int) -> str:
    """Etiqueta de la ola en la metadata, si ya está cargada."""
    for name, labels in (getattr(meta, "variable_value_labels", None) or {}).items():
        if str(name).lower() != "wave" or not labels:
            continue
        for k, v in labels.items():
            try:
                if int(float(k)) == wave and v:
                    return str(v)
            except (TypeError, ValueError):
                continue
    return ""


def _ancho_observado(series: pd.Series) -> int:
    if not (
        pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series)
    ):
        return 0
    lens = [
        len(v)
        for v in series.dropna()
        if isinstance(v, str)
    ]
    return max(lens) if lens else 0


def _ensanchar_textos(
    meta: Any,
    df: pd.DataFrame,
    meta_cliente: Any,
    meta_unificada: Any | None,
) -> None:
    """Deja cada texto con el ancho mayor entre cliente, ola y los datos.

    Así una abierta no se corta y un ancho distinto no parte la variable.
    """
    fmt = dict(getattr(meta, "original_variable_types", None) or {})
    cli = _formatos_por_lower(meta_cliente)
    uni = _formatos_por_lower(meta_unificada)
    for col in df.columns:
        low = str(col).lower()
        a_cli = _ancho_formato_a(cli.get(low))
        a_uni = _ancho_formato_a(uni.get(low))
        if not _es_texto(df[col], cli.get(low) or uni.get(low) or fmt.get(col)):
            continue
        best = max(a_cli, a_uni, _ancho_observado(df[col]))
        if best <= 0:
            continue
        fmt[str(col)] = f"A{best}"
    meta.original_variable_types = fmt


def armar_base_cliente(
    unificada: pd.DataFrame,
    columnas_madre: list[str],
    cliente: pd.DataFrame,
    wave: int,
    wave_label: str,
    meta_cliente: Any,
    meta_unificada: Any | None = None,
) -> tuple[pd.DataFrame, list[str], Any, list[str]]:
    """Apila solo la ola actual sobre la base cliente.

    No modifica la unificada. Devuelve el dataframe, las columnas nuevas
    conservadas, la metadata (el cliente gana) y las alertas de tipo.
    """
    wcol = next(
        (c for c in unificada.columns if str(c).lower() == "wave"),
        None,
    )
    if wcol is None:
        raise ValueError("La base unificada no tiene columna Wave")

    olas = pd.to_numeric(unificada[wcol], errors="coerce")
    ola = unificada.loc[olas == float(wave)].copy()
    keep, nuevas = _columnas_ola_cliente(
        list(ola.columns),
        [str(c) for c in cliente.columns],
        [str(c) for c in columnas_madre],
    )
    if not keep:
        raise ValueError("La ola no tiene columnas para sumar a la base cliente")
    ola = ola.loc[:, keep].copy()

    alerts = _forzar_tipo_cliente(ola, cliente, meta_cliente)
    apilada, _rep = align_and_stack(cliente, ola)

    label = _label_de_wave(meta_unificada, wave) or wave_label or f"Wave {wave}"
    eng = (
        EngineMeta.from_sav_meta(meta_unificada)
        if meta_unificada is not None
        else EngineMeta()
    )
    store = eng.value_labels.setdefault("Wave", {})
    if not _vl_has_key(store, float(wave)):
        store[float(wave)] = label

    meta = _merge_meta_into_ref(
        meta_cliente, eng, final_columns=list(apilada.columns)
    )
    _ensanchar_textos(meta, apilada, meta_cliente, meta_unificada)
    return apilada, nuevas, meta, alerts


def run_pipeline(
    madre_path: str,
    parcial_path: str,
    wave: int,
    output_path: str,
    sps1: str | None = None,
    sps2: str | None = None,
    progress: ProgressCb | None = None,
    cliente_path: str | None = None,
    cliente_output_path: str | None = None,
) -> PipelineReport:
    """Ejecuta el pipeline completo. No pisa la madre ni la base cliente.

    La unificada interna se escribe igual aunque no haya base cliente.
    La salida de cliente es un archivo aparte, solo si se pasó cliente_path.
    """

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
        _stamp_wave_column(eng.df, wave)
        eng._cols = {c.lower(): c for c in eng.df.columns}
        eng.run_file(str(sps2_path))
        _patch_wave_54(eng.df, eng.meta, wave)

        f_m.result()

    report.encoding_parcial = parcial_holder["enc"]
    report.encoding_madre = madre_holder["enc"]
    report.alerts.extend(eng.meta.alerts)

    # Colapsar variantes de casing (wave/Wave, P01_a1/P01_A1) y reestampar ola.
    preferred = {c.lower(): c for c in eng.df.columns}
    preferred["wave"] = "Wave"
    eng.df, _collapsed, collapse_alerts = collapse_case_duplicates(
        eng.df, preferred=preferred
    )
    report.alerts.extend(collapse_alerts)
    _stamp_wave_column(eng.df, wave)
    eng._cols = {c.lower(): c for c in eng.df.columns}
    # Remapear metadata del motor al casing canónico post-colapso
    casing = {c.lower(): c for c in eng.df.columns}
    eng.meta.column_labels = {
        casing.get(k.lower(), k): v for k, v in eng.meta.column_labels.items()
    }
    eng.meta.value_labels = {
        casing.get(k.lower(), k): v for k, v in eng.meta.value_labels.items()
    }
    eng.meta.formats = {
        casing.get(k.lower(), k): v for k, v in eng.meta.formats.items()
    }
    eng.meta.measures = {
        casing.get(k.lower(), k): v for k, v in eng.meta.measures.items()
    }

    emit("apilando", "Alineando columnas y apilando…")
    stacked, align_rep = align_and_stack(
        madre_holder["df"],
        eng.df,
        preferred_parcial=eng._cols,
    )
    report.align = asdict(align_rep)
    report.rows_total = align_rep.rows_total
    report.rows_wave = int((stacked["Wave"] == float(wave)).sum()) if "Wave" in stacked.columns else 0
    report.alerts.extend(align_rep.alerts)

    # Alertas de derivadas vacías en la ola nueva
    # YTD anual y Aprobacion ya no se derivan. YTD_SEPTIEMBRE cubre la ola 54.
    derived_candidates = [
        "Genero", "Edad", "Edad2", "Region", "Region2", "NSE",
        "Auto", "Vinculo", "Trimestral",
    ]
    if wave == 54:
        derived_candidates.append("YTD_SEPTIEMBRE")
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
    merged_meta = _merge_meta_into_ref(
        madre_holder["meta"], eng.meta, final_columns=list(stacked.columns)
    )
    escribir_sav(stacked, str(out), meta_ref=merged_meta)
    report.output_path = str(out.resolve())

    mrsets_path = out.with_suffix(".mrsets.sps")
    _write_mrsets_sps(mrsets_path, eng.meta.mrsets)
    report.mrsets_path = str(mrsets_path.resolve())

    if cliente_path:
        _escribir_base_cliente(
            report,
            stacked=stacked,
            columnas_madre=list(madre_holder["df"].columns),
            wave=wave,
            meta_unificada=merged_meta,
            cliente_path=cliente_path,
            cliente_output_path=cliente_output_path,
            madre_path=madre_path,
            unificada_path=str(out.resolve()),
            emit=emit,
        )

    emit("listo", f"Listo: {report.rows_total} filas")
    return report


def _escribir_base_cliente(
    report: PipelineReport,
    stacked: pd.DataFrame,
    columnas_madre: list[str],
    wave: int,
    meta_unificada: Any,
    cliente_path: str,
    cliente_output_path: str | None,
    madre_path: str,
    unificada_path: str,
    emit: Callable[[str, str], None],
) -> None:
    """Lee la base cliente histórica y escribe la ola actual encima.

    Corre después de guardar la unificada y no la modifica.
    """
    dest = Path(cliente_output_path) if cliente_output_path else None
    if dest is None:
        raise ValueError("Falta la ruta de salida de la base cliente")

    prohibidos = {
        Path(p).resolve()
        for p in (madre_path, cliente_path, unificada_path)
        if p
    }
    if dest.resolve() in prohibidos:
        raise ValueError(
            "La salida de cliente no puede pisar la madre, la base cliente ni la unificada"
        )

    emit("cliente", "Armando base para cliente…")
    cliente_df, cliente_meta, _enc = leer_sav(cliente_path, optimizar=True)
    apilada, nuevas, meta, alerts = armar_base_cliente(
        unificada=stacked,
        columnas_madre=columnas_madre,
        cliente=cliente_df,
        wave=wave,
        wave_label=report.wave_label,
        meta_cliente=cliente_meta,
        meta_unificada=meta_unificada,
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    escribir_sav(apilada, str(dest), meta_ref=meta)
    report.client_output_path = str(dest.resolve())
    report.client_rows_total = len(apilada)
    report.client_new_columns = nuevas
    report.alerts.extend(alerts)
    if nuevas:
        report.alerts.append(
            "Columnas nuevas incluidas en la base cliente: " + ", ".join(nuevas)
        )


def report_to_dict(report: PipelineReport) -> dict[str, Any]:
    return asdict(report)
