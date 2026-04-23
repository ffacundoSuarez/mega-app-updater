# utils.py

import pandas as pd
import numpy as np
import pyreadstat
import logging
import math
import os
import sys
import re 
from pptx import Presentation
from scipy import stats  # Esto soluciona 'stats is not defined'

# AÑADIR IMPORTS DE GEMINI
from google import genai
from google.genai.errors import APIError
from . import config 
#import config
# 1. Definición y carga de la clave API
API_KEY = os.environ.get("GEMINI_API_KEY")# 2. Variable de disponibilidad
LLM_AVAILABLE = True
try:
    if config.RUN_LLM:
        if API_KEY:
            # Inicializamos el cliente de Gemini si la clave existe
            #genai.configure(api_key=API_KEY)
            # Intentamos listar modelos para confirmar que la conexión funciona
            # genai.Client() # Solo para inicializar
            LLM_AVAILABLE = True
            logging.info("Gemini Client inicializado con éxito.")
        else:
            logging.error("No se encontró la clave API de Gemini (GEMINI_API_KEY). LLM_AVAILABLE = False.")
except Exception as e:
    logging.error(f"Fallo al inicializar el cliente de Gemini: {e}")
# ----------------------------------------------------
# Definiciones globales para el módulo
# ----------------------------------------------------

# --- FUNCIONES DE MANEJO DE METADATOS Y ARCHIVOS ---
def load_data_and_apply_base_filter(sav_file, is_secundaria=False):
    """Carga la base, aplica manejo de errores y filtra la base de datos (Retorna df, meta)."""
    
    # =========================================================
    # 🚀 NUEVO: RUTEO DE VARIABLES DE CONFIGURACIÓN
    # =========================================================
    if is_secundaria:
        aplica_filtro_ola = getattr(config, 'APPLY_WAVE_FILTER_SECUNDARIO', False)
        ola_objetivo = getattr(config, 'WAVE_FILTER_SECUNDARIO', None)
        var_peso = getattr(config, 'WEIGHT_VAR_SECUNDARIO', getattr(config, 'WEIGHT_VAR', 'ponderacion'))
        var_ola = getattr(config, 'WAVE_VAR_SECUNDARIO', 'OLA') # <--- Lee "OLA"
    else:
        aplica_filtro_ola = getattr(config, 'APPLY_WAVE_FILTER', False)
        ola_objetivo = getattr(config, 'WAVE_FILTER', 47)
        var_peso = getattr(config, 'WEIGHT_VAR', 'ponderacion')
        var_ola = getattr(config, 'WAVE_VAR', 'Wave') # <--- Lee "Wave"
    # =========================================================

    # ==============================================================
    # 🛡️ LECTOR BLINDADO ANTI-ERRORES DE CODIFICACIÓN (SPSS)
    # ==============================================================
    import os
    if not os.path.exists(sav_file):
        logging.error(f"Error FATAL: Archivo SAV no encontrado en la ruta: {sav_file}")
        raise FileNotFoundError(f"Archivo SAV no encontrado en: {sav_file}") 

    encodings_a_probar = [None, "cp1252", "latin1", "iso-8859-1"]
    df, meta = None, None
    ultimo_error = None
    enc_usado = None # Guardamos qué llave logró abrir la puerta

    for enc in encodings_a_probar:
        try:
            if enc is None:
                df, meta = pyreadstat.read_sav(sav_file)
            else:
                df, meta = pyreadstat.read_sav(sav_file, encoding=enc)
            
            _ = str(meta.variable_value_labels) 
            
            enc_usado = enc
            if enc is not None:
                logging.warning(f"⚠️ ¡Archivo leído con codificación de rescate: '{enc}'!")
            break 
            
        except Exception as e:
            ultimo_error = e
            continue 

    if df is None:
        logging.error(f"Error FATAL al leer archivo SAV: {ultimo_error}")
        raise Exception(f"Fallo en lectura de SAV por codificación: {ultimo_error}")

    # ==============================================================
    # 🪄 TRADUCTOR ANTI-MOJIBAKE (Fuerza Bruta)
    # ==============================================================
    if enc_usado is not None:
        logging.info("🧹 Aplicando limpieza Anti-Mojibake extrema por diccionario...")
        
        def fix_mojibake(text):
            if not isinstance(text, str):
                return text
            
            # 1. Intento matemático (funciona para el 90% de los casos limpios)
            try:
                res = text.encode(enc_usado).decode('utf-8', errors='ignore')
                if "Ã" not in res: return res
            except:
                pass
                
            # 2. LA APLANADORA: Si el texto sigue roto, reemplazamos la basura visual directamente
            reemplazos = {
                "Ã¡": "á", "Ã©": "é", "Ã­": "í", "Ã³": "ó", "Ãº": "ú",
                "Ã ": "Á", "Ã‰": "É", "Ã\x8d": "Í", "Ã“": "Ó", "Ãš": "Ú",
                "Ã±": "ñ", "Ã‘": "Ñ", "Â¿": "¿", "Â¡": "¡", "Ã¼": "ü", "Ãœ": "Ü",
                # Casos donde la librería se come el segundo caracter:
                "Ã": "í", 
            }
            
            res_bruto = text
            for basura, correcto in reemplazos.items():
                if basura in res_bruto:
                    res_bruto = res_bruto.replace(basura, correcto)
            
            return res_bruto

        # APLICAMOS LA APLANADORA A ABSOLUTAMENTE TODOS LOS CAJONES DE SPSS
        
        if hasattr(meta, 'column_names'):
            meta.column_names = [fix_mojibake(c) for c in meta.column_names]
            
        if hasattr(meta, 'column_labels'):
            meta.column_labels = [fix_mojibake(l) for l in meta.column_labels]
            
        if hasattr(meta, 'variable_to_label'):
            meta.variable_to_label = {fix_mojibake(k): fix_mojibake(v) for k, v in meta.variable_to_label.items()}
            
        if hasattr(meta, 'column_names_to_labels'):
            meta.column_names_to_labels = {fix_mojibake(k): fix_mojibake(v) for k, v in meta.column_names_to_labels.items()}
            
        if hasattr(meta, 'value_labels'):
            nuevo_vl = {}
            for var_name, mapping in meta.value_labels.items():
                nuevo_mapping = {fix_mojibake(k) if isinstance(k, str) else k: fix_mojibake(v) for k, v in mapping.items()}
                nuevo_vl[fix_mojibake(var_name)] = nuevo_mapping
            meta.value_labels = nuevo_vl
            
        if hasattr(meta, 'variable_value_labels'):
            nuevo_vvl = {}
            for var_name, mapping in meta.variable_value_labels.items():
                nuevo_mapping = {fix_mojibake(k) if isinstance(k, str) else k: fix_mojibake(v) for k, v in mapping.items()}
                nuevo_vvl[fix_mojibake(var_name)] = nuevo_mapping
            meta.variable_value_labels = nuevo_vvl

        # LIMPIAMOS LA TABLA (DATAFRAME)
        df.columns = [fix_mojibake(c) for c in df.columns]
        for col in df.select_dtypes(include=['object', 'category']).columns:
            if df[col].dtype.name == 'category':
                df[col] = df[col].cat.rename_categories(lambda x: fix_mojibake(x))
            else:
                df[col] = df[col].apply(lambda x: fix_mojibake(x) if isinstance(x, str) else x)

    # ==============================================================
    # ⚙️ AJUSTES POST-LECTURA (Se ejecuta siempre que cargue bien)
    # ==============================================================
    
