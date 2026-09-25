"""Lectura/escritura robusta de .sav (encoding + memoria).

La madre YPF falla con detección automática: hay que probar encodings en orden.
Al escribir, los numéricos van como float64 (como SPSS) y las claves de value
labels se castean a float para evitar el error 'must be int' de pyreadstat.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
import pyreadstat

# Orden de encodings a probar. latin1 mapea cualquier byte => red de seguridad.
_ENCODINGS = [None, "UTF-8", "WINDOWS-1252", "latin1"]

# Medidas que pyreadstat acepta en write_sav.
_VALID_MEASURES = frozenset({"nominal", "ordinal", "scale", "unknown"})


def leer_metadata(path: str) -> tuple[Any, str]:
    """Lee SOLO metadata (rápido, sin cargar datos). -> (meta, encoding)."""
    ultimo: Exception | None = None
    for enc in _ENCODINGS:
        try:
            _, meta = pyreadstat.read_sav(path, metadataonly=True, encoding=enc)
            return meta, (enc or "auto")
        except Exception as e:
            ultimo = e
    raise RuntimeError(f"No se pudo leer metadata de {path}: {ultimo}")


def leer_sav(path: str, optimizar: bool = True) -> tuple[pd.DataFrame, Any, str]:
    """Lee .sav completo probando encodings. -> (df, meta, encoding)."""
    ultimo: Exception | None = None
    for enc in _ENCODINGS:
        try:
            df, meta = pyreadstat.read_sav(path, encoding=enc)
            if optimizar:
                df = optimizar_tipos(df)
            return df, meta, (enc or "auto")
        except Exception as e:
            ultimo = e
    raise RuntimeError(f"No se pudo leer {path}: {ultimo}")


def optimizar_tipos(df: pd.DataFrame) -> pd.DataFrame:
    """Baja RAM: numéricos -> entero nullable / float32 más chico posible."""
    for col in df.columns:
        s = df[col]
        if pd.api.types.is_float_dtype(s):
            nn = s.dropna()
            if len(nn) > 0 and (nn % 1 == 0).all():
                df[col] = _int_min(s)
            else:
                df[col] = s.astype("float32")
    return df


def _int_min(s: pd.Series) -> pd.Series:
    nn = s.dropna()
    if len(nn) == 0:
        return s.astype("Int8")
    mn, mx = float(nn.min()), float(nn.max())
    for dt, lo, hi in (
        ("Int8", -128, 127),
        ("Int16", -32768, 32767),
        ("Int32", -(2**31), 2**31 - 1),
    ):
        if mn >= lo and mx <= hi:
            return s.astype(dt)
    return s.astype("Int64")


def fix_mojibake(text: str | None) -> str | None:
    """Repara UTF-8 leído como latin1 (ej. 'Ã³' → 'ó').

    Si el string ya está bien o no es mojibake, lo deja igual.
    """
    if text is None:
        return None
    if not isinstance(text, str) or not text:
        return text
    try:
        return text.encode("latin1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _normalize_value_labels(labels: dict, prefer_int: bool = True) -> dict:
    """Normaliza claves numéricas de value labels y repara textos.

    Descarta claves no numéricas (ej. basura de P08A) para que no aborten
    la escritura de todo el archivo.
    """
    out: dict = {}
    for k, v in labels.items():
        try:
            fk = float(k)
        except (TypeError, ValueError):
            continue
        label = fix_mojibake(str(v)) if v is not None else v
        if prefer_int and fk == int(fk) and abs(fk) < 2**31:
            out[int(fk)] = label
        else:
            out[fk] = label
    return out


def _build_value_labels(
    meta_ref: Any, cols: set[str], prefer_int: bool
) -> dict[str, dict]:
    """Arma variable_value_labels solo con variables que tienen claves numéricas."""
    raw = getattr(meta_ref, "variable_value_labels", None) or {}
    out: dict[str, dict] = {}
    for c, vl in raw.items():
        if c not in cols or not vl:
            continue
        cleaned = _normalize_value_labels(vl, prefer_int=prefer_int)
        if cleaned:
            out[c] = cleaned
    return out


def _build_measures(meta_ref: Any, cols: set[str]) -> dict[str, str]:
    """Extrae variable_measure filtrando a columnas presentes y valores válidos."""
    raw = getattr(meta_ref, "variable_measure", None) or {}
    out: dict[str, str] = {}
    for c, m in raw.items():
        if c not in cols or not m:
            continue
        measure = str(m).lower()
        if measure in _VALID_MEASURES and measure != "unknown":
            out[c] = measure
    return out


def escribir_sav(df: pd.DataFrame, path: str, meta_ref: Any = None) -> None:
    """Escribe .sav conservando labels/value labels/formatos/medidas de meta_ref.

    Convierte numéricos a float64 (como SPSS). NOTA: pyreadstat no re-escribe MRSETS.
    Si una variable tiene value labels inválidos, se omite esa variable; no se
    descartan todos los value labels del archivo.
    """
    out = df.copy()
    for col in list(out.columns):
        s = out[col]
        if pd.api.types.is_integer_dtype(s) or pd.api.types.is_float_dtype(s):
            out[col] = s.astype("float64")
        elif pd.api.types.is_bool_dtype(s):
            out[col] = s.astype("float64")

    kwargs: dict[str, Any] = {}
    if meta_ref is not None:
        cols = set(out.columns)
        if getattr(meta_ref, "column_names_to_labels", None):
            lab = meta_ref.column_names_to_labels or {}
            kwargs["column_labels"] = [
                fix_mojibake(lab.get(c)) for c in out.columns
            ]
        vl = _build_value_labels(meta_ref, cols, prefer_int=True)
        if vl:
            kwargs["variable_value_labels"] = vl
        if getattr(meta_ref, "original_variable_types", None):
            kwargs["variable_format"] = {
                c: v
                for c, v in (meta_ref.original_variable_types or {}).items()
                if c in cols
            }
        measures = _build_measures(meta_ref, cols)
        if measures:
            kwargs["variable_measure"] = measures

    try:
        pyreadstat.write_sav(out, path, file_label="", **kwargs)
        return
    except Exception as first_err:
        if "variable_value_labels" not in kwargs or meta_ref is None:
            raise first_err

        # Reintento 1: claves float en lugar de int.
        try:
            kwargs["variable_value_labels"] = _build_value_labels(
                meta_ref, set(out.columns), prefer_int=False
            )
            pyreadstat.write_sav(out, path, file_label="", **kwargs)
            return
        except Exception:
            pass

        # Reintento 2: omitir variables problemáticas; conservar el resto.
        remaining = dict(kwargs.get("variable_value_labels") or {})
        while remaining:
            for c in list(remaining):
                trial = {k: v for k, v in remaining.items() if k != c}
                kwargs["variable_value_labels"] = trial
                try:
                    pyreadstat.write_sav(out, path, file_label="", **kwargs)
                    return
                except Exception:
                    continue
            # Si ninguna omisión individual alcanza, sacar una y reintentar.
            remaining.pop(next(iter(remaining)))

        kwargs.pop("variable_value_labels", None)
        try:
            pyreadstat.write_sav(out, path, file_label="", **kwargs)
            return
        except Exception:
            raise first_err
