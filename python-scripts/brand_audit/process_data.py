# process_data.py

import pandas as pd
import numpy as np
import logging
import math
from . import config
from . import utils
#import config
#import utils


# --- Funciones de Procesamiento ---

def process_scale(df, meta, task, banner_info, master_col):
  """
  Procesa ítems de ESCALA para generar el Perfil (Distribución 1-5) 
  y la Tabla (T2B cruzado por Banner Concatenado) con significancia.
  Retorna 8 valores.
  """
  # Inicialización de DataFrames seguros
  chart_df = pd.DataFrame(); table_df = pd.DataFrame(); sig_df = pd.DataFrame()
    
  base_var = task["VARIABLE_NAME"]
  t2b_codes = task.get("T2B_CODES", [4.0, 5.0])
    
  # 1. Definimos el prefijo siempre para que no salte UnboundLocalError
  items_prefix = task.get("ITEMS_PREFIX", base_var)
    
  # 2. Leemos las columnas exactas si existen, o usamos el prefijo
  if "EXACT_COLS" in task:
      cols = task["EXACT_COLS"]
  else:
      cols = [c for c in df.columns if str(c).startswith(items_prefix)]
    
  finding = f"Análisis de Perfil de Escala {base_var}: No hay datos de ítems válidos."
    
  logging.info(f"DEBUG: Procesando Escala {base_var} ({len(cols)} ítems encontrados).")

  if not cols:
      empty_sig = pd.DataFrame(index=[], columns=[])
      contrast = f"Error: No items found para {base_var}."
      return chart_df, table_df, empty_sig, finding, contrast, "BAR_STACKED_100", None, None

  # CRÍTICO: Usar el diccionario de segmentos para iterar
  segment_keys = banner_info["segment_keys"] 
  banner_cols_named = list(banner_info["labels"].values())
  
  first_item_col = cols[0] 
  scale_labels = utils.get_label_dict(meta.variable_value_labels, first_item_col)
  scale_categories_ordered = [scale_labels.get(float(i), str(i)) for i in sorted(scale_labels.keys())]
  
  chart_results = []
  t2b_results = []
  
  for item_col in cols:
    try: 
      item_label = utils.get_variable_label(meta, item_col) 
      
      # 1. Definir la base de la pregunta (válidos en el ítem)
      df_valid_data = df[df[item_col].notna()].copy()
      total_valid = len(df_valid_data)
      if total_valid == 0: continue 
      
      # --- PARTE A: DISTRIBUCIÓN COMPLETA (GRÁFICO) ---
      counts = df_valid_data[item_col].value_counts().sort_index()
      pcts_raw = (counts / total_valid * 100).fillna(0)
      chart_row_data = {'Item': item_label}
      for code, label in scale_labels.items():
        pct_value = pcts_raw.get(float(code), 0.0) 
        chart_row_data[label] = round(pct_value, 0)
      chart_results.append(chart_row_data)

      # --- PARTE B: T2B CRUZADO POR BANNER CONCATENADO (TABLA) ---
      t2b_row_data = {'Item': item_label} 
      
      for segment_label, segment_filter in segment_keys.items():
        
        var_filter = list(segment_filter.keys())[0] # Ej: 'F1'
        val_filter = list(segment_filter.values())[0] # Ej: 1.0
        
        # Aplicar filtro de segmento a la base válida
        df_segment = df_valid_data[df_valid_data[var_filter] == val_filter].copy()
        total_base_segment = len(df_segment)
        
        if total_base_segment == 0:
          t2b_row_data[segment_label] = 0.0
          continue
        
        t2b_count = len(df_segment[df_segment[item_col].isin(t2b_codes)])
        t2b_pct = round((t2b_count / total_base_segment * 100), 1)
        t2b_row_data[segment_label] = t2b_pct
      t2b_results.append(t2b_row_data)

    except Exception as e:
      logging.error(f"Error al procesar ítem de escala {item_col}: {e}. Saltando ítem.")
      continue 

  if not chart_results:
    logging.warning(f"No se pudo generar data de perfil para {base_var}.")
    empty_sig = pd.DataFrame(index=[], columns=banner_cols_named)
    contrast = f"Visualización de la distribución 1-5 y tabla de Netas T2B ({t2b_codes}) por Banner Concatenado. (Datos insuficientes)."
    return chart_df, table_df, empty_sig, finding, contrast, "BAR_STACKED_100", None, banner_info["letter_map"]

  chart_df = pd.DataFrame(chart_results)
  chart_df = chart_df[['Item'] + scale_categories_ordered] 
  for col in scale_categories_ordered:
    chart_df[col] = chart_df[col].astype(int)
  table_df = pd.DataFrame(t2b_results)
  table_df.columns = ['Item'] + banner_cols_named
  for col in banner_cols_named:
    table_df[col] = table_df[col].astype(int)


  T2B_pct_matrix = table_df.set_index('Item')[banner_cols_named]
  # CRÍTICO: Pasar la máscara de comparación a test_z
  sig_df = utils.test_z(T2B_pct_matrix, banner_info["Ns"], banner_info["letter_map"], banner_info["comparison_mask"])
  
  finding = f"Análisis de Perfil de Escala {base_var} (Distribución y T2B)."
  contrast = f"Visualización de la distribución 1-5 y tabla de Netas T2B ({t2b_codes}) por Banner Concatenado."
  
  return chart_df, table_df, sig_df, finding, contrast, "BAR_STACKED_100", None, banner_info["letter_map"]


