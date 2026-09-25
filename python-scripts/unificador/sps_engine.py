"""Motor que ejecuta el subconjunto SPSS usado por los scripts del Unificador.

Nombres de variable se resuelven sin distinguir mayúsculas. Si falta una columna
fuente, se omite la operación y se registra una alerta (no se aborta).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from unificador.sps_parser import SpsCommand, parse_sps, parse_sps_file


@dataclass
class EngineMeta:
    """Metadata SPSS acumulada durante la ejecución (labels, formatos, MRSETS)."""

    column_labels: dict[str, str] = field(default_factory=dict)
    value_labels: dict[str, dict[float, str]] = field(default_factory=dict)
    formats: dict[str, str] = field(default_factory=dict)
    measures: dict[str, str] = field(default_factory=dict)
    mrsets: list[str] = field(default_factory=list)
    alerts: list[str] = field(default_factory=list)

    @classmethod
    def from_sav_meta(cls, meta: Any) -> "EngineMeta":
        """Copia labels/value labels/formatos/medidas desde metadata de pyreadstat."""
        em = cls()
        for c, lab in (getattr(meta, "column_names_to_labels", None) or {}).items():
            if lab:
                em.column_labels[c] = str(lab)
        for c, vl in (getattr(meta, "variable_value_labels", None) or {}).items():
            if not vl:
                continue
            cleaned: dict[float, str] = {}
            for k, v in vl.items():
                try:
                    cleaned[float(k)] = str(v)
                except (TypeError, ValueError):
                    continue
            if cleaned:
                em.value_labels[c] = cleaned
        for c, fmt in (getattr(meta, "original_variable_types", None) or {}).items():
            if fmt:
                em.formats[c] = str(fmt)
        for c, m in (getattr(meta, "variable_measure", None) or {}).items():
            if m and str(m).lower() != "unknown":
                em.measures[c] = str(m).lower()
        return em


@dataclass
class EngineResult:
    df: pd.DataFrame
    meta: EngineMeta


class SpsEngine:
    """Ejecuta comandos SPSS sobre un DataFrame."""

    def __init__(self, df: pd.DataFrame, meta: EngineMeta | None = None):
        self.df = df.copy()
        self.meta = meta or EngineMeta()
        # Mapa lower -> nombre real en el df
        self._cols = {c.lower(): c for c in self.df.columns}
        # Stack de máscaras activas para DO IF (True = fila activa).
        self._if_stack: list[pd.Series] = []

    # ------------------------------------------------------------------ API

    def run_commands(self, commands: list[SpsCommand]) -> EngineResult:
        for cmd in commands:
            self._dispatch(cmd)
        # Defragmentar tras muchos inserts de columnas.
        self.df = self.df.copy()
        self._cols = {c.lower(): c for c in self.df.columns}
        return EngineResult(df=self.df, meta=self.meta)

    def run_source(self, source: str) -> EngineResult:
        return self.run_commands(parse_sps(source))

    def run_file(self, path: str) -> EngineResult:
        return self.run_commands(parse_sps_file(path))

    # -------------------------------------------------------------- helpers

    def _resolve(self, name: str) -> str | None:
        return self._cols.get(name.lower())

    def _ensure_col(self, name: str) -> str:
        """Devuelve el nombre real; si no existe, crea la columna con NaN."""
        existing = self._resolve(name)
        if existing is not None:
            return existing
        self.df[name] = np.nan
        self._cols[name.lower()] = name
        return name

    def _widen_if_needed(self, col: str, values: pd.Series) -> None:
        """Si la columna es Int8/16 y los valores no entran, pasa a float64."""
        current = self.df[col]
        kind = str(current.dtype)
        bounds = {
            "Int8": (-128, 127),
            "Int16": (-32768, 32767),
            "int8": (-128, 127),
            "int16": (-32768, 32767),
        }
        if kind not in bounds:
            return
        nn = pd.to_numeric(values, errors="coerce").dropna()
        if len(nn) == 0:
            return
        lo, hi = bounds[kind]
        if float(nn.min()) < lo or float(nn.max()) > hi:
            self.df[col] = current.astype("float64")

    def _rename_col(self, old: str, new: str) -> None:
        real = self._resolve(old)
        if real is None:
            self.meta.alerts.append(f"RENAME: columna ausente '{old}'")
            return
        if real == new:
            return
        # Si el destino ya existe con otro casing, lo pisamos.
        dest = self._resolve(new)
        if dest is not None and dest != real:
            self.df.drop(columns=[dest], inplace=True)
            self._cols.pop(dest.lower(), None)
        self.df.rename(columns={real: new}, inplace=True)
        self._cols.pop(real.lower(), None)
        self._cols[new.lower()] = new
        # Migrar metadata (incluye medidas de la parcial)
        for store in (
            self.meta.column_labels,
            self.meta.formats,
            self.meta.value_labels,
            self.meta.measures,
        ):
            if real in store:
                store[new] = store.pop(real)

    def _active_mask(self) -> pd.Series:
        if not self._if_stack:
            return pd.Series(True, index=self.df.index)
        mask = self._if_stack[0].copy()
        for m in self._if_stack[1:]:
            mask &= m
        return mask

    def _apply_where(self, series: pd.Series, values: pd.Series) -> pd.Series:
        """Asigna `values` solo donde el DO IF activo es True."""
        mask = self._active_mask()
        out = series.copy()
        out.loc[mask] = values.loc[mask]
        return out

    def _alert(self, msg: str) -> None:
        self.meta.alerts.append(msg)

    # ------------------------------------------------------------- dispatch

    def _dispatch(self, cmd: SpsCommand) -> None:
        handlers = {
            "RENAME": self._cmd_rename,
            "RECODE": self._cmd_recode,
            "ALTER_TYPE": self._cmd_alter_type,
            "FORMATS": self._cmd_formats,
            "VALUE_LABELS": self._cmd_value_labels,
            "VARIABLE_LABELS": self._cmd_variable_labels,
            "COMPUTE": self._cmd_compute,
            "IF": self._cmd_if,
            "COUNT": self._cmd_count,
            "AUTORECODE": self._cmd_autorecode,
            "DO_IF": self._cmd_do_if,
            "END_IF": self._cmd_end_if,
            "MRSETS": self._cmd_mrsets,
            "UNKNOWN": self._cmd_unknown,
        }
        handler = handlers.get(cmd.kind, self._cmd_unknown)
        try:
            handler(cmd)
        except Exception as e:
            self._alert(f"L{cmd.line} {cmd.kind}: {e}")

    def _cmd_unknown(self, cmd: SpsCommand) -> None:
        # Comandos no soportados se ignoran con alerta suave.
        head = cmd.text.split(None, 1)[0] if cmd.text else "?"
        self._alert(f"L{cmd.line}: comando no soportado '{head}' (omitido)")

    # -------------------------------------------------------------- RENAME

    def _cmd_rename(self, cmd: SpsCommand) -> None:
        # RENAME VARIABLES a = b c = d.  /  RENAME VARIABLES a=b.
        body = re.sub(r"(?i)^RENAME\s+VARIABLES\s+", "", cmd.text).strip()
        # Pares: name = name (nombres pueden tener puntos/guiones bajos)
        pairs = re.findall(
            r"([A-Za-z_@][\w.]*)\s*=\s*([A-Za-z_@][\w.]*)",
            body,
        )
        for old, new in pairs:
            self._rename_col(old, new)

    # -------------------------------------------------------------- RECODE

    def _cmd_recode(self, cmd: SpsCommand) -> None:
        text = cmd.text
        # Separar INTO si existe
        into_match = re.search(r"(?i)\bINTO\b", text)
        into_vars: list[str] = []
        if into_match:
            src_part = text[: into_match.start()]
            into_part = text[into_match.end() :]
            into_vars = re.findall(r"[A-Za-z_][\w.]*", into_part)
        else:
            src_part = text

        # Quitar la palabra RECODE
        src_part = re.sub(r"(?i)^RECODE\s+", "", src_part).strip()

        # Specs entre paréntesis al final
        specs = list(re.finditer(r"\(([^)]*)\)", src_part))
        if not specs:
            self._alert(f"L{cmd.line}: RECODE sin especificaciones")
            return

        # Variables = todo antes del primer (
        vars_text = src_part[: specs[0].start()]
        src_vars = re.findall(r"[A-Za-z_][\w.]*", vars_text)
        if not src_vars:
            self._alert(f"L{cmd.line}: RECODE sin variables fuente")
            return

        mappings = [self._parse_recode_spec(s.group(1)) for s in specs]

        if into_vars and len(into_vars) != len(src_vars):
            # SPSS permite 1:1; si difieren, alineamos al mínimo y alertamos.
            self._alert(
                f"L{cmd.line}: RECODE INTO desbalanceado "
                f"({len(src_vars)} fuentes, {len(into_vars)} destinos)"
            )

        targets = into_vars if into_vars else src_vars
        n = min(len(src_vars), len(targets)) if into_vars else len(src_vars)

        for i in range(n if into_vars else len(src_vars)):
            src_name = src_vars[i]
            dst_name = targets[i] if into_vars else src_vars[i]
            src_real = self._resolve(src_name)
            if src_real is None:
                self._alert(f"L{cmd.line}: RECODE columna ausente '{src_name}'")
                continue
            src = self.df[src_real]
            result = self._apply_recode(src, mappings)
            if into_vars:
                dst_real = self._ensure_col(dst_name)
                merged = self._apply_where(self.df[dst_real], result)
                self._widen_if_needed(dst_real, merged)
                self.df[dst_real] = merged
            else:
                merged = self._apply_where(src, result)
                self._widen_if_needed(src_real, merged)
                self.df[src_real] = merged

    def _parse_recode_spec(self, spec: str) -> tuple[Any, Any]:
        """Parsea '1=5', '4 thru 5=11', '3=sys', '16 thru Highest=5', '1 2=33'."""
        spec = spec.strip()
        if "=" not in spec:
            return (None, None)
        left, right = spec.split("=", 1)
        left = left.strip()
        right = right.strip()
        target = self._parse_recode_target(right)
        sources = self._parse_recode_sources(left)
        return (sources, target)

    def _parse_recode_target(self, right: str) -> Any:
        low = right.lower()
        if low in ("sys", "sysmis", "sysmis."):
            return np.nan
        try:
            return float(right)
        except ValueError:
            return right.strip("\"'")

    def _parse_recode_sources(self, left: str) -> list[Any]:
        """Devuelve lista de matchers: número, ('thru', lo, hi), 'else'."""
        low = left.lower().strip()
        if low in ("else", "else."):
            return ["else"]
        # "4 thru 5" / "16 thru Highest"
        m = re.match(
            r"(?i)^(-?\d+(?:\.\d+)?)\s+thru\s+(hi(?:ghest)?|-?\d+(?:\.\d+)?)$",
            left.strip(),
        )
        if m:
            lo = float(m.group(1))
            hi_raw = m.group(2)
            hi = float("inf") if hi_raw.lower().startswith("hi") else float(hi_raw)
            return [("thru", lo, hi)]
        # Lista de valores: "1 2" o "14 15 16"
        vals: list[Any] = []
        for tok in re.findall(r"-?\d+(?:\.\d+)?", left):
            vals.append(float(tok))
        return vals

    def _apply_recode(
        self, src: pd.Series, mappings: list[tuple[Any, Any]]
    ) -> pd.Series:
        """Aplica mappings en orden; valores no listados quedan intactos."""
        out = src.copy()
        # Trabajar en float para comparar
        numeric = pd.to_numeric(src, errors="coerce")
        assigned = pd.Series(False, index=src.index)

        for sources, target in mappings:
            if sources is None:
                continue
            if sources == ["else"] or sources == "else":
                mask = ~assigned & src.notna()
                out = self._set_recode(out, mask, target)
                assigned |= mask
                continue
            mask = pd.Series(False, index=src.index)
            for s in sources:
                if isinstance(s, tuple) and s[0] == "thru":
                    _, lo, hi = s
                    mask |= numeric.notna() & (numeric >= lo) & (numeric <= hi)
                else:
                    mask |= numeric.notna() & (numeric == float(s))
            mask &= ~assigned
            out = self._set_recode(out, mask, target)
            assigned |= mask
        return out

    def _set_recode(self, out: pd.Series, mask: pd.Series, target: Any) -> pd.Series:
        result = out.copy()
        if target is np.nan or (isinstance(target, float) and np.isnan(target)):
            result.loc[mask] = np.nan
        else:
            result.loc[mask] = target
        return result

    # ---------------------------------------------------------- ALTER TYPE

    def _cmd_alter_type(self, cmd: SpsCommand) -> None:
        # ALTER TYPE var (A2000). / ALTER TYPE v1 v2 (A2000).
        body = re.sub(r"(?i)^ALTER\s+TYPE\s+", "", cmd.text).strip()
        fmt_m = re.search(r"\(([^)]+)\)", body)
        fmt = fmt_m.group(1).strip().upper() if fmt_m else "A8"
        vars_text = body[: fmt_m.start()] if fmt_m else body
        for name in re.findall(r"[A-Za-z_][\w.]*", vars_text):
            real = self._resolve(name)
            if real is None:
                self._alert(f"ALTER TYPE: columna ausente '{name}'")
                continue
            if fmt.startswith("A"):
                self.df[real] = self.df[real].map(
                    lambda x: "" if pd.isna(x) else str(x)
                )
                self.meta.formats[real] = fmt
            else:
                self.meta.formats[real] = fmt

    # ------------------------------------------------------------- FORMATS

    def _cmd_formats(self, cmd: SpsCommand) -> None:
        body = re.sub(r"(?i)^FORMATS\s+", "", cmd.text).strip()
        # FORMATS v1 v2 (F40).
        fmt_m = re.search(r"\(([^)]+)\)", body)
        if not fmt_m:
            return
        fmt = fmt_m.group(1).strip()
        vars_text = body[: fmt_m.start()]
        for name in re.findall(r"[A-Za-z_][\w.]*", vars_text):
            real = self._resolve(name) or name
            self.meta.formats[real] = fmt

    # ------------------------------------------------------- VALUE LABELS

    def _cmd_value_labels(self, cmd: SpsCommand) -> None:
        body = re.sub(r"(?i)^VALUE\s+LABELS\s+", "", cmd.text).strip()
        # Variables al inicio hasta el primer número/string de label.
        # Formato: VAR1 VAR2 1 "lab" 2 'lab'
        tokens = self._tokenize_labels(body)
        var_names: list[str] = []
        i = 0
        while i < len(tokens) and tokens[i][0] == "name":
            # Un name seguido de otro name sigue siendo variable; si sigue
            # número/string, las variables terminaron.
            if i + 1 < len(tokens) and tokens[i + 1][0] == "name":
                var_names.append(tokens[i][1])
                i += 1
                continue
            # name + number/string => name es última variable
            if i + 1 < len(tokens) and tokens[i + 1][0] in ("num", "str"):
                var_names.append(tokens[i][1])
                i += 1
                break
            var_names.append(tokens[i][1])
            i += 1
            break

        pairs: list[tuple[float, str]] = []
        while i < len(tokens):
            if tokens[i][0] == "num" and i + 1 < len(tokens) and tokens[i + 1][0] == "str":
                pairs.append((float(tokens[i][1]), tokens[i + 1][1]))
                i += 2
            else:
                i += 1

        for vn in var_names:
            real = self._resolve(vn) or vn
            store = self.meta.value_labels.setdefault(real, {})
            for k, v in pairs:
                store[k] = v

    def _tokenize_labels(self, text: str) -> list[tuple[str, str]]:
        tokens: list[tuple[str, str]] = []
        i = 0
        n = len(text)
        while i < n:
            ch = text[i]
            if ch.isspace():
                i += 1
                continue
            if ch in "'\"":
                quote = ch
                i += 1
                buf = []
                while i < n and text[i] != quote:
                    buf.append(text[i])
                    i += 1
                if i < n:
                    i += 1
                tokens.append(("str", "".join(buf)))
                continue
            if ch.isdigit() or (ch == "-" and i + 1 < n and text[i + 1].isdigit()):
                m = re.match(r"-?\d+(?:\.\d+)?", text[i:])
                if m:
                    tokens.append(("num", m.group(0)))
                    i += len(m.group(0))
                    continue
            m = re.match(r"[A-Za-z_][\w.]*", text[i:])
            if m:
                tokens.append(("name", m.group(0)))
                i += len(m.group(0))
                continue
            i += 1
        return tokens

    # ---------------------------------------------------- VARIABLE LABELS

    def _cmd_variable_labels(self, cmd: SpsCommand) -> None:
        body = re.sub(r"(?i)^VARIABLE\s+LABELS\s+", "", cmd.text).strip()
        # VARIABLE LABELS var 'label'.  /  var "label"
        m = re.match(
            r"([A-Za-z_][\w.]*)\s+(['\"])(.*?)\2",
            body,
            flags=re.DOTALL,
        )
        if not m:
            return
        name, _, label = m.group(1), m.group(2), m.group(3)
        real = self._resolve(name) or name
        self.meta.column_labels[real] = label

    # ------------------------------------------------------------- COMPUTE

    def _cmd_compute(self, cmd: SpsCommand) -> None:
        body = re.sub(r"(?i)^COMPUTE\s+", "", cmd.text).strip()
        if "=" not in body:
            return
        left, right = body.split("=", 1)
        dest = left.strip()
        expr = right.strip()
        dst_real = self._ensure_col(dest)
        values = self._eval_expr(expr)
        self.df[dst_real] = self._apply_where(self.df[dst_real], values)

    def _eval_expr(self, expr: str) -> pd.Series:
        """Evalúa expresiones simples: literal, variable, o aritmética básica."""
        expr = expr.strip()
        # Literal numérico
        try:
            val = float(expr)
            return pd.Series(val, index=self.df.index, dtype="float64")
        except ValueError:
            pass
        # Solo nombre de variable
        if re.fullmatch(r"[A-Za-z_][\w.]*", expr):
            real = self._resolve(expr)
            if real is None:
                self._alert(f"COMPUTE: columna ausente '{expr}'")
                return pd.Series(np.nan, index=self.df.index)
            return pd.to_numeric(self.df[real], errors="coerce")
        # Reemplazar nombres de variables por series y evaluar aritmética segura
        # Solo +, -, *, /
        tokens = re.findall(r"[A-Za-z_][\w.]*|\d+(?:\.\d+)?|[+\-*/()]|\s+", expr)
        rebuilt: list[str] = []
        env: dict[str, pd.Series] = {}
        for tok in tokens:
            if not tok.strip():
                continue
            if re.fullmatch(r"[A-Za-z_][\w.]*", tok):
                real = self._resolve(tok)
                key = f"V_{len(env)}"
                if real is None:
                    env[key] = pd.Series(np.nan, index=self.df.index)
                    self._alert(f"COMPUTE: columna ausente '{tok}'")
                else:
                    env[key] = pd.to_numeric(self.df[real], errors="coerce")
                rebuilt.append(key)
            else:
                rebuilt.append(tok)
        code = "".join(rebuilt)
        try:
            result = eval(code, {"__builtins__": {}}, env)  # noqa: S307
            if isinstance(result, pd.Series):
                return result
            return pd.Series(result, index=self.df.index)
        except Exception as e:
            self._alert(f"COMPUTE expr falló '{expr}': {e}")
            return pd.Series(np.nan, index=self.df.index)

    # ------------------------------------------------------------------ IF

    def _cmd_if(self, cmd: SpsCommand) -> None:
        # IF (cond) var = value.
        # IF ((P126_1=1) and P126B=1) Vinculo=1.
        # IF (Missing (P126_1=1) and P126B=1) Vinculo=3.  ← SPSS idiom raro
        body = re.sub(r"(?i)^IF\s+", "", cmd.text).strip()
        # Separar condición y asignación: última aparición de ) antes de name=
        # Más simple: buscar el patrón ) NAME = VALUE al final
        m = re.search(
            r"\)\s*([A-Za-z_][\w.]*)\s*=\s*(.+)$",
            body,
        )
        if not m:
            # IF sin paréntesis externos: IF var=1 dest=2
            m2 = re.match(
                r"(.+?)\s+([A-Za-z_][\w.]*)\s*=\s*(.+)$",
                body,
            )
            if not m2:
                self._alert(f"L{cmd.line}: IF no parseable")
                return
            cond_text, dest, value_text = m2.group(1), m2.group(2), m2.group(3)
        else:
            dest, value_text = m.group(1), m.group(2)
            # Condición = todo antes del ) que cierra, incluyendo el (
            cond_text = body[: m.start() + 1]

        mask = self._eval_condition(cond_text)
        # Combinar con DO IF activo
        mask = mask & self._active_mask()
        dst_real = self._ensure_col(dest)
        value = self._parse_scalar(value_text.strip())
        self.df.loc[mask, dst_real] = value

    def _parse_scalar(self, text: str) -> Any:
        low = text.lower()
        if low in ("sys", "sysmis"):
            return np.nan
        try:
            return float(text)
        except ValueError:
            return text.strip("\"'")

    def _eval_condition(self, text: str) -> pd.Series:
        """Evalúa condiciones SPSS: (a=1) and (b>1), Missing(...), etc."""
        t = text.strip()
        # missing(VAR) / Missing(VAR) / Missing (VAR=1)
        def repl_missing(m: re.Match) -> str:
            var = m.group(1)
            return f"__MISS_{var}__"

        t2 = re.sub(
            r"(?i)\bmissing\s*\(\s*([A-Za-z_@][\w.]*)\s*(?:=\s*[^)]*)?\)",
            repl_missing,
            t,
        )
        return self._eval_condition_core(t2)

    def _eval_condition_core(self, text: str) -> pd.Series:
        # Reemplazar and/or/not
        expr = text
        # Tokens de missing placeholder
        miss_vars = re.findall(r"__MISS_([A-Za-z_@][\w.]*)__", expr)
        env: dict[str, Any] = {}
        for var in miss_vars:
            real = self._resolve(var)
            key = f"M_{len(env)}"
            if real is None:
                env[key] = pd.Series(True, index=self.df.index)
            else:
                env[key] = self.df[real].isna()
            expr = expr.replace(f"__MISS_{var}__", key)

        # Comparaciones: VAR op VAL (nombres pueden empezar con @)
        def repl_cmp(m: re.Match) -> str:
            var, op, val = m.group(1), m.group(2), m.group(3)
            real = self._resolve(var)
            key = f"C_{len(env)}"
            if real is None:
                env[key] = pd.Series(False, index=self.df.index)
            else:
                series = pd.to_numeric(self.df[real], errors="coerce")
                try:
                    v = float(val)
                except ValueError:
                    v = val.strip("\"'")
                    series = self.df[real]
                if op == "=":
                    env[key] = series == v
                elif op == ">":
                    env[key] = series > v
                elif op == "<":
                    env[key] = series < v
                elif op == ">=":
                    env[key] = series >= v
                elif op == "<=":
                    env[key] = series <= v
                elif op in ("<>", "~="):
                    env[key] = series != v
                else:
                    env[key] = pd.Series(False, index=self.df.index)
            return key

        # También strings: ESTRATO_ARG ="AB"
        expr = re.sub(
            r"([A-Za-z_@][\w.]*)\s*(<>|>=|<=|=|>|<)\s*("
            r"-?\d+(?:\.\d+)?|\"[^\"]*\"|'[^']*')",
            repl_cmp,
            expr,
        )
        expr = re.sub(r"(?i)\band\b", "&", expr)
        expr = re.sub(r"(?i)\bor\b", "|", expr)
        expr = re.sub(r"(?i)\bnot\b", "~", expr)
        # Limpiar paréntesis sobrantes triviales
        try:
            result = eval(expr, {"__builtins__": {}}, env)  # noqa: S307
            if isinstance(result, pd.Series):
                return result.fillna(False).astype(bool)
            return pd.Series(bool(result), index=self.df.index)
        except Exception as e:
            self._alert(f"IF condición falló '{text}': {e}")
            return pd.Series(False, index=self.df.index)

    # --------------------------------------------------------------- COUNT

    def _cmd_count(self, cmd: SpsCommand) -> None:
        # COUNT target = v1 v2 v3 (1).
        body = re.sub(r"(?i)^COUNT\s+", "", cmd.text).strip()
        m = re.match(
            r"([A-Za-z_][\w.]*)\s*=\s*(.+)\((\s*[^)]+\s*)\)\s*$",
            body,
        )
        if not m:
            self._alert(f"L{cmd.line}: COUNT no parseable")
            return
        dest = m.group(1)
        vars_text = m.group(2)
        val_text = m.group(3).strip()
        try:
            target_val = float(val_text)
        except ValueError:
            target_val = val_text.strip("\"'")
        src_vars = re.findall(r"[A-Za-z_][\w.]*", vars_text)
        counts = pd.Series(0, index=self.df.index, dtype="float64")
        for vn in src_vars:
            real = self._resolve(vn)
            if real is None:
                self._alert(f"COUNT: columna ausente '{vn}'")
                continue
            series = pd.to_numeric(self.df[real], errors="coerce")
            counts += (series == target_val).astype("float64")
        dst_real = self._ensure_col(dest)
        self.df[dst_real] = self._apply_where(self.df[dst_real], counts)

    # ---------------------------------------------------------- AUTORECODE

    def _cmd_autorecode(self, cmd: SpsCommand) -> None:
        # AUTORECODE VARIABLES=ESTRATO_ARG /INTO @NSE /PRINT.
        body = re.sub(r"(?i)^AUTORECODE\s+", "", cmd.text).strip()
        src_m = re.search(r"(?i)VARIABLES\s*=\s*([A-Za-z_][\w.]*)", body)
        into_m = re.search(r"(?i)/INTO\s+([A-Za-z_@][\w.]*)", body)
        if not src_m or not into_m:
            self._alert(f"L{cmd.line}: AUTORECODE incompleto")
            return
        src_name = src_m.group(1)
        dst_name = into_m.group(1)
        real = self._resolve(src_name)
        if real is None:
            self._alert(f"AUTORECODE: columna ausente '{src_name}'")
            return
        # Orden alfabético de valores únicos no-nulos (como SPSS)
        values = sorted({str(v) for v in self.df[real].dropna().unique()})
        mapping = {v: float(i + 1) for i, v in enumerate(values)}
        coded = self.df[real].map(lambda x: mapping.get(str(x), np.nan) if pd.notna(x) else np.nan)
        dst_real = self._ensure_col(dst_name)
        self.df[dst_real] = self._apply_where(self.df[dst_real], coded)

    # -------------------------------------------------------- DO IF/END IF

    def _cmd_do_if(self, cmd: SpsCommand) -> None:
        # DO IF (Wave=21).
        body = re.sub(r"(?i)^DO\s+IF\s+", "", cmd.text).strip()
        mask = self._eval_condition(body)
        self._if_stack.append(mask.fillna(False).astype(bool))

    def _cmd_end_if(self, cmd: SpsCommand) -> None:
        # END IF huérfano = no-op (como SPSS que falla ese comando y sigue).
        if self._if_stack:
            self._if_stack.pop()

    # -------------------------------------------------------------- MRSETS

    def _cmd_mrsets(self, cmd: SpsCommand) -> None:
        # Guardamos el texto original (con punto) para el .sps auxiliar.
        self.meta.mrsets.append(cmd.text.strip() + ".")
