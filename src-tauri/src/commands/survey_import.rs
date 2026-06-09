//! Lectura e inserción de Excels de encuestas para el Limpiador, hecha en Rust.
//!
//! Motivo: el lector JS del WebView (`xlsx-js-style`) carga toda la hoja como un
//! único string y revienta el límite de V8 (~536 MB) con el export crudo de QP,
//! y además materializa todo el dataset en la RAM del renderer (vimos 4 GB con
//! 10k×314). Acá usamos `calamine`, que parsea con bajo consumo, e insertamos a
//! Supabase vía PostgREST por batches, emitiendo progreso por evento Tauri.
//!
//! Dos comandos:
//!   - `read_survey_schema(path, source)`: abre el archivo, detecta la hoja y los
//!     headers, y devuelve un schema liviano + preview (sin materializar filas).
//!   - `import_survey_rows(...)`: streamea las filas y las inserta por batches.
//!
//! La lógica de detección de headers replica la del parser TS (F2a): tolerante a
//! acentos/mayúsculas/orden para QuestionPro.

use std::collections::{HashMap, HashSet};

use calamine::{open_workbook_auto, Data, Range, Reader};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter};

/// Evento Tauri con el progreso de inserción. Payload: `{ inserted, total }`.
pub const SURVEY_IMPORT_PROGRESS_EVENT: &str = "survey-import-progress";

#[derive(Debug, thiserror::Error)]
pub enum SurveyImportError {
    #[error("No se pudo abrir el Excel: {0}")]
    OpenWorkbook(String),

    #[error("No se pudo leer la hoja \"{sheet}\": {detail}")]
    ReadSheet { sheet: String, detail: String },

    #[error("El archivo no tiene hojas legibles. ¿Está vacío o corrupto?")]
    EmptyWorkbook,

    #[error("{0}")]
    NotEnoughRows(String),

    #[error("Parámetro inválido: {0}")]
    InvalidParam(String),

    #[error("Error de red insertando filas: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Falló insertar filas ({inserted}/{total}) — Supabase {status}: {body}")]
    Insert {
        inserted: usize,
        total: usize,
        status: u16,
        body: String,
    },

    #[error("Error interno de parsing: {0}")]
    Join(String),
}

// Los errores de comandos Tauri cruzan a JS como string.
impl Serialize for SurveyImportError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

// ===========================================================================
// Normalización + definición de metadata QP (espejo de excel-parser.ts F2a)
// ===========================================================================

