//! Comandos Tauri para llamadas de escritura a QuestionPro.
//!
//! El renderer puede leer algunas APIs de QP con `fetch`, pero la creación de
//! preguntas falla por CORS en el WebView. Estas llamadas salen desde Rust para
//! esquivar esa restricción y devolver errores con status/body útiles.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const QP_API_BASE: &str = "https://api.questionpro.com/a/api/v2";

#[derive(Debug, thiserror::Error)]
pub enum QuestionproError {
    #[error("Parámetro inválido: {0}")]
    InvalidParam(String),

    #[error("Error de red llamando a QuestionPro: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Error de QuestionPro ({status}): {body}")]
    Api { status: u16, body: String },

    #[error("QuestionPro devolvió una respuesta inesperada: {0}")]
    UnexpectedResponse(String),
}

impl serde::Serialize for QuestionproError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSurveyParams {
    pub user_id: String,
    pub api_key: String,
    pub name: String,
    #[serde(default)]
    pub folder_id: Option<i64>,
    #[serde(default)]
    pub save_and_continue: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSurvey {
    pub survey_id: i64,
    pub name: String,
    pub url: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateQuestionParams {
    pub survey_id: String,
    pub api_key: String,
    pub payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedQuestion {
    pub question_id: i64,
    pub block_id: Option<i64>,
    pub order_number: Option<i64>,
}

#[tauri::command]
pub async fn questionpro_create_survey(
    params: CreateSurveyParams,
) -> Result<CreatedSurvey, QuestionproError> {
    let user_id = params.user_id.trim();
    let api_key = params.api_key.trim();
    let name = params.name.trim();
    if user_id.is_empty() {
        return Err(QuestionproError::InvalidParam(
            "Falta el User ID de QuestionPro".into(),
        ));
    }
    if api_key.is_empty() {
        return Err(QuestionproError::InvalidParam(
            "Falta la API key de QuestionPro".into(),
        ));
    }
    if name.is_empty() {
        return Err(QuestionproError::InvalidParam(
            "El nombre de la encuesta no puede estar vacío".into(),
        ));
    }

    let mut body = json!({ "name": name });
    if let Some(folder_id) = params.folder_id {
        body["folderID"] = json!(folder_id);
    }
    if let Some(save_and_continue) = params.save_and_continue {
        body["saveAndContinue"] = json!(save_and_continue);
    }

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{QP_API_BASE}/users/{user_id}/surveys"))
        .header("api-key", api_key)
        .json(&body)
        .send()
        .await?;

    let data = json_response(res).await?;
    let response = data
        .get("response")
        .ok_or_else(|| QuestionproError::UnexpectedResponse(data.to_string()))?;
    let survey_id = response
        .get("surveyID")
        .and_then(Value::as_i64)
        .ok_or_else(|| QuestionproError::UnexpectedResponse(data.to_string()))?;

    Ok(CreatedSurvey {
        survey_id,
        name: response
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(name)
            .to_string(),
        url: response
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        status: response
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("Unknown")
            .to_string(),
    })
}

#[tauri::command]
pub async fn questionpro_create_question(
    params: CreateQuestionParams,
) -> Result<CreatedQuestion, QuestionproError> {
    let survey_id = params.survey_id.trim();
    let api_key = params.api_key.trim();
    if survey_id.is_empty() {
        return Err(QuestionproError::InvalidParam(
            "Falta el Survey ID de QuestionPro".into(),
        ));
    }
    if api_key.is_empty() {
        return Err(QuestionproError::InvalidParam(
            "Falta la API key de QuestionPro".into(),
        ));
    }

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{QP_API_BASE}/surveys/{survey_id}/questions"))
        .header("api-key", api_key)
        .json(&params.payload)
        .send()
        .await?;

    let data = json_response(res).await?;
    let response = data
        .get("response")
        .ok_or_else(|| QuestionproError::UnexpectedResponse(data.to_string()))?;
    let question_id = response
        .get("questionID")
        .and_then(Value::as_i64)
        .ok_or_else(|| QuestionproError::UnexpectedResponse(data.to_string()))?;

    Ok(CreatedQuestion {
        question_id,
        block_id: response.get("blockID").and_then(Value::as_i64),
        order_number: response.get("orderNumber").and_then(Value::as_i64),
    })
}

async fn json_response(res: reqwest::Response) -> Result<Value, QuestionproError> {
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(QuestionproError::Api {
            status: status.as_u16(),
            body: truncate(&text, 500),
        });
    }
    serde_json::from_str(&text).map_err(|_| QuestionproError::UnexpectedResponse(truncate(&text, 500)))
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}