# 🔄 HARDCODE TEMPORAL: Renombrar variables P16_A a P17_ (Data + Metadatos)
    diccionario_renombres = {
        "P16_A1": "P17_1",
        "P16_A2": "P17_2",
        "P16_A3": "P17_3",
        "P16_A4": "P17_4",
        "P16_A5": "P17_5",
        "P16_A6": "P17_6"
    }
    
    # Solo renombra las que realmente existan en el DataFrame
    renombres_aplicar = {k: v for k, v in diccionario_renombres.items() if k in df.columns}
    
    if renombres_aplicar:
        # 1. Renombramos en los datos reales (DataFrame)
        df = df.rename(columns=renombres_aplicar)
        
        # 2. Renombramos en los Metadatos (CRUCIAL para no perder las etiquetas)
        if hasattr(meta, 'column_names'):
            meta.column_names = [renombres_aplicar.get(col, col) for col in meta.column_names]
            
        if hasattr(meta, 'variable_to_label'):
            meta.variable_to_label = {renombres_aplicar.get(k, k): v for k, v in meta.variable_to_label.items()}
            
        if hasattr(meta, 'column_names_to_labels'):
            meta.column_names_to_labels = {renombres_aplicar.get(k, k): v for k, v in meta.column_names_to_labels.items()}
            
        if hasattr(meta, 'variable_value_labels'):
            meta.variable_value_labels = {renombres_aplicar.get(k, k): v for k, v in meta.variable_value_labels.items()}

        logging.info(f"🔄 HARDCODE: Se renombraron {len(renombres_aplicar)} variables en Datos y Metadatos.")

    # 🧹 FILTRO ANTI-BASURA: Eliminar variables T2B precalculadas
    columnas_t2b = [col for col in df.columns if "t2b" in str(col).lower()]
    if columnas_t2b:
        df = df.drop(columns=columnas_t2b)
        logging.info(f"🗑️ LIMPIEZA: Se eliminaron {len(columnas_t2b)} variables 'T2B' del SPSS para evitar conflictos.")

    if 'total' in df.columns:
        df = df.rename(columns={'total': 'TOTAL'})
    elif 'TOTAL' not in df.columns:
        df['TOTAL'] = 1
        
    if "Base_orden" in df.columns:
        df = df[df["Base_orden"] == 1].copy()
        logging.info(f"Filtro Base_orden=1 aplicado. Base N={len(df)}.")
        
    # =========================================================
    # 🌊 FILTRO POR OLA DINÁMICO (Usa var_ola)
    # =========================================================
    if aplica_filtro_ola and var_ola in df.columns and ola_objetivo is not None:
        df = df[df[var_ola] == ola_objetivo].copy()
        logging.info(f"Filtro {var_ola}={ola_objetivo} aplicado. Base N={len(df)}.")
    elif aplica_filtro_ola and var_ola not in df.columns:
        logging.warning(f"⚠️ Se pidió filtrar por ola, pero la columna '{var_ola}' NO EXISTE en esta base.")
    else:
        logging.info(f"Procesando base COMPLETA (Sin filtro de ola). Base N={len(df)}.")
        
    # =========================================================
    # PONDERACIÓN DINÁMICA
    # =========================================================
    if var_peso in df.columns:
        df[var_peso] = df[var_peso].fillna(1.0)
    else:
        df[var_peso] = 1.0 

    return df, meta

