import logging
import sys
import os
import pyreadstat
import pandas as pd
from . import config, utils, process_data, create_slides, config_loader, generador_ia
from .tabulation_engine import TabulationEngine
import json
import warnings
import pickle

# Apagamos los warnings de futuras versiones de Pandas para tener la consola limpia
warnings.simplefilter(action='ignore', category=FutureWarning)

# 1. DEFINICIÓN DEL INTERRUPTOR
MODO_PRODUCCION = False  # Cambialo a True para la primera corrida o cuando cambies datos

_suffix_filtro = ""
if getattr(config, "FILTRAR_BASE", False):
    _suffix_filtro = f"_{config.VARIABLE_FILTRO}_{config.VALOR_FILTRO}"

CACHE_FILE = f"memoria_datos_{config.STUDY_ID}{_suffix_filtro}.pkl"

# --- CONFIGURACIÓN DE LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler("debug_ejecucion.log", mode='w', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

if not hasattr(config, 'CACHE_COLUMNAS_BLOQUES'):
    config.CACHE_COLUMNAS_BLOQUES = {}

def run_brand_audit():
    usar_cache = False
    excel_results_prin = []
    excel_results_sec = []
    excel_results_hist = []
    df_auditoria_total = pd.DataFrame()
    lista_dfs_auditoria = []
    all_findings = []

    # 2. INTENTO DE CARGA DE MEMORIA
    if not MODO_PRODUCCION and os.path.exists(CACHE_FILE):
        logging.info("🚀 [MODO PRUEBA] Saltando cálculos. Cargando memoria...")
        try:
            with open(CACHE_FILE, 'rb') as f:
                cache = pickle.load(f)
            
            excel_results_prin = cache['prin']
            excel_results_sec = cache['sec']
            excel_results_hist = cache['hist']
            df_auditoria_total = cache['audit_total']
            lista_dfs_auditoria = cache['audit_lista']
            all_findings = cache.get('findings', [])

            usar_cache = True  
            logging.info("✅ Memoria cargada con éxito. Yendo directo al PPT.")
        except Exception as e:
            logging.error(f"❌ Error al cargar memoria: {e}. Re-calculando...")
    else:
        logging.info("⏳ [MODO PRODUCCIÓN] Iniciando motor completo...")

    if not usar_cache:        
        # ==============================================================
        # 1. CARGAMOS LA BASE PRINCIPAL
        # ==============================================================
        try:
            df, df_hist, meta = utils.load_data_and_apply_base_filter(config.SAV_FILE)
        except Exception as e:
            logging.error(f"Error FATAL en la carga del archivo principal: {e}")
            sys.exit(1)

        # ==============================================================
        # ⚡ 🚀 FILTRO GLOBAL DE SEGMENTACIÓN (CON SALVAGUARDA HISTÓRICA)
        # ==============================================================
        aplicar_filtro = getattr(config, "FILTRAR_BASE", False)
        if aplicar_filtro:
            v_filtro = getattr(config, "VARIABLE_FILTRO", None)
            val_filtro = getattr(config, "VALOR_FILTRO", None)
            lbl_filtro = getattr(config, "LABEL_FILTRO", f"Valor {val_filtro}")

            if v_filtro and val_filtro is not None:
                if v_filtro in df.columns:
                    base_antes = len(df)
                    df = df[df[v_filtro] == val_filtro].copy()
                    logging.info(f"⚡ [FILTRO ACTIVO] Base Principal recortada por {v_filtro} == {val_filtro}. Casos: {base_antes} -> {len(df)}")
                else:
                    logging.error(f"❌ [FILTRO ERROR] La variable '{v_filtro}' no existe en la base Principal actual.")

                # Proteger histórico de YPF para mantener intacto el evolutivo de olas
                if v_filtro in df_hist.columns:
                    logging.info(f"🛡️ [PROTECCIÓN AUDITORÍA] Base Histórica preservada con sus {len(df_hist)} casos intactos.")

        try:
            banner_vars = config.BANNER_VARIABLES 
            banner_info, master_col = utils.prepare_banner_info(df, banner_vars, meta.variable_value_labels)
        
            var_ola_hist = getattr(config, 'WAVE_VAR', 'Wave')
            banner_vars_hist = [var_ola_hist] 
            
            banner_info_hist, master_col_hist = utils.prepare_banner_info(
                df_hist, banner_vars_hist, meta.variable_value_labels
            )    
        except Exception as e:
            logging.error(f"Error en configuración de Banner: {e}")
            sys.exit(1)

        # ==============================================================
        # 2. CARGAMOS LA BASE SECUNDARIA APARTE
        # ==============================================================
        df_sec = None
        meta_sec = None
        banner_sec = None
        master_col_sec = None 
        try:
            archivo_sec = getattr(config, "SAV_FILE_SECUNDARIO", None)
            banners_sec_config = getattr(config, "BANNER_VARIABLES_SECUNDARIO", config.BANNER_VARIABLES)
            
            if archivo_sec:
                df_sec, df_sec_hist, meta_sec = utils.load_data_and_apply_base_filter(archivo_sec, is_secundaria=True)
                
                if aplicar_filtro and v_filtro and val_filtro is not None:
                    if v_filtro in df_sec.columns:
                        base_sec_antes = len(df_sec)
                        df_sec = df_sec[df_sec[v_filtro] == val_filtro].copy()
                        logging.info(f"⚡ [FILTRO ACTIVO] Base Secundaria recortada. Casos: {base_sec_antes} -> {len(df_sec)}")

                peso_sec = getattr(config, "WEIGHT_VAR_SECUNDARIO", None)            
                if peso_sec and peso_sec in df_sec.columns and peso_sec != "ponderacion":
                    df_sec = df_sec.rename(columns={peso_sec: "ponderacion"})
                    logging.info(f"⚖️ Columna '{peso_sec}' renombrada a 'ponderacion' para el motor.")
                
                banner_sec, master_col_sec = utils.prepare_banner_info(df_sec, banners_sec_config, meta_sec.variable_value_labels)
                logging.info("✅ Base Secundaria cargada en la sombra.")
                
        except Exception as e:
            logging.warning(f"No hay base secundaria o falló su carga: {e}")

        # ==============================================================
        # 🧹 LIMPIEZA PRE-MOTOR
        # ==============================================================
        basura_prin = getattr(config, "BASURA_SPSS", [])
        if basura_prin:
            df = df.drop(columns=basura_prin, errors='ignore')
            logging.info(f"🧹 Se eliminaron {len(basura_prin)} variables basura de la base Principal.")

        if df_sec is not None:
            basura_sec = getattr(config, "BASURA_SPSS_SECUNDARIO", [])
            if basura_sec:
                df_sec = df_sec.drop(columns=basura_sec, errors='ignore')
                logging.info(f"🧹 Se eliminaron {len(basura_sec)} variables basura de la base Secundaria.")

        # ==============================================================
        # 3. DICCIONARIO Y MOTORES
        # ==============================================================
        ruta_cuestionario = getattr(config, "QUESTIONNAIRE_EXCEL", "cuestionario.xlsx")
        diccionario_cuestionario = utils.load_questionnaire_dict(ruta_cuestionario)
        
        engine = TabulationEngine(df, meta, banner_info, quest_dict=diccionario_cuestionario)
        engine_hist = TabulationEngine(df_hist, meta, banner_info_hist, quest_dict=diccionario_cuestionario)

        engine_sec = None
        if df_sec is not None:
            ruta_cuestionario_sec = getattr(config, "QUESTIONNAIRE_EXCEL_SECUNDARIO", None)
            if ruta_cuestionario_sec:
                diccionario_sec = utils.load_questionnaire_dict(ruta_cuestionario_sec)
                logging.info(f"📖 Diccionario secundario cargado: {ruta_cuestionario_sec}")
            else:
                diccionario_sec = None 
            engine_sec = TabulationEngine(df_sec, meta_sec, banner_sec, quest_dict=diccionario_sec)

        # ==============================================================
        # 4. GESTIÓN DE TAREAS Y LIMPIEZA
        # ==============================================================
        banner_list = list(config.BANNER_VARIABLES[0]) if isinstance(config.BANNER_VARIABLES, tuple) else list(config.BANNER_VARIABLES)
        vars_intocables = banner_list + [config.WEIGHT_VAR]

        vars_a_rescatar = ["Vinculo"]
        vars_a_excluir = [var for var in vars_intocables if var not in vars_a_rescatar]

        if basura_prin:
            vars_a_excluir.extend(basura_prin)

        auto_tasks = utils.generate_default_tasks(df, meta, vars_a_excluir)
        manual_tasks = config_loader.load_manual_tasks_from_csv(config.MANUAL_TASKS_CSV)
        
        final_tasks = auto_tasks.copy()
        final_tasks.update(manual_tasks)

        tareas_extra = getattr(config, "TAREAS_MANUALES_EXTRA", {})
        if tareas_extra:
            vars_manuales = [str(t.get("VARIABLE_NAME")) for t in tareas_extra.values() if t.get("VARIABLE_NAME")]
            claves_duplicadas = []
            for k, v in final_tasks.items():
                auto_var = str(v.get("VARIABLE_NAME", ""))
                for v_man in vars_manuales:
                    if auto_var == v_man or auto_var.startswith(f"{v_man} (") or auto_var.startswith(f"{v_man}_"):
                        claves_duplicadas.append(k)
                        break 
            for k in claves_duplicadas:
                del final_tasks[k]
            final_tasks.update(tareas_extra) 

        # ==============================================================
        # 🛡️ FILTRO DE MODO PRUEBA
        # ==============================================================
        modo_prueba = getattr(config, "MODO_PRUEBA", False)
        if modo_prueba:
            vars_permitidas = getattr(config, "VARIABLES_DE_PRUEBA", [])
            if vars_permitidas:
                final_tasks = {
                    k: v for k, v in final_tasks.items() 
                    if str(v.get("VARIABLE_NAME", "")) in vars_permitidas
                }
                logging.warning(f"⚠️ MODO PRUEBA ACTIVO: Se tabularán SOLO {len(final_tasks)} variables.")

        # ==============================================================
        # 🚀 ORDENAMIENTO DE TAREAS
        # ==============================================================
        column_order = list(df.columns)
        def get_task_index(task):
            var_name = task.get("VARIABLE_NAME", "")
            tipo_tarea = task.get("TYPE", task.get("VARIABLE_TYPE", ""))
            if var_name in column_order: return column_order.index(var_name)
            exact_cols = task.get("EXACT_COLS")
            if exact_cols and isinstance(exact_cols, list) and len(exact_cols) > 0:
                if exact_cols[0] in column_order: return column_order.index(exact_cols[0])
            prefix = task.get("COLS_PREFIX") or task.get("ITEMS_PREFIX") or var_name
            for i, col in enumerate(column_order):
                if str(col).startswith(str(prefix)): return i
            if "GRID" in str(tipo_tarea).upper() or "CATEGORICAL" in str(tipo_tarea).upper():
                return len(column_order) 
            return len(column_order)

        final_tasks = dict(sorted(final_tasks.items(), key=lambda item: get_task_index(item[1])))

        # =====================================================================
        # 5. EL SÚPER BUCLE: PREPARACIÓN DE LAS DOS BASES CON YTD NATIVO SPSS
        # =====================================================================
        all_findings = []
        excel_results_prin = []
        excel_results_hist = [] 
        excel_results_sec = []

        # ---------------------------------------------------------------------
        # 🎯 APLICAMOS LA REGLA EXACTA DE RECODE WAVE DE SPSS A LA BASE HISTÓRICA
        # ---------------------------------------------------------------------
        mes_corte_audit = getattr(config, "MES_CORTE", 8)
        var_wave_name = getattr(config, "WAVE_VAR", "Wave")
        
        # 1. Asignamos la columna 'YTD_GRUPO' directamente en los microdatos según la regla SPSS
        df_hist = utils.aplicar_recode_ytd_spss(df_hist, mes_corte_audit, var_wave=var_wave_name)
        logging.info(f"📊 [YTD SPSS NATIVO] Variable 'YTD_GRUPO' generada en df_hist con mes corte: {mes_corte_audit}")

        # 2. Re-preparamos el banner histórico para incluir 'YTD_GRUPO' si existe
        banner_vars_hist = ['YTD_GRUPO'] if 'YTD_GRUPO' in df_hist.columns else [var_wave_name]
        banner_info_hist, master_col_hist = utils.prepare_banner_info(
            df_hist, banner_vars_hist, meta.variable_value_labels
        )
        engine_hist = TabulationEngine(df_hist, meta, banner_info_hist, quest_dict=diccionario_cuestionario)
        # ---------------------------------------------------------------------

        paquetes_a_procesar = [
            {"nombre": "PRINCIPAL", "df": df, "meta": meta, "banner": banner_info, "engine": engine, "tareas": final_tasks, "resultados": excel_results_prin, "master_col": master_col},
            {"nombre": "PRINCIPAL_HISTORICA", "df": df_hist, "meta": meta, "banner": banner_info_hist, "engine": engine_hist, "tareas": final_tasks, "resultados": excel_results_hist, "master_col": master_col_hist}        
        ]

        if df_sec is not None and engine_sec is not None:
            auto_tasks_sec = utils.generate_default_tasks(df_sec, meta_sec, vars_a_excluir)
            manuales_sec = {k: v for k, v in tareas_extra.items() if v.get("ORIGEN") == "secundaria"}
            auto_tasks_sec.update(manuales_sec)
            paquetes_a_procesar.append({"nombre": "SECUNDARIA", "df": df_sec, "meta": meta_sec, "banner": banner_sec, "engine": engine_sec, "tareas": auto_tasks_sec, "resultados": excel_results_sec, "master_col": master_col_sec})

        for paquete in paquetes_a_procesar:
            _p_nombre = paquete["nombre"]
            _p_df = paquete["df"]
            _p_meta = paquete["meta"]
            _p_banner = paquete["banner"]
            _p_engine = paquete["engine"]
            _p_tareas = paquete["tareas"]
            _p_resultados = paquete["resultados"]
            _p_master_col = paquete["master_col"] 

            _p_engine.segments = _p_banner["segment_keys"]
            logging.info(f"--- Iniciando tabulación completa de la base {_p_nombre} ({len(_p_tareas)} variables) ---")

            for t_id, task in _p_tareas.items():
                try:
                    res = None
                    tab = None
                    v_name = task.get("VARIABLE_NAME")
                    v_type = task.get("VARIABLE_TYPE", "SRQ")

                    if task["TYPE"] == "SINGLE":
                        try:
                            res = process_data.process_single(_p_df, _p_meta, task, _p_banner, _p_master_col)
                        except AttributeError as e:
                            if "split" in str(e): logging.debug(f"Omitiendo textos IA para '{v_name}'.")
                            else: logging.debug(f"Aviso menor en '{v_name}': {e}")
                        except Exception: pass
                        
                        if v_type == "SRQ": tab = _p_engine.tabulate_srq(v_name)
                        elif v_type == "MRQ": tab = _p_engine.tabulate_mrq(v_name, task.get("COLS_PREFIX"))
                        elif task["VARIABLE_TYPE"] == "MRQ_CATEGORICAL": tab = _p_engine.tabulate_mrq_categorical(v_name, task.get("EXACT_COLS"))
                        elif v_type == "NUMERIC": tab = _p_engine.tabulate_numeric(v_name)                        
                        elif v_type == "NUMERIC_GRID" or task.get("TYPE") == "NUMERIC_GRID" or task.get("VARIABLE_TYPE") == "NUMERIC_GRID":
                            cols = task.get("EXACT_COLS", task.get("COLS", []))
                            tab = _p_engine.tabulate_numeric_grid(v_name, cols)

                    elif task["TYPE"] == "SCALE_PROFILE":
                        try:
                            res = process_data.process_scale(_p_df, _p_meta, task, _p_banner, _p_master_col)
                        except Exception: pass

                        cols_grid = task.get("EXACT_COLS", [c for c in _p_df.columns if str(c).startswith(task.get("ITEMS_PREFIX", v_name))])
                        cajas_solicitadas = task.get("BOXES", ["T2B", "B2B"])
                        tab = _p_engine.tabulate_smart_grid(group_name=v_name, cols=cols_grid, boxes=cajas_solicitadas)

                    if tab:
                        _p_resultados.append(tab)
                except Exception as e:
                    logging.error(f"Error procesando tarea {t_id} en base {_p_nombre}: {e}")

        # =====================================================================
        # 🧼 PRE-PROCESAMIENTO DE AUDITORÍA CON FILTRO PROTECTOR INTEGRADO
        # =====================================================================
        anios_audit = [2022, 2023, 2024, 2025, 2026]
        lista_dfs_auditoria = [] 

        for res in excel_results_hist:
            if not res or 'percentages' not in res: continue
        
            df_p = res['percentages'].copy()
            v_name = res.get("variable", "N/D")

            nuevas_categorias = []
            contexto_padre = ""
        
            for idx in df_p.index:
                nombre_fila = str(idx).strip()
                es_tecnica = any(x in nombre_fila.lower() for x in ["base", "total", "n=", "---"])
                fila_valores = df_p.loc[idx]
                fila_vacia = fila_valores.isna().all()

                if hasattr(fila_vacia, "any"): fila_vacia = fila_vacia.all()

                if fila_vacia and not es_tecnica:
                    contexto_padre = nombre_fila
                    nuevas_categorias.append(nombre_fila)
                else:
                    if contexto_padre and contexto_padre != nombre_fila and not es_tecnica:
                        nuevas_categorias.append(f"{contexto_padre} | {nombre_fila}")
                    else:
                        nuevas_categorias.append(nombre_fila)
        
            df_p.index = nuevas_categorias

            # 🛡️ ALINEACIÓN SOBERANA ANTI-DESFASE
            indices_originales = list(df_p.index)

            for anio in anios_audit:
                # Extrae directamente la columna YTD calculada de la tabulación nativa
                valores_ytd = df_p.apply(
                    lambda row: utils.calcular_ytd_homogeneo(
                        row.to_dict(), 
                        anio, 
                        mes_corte_audit, 
                        df_variable_completa=df_p
                    ), axis=1
                )
                df_p[f"YTD {anio}"] = valores_ytd.values

            # Reaseguramos el índice antes del reset
            df_p.index = indices_originales
            df_temp = df_p.reset_index().rename(columns={'index': 'Categoría'})
            
            df_temp.columns = [str(c).strip() for c in df_temp.columns]
            df_temp['Variable'] = v_name

            # 🧼 Limpieza en caliente del origen
            if not df_temp.empty and 'Categoría' in df_temp.columns:
                condicion_titulo_puro = (df_temp['Categoría'].str.contains('GRID_', na=False)) & (~df_temp['Categoría'].str.contains(r'\|', na=False))
                cat_as_str = df_temp['Categoría'].astype(str).str.strip()
                condicion_cierre_vacio = ((df_temp['Categoría'].isna()) | (cat_as_str == "") | (cat_as_str.str.lower() == "nan")) & (~cat_as_str.str.lower().str.contains("respond|sabe|contest", na=False))
                df_temp = df_temp[~(condicion_titulo_puro | condicion_cierre_vacio)].copy()

            lista_dfs_auditoria.append(df_temp)

        df_auditoria_total = pd.concat(lista_dfs_auditoria, ignore_index=True) if lista_dfs_auditoria else pd.DataFrame()

        # =====================================================================
        # 🛡️ BLINDAJE CASE-INSENSITIVE PARA RECONCILIAR YTD (YPF / PROMOS)
        # =====================================================================
        if not df_auditoria_total.empty and 'Categoría' in df_auditoria_total.columns:
            df_mayusculas = df_auditoria_total.copy()
            df_mayusculas['Categoría'] = df_mayusculas['Categoría'].astype(str).str.upper()
            
            df_auditoria_total = pd.concat([df_auditoria_total, df_mayusculas], ignore_index=True)
            logging.info("🛡️ [CASE BLINDAJE] Índices de auditoría duplicados en MAYÚSCULAS para asegurar el match YTD.")

        datos_a_guardar = {
            'prin': excel_results_prin, 'sec': excel_results_sec, 'hist': excel_results_hist,
            'audit_total': df_auditoria_total, 'audit_lista': lista_dfs_auditoria, 'findings': all_findings
        }
        with open(CACHE_FILE, 'wb') as f:
            pickle.dump(datos_a_guardar, f)
        logging.info("💾 Datos sincronizados en memoria.")

    if usar_cache:
        logging.info("⚙️ Reconstruyendo contexto mínimo para PPT...")
        df, df_hist, meta = utils.load_data_and_apply_base_filter(config.SAV_FILE)

    # =====================================================================
    # 6. SECCIÓN ESPECIAL PPTX (CON RELLENO DE ATRIBUTOS MÚLTIPLES HÍBRIDO)
    # =====================================================================
    solo_tablas = getattr(config, "ONLY_GENERATE_TABLES", False)
    mochila_ia = {}

    if not solo_tablas:
        logging.info("Iniciando armado de PowerPoint...")
        prs = utils.setup_presentation(config.TEMPLATE_PPX)
        create_slides.create_summary_slide_with_llm(prs, all_findings)

        try:
            create_slides.renombrar_por_geometria(prs)
            mes_nuevo = getattr(config, "NEW_WAVE_NAME", "Nueva Ola")
            mapa_graficos = getattr(config, "TRACKING_CHARTS", [])

            logging.info(f"RADAR: Tablas listas en Principal: {len(excel_results_prin)} | Secundaria: {len(excel_results_sec)}")

            for chart_config in mapa_graficos:
                c_name = chart_config.get("chart_name")

                if chart_config.get("chart_name") == "Chart_YTD_Index_YPF":
                        logging.info(f"🔍 [Llamador YTD] Evaluando Chart_YTD_Index_YPF | Config Variable: '{chart_config.get('variable')}'")

                # =====================================================================
                # 📡 ESCÁNER GLOBAL DE GRÁFICOS (PARA VER SI ESTÁ LEYENDO P03)
                # =====================================================================
                v_config_actual = str(chart_config.get("variable", "")).upper().strip()
                if "P03" in v_config_actual or chart_config.get("chart_name") == "Chart_Detalle_P03_1":
                    print(f"\n📡 [ESCÁNER GLOBAL] Procesando en Config: '{c_name}' | Variable: '{v_config_actual}'")
                # =====================================================================

                if chart_config.get("is_header"):
                    exito = create_slides.update_header_table_in_presentation(prs, c_name, mes_nuevo)
                    continue

                # 🛠️ A) CARRIL YTD HISTÓRICO ORIGINAL (Con duplicado tolerante por compatibilidad)
                if chart_config.get("is_ytd_calculated"):
                    var_name = chart_config.get("variable")
                    if not var_name:
                        ref_name = chart_config.get("ref_chart_name", "")
                        var_name = next((p for p in ref_name.split('_') if p.startswith('P')), None)
                    
                    chart_config["variable_deducida"] = var_name                        
                    metrics = chart_config.get("metrics", {})
                    first_metric = next(iter(metrics.values())) if metrics else None
                    is_multivariable = isinstance(first_metric, dict) and "variable" in first_metric                    
                    
                    if not var_name and not is_multivariable: continue

                    try:
                        # Adaptamos en caliente las columnas sin machacar el YTD legítimo
                        df_audit_adaptado = df_auditoria_total.copy() if not df_auditoria_total.empty else pd.DataFrame()
                        if not df_audit_adaptado.empty:
                            for col in list(df_audit_adaptado.columns):
                                col_str = str(col)
                                for anio in ["2022", "2023", "2024", "2025", "2026"]:
                                    # 🛡️ REGLA PROTECTORA: Si la columna YA ES un YTD legítimo, NO la pisamos con una Wave
                                    if f"YTD {anio}" == col_str:
                                        continue
                                        
                                    if anio in col_str and ("Wave" in col_str or "YTD" in col_str):
                                        suffix = anio[-2:]
                                        df_audit_adaptado[anio] = df_audit_adaptado[col]
                                        df_audit_adaptado[int(anio)] = df_audit_adaptado[col]
                                        df_audit_adaptado[suffix] = df_audit_adaptado[col]
                                        
                                        # Solo asignamos a f"YTD {anio}" si esa columna no venía previamente calculada con datos reales
                                        if f"YTD {anio}" not in df_auditoria_total.columns:
                                            df_audit_adaptado[f"YTD {anio}"] = df_audit_adaptado[col]

                        exito = create_slides.inyectar_ytd_desde_auditoria(prs, chart_config, df_audit_adaptado)
                        if exito: logging.info(f"✅ ÉXITO: {c_name} actualizado desde YTD.")
                    except Exception as e:
                        logging.error(f"❌ Error en {c_name}: {e}")
                    continue
                        
                # 🛠️ B) CARRIL COMÚN (Adaptado con Puente Multi-Llave Externo)
                metrics_map = chart_config.get("metrics", {})
                target_box = chart_config.get("target_box", "t2b").lower()
                
                if "4" in target_box: box_keywords = ["top 4 box", "t4b"]
                elif "3" in target_box: box_keywords = ["top 3 box", "t3b"]
                elif "5" in target_box: box_keywords = ["top 5 box", "t5b"]
                elif "bottom" in target_box or "b2b" in target_box: box_keywords = ["bottom 2 box", "b2b"]
                else: box_keywords = ["top 2 box", "t2b"]

                lista_a_buscar = excel_results_sec if chart_config.get("origen") == "secundaria" else excel_results_prin
                datos_a_inyectar = {}
                valores_para_promedio = []

                for row_name, metrica_info in metrics_map.items():
                    if isinstance(metrica_info, dict):
                        var_actual = metrica_info.get("variable")
                        keywords = metrica_info.get("keywords", [])
                    else:
                        var_actual = chart_config.get("variable")
                        keywords = metrica_info

                    df_var = None
                    for tab in lista_a_buscar:
                        if tab and str(tab.get("variable", "")).startswith(str(var_actual)):
                            df_var = tab.get("percentages").copy()
                            break

                    if df_var is not None:
                        nuevo_index = []
                        contexto_actual = ""
                        for idx in df_var.index:
                            idx_str = str(idx).strip()
                            if "AÑO" in idx_str.upper(): contexto_actual = idx_str
                            if contexto_actual and idx_str in ["Mejor", "Igual", "Peor"]:
                                nuevo_index.append(f"{contexto_actual} {idx_str}")
                            else:
                                nuevo_index.append(idx_str)
                        df_var.index = nuevo_index

                        valor_crudo = 0.0 
                        encontrado = False
                        fila_real = None
                        es_multi_marca = any("|" in str(kw) for kw in keywords)
                        contexto_grid_actual = ""
                        
                        for pos, indice in enumerate(df_var.index):
                            indice_str = str(indice).lower()
                            
                            if es_multi_marca:
                                if "grid_attr:" in indice_str:
                                    contexto_grid_actual = indice_str.replace("grid_attr:", "").strip()
                                    
                                for kw in keywords:
                                    kw_lower = str(kw).lower().strip()
                                    if "|" in kw_lower:
                                        attr_buscado, metrica_buscada = [x.strip() for x in kw_lower.split("|")]
                                        if attr_buscado in contexto_grid_actual and metrica_buscada == indice_str:
                                            val_temp = df_var.iloc[pos]["TOTAL"]
                                            if pd.notna(val_temp):
                                                valor_crudo += float(val_temp)
                                                encontrado = True
                                                break 
                                if encontrado: break
                                    
                            else:
                                if any(str(kw).lower() in indice_str for kw in keywords):
                                    fila_real = indice
                                    val_temp = df_var.iloc[pos]["TOTAL"]
                                    if pd.notna(val_temp):
                                        valor_crudo += float(val_temp)
                                        encontrado = True
                                elif fila_real is not None and not encontrado and any(kw in indice_str for kw in box_keywords):
                                    val_temp = df_var.iloc[pos]["TOTAL"]
                                    if pd.notna(val_temp):                                    
                                        valor_crudo += float(val_temp)
                                        encontrado = True
                                        break 

                        if encontrado:
                            try:
                                decimales = chart_config.get("decimals", 0)
                                valor_redondeado = round(float(valor_crudo), decimales) if decimales > 0 else int(round(valor_crudo))
                                valores_para_promedio.append(valor_redondeado)
                                
                                # 🎯 PARCHE MULTI-LLAVE EXTERNO: Inyecta variantes para que matchee con cualquier layout
                                datos_a_inyectar[row_name] = valor_redondeado
                                datos_a_inyectar[str(row_name).lower()] = valor_redondeado
                                if isinstance(keywords, list):
                                    for kw in keywords:
                                        kw_clean = str(kw).lower().strip()
                                        if "|" in kw_clean:
                                            datos_a_inyectar[kw_clean.split("|")[0].strip()] = valor_redondeado
                                        datos_a_inyectar[kw_clean] = valor_redondeado
                                else:
                                    datos_a_inyectar[str(keywords).lower().strip()] = valor_redondeado
                            except: pass