/// Normaliza un header: saca acentos (español), pasa a minúsculas y colapsa
/// espacios. Así "País" == "Pais", "ID  Respuesta" == "id respuesta", etc.
fn normalize_header(s: &str) -> String {
    let mut mapped = String::with_capacity(s.len());
    for ch in s.chars() {
        let c = match ch {
            'á' | 'à' | 'ä' | 'â' | 'ã' | 'Á' | 'À' | 'Ä' | 'Â' | 'Ã' => 'a',
            'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' | 'Ó' | 'Ò' | 'Ö' | 'Ô' | 'Õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'u',
            'ñ' | 'Ñ' => 'n',
            other => other,
        };
        mapped.push(c);
    }
    mapped
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Bloque de metadata estándar de QP: (columnId, label, alias normalizados).
/// Incluye tanto las etiquetas del formato "limpio" (Automatizaciones) como las
/// del export crudo de QP, para reconocer ambos.
fn qp_metadata_defs() -> Vec<(&'static str, &'static str, Vec<&'static str>)> {
    vec![
        (
            "META_ID_RESPUESTA",
            "ID Respuesta",
            vec!["id respuesta", "id de respuesta", "response id", "responseid"],
        ),
        (
            "META_FECHA_HORA",
            "Fecha y Hora",
            vec![
                "fecha y hora",
                "fecha",
                "marca de tiempo",
                "marca de tiempo (mm/dd/yyyy)",
                "timestamp",
            ],
        ),
        (
            "META_MINUTOS",
            "Minutos",
            vec![
                "minutos",
                "tiempo necesario para completar (segundos)",
                "tiempo necesario para completar",
                "timetaken",
            ],
        ),
        (
            "META_ESTADO",
            "Estado",
            vec!["estado", "estado de respuesta", "responsestatus"],
        ),
        ("META_IP", "IP", vec!["ip", "direccion ip", "ip address", "ipaddress"]),
        ("META_DUPLICADO", "Duplicado", vec!["duplicado", "duplicar", "duplicate"]),
        ("META_PAIS", "País", vec!["pais", "country"]),
    ]
}

// ===========================================================================
// Conversión de celdas calamine -> JSON / String
// ===========================================================================

/// f64 -> número JSON, usando entero cuando el valor es entero (evita "5.0").
fn float_to_value(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992_f64 {
        Value::Number((f as i64).into())
    } else {
        serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

/// Valor de celda para persistir en `cleaning_rows.data` (preserva tipos).
fn data_to_json(d: &Data) -> Value {
    match d {
        Data::Empty => Value::Null,
        Data::String(s) => Value::String(s.clone()),
        Data::Bool(b) => Value::Bool(*b),
        Data::Int(i) => Value::Number((*i).into()),
        Data::Float(f) => float_to_value(*f),
        Data::DateTime(dt) => float_to_value(dt.as_f64()),
        Data::DateTimeIso(s) => Value::String(s.clone()),
        Data::DurationIso(s) => Value::String(s.clone()),
        Data::Error(_) => Value::Null,
    }
}

/// Representación string de una celda (para headers y response_id).
fn cell_to_string(d: &Data) -> String {
    match d {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Bool(b) => b.to_string(),
        Data::Int(i) => i.to_string(),
        Data::Float(f) => {
            if f.fract() == 0.0 {
                (*f as i64).to_string()
            } else {
                f.to_string()
            }
        }
        Data::DateTime(dt) => {
            let v = dt.as_f64();
            if v.fract() == 0.0 {
                (v as i64).to_string()
            } else {
                v.to_string()
            }
        }
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(_) => String::new(),
    }
}

// ===========================================================================
// Schema (salida del lector). Las claves de columna usan snake_case para
// coincidir con `SchemaColumn` del lado TS (`is_metadata`).
// ===========================================================================

#[derive(Debug, Clone, Serialize)]
struct SchemaColumnOut {
    index: usize,
    id: String,
    question: String,
    is_metadata: bool,
}

#[derive(Debug, Serialize)]
struct SchemaOut {
    columns: Vec<SchemaColumnOut>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewOut {
    headers: Vec<String>,
    sample_rows: Vec<Map<String, Value>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SurveySchemaResult {
    schema: SchemaOut,
    total_rows: usize,
    preview: PreviewOut,
    sheet_name: String,
}

/// Elige la hoja a leer. Para QuestionPro, el export crudo trae los datos en
/// "Datos sin procesar"; si existe la usamos, si no, la primera hoja.
fn pick_sheet(names: &[String], source: &str) -> Option<String> {
    if source == "questionpro" {
        if let Some(n) = names
            .iter()
            .find(|n| normalize_header(n) == "datos sin procesar")
        {
            return Some(n.clone());
        }
    }
    names.first().cloned()
}

/// Cantidad de filas de encabezado según el origen (Qualtrics: ids + textos).
fn header_rows(source: &str) -> usize {
    if source == "qualtrics" {
        2
    } else {
        1
    }
}

/// Construye las columnas del schema a partir del header, según el origen.
/// Devuelve (columnas, índice de columna del response_id).
fn build_columns(header: &[Data], texts: Option<&[Data]>, source: &str) -> (Vec<SchemaColumnOut>, usize) {
    if source == "qualtrics" {
        build_qualtrics_columns(header, texts.unwrap_or(&[]))
    } else {
        build_questionpro_columns(header)
    }
}

/// Qualtrics: fila 1 = ids de columna, fila 2 = textos de pregunta.
fn build_qualtrics_columns(ids: &[Data], texts: &[Data]) -> (Vec<SchemaColumnOut>, usize) {
    let mut cols = Vec::new();
    let mut response_id_index = 0usize;
    let mut found_rid = false;

    for (index, id_cell) in ids.iter().enumerate() {
        let id = cell_to_string(id_cell).trim().to_string();
        if id.is_empty() {
            continue;
        }
        let question = texts
            .get(index)
            .map(cell_to_string)
            .unwrap_or_default()
            .trim()
            .to_string();
        if !found_rid && id.to_uppercase().contains("RESPONSEID") {
            response_id_index = index;
            found_rid = true;
        }
        cols.push(SchemaColumnOut {
            index,
            id,
            question,
            is_metadata: false,
        });
    }
    (cols, response_id_index)
}

/// QuestionPro (formato limpio): fila 1 = headers. Detección tolerante de la
/// metadata por alias; el resto son preguntas Q1..Qn.
fn build_questionpro_columns(header: &[Data]) -> (Vec<SchemaColumnOut>, usize) {
    let defs = qp_metadata_defs();

    // alias normalizado -> (columnId, label)
    let mut alias_map: HashMap<String, (&'static str, &'static str)> = HashMap::new();
    for (column_id, label, aliases) in &defs {
        for alias in aliases {
            alias_map.insert((*alias).to_string(), (*column_id, *label));
        }
    }

    let mut cols = Vec::new();
    let mut assigned: HashSet<&'static str> = HashSet::new();
    let mut question_counter = 0usize;
    let mut response_id_index = 0usize;
    let mut found_rid = false;

    for (index, cell) in header.iter().enumerate() {
        let text = cell_to_string(cell);
        let norm = normalize_header(&text);
        let meta = if norm.is_empty() {
            None
        } else {
            alias_map.get(norm.as_str()).copied()
        };

        match meta {
            Some((column_id, label)) if !assigned.contains(column_id) => {
                assigned.insert(column_id);
                if column_id == "META_ID_RESPUESTA" && !found_rid {
                    response_id_index = index;
                    found_rid = true;
                }
                cols.push(SchemaColumnOut {
                    index,
                    id: column_id.to_string(),
                    question: label.to_string(),
                    is_metadata: true,
                });
            }
            _ => {
                question_counter += 1;
                let trimmed = text.trim();
                cols.push(SchemaColumnOut {
                    index,
                    id: format!("Q{question_counter}"),
                    question: if trimmed.is_empty() {
                        format!("Q{question_counter}")
                    } else {
                        trimmed.to_string()
                    },
                    is_metadata: false,
                });
            }
        }
    }

    (cols, response_id_index)
}

// ===========================================================================
// Comando: read_survey_schema
// ===========================================================================

/// Lee el archivo y devuelve el schema + preview, sin materializar las filas.
#[tauri::command]
pub async fn read_survey_schema(
    path: String,
    source: String,
) -> Result<SurveySchemaResult, SurveyImportError> {
    tauri::async_runtime::spawn_blocking(move || read_schema_blocking(&path, &source))
        .await
        .map_err(|e| SurveyImportError::Join(e.to_string()))?
}

/// Abre el workbook, elige la hoja y devuelve su rango completo + el nombre de
/// hoja. Compartido por el lector de schema y el import. (calamine carga toda
/// la hoja en memoria; no expone lectura por fila.)
fn load_range(path: &str, source: &str) -> Result<(Range<Data>, String), SurveyImportError> {
    let mut workbook =
        open_workbook_auto(path).map_err(|e| SurveyImportError::OpenWorkbook(e.to_string()))?;
    let names = workbook.sheet_names();
    let sheet_name = pick_sheet(&names, source).ok_or(SurveyImportError::EmptyWorkbook)?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| SurveyImportError::ReadSheet {
            sheet: sheet_name.clone(),
            detail: e.to_string(),
        })?;
    Ok((range, sheet_name))
}

fn read_schema_blocking(path: &str, source: &str) -> Result<SurveySchemaResult, SurveyImportError> {
    let (range, sheet_name) = load_range(path, source)?;

    let start = header_rows(source);
    let mut rows_iter = range.rows();

    let header: Vec<Data> = rows_iter
        .next()
        .map(|r| r.to_vec())
        .ok_or_else(|| SurveyImportError::NotEnoughRows("El archivo está vacío.".into()))?;

    let texts: Option<Vec<Data>> = if source == "qualtrics" {
        let t = rows_iter.next().map(|r| r.to_vec()).ok_or_else(|| {
            SurveyImportError::NotEnoughRows(
                "El archivo Qualtrics debe tener al menos 3 filas (IDs, textos y datos)."
                    .into(),
            )
        })?;
        Some(t)
    } else {
        None
    };

    let (columns, _rid) = build_columns(&header, texts.as_deref(), source);
    if columns.is_empty() {
        return Err(SurveyImportError::NotEnoughRows(
            "No se detectaron columnas con encabezado en el archivo.".into(),
        ));
    }

    let total_height = range.height();
    let total_rows = total_height.saturating_sub(start);

    // Preview: primeras 5 columnas, primeras 3 filas de datos.
    let preview_cols: Vec<&SchemaColumnOut> = columns.iter().take(5).collect();
    let headers: Vec<String> = preview_cols.iter().map(|c| c.id.clone()).collect();

    let mut sample_rows: Vec<Map<String, Value>> = Vec::new();
    for row in range.rows().skip(start).take(3) {
        let mut obj = Map::new();
        for col in &preview_cols {
            let v = row.get(col.index).map(data_to_json).unwrap_or(Value::Null);
            obj.insert(col.id.clone(), v);
        }
        sample_rows.push(obj);
    }

    Ok(SurveySchemaResult {
        schema: SchemaOut { columns },
        total_rows,
        preview: PreviewOut {
            headers,
            sample_rows,
        },
        sheet_name,
    })
}

// ===========================================================================
// Comando: import_survey_rows
// ===========================================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportParams {
    /// Ruta absoluta al .xlsx/.xls en disco.
    pub path: String,
    /// "qualtrics" | "questionpro".
    pub source: String,
    /// Schema (posiblemente enriquecido por QP). Sólo se usan `columns[].index`
    /// y `columns[].id`.
    pub schema: Value,
    /// Id de la `cleaning_versions` ya creada en JS.
    pub version_id: String,
    /// URL del proyecto Supabase (ej. https://xxx.supabase.co).
    pub supabase_url: String,
    /// anon key del proyecto.
    pub anon_key: String,
    /// Filas por request a PostgREST. Default 500.
    #[serde(default)]
    pub batch_size: Option<usize>,
}

/// Mapeo de columnas del schema -> (índice en la hoja, id) + índice de la
/// columna del response_id (META_ID_RESPUESTA o *ResponseId*).
fn parse_schema_columns(schema: &Value) -> (Vec<(usize, String)>, Option<usize>) {
    let arr = schema.get("columns").and_then(Value::as_array);

    let cols: Vec<(usize, String)> = arr
        .map(|a| {
            a.iter()
                .filter_map(|c| {
                    let idx = c.get("index").and_then(Value::as_u64)? as usize;
                    let id = c.get("id").and_then(Value::as_str)?.to_string();
                    Some((idx, id))
                })
                .collect()
        })
        .unwrap_or_default();

    let rid_index = arr.and_then(|a| {
        a.iter().find_map(|c| {
            let id = c.get("id").and_then(Value::as_str)?;
            let idx = c.get("index").and_then(Value::as_u64)? as usize;
            if id == "META_ID_RESPUESTA" || id.to_uppercase().contains("RESPONSEID") {
                Some(idx)
            } else {
                None
            }
        })
    });

    (cols, rid_index)
}

/// Inserta un batch en `cleaning_rows` vía PostgREST. Serializa el slice sin
/// clonarlo. Devuelve error con status/body si Supabase rechaza.
async fn post_batch(
    client: &reqwest::Client,
    endpoint: &str,
    anon_key: &str,
    batch: &[Value],
    inserted: usize,
    total: usize,
) -> Result<(), SurveyImportError> {
    let res = client
        .post(endpoint)
        .header("apikey", anon_key)
        .header("Authorization", format!("Bearer {anon_key}"))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(batch)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        return Err(SurveyImportError::Insert {
            inserted,
            total,
            status,
            body: truncate(&text, 400),
        });
    }
    Ok(())
}

/// Streamea las filas del Excel y las inserta en `cleaning_rows` por batches.
/// Arma cada batch al vuelo y lo libera tras insertarlo (no materializa todas
/// las filas en memoria). Emite `SURVEY_IMPORT_PROGRESS_EVENT` tras cada batch.
#[tauri::command]
pub async fn import_survey_rows(
    app: AppHandle,
    params: ImportParams,
) -> Result<usize, SurveyImportError> {
    let url = params.supabase_url.trim().trim_end_matches('/').to_string();
    let anon_key = params.anon_key.trim().to_string();
    if url.is_empty() || anon_key.is_empty() {
        return Err(SurveyImportError::InvalidParam(
            "Faltan la URL o la anon key de Supabase.".into(),
        ));
    }
    let batch_size = params.batch_size.unwrap_or(500).max(1);

    let (cols, rid_index) = parse_schema_columns(&params.schema);
    if cols.is_empty() {
        return Err(SurveyImportError::InvalidParam(
            "El schema no tiene columnas.".into(),
        ));
    }

    // La carga del archivo (calamine) es CPU/IO sync: fuera del runtime async.
    let path = params.path.clone();
    let source = params.source.clone();
    let (range, _sheet) =
        tauri::async_runtime::spawn_blocking(move || load_range(&path, &source))
            .await
            .map_err(|e| SurveyImportError::Join(e.to_string()))??;

    let start = header_rows(&params.source);
    let total = range.height().saturating_sub(start);
    let version_id = params.version_id;

    let client = reqwest::Client::new();
    let endpoint = format!("{url}/rest/v1/cleaning_rows");
    let mut inserted = 0usize;
    let mut batch: Vec<Value> = Vec::with_capacity(batch_size);
    let mut row_number: i64 = 0;

    for row in range.rows().skip(start) {
        row_number += 1;
        let mut data = Map::new();
        for (idx, id) in &cols {
            let v = row.get(*idx).map(data_to_json).unwrap_or(Value::Null);
            data.insert(id.clone(), v);
        }
        let response_id: Option<String> = rid_index
            .and_then(|i| row.get(i))
            .map(cell_to_string)
            .filter(|s| !s.is_empty());

        batch.push(json!({
            "version_id": version_id,
            "row_number": row_number,
            "response_id": response_id,
            "data": Value::Object(data),
        }));

        if batch.len() >= batch_size {
            post_batch(&client, &endpoint, &anon_key, &batch, inserted, total).await?;
            inserted += batch.len();
            let _ = app.emit(
                SURVEY_IMPORT_PROGRESS_EVENT,
                json!({ "inserted": inserted, "total": total }),
            );
            batch.clear();
        }
    }

    // Último batch parcial.
    if !batch.is_empty() {
        post_batch(&client, &endpoint, &anon_key, &batch, inserted, total).await?;
        inserted += batch.len();
        let _ = app.emit(
            SURVEY_IMPORT_PROGRESS_EVENT,
            json!({ "inserted": inserted, "total": total }),
        );
    }

    Ok(inserted)
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}