def prepare_banner_info(df, banner_vars, value_labels=None):
    """
    Crea un Banner Concatenado asegurando que el TOTAL exista para referencia,
    excluyéndolo de las pruebas de significancia. Asigna letras reiniciando por
    variable demográfica (A, B, C...) y genera la máscara para el test_z.
    """
    # 1. CASO: REPORTE SOLO TOTAL
    if not banner_vars:
        banner_vars_info = {
            "name": "Total",
            "variable": "Total",
            "labels": {"TOTAL": "Total"}, 
            "letter_map": {"TOTAL": ""},
            "display_map": {"TOTAL": ""},
            "Ns": {"TOTAL": len(df)},
            "segment_keys": {"TOTAL": {"TOTAL": 1}},
            "comparison_mask": [] # Lista vacía para la nueva función test_z
        }
        return banner_vars_info, None

    # --- CORRECCIÓN PARA LISTAS ANIDADAS (Mantenido intacto) ---
    flat_vars = []
    for v in banner_vars:
        if isinstance(v, list):
            flat_vars.extend(v)
        else:
            flat_vars.append(v)
    banner_vars = flat_vars 
    # ----------------------------------------------

    # 2. CARGA DE METADATOS (Mantenido intacto)
    # 2. CARGA DE METADATOS (Mantenido intacto)
    #df_meta, meta = pyreadstat.read_sav(
    #    config.SAV_FILE,
    #    metadataonly=True
    #)
    #value_labels = meta.variable_value_labels

# 👇 2. BORRAMOS EL READ_SAV Y USAMOS EL PARAMETRO DIRECTO 👇
    if value_labels is None:
        value_labels = {} # Red de seguridad vacía por si acaso

    # --- INICIALIZACIÓN CON EL TOTAL (Sin letra asignada) ---
    all_segments = {"TOTAL": {"TOTAL": 1}}
    global_Ns = {"TOTAL": len(df)}
    sorted_segment_keys_list = ["TOTAL"]
    display_letter_map = {"TOTAL": ""} 
    comparison_groups = [] # <- NUEVO: Guarda los grupos para cruzar intra-variable

    # 3. PROCESAMIENTO DE SEGMENTOS
    for var in banner_vars:
        if var not in df.columns: continue
        
        # get_label_dict debe estar definida en utils.py
        labels_map = get_label_dict(value_labels, var)
        unique_vals = sorted(df[var].dropna().unique())

        # --- RED DE SEGURIDAD (Mantenida intacta) ---
        if len(unique_vals) > 30:
            import logging
            logging.warning(f"Omitiendo '{var}' del banner: tiene {len(unique_vals)} categorías (límite superado).")
            continue
        # -------------------------------    

        # --- NUEVA LÓGICA: Reiniciamos el abecedario por cada variable ---
        letter_idx = 0 
        current_var_segments = []

        for code in unique_vals: 
            label = labels_map.get(code, f'Cod:{code}')
            
            # Limpieza estética de las etiquetas que vienen de SPSS
            if " - " in str(label): label = str(label).split(" - ")[-1].strip()
            elif ":" in str(label): label = str(label).split(":")[-1].strip()
            else: label = str(label).strip()

            # Calculamos la letra (A, B, C...) y la agregamos al título de la columna
            assigned_letter = chr(65 + letter_idx)
            segment_key = f"{var}: {label} ({assigned_letter})" 
            
            N_segment = len(df[df[var] == code])
            
            if N_segment > 0:
                global_Ns[segment_key] = N_segment
                all_segments[segment_key] = {var: code} 
                sorted_segment_keys_list.append(segment_key)
                
                # Mapeamos qué letra tiene esta columna
                display_letter_map[segment_key] = assigned_letter
                current_var_segments.append(segment_key)
                
                letter_idx += 1

        # Si la variable tiene 2 o más opciones válidas, la guardamos para test_z
        if len(current_var_segments) > 1:
            comparison_groups.append(current_var_segments)

    # --- 4. CREACIÓN DE LA MÁSCARA DE COMPARACIÓN (ACTUALIZADA PARA test_z) ---
    # Genera una lista de tuplas con los pares permitidos (ej: Hombre vs Mujer)
    comparison_mask = []
    for group in comparison_groups:
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                comparison_mask.append((group[i], group[j]))

    # 5. ESTRUCTURA FINAL
    banner_vars_info = {
        "variable": ", ".join(banner_vars),
        "name": "Banner Concatenado", 
        "labels": {label: label for label in sorted_segment_keys_list}, 
        "letter_map": display_letter_map,
        "display_map": display_letter_map,
        "Ns": global_Ns,
        "segment_keys": all_segments, 
        "comparison_mask": comparison_mask # Ahora envía la lista limpia para el test
    }
    
    return banner_vars_info, None

def load_questionnaire_dict(excel_path):
    """
    Lee un Excel asegurándose de no saltarse la primera fila.
    """
    if not os.path.exists(excel_path):
        print(f"⚠️ No se encontró el archivo: {excel_path}")
        return {} 
        
    try:
        # header=None asegura que lea desde la Fila 1
        # dtype=str fuerza a que todo sea texto (para que un "01" no se vuelva "1")
        df_quest = pd.read_excel(excel_path, header=None, dtype=str)
        dict_preguntas = {}
        
        for index, row in df_quest.iterrows():
            var_name = str(row.iloc[0]).strip()
            label = str(row.iloc[1]).strip()
            
            # Filtramos si la fila está vacía o si por casualidad pusieron títulos tipo "Variable"
            if var_name != 'nan' and label != 'nan' and var_name.lower() != 'variable':
                dict_preguntas[var_name] = label
                
        return dict_preguntas
    except Exception as e:
        print(f"⚠️ Error al leer el cuestionario externo: {e}")
        return {}

