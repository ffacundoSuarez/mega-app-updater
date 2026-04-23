# config_loader.py

import pandas as pd
import logging
import sys
import os # Necesario para asegurar la ruta absoluta del archivo

def load_manual_tasks_from_csv(file_path):
    """Carga y procesa tareas manuales (SCALE_PROFILE, DUAL) desde un archivo CSV/Excel.
    Aplica limpieza para ser robusto contra delimitadores y espacios en encabezados.
    """
    
    # Resolver la ruta absoluta, en caso de que config.py no lo haya hecho
    abs_file_path = os.path.abspath(file_path)
    logging.info(f"Cargando configuración manual desde: {abs_file_path}")
    
    # 1. Intentamos leer el archivo CSV/Excel con manejo de robustez
    try:
        delimiters = [',', ';', '\t'] # Coma, Punto y coma, Tabulador
        df = None
        
        for sep in delimiters:
            try:
                # Usar codificación latin1 por si el CSV fue guardado en Excel con caracteres especiales
                df_temp = pd.read_csv(abs_file_path, sep=sep, encoding='latin1', engine='python')
                
                # Limpieza de Encabezados (CRÍTICA)
                df_temp.columns = df_temp.columns.str.strip().str.upper()
                
                # Verificación rápida: si encontramos 'TIPO', el separador es correcto.
                if 'TIPO' in df_temp.columns:
                    df = df_temp
                    logging.info(f"Éxito: CSV leído con separador '{sep}' y codificación 'latin1'.")
                    break
                
            except Exception:
                # Ignorar errores de lectura si el delimitador no es correcto y probar el siguiente
                continue
        
        if df is None:
             logging.error("Error: Ningún delimitador estándar (coma, punto y coma, tabulador) pudo leer los encabezados correctamente.")
             return {}

        # 2. Validación de Columnas Requeridas
        required_cols = ['TIPO', 'VARIABLE_NAME', 'VAR_B', 'ITEMS_PREFIX', 'CHART_TYPE', 'LLM_NARRATIVE']
        
        # Verificar que el set de columnas requeridas sea un subconjunto de las columnas del DataFrame
        if not set(required_cols).issubset(df.columns):
             missing_cols = set(required_cols) - set(df.columns)
             logging.error(f"Error: El archivo CSV no contiene todos los encabezados requeridos: {missing_cols}")
             return {}
             
        df = df.fillna('')
        
    except FileNotFoundError:
        logging.warning(f"Archivo de configuración manual no encontrado en: {abs_file_path}. No se añadirán tareas manuales.")
        return {}
    except Exception as e:
        # Capturar cualquier otro error de lectura no relacionado con el archivo no encontrado.
        logging.error(f"Error al leer el archivo de configuración manual: {e}")
        sys.exit(1)
        
    # 3. Procesamiento de las filas y Conversión a Objeto de Tarea
    manual_tasks_dict = {}
    
    for index, row in df.iterrows():
        # Usamos str() para asegurar que incluso los valores vacíos se manejen como strings.
        task_type = str(row['TIPO']).strip().upper()
        var_name = str(row['VARIABLE_NAME']).strip()
        
        # Saltamos filas vacías o con tipos no válidos
        if not var_name or task_type not in ['SCALE_PROFILE', 'DUAL', 'SINGLE']:
            continue

        task_id = f"{var_name}_{task_type}_MANUAL"
        
        task = {
            "TASK_ID": task_id,
            "TYPE": task_type,
            "VARIABLE_NAME": var_name,
            "LLM_NARRATIVE": str(row['LLM_NARRATIVE']).strip().upper() == 'SI'
        }
        
        # Lógica Específica para SCALE_PROFILE
        if task_type == 'SCALE_PROFILE':
            task['ITEMS_PREFIX'] = str(row['ITEMS_PREFIX']).strip() or var_name 
            task['T2B_CODES'] = [4.0, 5.0] # Códigos T2B por defecto (ej: Muy de Acuerdo/Totalmente de Acuerdo)
        
        # Lógica Específica para DUAL
        elif task_type == 'DUAL':
            var_b = str(row['VAR_B']).strip()
            if not var_b:
                logging.warning(f"Tarea DUAL {var_name} omitida: falta VAR_B.")
                continue

            task["VARIABLE_A"] = {"NAME": var_name, "TYPE": "SRQ"}
            task["VARIABLE_B"] = {"NAME": var_b, "TYPE": "SRQ"}
            task["CHART_TYPE"] = str(row['CHART_TYPE']).strip() or 'BAR_CLUSTERED'
        
        # Lógica Específica para SINGLE (Sobrescritura de tipos de gráfico)
        elif task_type == 'SINGLE':
            task["VARIABLE_TYPE"] = "SRQ" # Asumimos SRQ para la sobrescritura simple
            chart_type_val = str(row['CHART_TYPE']).strip()
            if chart_type_val:
                 task["CHART_TYPE"] = chart_type_val

        manual_tasks_dict[var_name] = task # Usamos VARIABLE_NAME como clave de sobrescritura
        
    logging.info(f"Se cargaron {len(manual_tasks_dict)} tareas manuales desde el archivo de configuración.")
    return manual_tasks_dict