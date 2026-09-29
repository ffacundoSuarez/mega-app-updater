"""Parser de un subconjunto de sintaxis SPSS (.sps).

Junta líneas hasta el punto que cierra el comando. Un punto dentro de un nombre
(P02_1.0) o de un decimal (1.5) no cierra. Una línea que empieza con `*` es un
comando comentado entero. Bloques /* */ se omiten.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class SpsCommand:
    """Un comando SPSS ya cerrado (sin el punto final)."""

    kind: str
    text: str
    line: int


def _strip_block_comments(src: str) -> str:
    """Quita comentarios de bloque /* ... */ (pueden cruzar líneas)."""
    out: list[str] = []
    i = 0
    n = len(src)
    while i < n:
        if src[i : i + 2] == "/*":
            end = src.find("*/", i + 2)
            if end < 0:
                break
            out.append(" ")
            i = end + 2
            continue
        out.append(src[i])
        i += 1
    return "".join(out)


def _terminating_dot_index(text: str) -> int | None:
    """Índice del punto que cierra el comando, o None si aún no hay."""
    in_single = False
    in_double = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue
        if in_single or in_double:
            i += 1
            continue
        if ch == ".":
            prev = text[i - 1] if i > 0 else ""
            nxt = text[i + 1] if i + 1 < n else ""
            # Parte de decimal o de nombre: P02_1.0 / 1.5
            if nxt.isdigit() and (prev.isdigit() or prev.isalnum() or prev == "_"):
                i += 1
                continue
            if nxt == "" or nxt.isspace():
                return i
        i += 1
    return None


def _classify(text: str) -> str:
    head = text.lstrip().split(None, 1)[0].upper() if text.strip() else ""
    mapping = {
        "RENAME": "RENAME",
        "RECODE": "RECODE",
        "ALTER": "ALTER_TYPE",
        "FORMATS": "FORMATS",
        "VALUE": "VALUE_LABELS",
        "VARIABLE": "VARIABLE_LABELS",
        "COMPUTE": "COMPUTE",
        "IF": "IF",
        "COUNT": "COUNT",
        "AUTORECODE": "AUTORECODE",
        "DO": "DO_IF",
        "END": "END_IF",
        "MRSETS": "MRSETS",
        "EXECUTE": "NOOP",
        "EXE": "NOOP",
        "FREQUENCIES": "NOOP",
        "FRE": "NOOP",
        "PRINT": "NOOP",
        "DISPLAY": "NOOP",
    }
    return mapping.get(head, "UNKNOWN")


def parse_sps(source: str) -> list[SpsCommand]:
    """Parsea un .sps completo a una lista de comandos."""
    cleaned = _strip_block_comments(source)
    commands: list[SpsCommand] = []
    buf = ""
    buf_start_line = 1
    in_command = False

    for line_no, raw_line in enumerate(cleaned.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            if in_command:
                buf += " "
            continue

        # Comentario de línea completa (fuera de un comando en curso).
        if stripped.startswith("*") and not in_command:
            continue

        if not in_command:
            buf = stripped
            buf_start_line = line_no
            in_command = True
        else:
            buf += " " + stripped

        # Puede haber varios comandos en la misma línea lógica (raro).
        while True:
            idx = _terminating_dot_index(buf)
            if idx is None:
                break
            cmd_text = buf[:idx].strip()
            rest = buf[idx + 1 :].lstrip()
            if cmd_text:
                kind = _classify(cmd_text)
                if kind != "NOOP":
                    commands.append(
                        SpsCommand(kind=kind, text=cmd_text, line=buf_start_line)
                    )
            buf = rest
            if not buf:
                in_command = False
                break
            # El resto es el inicio del siguiente comando en la misma línea.
            buf_start_line = line_no

    return commands


def parse_sps_file(path: str) -> list[SpsCommand]:
    """Lee un archivo .sps (UTF-8 con fallback latin1) y lo parsea."""
    p = Path(path)
    try:
        raw = p.read_text(encoding="utf-8-sig")  # strip BOM
    except UnicodeDecodeError:
        raw = p.read_text(encoding="latin1")
    return parse_sps(raw)