def load_question_map(file_path):
    """Carga el diccionario de mapeo {Variable_Name: Question_Text} desde un CSV."""
    
    # Ruta del archivo CSV de mapeo
    if not file_path:
        logging.warning("Ruta del archivo de mapeo no proporcionada. Usando mapeo vacío.")
        return {}
        
    try:
        try:
            df = pd.read_csv(file_path, sep=';', encoding='latin-1', engine='python')
        except:
            # 2. Si falla, volver a intentar con la coma (el valor por defecto)
            df = pd.read_csv(file_path, encoding='latin-1', engine='python')
        # Cargar el archivo CSV (tu lógica es correcta aquí)
        #df = pd.read_csv(file_path, encoding='latin-1') 
        QUESTION_MAP = df.set_index('Variable_Name')['Question_Text'].to_dict()
        
        logging.info(f"Mapeo de preguntas cargado con {len(QUESTION_MAP)} entradas.")
        return QUESTION_MAP
        
    except FileNotFoundError:
        logging.error(f"Archivo de mapeo no encontrado en: {file_path}")
        return {}
    except KeyError:
        logging.error("Las columnas 'Variable_Name' o 'Question_Text' no se encontraron en el CSV de mapeo.")
        return {}
    except Exception as e:
        logging.error(f"Error desconocido al cargar el mapeo de preguntas: {e}")
        return {}

    # 3. Inicializar las variables globales DESPUÉS de definir la función
QUESTION_MAP = None
MAP_FILE_PATH = 'question_map.csv' # Ruta del archivo

# 3. Función de acceso LAZY (Perezosa)
def get_question_map():
    """Carga el mapeo una sola vez y lo retorna."""
    global QUESTION_MAP
    
    # Si la variable aún no se ha cargado (es None), cargarla ahora.
    if QUESTION_MAP is None:
        QUESTION_MAP = load_question_map(MAP_FILE_PATH)
        
    return QUESTION_MAP

def get_label_dict(value_labels, varname):
    """Encuentra las etiquetas de valor para una variable (case-insensitive)."""
    var_l = varname.lower().strip()
    for k in value_labels.keys():
        if k.lower().strip() == var_l:
            return value_labels[k]
    return {}

_LABEL_MAP_CACHE = None 

#def get_variable_label(meta, var_name):
#    global _LABEL_MAP_CACHE
#    if _LABEL_MAP_CACHE is None or len(_LABEL_MAP_CACHE) == 0:
#        # Prioridad absoluta al diccionario nativo de pyreadstat
#        if hasattr(meta, 'column_names_to_labels') and meta.column_names_to_labels:
#            _LABEL_MAP_CACHE = meta.column_names_to_labels
#        else:
#            # Fallback: construirlo manualmente
#            _LABEL_MAP_CACHE = dict(zip(meta.column_names, meta.variable_labels))
#            
#    return _LABEL_MAP_CACHE.get(var_name, var_name)

#def get_variable_label(meta, var_name):
#    """
#    Obtiene la etiqueta de la variable de forma 100% segura. 
#    Si SPSS la dejó vacía (None), devuelve el nombre de la columna original.
#    """
#    try:
#        if not meta or not hasattr(meta, 'column_names_to_labels'):
#            return str(var_name)
#            
#        label = meta.column_names_to_labels.get(var_name)
#        
#        # Validamos que no sea None, ni vacío, ni la palabra "None"
#        if label is None or str(label).strip() == "" or str(label).lower() == "none":
#            return str(var_name)
#            
#        return str(label)
#    except Exception:
#        return str(var_name)

def get_variable_label(meta, var_name, quest_dict=None):
    """
    Obtiene la etiqueta. Prioridad 1: Excel. Prioridad 2: SPSS.
    """
    # Limpiamos el nombre por si el motor automático le pegó el "(BATERÍA ESCALA)"
    clean_var_name = str(var_name).replace(" (BATERÍA ESCALA)", "").strip()
    
    # 1. Buscamos en tu Excel traductor usando el nombre limpio
    if quest_dict and clean_var_name in quest_dict:
        return quest_dict[clean_var_name]

    # 2. Plan B: Buscamos en el SPSS original (con el nombre original)
    if var_name in meta.column_names_to_labels:
        return meta.column_names_to_labels[var_name]
        
    # 3. Plan C: Nombre crudo
    return var_name




def is_truly_ordinal(labels_dict):
    """
    Valida que sea una escala: etiquetas cortas y presencia de palabras clave.
    """
    if not labels_dict: return False
    
    # 1. Regla de oro: Ninguna etiqueta de escala real es un párrafo largo.
    for label in labels_dict.values():
        if len(str(label).split()) > 10:
            return False
            
    # 2. Diccionario de palabras clave de todas tus escalas (YPF)
    scale_keywords = [
        'gusta', 'acuerdo', 'importante', 'calificación', 'interesaría',
        'malo', 'bueno', 'excelente', 'disgusta', 'satisfecho', 
        'muy', 'relevante', 'creíble', 'fácil', 
        'mucho', 'poco', 'nada', 'bastante', 'algo',
        'mala', 'pésima', 'desacuerdo', 'adecuada', 'inadecuada',
        'peor', 'mejor', 'igual', 'siempre', 'nunca', 'frecuencia',
        'ganas', 'menos', 'más', 'mas', 'cambian'  # <--- PALABRAS AGREGADAS PARA P165
    ]
    
    labels_text = " ".join([str(v).lower() for v in labels_dict.values()])
    
    has_keywords = any(word in labels_text for word in scale_keywords)
    is_numeric_scale = all(str(v).strip().isdigit() for v in labels_dict.values())
    
    return has_keywords or is_numeric_scale

