//! Lectura de Excel para Codificación (respuestas + libro de códigos).
//!
//! Mismo motivo que `survey_import.rs`: evitar parsear archivos grandes en el
//! WebView con `xlsx-js-style`. Usa calamine en un worker thread.

use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum CodificacionImportError {
    #[error("No se pudo abrir el Excel: {0}")]
    OpenWorkbook(String),

    #[error("No se pudo leer la hoja: {0}")]
    ReadSheet(String),

    #[error("El archivo no tiene hojas")]
    EmptyWorkbook,

    #[error("{0}")]
    Validation(String),

    #[error("Error interno: {0}")]
    Join(String),
}

impl Serialize for CodificacionImportError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

fn float_to_value(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992_f64 {
        Value::Number((f as i64).into())
    } else {
        serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null)
    }
}

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
        Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
        Data::Error(_) => String::new(),
    }
}

fn filename_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("archivo.xlsx")
        .to_string()
}

fn display_response(text: &str) -> String {
    let t = text.trim();
    if t.is_empty() {
        return "(vacío)".to_string();
    }
    if t.chars().count() > 120 {
        format!("{}…", t.chars().take(120).collect::<String>())
    } else {
        t.to_string()
    }
}

fn load_raw_matrix(path: &str) -> Result<Vec<Vec<Value>>, CodificacionImportError> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|e| CodificacionImportError::OpenWorkbook(e.to_string()))?;
    let names = workbook.sheet_names();
    let sheet = names
        .first()
        .cloned()
        .ok_or(CodificacionImportError::EmptyWorkbook)?;
    let range = workbook
        .worksheet_range(&sheet)
        .map_err(|e| CodificacionImportError::ReadSheet(e.to_string()))?;

    Ok(range
        .rows()
        .map(|row| row.iter().map(data_to_json).collect())
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRowOut {
    id: String,
    response: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelUploadDataOut {
    filename: String,
    rows: usize,
    columns: Vec<String>,
    preview: Vec<PreviewRowOut>,
    raw_data: Vec<Vec<Value>>,
    id_column_index: usize,
    response_column_index: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionProColumnOut {
    index: usize,
    name: String,
    non_empty_count: usize,
    preview: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingQuestionProOut {
    filename: String,
    columns: Vec<QuestionProColumnOut>,
    raw_data: Vec<Vec<Value>>,
    id_column_index: usize,
    id_column_name: String,
    total_rows: usize,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ParseResponsesResultOut {
    #[serde(rename = "ready")]
    Ready { data: ExcelUploadDataOut },
    #[serde(rename = "select-column")]
    SelectColumn { pending: PendingQuestionProOut },
}

fn header_strings(row: &[Value]) -> Vec<String> {
    row.iter()
        .map(|v| match v {
            Value::Null => String::new(),
            Value::String(s) => s.trim().to_string(),
            other => other.to_string().trim().to_string(),
        })
        .collect()
}

fn build_question_pro_pending(
    filename: String,
    json_data: &[Vec<Value>],
    headers: &[String],
) -> Result<PendingQuestionProOut, CodificacionImportError> {
    let data_rows = &json_data[1..];

    let mut id_column_index = headers.iter().position(|h| {
        let n = h.to_uppercase();
        n == "RESPONSE ID" || n == "ID RESPUESTA" || n == "ID DE RESPUESTA"
    });
    if id_column_index.is_none() {
        id_column_index = Some(0);
    }
    let id_column_index = id_column_index.unwrap();

    let mut columns = Vec::new();
    for (index, header) in headers.iter().enumerate() {
        if index == id_column_index || header.is_empty() {
            continue;
        }
        let mut non_empty_count = 0usize;
        let mut preview = Vec::new();
        for row in data_rows {
            if let Some(val) = row.get(index) {
                let s = match val {
                    Value::Null => String::new(),
                    Value::String(s) => s.trim().to_string(),
                    other => other.to_string().trim().to_string(),
                };
                if !s.is_empty() {
                    non_empty_count += 1;
                    if preview.len() < 2 {
                        preview.push(display_response(&s));
                    }
                }
            }
        }
        columns.push(QuestionProColumnOut {
            index,
            name: header.clone(),
            non_empty_count,
            preview,
        });
    }

    if columns.is_empty() {
        return Err(CodificacionImportError::Validation(
            "No se encontraron columnas válidas en el archivo".into(),
        ));
    }

    Ok(PendingQuestionProOut {
        filename,
        columns,
        raw_data: json_data.to_vec(),
        id_column_index,
        id_column_name: headers
            .get(id_column_index)
            .filter(|s| !s.is_empty())
            .cloned()
            .unwrap_or_else(|| format!("Columna {}", id_column_index + 1)),
        total_rows: data_rows.len(),
    })
}

fn parse_responses_blocking(
    path: &str,
    platform: &str,
) -> Result<ParseResponsesResultOut, CodificacionImportError> {
    let json_data = load_raw_matrix(path)?;
    if json_data.len() < 2 {
        return Err(CodificacionImportError::Validation(
            "El archivo debe tener al menos 2 filas (encabezados + datos)".into(),
        ));
    }

    let filename = filename_from_path(path);
    let headers = header_strings(&json_data[0]);

    if platform == "questionpro" {
        let pending = build_question_pro_pending(filename, &json_data, &headers)?;
        return Ok(ParseResponsesResultOut::SelectColumn { pending });
    }

    let non_empty_headers: Vec<&String> = headers.iter().filter(|h| !h.is_empty()).collect();
    if non_empty_headers.len() < 2 {
        return Err(CodificacionImportError::Validation(
            "El archivo debe tener al menos 2 columnas (ID y Respuesta)".into(),
        ));
    }

    let data_rows = &json_data[1..];
    let preview: Vec<PreviewRowOut> = data_rows
        .iter()
        .take(5)
        .enumerate()
        .map(|(index, row)| {
            let id = row
                .first()
                .map(|v| cell_to_string_from_value(v))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| format!("Row_{}", index + 1));
            let response = row
                .get(1)
                .map(|v| display_response(&cell_to_string_from_value(v)))
                .unwrap_or_else(|| display_response(""));
            PreviewRowOut { id, response }
        })
        .collect();

    Ok(ParseResponsesResultOut::Ready {
        data: ExcelUploadDataOut {
            filename,
            rows: data_rows.len(),
            columns: headers.iter().filter(|h| !h.is_empty()).cloned().collect(),
            preview,
            raw_data: json_data,
            id_column_index: 0,
            response_column_index: 1,
        },
    })
}

fn cell_to_string_from_value(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBookRowOut {
    id: i64,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseCategoryBookResultOut {
    categories: Vec<CategoryBookRowOut>,
    errors: Vec<String>,
}

fn parse_category_book_blocking(path: &str) -> Result<ParseCategoryBookResultOut, CodificacionImportError> {
    let mut workbook = open_workbook_auto(path)
        .map_err(|e| CodificacionImportError::OpenWorkbook(e.to_string()))?;
    let names = workbook.sheet_names();
    let sheet = names
        .first()
        .cloned()
        .ok_or(CodificacionImportError::EmptyWorkbook)?;
    let range = workbook
        .worksheet_range(&sheet)
        .map_err(|e| CodificacionImportError::ReadSheet(e.to_string()))?;

    let rows: Vec<Vec<Data>> = range.rows().map(|r| r.to_vec()).collect();
    if rows.len() < 2 {
        return Err(CodificacionImportError::Validation(
            "El archivo debe tener al menos 2 filas".into(),
        ));
    }

    let mut categories = Vec::new();
    let mut errors = Vec::new();
    let mut used_ids = std::collections::HashSet::new();
    let mut used_names = std::collections::HashSet::new();

    for (idx, row) in rows.iter().enumerate().skip(1) {
        let original_row_number = idx + 1;
        let cells: Vec<String> = row.iter().map(|d| cell_to_string(d).trim().to_string()).collect();
        if cells.iter().all(|c| c.is_empty()) {
            continue;
        }

        let mut id_idx: Option<usize> = None;
        let mut parsed_id: Option<i64> = None;
        for (i, cell) in cells.iter().enumerate() {
            if let Ok(num) = cell.parse::<f64>() {
                if num.fract() == 0.0 && num > 0.0 {
                    id_idx = Some(i);
                    parsed_id = Some(num as i64);
                    break;
                }
            }
        }

        let mut name_idx: Option<usize> = None;
        for (i, cell) in cells.iter().enumerate() {
            if Some(i) == id_idx {
                continue;
            }
            if !cell.is_empty() {
                name_idx = Some(i);
                break;
            }
        }

        let mut description_idx: Option<usize> = None;
        for (i, cell) in cells.iter().enumerate() {
            if Some(i) == id_idx || Some(i) == name_idx {
                continue;
            }
            if !cell.is_empty() {
                description_idx = Some(i);
                break;
            }
        }

        let name = name_idx
            .and_then(|i| cells.get(i))
            .map(|s| s.as_str())
            .unwrap_or("");
        if name.is_empty() {
            errors.push(format!(
                "Fila {original_row_number}: Nombre de categoría vacío"
            ));
            continue;
        }
        let Some(parsed_id) = parsed_id else {
            errors.push(format!(
                "Fila {original_row_number}: ID de categoría vacío"
            ));
            continue;
        };
        if used_ids.contains(&parsed_id) {
            errors.push(format!(
                "Fila {original_row_number}: ID {parsed_id} ya existe"
            ));
            continue;
        }
        let name_key = name.to_lowercase();
        if used_names.contains(&name_key) {
            errors.push(format!(
                "Fila {original_row_number}: Categoría \"{name}\" ya existe"
            ));
            continue;
        }

        used_ids.insert(parsed_id);
        used_names.insert(name_key);
        categories.push(CategoryBookRowOut {
            id: parsed_id,
            name: name.to_string(),
            description: description_idx.and_then(|i| {
                cells.get(i).filter(|s| !s.is_empty()).cloned()
            }),
        });
    }

    categories.sort_by_key(|c| c.id);
    Ok(ParseCategoryBookResultOut { categories, errors })
}

/// Parsea el Excel de respuestas para Codificación (Qualtrics o QuestionPro).
#[tauri::command]
pub async fn parse_codificacion_responses(
    path: String,
    platform: String,
) -> Result<ParseResponsesResultOut, CodificacionImportError> {
    tauri::async_runtime::spawn_blocking(move || parse_responses_blocking(&path, &platform))
        .await
        .map_err(|e| CodificacionImportError::Join(e.to_string()))?
}

/// Parsea un libro de códigos desde Excel.
#[tauri::command]
pub async fn parse_codificacion_category_book(
    path: String,
) -> Result<ParseCategoryBookResultOut, CodificacionImportError> {
    tauri::async_runtime::spawn_blocking(move || parse_category_book_blocking(&path))
        .await
        .map_err(|e| CodificacionImportError::Join(e.to_string()))?
}