def process_single(df, meta, task, banner_info, master_col):
  """
  Procesa una única variable (SRQ o MRQ) de forma paramétrica.
  Retorna siempre 8 valores, usando DataFrames vacíos o None si hay fallo.
  """
  total_df = None; table_data_final = None; sig_df_raw = None
  
  var_name = task.get("VARIABLE_NAME") or task.get("NAME") 
  var_type = task.get("VARIABLE_TYPE") or task.get("TYPE") 
  chart_type_key = task.get("CHART_TYPE", "BAR_HORIZONTAL")
  
  # CRÍTICO: Usar el diccionario de segmentos para iterar
  segment_keys = banner_info["segment_keys"] 
  info = banner_info 
  
  var_label_short = utils.get_variable_label(meta, var_name).split(':')[0]
  finding = f"{var_label_short}: Sin datos válidos."
  contrast = f"Desglose por Banner Concatenado (N={len(df)})."
  
  banner_cols = list(banner_info["letter_map"].keys())
  empty_total = pd.DataFrame(columns=['Categoria', 'Porcentaje'])
  empty_table = pd.DataFrame(columns=['Categoria'] + banner_cols)
  empty_sig = pd.DataFrame(index=[], columns=banner_cols)

  if not var_name or not var_type:
    return empty_total, empty_table, empty_sig, "Configuración de tarea incompleta", "Error", None, None, None
    
  # 1. LÓGICA SRQ
  if var_type == "SRQ":
    value_labels_var = utils.get_label_dict(meta.variable_value_labels, var_name)
    
    def map_to_label(val):
      if pd.isna(val): return "N/R"
      label = value_labels_var.get(float(val), f"{int(val) if val == int(val) else val}")
      return str(label)
    
    df_proc = df.copy()
    df_proc['Categoria'] = df_proc[var_name].apply(map_to_label)
    # Filtro base: no nulos en la variable de pregunta
    df_valid_data = df_proc[(df_proc['Categoria'] != "N/R") & (df_proc['Categoria'] != '')].copy()

    if df_valid_data.empty:
      return empty_total, empty_table, empty_sig, finding, contrast, None, None, info["letter_map"]

    # Cálculo Total
    total_counts = df_valid_data['Categoria'].value_counts()
    # --- MODIFICACIÓN 1: Redondear a 0 decimales para el Total (SRQ) ---
    total_pct_raw = (total_counts / len(df_valid_data) * 100).round(0) 
    
    total_df = total_pct_raw.reset_index(); total_df.columns = ['Categoria', 'Porcentaje']
    total_df = total_df.sort_values('Porcentaje', ascending=False).reset_index(drop=True)
    
    # --- CÁLCULO CRUZADO PARA BANNER CONCATENADO (SRQ) ---
    banner_pct_data = {}
    for segment_label, segment_filter in segment_keys.items():
      var_filter = list(segment_filter.keys())[0] 
      val_filter = list(segment_filter.values())[0]
      
      # Aplicar filtro de segmento
      df_segment = df_valid_data[df_valid_data[var_filter] == val_filter].copy()
      N_segment = len(df_segment)
      
      if N_segment > 0:
        counts = df_segment['Categoria'].value_counts()
        pcts = (counts / N_segment * 100).round(0)
        banner_pct_data[segment_label] = pcts
      else:
        banner_pct_data[segment_label] = 0.0

    banner_pct_named = pd.DataFrame(banner_pct_data).fillna(0)
    # --- FIN CÁLCULO CRUZADO ---

    # Aplicar filtro Top-N (SRQ)
    enable_top_n = task.get("ENABLE_TOP_N", False)
    top_n_limit = task.get("TOP_N_LIMIT", config.TOP_N_LIMIT)
    min_categories = task.get("MIN_CATEGORIES_FOR_TOP_N", config.MIN_CATEGORIES_FOR_TOP_N)
    
    if enable_top_n and len(total_df) > min_categories:
      total_df = total_df.head(top_n_limit).copy()
    
    # Lista de categorías filtradas
    categories_list = total_df['Categoria'].tolist()
    
    # Reindexar la tabla de cruce y calcular significancia SOLO para el Top N
    banner_pct_for_sig = banner_pct_named.reindex(categories_list).fillna(0)
    
    table_data_final = banner_pct_for_sig.reset_index().rename(columns={'Categoria': 'Categoria'})
    # CRÍTICO: Pasar la máscara de comparación a test_z
    sig_df_raw = utils.test_z(banner_pct_for_sig, info["Ns"], info["letter_map"], banner_info["comparison_mask"])
    
    