def is_frequency_variable(labels_dict):
    """
    Detecta si las etiquetas contienen términos relacionados con frecuencia temporal.
    """
    freq_keywords = [
        'diaria', 'diario', 'días', 'semana', 'semanal', 
        'quincena', 'quincenal', 'mes', 'mensual', 'veces'
    ]
    labels_text = " ".join([str(v).lower() for v in labels_dict.values()])
    
    return any(word in labels_text for word in freq_keywords)

def get_frequency_weights(labels_dict):
    """
    Asigna un valor numérico (días al mes) según la etiqueta para calcular el promedio.
    """
    weights = {}
    for code, label in labels_dict.items():
        l = str(label).lower()
        if 'diaria' in l or 'todos los días' in l:
            weights[float(code)] = 30.0
        elif '3 o 4 veces' in l:
            weights[float(code)] = 15.0 # (3.5 veces * 4.3 semanas)
        elif '2 veces' in l or '2 o 3 veces' in l:
            weights[float(code)] = 10.7 # (2.5 veces * 4.3 semanas)
        elif '1 vez por semana' in l or '1 vez a la semana' in l:
            weights[float(code)] = 4.3
        elif 'quincena' in l:
            weights[float(code)] = 2.0
        elif 'mes' in l:
            weights[float(code)] = 1.0
        else:
            weights[float(code)] = 0.0
    return weights


def find_brand_knowledge_vars(meta):
    """
    Escanea la metadata y devuelve una lista de variables que 
    usan la escala de conocimiento de 5 niveles.
    """
    target_scale = [
        "nunca había oído hablar de esta marca",
        "he escuchado la marca, pero no sé nada de ella",
        "conozco muy poco sobre esta marca",
        "conozco algo sobre esta marca",
        "conozco mucho sobre esta marca"
    ]
    
    knowledge_vars = []
    
    for var_name, labels in meta.variable_value_labels.items():
        # Convertir etiquetas a minúsculas para comparar
        current_labels = [str(v).lower() for v in labels.values()]
        
        # Si la variable tiene 5 etiquetas y coinciden palabras clave del conocimiento
        if len(current_labels) == 5:
            matches = 0
            for text in target_scale:
                if any(text in lbl for lbl in current_labels):
                    matches += 1
            
            # Si coinciden al menos 3 de las 5 etiquetas críticas, la marcamos
            if matches >= 3:
                knowledge_vars.append(var_name)
                
    return knowledge_vars

def get_funnel_variables_map(meta):
    """
    Escanea la metadata para identificar las variables de cada etapa del funnel.
    """
    funnel_map = {
        "TOM": None,
        "SOM": None,
        "ALGUNA_VEZ": None,
        "HABITUAL": None,
        "PREFERIDA": None
    }
    
    keywords = {
        "TOM": ["primera marca", "top of mind", "primero que viene a la mente"],
        "SOM": ["menciones espontáneas", "share of mind", "cuáles más conoce"],
        "ALGUNA_VEZ": ["alguna vez", "ha usado", "ha consumido"],
        "HABITUAL": ["en forma habitual", "u3m", "últimos 3 meses", "más usa"],
        "PREFERIDA": ["preferida", "más prefiere", "marca favorita"]
    }

    print("\n" + "="*50)
    print("AUDITORÍA DE DETECCIÓN DE ETAPAS (FUNNEL)")
    print("="*50)

    for stage, keys in keywords.items():
        for var_name, label in meta.column_names_to_labels.items():
            # VALIDACIÓN: Si la etiqueta es None, la saltamos o usamos string vacío
            if label is None:
                continue            
            
            label_lower = str(label).lower() # Forzamos a string por seguridad            if any(k in label_lower for k in keys):
            
            if any(k in label_lower for k in keys):
                # Si la etapa es PREFERIDA o TOM, NO quitamos el número final 
                # porque suelen ser variables únicas (SRQ)
                if stage in ["PREFERIDA", "TOM"]:
                    root_var = var_name 
                else:
                    import re
                    root_var = re.sub(r'(_\d+|\.\d+)$', '', var_name)
                
                funnel_map[stage] = root_var
                print(f"✅ {stage:12} -> Variable asignada: {root_var:8}")
                break

            #if any(k in label_lower for k in keys):
            #    root_var = re.sub(r'(_\d+|\.\d+)$', '', var_name)
            #    funnel_map[stage] = root_var
            #    #funnel_map[stage] = var_name
            #    print(f"✅ {stage:12} -> Detectada en: {root_var:8} | '{label[:50]}...'")
            #    break
        
        if funnel_map[stage] is None:
            print(f"❌ {stage:12} -> NO DETECTADA (Se usará 0.0% en el reporte)")
            
    print("="*50 + "\n")
    return funnel_map

def setup_presentation(template_file):
    """Inicializa la presentación desde la plantilla."""
    try:
        return Presentation(template_file)
    except FileNotFoundError:
        logging.error(f"Plantilla no encontrada: {template_file}")
        sys.exit(1)