# -------------------------------------------------------------
                # 🔄 REPORCENTUALIZACIÓN CORRECTA (RE-BASE SOBRE GRUPO FILTRADO)
                # -------------------------------------------------------------
                if chart_config.get("reporcentualizar") and datos_a_inyectar:
                    # 1. Filtramos solo las llaves principales definidas en 'metrics' para evitar duplicados
                    llaves_unicas = list(metrics_map.keys())
                    datos_unicos = {k: datos_a_inyectar[k] for k in llaves_unicas if k in datos_a_inyectar}
                    
                    if not datos_unicos:
                        datos_unicos = datos_a_inyectar.copy()

                    # 2. Normalizamos valores (si venían como 0.44 -> 44)
                    datos_normalizados = {}
                    for k, v in datos_unicos.items():
                        val_num = float(v)
                        datos_normalizados[k] = val_num * 100.0 if val_num <= 1.0 else val_num

                    # 3. Suma real del subgrupo (ej: 44 + 6 + 2 + 10 = 62)
                    suma_subgrupo = sum(datos_normalizados.values())

                    if suma_subgrupo > 0:
                        datos_recalc = {}
                        decimales = chart_config.get("decimals", 0)

                        for clave, valor in datos_normalizados.items():
                            pct_100 = (valor / suma_subgrupo) * 100.0
                            if decimales > 0:
                                datos_recalc[clave] = round(pct_100, decimales)
                            else:
                                datos_recalc[clave] = int(round(pct_100))

                        # 4. Asignamos los datos recalculados limpios
                        datos_a_inyectar = datos_recalc
                        
                        # 5. Generamos alias técnicos en minúsculas POST-cálculo para que PowerPoint los encuentre
                        datos_con_alias = datos_a_inyectar.copy()
                        for k_orig, v_final in datos_a_inyectar.items():
                            datos_con_alias[str(k_orig).lower()] = v_final
                            if k_orig in metrics_map:
                                kws = metrics_map[k_orig]
                                if isinstance(kws, list):
                                    for kw in kws:
                                        datos_con_alias[str(kw).lower().strip()] = v_final
                                elif isinstance(kws, dict):
                                    for kw in kws.get("keywords", []):
                                        datos_con_alias[str(kw).lower().strip()] = v_final

                        datos_a_inyectar = datos_con_alias
                        logging.info(f"📊 [REPORCENTUALIZADO OK YPF] Suma subgrupo: {suma_subgrupo} | {datos_unicos} -> {datos_recalc}")

                #if chart_config.get("reporcentualizar") and datos_a_inyectar:
                #    nueva_base = sum(datos_a_inyectar.values())
                #    if nueva_base > 0:
                #        for clave, valor in datos_a_inyectar.items():
                #            datos_a_inyectar[clave] = int(round((valor / nueva_base) * 100))

                if chart_config.get("calcular_promedio") and valores_para_promedio:
                    datos_a_inyectar["promedio"] = int(round(sum(valores_para_promedio) / len(valores_para_promedio)))

                if datos_a_inyectar:
                    if chart_config.get("is_table"):
                        col_datos = chart_config.get("start_data_col", 1)
                        exito = create_slides.update_tracking_table_in_presentation(
                            prs, c_name, mes_nuevo, datos_a_inyectar, 
                            start_data_col=col_datos, label_col=chart_config.get("label_col", col_datos - 1),
                            is_percentage=chart_config.get("is_percentage", False), has_header=chart_config.get("has_header", True)
                        )
                    else:
                        es_porcentaje = chart_config.get("is_percentage", False)
                        if es_porcentaje:
                            for clave in list(datos_a_inyectar.keys()):
                                datos_a_inyectar[clave] = datos_a_inyectar[clave] / 100.0

                        decimales = chart_config.get("decimals", 0)
                        exito = create_slides.update_tracking_chart_in_presentation(
                            prs, c_name, mes_nuevo, datos_a_inyectar, 
                            is_percentage=es_porcentaje, append_only=chart_config.get("append_only", False),
                            line_colors=chart_config.get("line_colors", {}), remove_percentage_sign=chart_config.get("remove_percentage_sign", False),
                            decimals=decimales, ola_impar=chart_config.get("ola_impar", False)
                        )
                        
                        if exito and not chart_config.get("skip_insight", False):
                            datos_ia = create_slides.extract_chart_data_for_ai(prs, c_name, ultimos_n_meses=12)
                            if datos_ia: mochila_ia[c_name] = datos_ia

        except Exception as e:
            logging.error(f"Error en la actualización masiva de gráficos: {e}")

        # ==============================================================
        # 7. CONSOLIDACIÓN DE INFORMES E IA
        # ==============================================================
        def limpiar_decimales_para_ia(obj):
            if isinstance(obj, float) or "float" in str(type(obj)).lower(): return round(float(obj), 4)
            elif isinstance(obj, dict): return {k: limpiar_decimales_para_ia(v) for k, v in obj.items()}
            elif isinstance(obj, list): return [limpiar_decimales_para_ia(i) for i in obj]
            return obj

        claves_a_borrar = [k for k in mochila_ia.keys() if "Chart_Detalle" in k]
        for k in claves_a_borrar: del mochila_ia[k]
        mochila_ia = limpiar_decimales_para_ia(mochila_ia)

        usar_ia = getattr(config, "USE_AI_INSIGHTS", False) 
        if mochila_ia and usar_ia:
            MI_API_KEY = "MI_API_KEY" 
            diccionario_titulos = generador_ia.redactar_titulos_con_gemini(MI_API_KEY, mochila_ia)
            if diccionario_titulos:
                create_slides.inject_ai_insights_into_presentation(prs, diccionario_titulos)

        cant_ytd, texto_ytd = create_slides.update_global_ytd_labels(prs, mes_nuevo)
        output_ppt = f"informe_{config.STUDY_ID}.pptx"
        prs.save(output_ppt)
        logging.info(f"➡️ PowerPoint: {output_ppt}")
    else:
        logging.info("⏭️ MODO SOLO TABLAS ACTIVADO: Omitiendo PowerPoint.")

    # =========================================================
    # 📝 EXPORTACIÓN DE EXCEL DE AUDITORÍA HISTÓRICA
    # =========================================================
    import xlsxwriter
    output_path = f"Auditoria_Diseno_Identico_{config.STUDY_ID}.xlsx"
    writer = pd.ExcelWriter(output_path, engine='xlsxwriter')
    workbook = writer.book
    ws = workbook.add_worksheet('Auditoria YTD')

    fmt_head = workbook.add_format({'bold': True, 'bg_color': '#423F40', 'font_color': 'white', 'border': 1, 'align': 'center', 'valign': 'vcenter'})
    fmt_idx = workbook.add_format({'bold': True, 'border': 1})
    fmt_title = workbook.add_format({'bold': True, 'font_size': 11, 'font_color': '#00A5A3'})
    fmt_num = workbook.add_format({'border': 1, 'num_format': '0"%"', 'align': 'center'})
    fmt_decimal = workbook.add_format({'border': 1, 'num_format': '0.00', 'align': 'center'})
    fmt_base = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'bg_color': '#F8F9F9', 'font_size': 9})
    fmt_idx_base = workbook.add_format({'bold': True, 'border': 1, 'bg_color': '#F8F9F9', 'font_size': 9})
    
    start_row = 1
    anios_cols = [f"YTD {a}" for a in [2022, 2023, 2024, 2025, 2026]]

    for df_audit in lista_dfs_auditoria:
        v_name = df_audit['Variable'].iloc[0]
        ws.write(start_row, 0, f"Variable: {v_name}", fmt_title)
        start_row += 2

        all_cols = [c for c in df_audit.columns if c not in ['Variable']]
        for c_idx, col in enumerate(all_cols):
            ws.write(start_row, c_idx, str(col), fmt_head)
        start_row += 1

        for _, row in df_audit.iterrows():
            cat_name = str(row['Categoría'])
            fmt_row_idx = fmt_idx_base if ("base" in cat_name.lower()) else fmt_idx
            ws.write(start_row, 0, cat_name, fmt_row_idx)

            for c_idx, col_name in enumerate(all_cols[1:]): 
                val = row[col_name]
                es_tecnica = any(x in cat_name.lower() for x in ["base", "media", "promedio"])
                es_ytd_col = col_name in anios_cols
                
                if es_tecnica and es_ytd_col:
                    ws.write_blank(start_row, c_idx + 1, None, fmt_base if "base" in cat_name.lower() else fmt_decimal)
                else:
                    fmt = fmt_base if "base" in cat_name.lower() else (fmt_decimal if ("media" in cat_name.lower() or "promedio" in cat_name.lower()) else fmt_num)
                    ws.write(start_row, c_idx + 1, val if pd.notna(val) else 0, fmt)
            
            start_row += 1
        start_row += 2 

    ws.set_column('A:A', 50) 
    writer.close()
    logging.info(f"📊 Auditoría Final generada usando datos pre-procesados.")

    # =========================================================
    # 8. EXPORTACIÓN DE EXCEL PRINCIPAL DESDE EL ENGINE
    # =========================================================
    output_xls_prin = f"Tablas_Principal_{config.STUDY_ID}.xlsx"
    if not usar_cache:
        engine.export_to_excel(excel_results_prin, output_xls_prin)
        logging.info(f"➡️ Excel Principal: {output_xls_prin}")

        if excel_results_sec and engine_sec is not None:
            output_xls_sec = f"Tablas_Secundaria_{config.STUDY_ID}.xlsx"
            engine_sec.export_to_excel(excel_results_sec, output_xls_sec)
            logging.info(f"➡️ Excel Secundario: {output_xls_sec}")
    else:
        logging.info("⏭️ Export Excel omitido (modo cache).")

    logging.info("="*60)
    logging.info("🎉 PROCESO COMPLETADO EXITOSAMENTE")
    logging.info("="*60)

if __name__ == '__main__':
    run_brand_audit()