# 2. LÓGICA MRQ
  elif var_type == "MRQ":
    cols = task.get("EXACT_COLS")
    if not cols:
        cols_prefix = task.get("COLS_PREFIX")
        if not cols_prefix:
            return empty_total, empty_table, empty_sig, finding, contrast, None, None, info["letter_map"]
        cols = [c for c in df.columns if c.startswith(cols_prefix)]

    if not cols:
       return empty_total, empty_table, empty_sig, finding, contrast, None, None, info["letter_map"]

    df_mrq = utils.normalize_mrq(df, cols)
    df_valid_base = df_mrq[cols].any(axis=1) 
    df_valid = df_mrq[df_valid_base].copy()

    if df_valid.empty:
       return empty_total, empty_table, empty_sig, finding, contrast, None, None, info["letter_map"]

    # --- EXTRACCIÓN Y DESDUPLICACIÓN DE ETIQUETAS ---
    col_labels = {}
    seen_labels = {}
    for c in cols:
        cvl = utils.get_label_dict(meta.variable_value_labels, c)
        if 1.0 in cvl: raw_label = str(cvl[1.0])
        elif len(cvl) == 1: raw_label = str(list(cvl.values())[0])
        else: raw_label = str(utils.get_variable_label(meta, c))
            
        if " - " in raw_label: clean_label = raw_label.split(" - ")[-1].strip()
        elif ":" in raw_label: clean_label = raw_label.split(":")[-1].strip()
        else: clean_label = raw_label.strip()
        
        if not clean_label: clean_label = c
        
        if clean_label in seen_labels:
            seen_labels[clean_label] += 1
            final_label = f"{clean_label} ({c})" 
        else:
            seen_labels[clean_label] = 1
            final_label = clean_label

        col_labels[c] = final_label

    # --- CÁLCULO TOTAL (PONDERADO) ---
    pesos_total = df_valid['ponderacion'] if 'ponderacion' in df_valid.columns else pd.Series(1, index=df_valid.index)
    n_total_weighted = pesos_total.sum()

    total_pct = (df_valid[cols].multiply(pesos_total, axis=0).sum() / n_total_weighted * 100).round(0) 
      
    total_df = pd.DataFrame({"Categoria": [col_labels[c] for c in cols], "Porcentaje": total_pct.values}).dropna(subset=['Categoria'])
    total_df = total_df.sort_values('Porcentaje', ascending=False).reset_index(drop=True)
    total_df["Porcentaje"] = total_df["Porcentaje"].astype(int)

    # Aplicar filtro Top-N (MRQ)
    enable_top_n = task.get("ENABLE_TOP_N", False)
    top_n_limit = task.get("TOP_N_LIMIT", config.TOP_N_LIMIT)
    min_categories = task.get("MIN_CATEGORIES_FOR_TOP_N", config.MIN_CATEGORIES_FOR_TOP_N)
    
    if enable_top_n and len(total_df) > min_categories:
      total_df = total_df.head(top_n_limit).copy()
    
    # --- CÁLCULO CRUZADO PARA BANNER CONCATENADO (MRQ PONDERADO) ---
    categories_list = total_df['Categoria'].tolist()
    banner_pct_data = {}
    
    for segment_label, segment_filter in segment_keys.items():
        if not segment_filter:
            df_segment = df_valid.copy()
        else:
            var_filter = list(segment_filter.keys())[0] 
            val_filter = list(segment_filter.values())[0]
            df_segment = df_valid[df_valid[var_filter] == val_filter].copy()
        
        pesos_seg = df_segment['ponderacion'] if 'ponderacion' in df_segment.columns else pd.Series(1, index=df_segment.index)
        n_seg_weighted = pesos_seg.sum()
        
        if n_seg_weighted > 0:
            pcts = (df_segment[cols].multiply(pesos_seg, axis=0).sum() / n_seg_weighted * 100).round(0)
            pcts.index = pcts.index.map(col_labels) 
            banner_pct_data[segment_label] = pcts
        else:
            banner_pct_data[segment_label] = pd.Series(0.0, index=categories_list)

    banner_pct_named = pd.DataFrame(banner_pct_data).fillna(0)
    banner_pct_named = banner_pct_named.reindex(categories_list, fill_value=0.0)
    
    sig_df_raw = utils.test_z(banner_pct_named, info["Ns"], info["letter_map"], banner_info["comparison_mask"])
    
    table_data_final = banner_pct_named.reset_index().rename(columns={'index': 'Categoria'})
    pct_cols = [c for c in table_data_final.columns if c != "Categoria"]
    table_data_final[pct_cols] = table_data_final[pct_cols].fillna(0).astype(int)