def find_layout_by_name(prs, layout_name):
    """Busca un layout por nombre."""
    for layout in prs.slide_layouts:
        if layout.name == layout_name:
            return layout
    return None

def normalize_mrq(df, cols):
    """Convierte las columnas MRQ a 0/1 (Necesario para process_data.py)."""
    df_copy = df.copy()
    for c in cols:
        if c not in df_copy: continue
        #df_copy[c] = df_copy[c].fillna(0)
        df_copy[c] = pd.to_numeric(df_copy[c], errors='coerce').fillna(0)
        #df_copy[c] = np.where(df_copy[c] > 0, 1, 0)
        df_copy[c] = (df_copy[c] > 0).astype(int)
    return df_copy

# --- FUNCIONES DE ANÁLISIS (test_z, LLM) ---

import numpy as np
from scipy.stats import norm
import pandas as pd

def test_z(df_pct, bases, letter_map, comparison_mask, sig_level=0.05):
    """
    Calcula la significancia estadística (Z-Test) entre columnas específicas.
    Pega las letras ganadoras concatenadas (ej: AC) en la celda correspondiente.
    """
    sig_df = pd.DataFrame(index=df_pct.index, columns=df_pct.columns).fillna("")
    z_crit = norm.ppf(1 - sig_level / 2)

    for col1, col2 in comparison_mask:
        # Verificamos que ambas columnas existan en la tabla actual
        if col1 not in df_pct.columns or col2 not in df_pct.columns:
            continue

        n1 = bases.get(col1, 0)
        n2 = bases.get(col2, 0)

        # Regla de investigación: no se testea si alguna base es menor a 30
        if n1 < 30 or n2 < 30:
            continue

        for idx in df_pct.index:
            p1 = df_pct.loc[idx, col1] / 100.0
            p2 = df_pct.loc[idx, col2] / 100.0

            if pd.isna(p1) or pd.isna(p2): 
                continue

            # Varianza agrupada (Pooled variance)
            p_pool = (p1 * n1 + p2 * n2) / (n1 + n2)
            if p_pool == 0 or p_pool == 1: 
                continue

            se = np.sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
            if se == 0: 
                continue

            z = (p1 - p2) / se

            # Asignar la letra al ganador
            if abs(z) > z_crit:
                if z > 0: # col1 es mayor a col2
                    actual = str(sig_df.loc[idx, col1])
                    letra_ganada = letter_map[col2]
                    if letra_ganada not in actual:
                        sig_df.loc[idx, col1] = actual + letra_ganada
                else:     # col2 es mayor a col1
                    actual = str(sig_df.loc[idx, col2])
                    letra_ganada = letter_map[col1]
                    if letra_ganada not in actual:
                        sig_df.loc[idx, col2] = actual + letra_ganada

    # Pulido final: Ordenar las letras alfabéticamente en cada celda (ej: transforma CA en AC)
    for col in sig_df.columns:
        sig_df[col] = sig_df[col].apply(lambda x: "".join(sorted(list(x))) if x else "")

    return sig_df


def get_sig_letters(p1, p2, n1, n2, target_letter, confidence=0.95):
    """
    Compara dos proporciones (p1 vs p2) y determina si la diferencia es estadísticamente
    significativa dado un nivel de confianza.
    
    Args:
        p1 (float): Proporción de la columna de prueba (ej: 0.85 para 85%).
        p2 (float): Proporción de la columna de comparación (ej: 0.70 para 70%).
        n1 (int): Base (tamaño de muestra) de la columna de prueba.
        n2 (int): Base (tamaño de muestra) de la columna de comparación.
        target_letter (str): Letra identificadora de la columna p2 (ej: 'B').
        confidence (float): Nivel de confianza (0.95 por defecto).
        
    Returns:
        str: La letra de la columna comparada si p1 > p2 significativamente, 
             de lo contrario un string vacío "".
    """
    # 1. Validaciones de seguridad: Bases mínimas y valores lógicos
    if n1 < 30 or n2 < 30:
        return ""
    
    # Solo marcamos si p1 es mayor que p2 (test de una cola)
    if p1 <= p2:
        return ""

    try:
        # 2. Cálculo del Valor Crítico (Z-score crítico)
        # Para 95% de confianza, esto devuelve aproximadamente 1.96
        # Importamos localmente para evitar el NameError detectado
        from scipy import stats
        critical_value = stats.norm.ppf(1 - (1 - confidence) / 2)
        
        # 3. Cálculo de la Proporción Combinada (Pooled Proportion)
        p_pool = (p1 * n1 + p2 * n2) / (n1 + n2)
        
        # Evitar división por cero si ambos porcentajes son 0 o 100
        if p_pool <= 0 or p_pool >= 1:
            return ""
        
        # 4. Error Estándar de la diferencia
        se = np.sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
        
        # 5. Cálculo del Z-score observado
        z_score = (p1 - p2) / se
        
        # 6. Comparación final
        # Si el Z observado es mayor que el crítico, la diferencia es significativa
        if z_score > critical_value:
            return target_letter.upper()
        else:
            return ""
            
    except Exception as e:
        # En caso de cualquier error matemático inesperado, devolvemos vacío
        # para no detener el flujo de tabulación masiva.
        return ""
    
    
def generate_text_with_llm(prompt):
  """Función para llamar a la API de Gemini."""
  
  # Usamos la variable global LLM_AVAILABLE que ya se definió al inicio del script
  if not config.RUN_LLM or not LLM_AVAILABLE:
    # Cambiamos el raise por un return de falla
    logging.warning("LLM no habilitado o disponible. Devolviendo texto simulado.")
    # Devolvemos un formato que el regex pueda parsear (para evitar más errores)
    return "TÍTULO GLOBAL: Fallo en la IA \nRESUMEN: La síntesis automática falló por error de conexión."


  try:
    client = genai.Client(api_key=API_KEY)

    # Parámetros de la llamada (ajusta según tus necesidades de latencia/calidad)
    response = client.models.generate_content(
      model='gemini-2.5-flash',
      contents=prompt,
      config={"temperature": 0.3}
    )
    
    # Retornar el texto generado por Gemini
    return response.text

  except APIError as e:
    logging.error(f"Error de la API de Gemini: {e}")
    return "TÍTULO GLOBAL: Fallo en la API \nRESUMEN: La síntesis automática falló por error de la API."
  
  except Exception as e:
    logging.error(f"Error desconocido al llamar a Gemini: {e}")
    return "TÍTULO GLOBAL: Fallo desconocido \nRESUMEN: La síntesis automática falló por un error inesperado."

# utils.py (alrededor de la línea 407, después de generate_text_with_llm)

def create_llm_prompt(data_context, prompt_type):
    """
    Genera prompts estructurados basados en el contexto de los datos 
    y el tipo de resumen solicitado.
    
    :param data_context: Diccionario (para contextual) o Lista de strings (para global).
    :param prompt_type: El tipo de resumen a generar ("GLOBAL_SUMMARY" o "SLIDE_CONTEXTUAL").
    :return: String del prompt listo para ser enviado al LLM.
    """
    
    # 1. LÓGICA PARA RESUMEN GLOBAL (GLOBAL_SUMMARY)
    if prompt_type == "GLOBAL_SUMMARY":
        
        # Asumimos que data_context es una lista de strings para el resumen global
        findings_str = "\n".join(
            [f"- {finding}" for finding in data_context if finding]
        )
        
        # Plantilla del prompt
        prompt = f"""
        Eres un analista de investigación de mercados experto, conciso y profesional.
        Tu tarea es leer la siguiente lista de hallazgos clave de una encuesta, 
        y generar un Resumen Ejecutivo Global que sintetice las principales conclusiones
        para una presentación de PowerPoint.

        La síntesis debe enfocarse en los puntos más importantes y no debe exceder las 4 o 5 frases clave.

        FORMATO DE SALIDA REQUERIDO (¡CRÍTICO! Usa exactamente estas etiquetas):

        TÍTULO GLOBAL: [Tu título principal de una línea]
        RESUMEN: [Tu resumen ejecutivo en forma de párrafo]
        
        HALLAZGOS INDIVIDUALES PARA SINTETIZAR:
        ---
        {findings_str}
        ---

        Genera únicamente el texto de salida siguiendo el FORMATO DE SALIDA REQUERIDO.
        """
        
        logging.info("Prompt global generado con éxito.")
        return prompt

    # 2. LÓGICA PARA TÍTULOS CONTEXTUALES DE SLIDE (SLIDE_CONTEXTUAL)
    elif prompt_type == "SLIDE_CONTEXTUAL":
        
        # Asumimos que data_context es un diccionario: 
        # {'finding_principal', 'pregunta', 'tabla_cruzada'}
        
        prompt = f"""
        Eres un generador de títulos de diapositivas de investigación de mercados.
        Tu objetivo es generar un TÍTULO y un SUBTÍTULO que contextualicen y sinteticen 
        el hallazgo principal y la información de la tabla para una diapositiva.

        CONTEXTO:
        - PREGUNTA: {data_context.get('pregunta', 'N/D')}
        - HALLAZGO PRINCIPAL (ya sintetizado): {data_context.get('finding_principal', 'N/D')}
        
        TABLA CRUZADA (Valores porcentuales por categoría y segmento):
        ---
        {data_context.get('tabla_cruzada', 'Sin datos tabulares')}
        ---

        REGLAS:
        1. El TÍTULO debe ser la conclusión principal (debe ser corto, menos de 10 palabras).
        2. El SUBTÍTULO debe ser la pregunta o el contexto de la segmentación (ej: 'Desglose de la pregunta por segmentos').
        
        FORMATO DE SALIDA REQUERIDO (¡CRÍTICO! Usa exactamente estas etiquetas):
        
        TÍTULO: [Tu título principal]
        SUBTÍTULO: [Tu subtítulo contextual]

        Genera únicamente el texto de salida siguiendo el FORMATO DE SALIDA REQUERIDO.
        """
        logging.info("Prompt contextual del slide generado.")
        return prompt

    # 3. LÓGICA DE FALLO
    else:
        logging.error(f"Tipo de prompt '{prompt_type}' no soportado.")
        return "Error: Tipo de prompt no válido."


# --- FUNCIÓN DE AUTOMATIZACIÓN DE TAREAS ---