# --- LA LÍNEA QUE FALTABA AGREGAR ---
    return total_df, table_data_final, sig_df_raw, finding, contrast, None, None, info["letter_map"]
  else: 
    # Tipo de variable no soportado
    return empty_total, empty_table, empty_sig, finding, contrast, None, None, info["letter_map"]

  # 3. Retorno Exitoso (8 valores)
  max_cat_label = total_df.iloc[0]['Categoria']
  max_pct = total_df.iloc[0]['Porcentaje']
  #finding = f"{var_label_short}: '{max_cat_label}' por el {max_pct:.1f}% de la base."
  #finding = f"{var_label_short}: '{max_cat_label}' por el {max_pct:.1f}% de la base."
  finding = f"'{max_cat_label}' por el {max_pct:.1f}% de la base."  
    # --- MODIFICACIÓN 2: Asegurar que el porcentaje total (SRQ/MRQ) sea un entero antes del retorno ---
  total_df['Porcentaje'] = total_df['Porcentaje'].astype(int)
    # ---------------------------------------------------------------------------------------------------

  contrast = f"Desglose por Banner Concatenado (N={len(df)})."

  total_df['Categoria'] = total_df['Categoria'].astype(str)
  table_data_final['Categoria'] = table_data_final['Categoria'].astype(str)
  
  return total_df, table_data_final, sig_df_raw, finding, contrast, "PERCENTAGE", chart_type_key, info["letter_map"]