def generate_default_tasks(df, meta, exclude_vars):
    """
    Detecta automáticamente SRQ, MRQ y ESCALAS agrupando inteligentemente 
    para no mezclar preguntas filtro (ej: P16) con sus grillas (ej: P16_A1).
    Además detecta variables Numéricas Puras y Omiten Textos Abiertos.
    """
    import pandas as pd # Nos aseguramos que pandas esté disponible para la validación
    
    auto_tasks = {}
    grouped_vars = {}
    
    # 1. AGRUPAR VARIABLES INTELIGENTEMENTE
    for col in df.columns:
        if col in exclude_vars:
            continue
            
        if '_' in col:
            # Si tiene guion bajo, es parte de una batería. 
            # Separamos el prefijo y le agregamos "_GRID" a la llave interna 
            # para que NUNCA pise a la variable madre.
            prefix = col.rsplit('_', 1)[0]
            group_key = f"{prefix}_GRID" 
            original_prefix = prefix
        else:
            # Si no tiene guion bajo, es una variable única e independiente
            group_key = col
            original_prefix = col
            
        if group_key not in grouped_vars:
            grouped_vars[group_key] = {"prefix": original_prefix, "cols": []}
        grouped_vars[group_key]["cols"].append(col)

    # 2. CLASIFICAR CADA GRUPO
    for group_key, data in grouped_vars.items():
        prefix = data["prefix"]
        cols = data["cols"]
        
        if len(cols) > 1:
            first_col = cols[0]
            val_labels = get_label_dict(meta.variable_value_labels, first_col) if 'utils.' not in str(globals()) else get_label_dict(meta.variable_value_labels, first_col)
            
            # CASO A: Es una Batería de Escala (Grid)
            if len(val_labels) >= 3 and is_truly_ordinal(val_labels):
                try:
                    valid_keys = [float(k) for k in val_labels.keys()]
                    valid_keys.sort()
                    t2b = valid_keys[-2:] if len(valid_keys) >= 4 else [valid_keys[-1]]
                except:
                    t2b = [4.0, 5.0]

                auto_tasks[group_key] = {
                    "TASK_ID": f"{group_key}_AUTO_SCALE",
                    "TYPE": "SCALE_PROFILE",
                    "VARIABLE_NAME": f"{prefix} (BATERÍA ESCALA)", 
                    "EXACT_COLS": cols,
                    "T2B_CODES": t2b
                }
            
            # CASO B: Es Múltiple Categórica (Marcas/Menciones: TOM y SOM)
            elif len(val_labels) >= 3 and not is_truly_ordinal(val_labels):
                # 1. Tarea para el Top of Mind (Primera columna sola)
                auto_tasks[first_col] = {
                    "TASK_ID": f"{first_col}_AUTO_TOM",
                    "TYPE": "SINGLE",
                    "VARIABLE_NAME": first_col, # La procesa como SRQ normal
                    "VARIABLE_TYPE": "SRQ",
                    "CHART_TYPE": "BAR_HORIZONTAL",
                    "ENABLE_TOP_N": True
                }
                
                # 2. Tarea para el Share of Mind (Todo el bloque junto)
                auto_tasks[group_key] = {
                    "TASK_ID": f"{group_key}_AUTO_SOM",
                    "TYPE": "SINGLE",
                    "VARIABLE_NAME": f"{prefix} (MENCIONES TOTALES / SOM)",
                    "VARIABLE_TYPE": "MRQ_CATEGORICAL", # <--- NUEVO TIPO
                    "EXACT_COLS": cols,
                    "CHART_TYPE": "BAR_HORIZONTAL",
                    "ENABLE_TOP_N": True 
                }

            # CASO C: Es Múltiple normal (0/1)
            else:
                auto_tasks[group_key] = {
                    "TASK_ID": f"{group_key}_AUTO_MRQ",
                    "TYPE": "SINGLE",
                    # Le devolvemos su nombre clásico y limpio
                    "VARIABLE_NAME": f"{prefix}",
                    "VARIABLE_TYPE": "MRQ",
                    "EXACT_COLS": cols,
                    "COLS_PREFIX": f"{prefix}_",
                    "CHART_TYPE": "BAR_HORIZONTAL",
                    "ENABLE_TOP_N": True 
                }
                
        else:
            col = cols[0]
            is_categorical = col in meta.variable_value_labels
            
            # CASO D: Es Respuesta Única (SRQ)
            if is_categorical:
                auto_tasks[col] = {
                    "TASK_ID": f"{col}_AUTO_SRQ",
                    "TYPE": "SINGLE",
                    "VARIABLE_NAME": col,
                    "VARIABLE_TYPE": "SRQ",
                    "CHART_TYPE": "BAR_HORIZONTAL",
                    "ENABLE_TOP_N": True, 
                }
                
            # =========================================================
            # 🚀 NUEVO: DETECCIÓN DE NUMÉRICAS Y TEXTOS ABIERTOS
            # =========================================================
            else:
                # 1. ¿Es una variable numérica pura sin etiquetas (Ej: Edad)?
                if pd.api.types.is_numeric_dtype(df[col]):
                    # Validamos que no esté llena de nulos
                    if df[col].notna().sum() > 0:
                        print(f"🤖 [AUTO-DETECT] '{col}' -> Variable Numérica. Ruteando a NUMERIC...")
                        auto_tasks[col] = {
                            "TASK_ID": f"{col}_AUTO_NUM",
                            "TYPE": "SINGLE",
                            "VARIABLE_NAME": col,
                            "VARIABLE_TYPE": "NUMERIC"
                        }
                    else:
                        print(f"⚠️ Omitiendo '{col}': Es numérica pero está completamente vacía.")
                        
                # 2. ¿Es una variable de texto abierto (Ej: Por qué le gusta?)
                elif pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
                    print(f"⏭️ Omitiendo '{col}': Es texto abierto. (Requiere IA Cualitativa).")
            # =========================================================

    return auto_tasks