import logging
import sys
import os
import pyreadstat
import pandas as pd
from . import config, utils, process_data, create_slides, config_loader, generador_ia
from .tabulation_engine import TabulationEngine
import json
import warnings

# Apagamos los warnings de futuras versiones de Pandas para tener la consola limpia
warnings.simplefilter(action='ignore', category=FutureWarning)

# --- NUEVA CONFIGURACIÓN DE LOGGING (Consola + Archivo) ---
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s",
    handlers=[
        logging.FileHandler("debug_ejecucion.log", mode='w', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
# ----------------------------------------------------------

def run_brand_audit():
    # ==============================================================
    # 1. CARGAMOS LA BASE PRINCIPAL
    # ==============================================================
    try:
        df, meta = utils.load_data_and_apply_base_filter(config.SAV_FILE)
    except Exception as e:
        logging.error(f"Error FATAL en la carga del archivo principal: {e}")
        sys.exit(1)

    try:
        banner_vars = config.BANNER_VARIABLES 
        banner_info, master_col = utils.prepare_banner_info(df, banner_vars, meta.variable_value_labels)
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
            df_sec, meta_sec = utils.load_data_and_apply_base_filter(archivo_sec, is_secundaria=True)
            
            peso_sec = getattr(config, "WEIGHT_VAR_SECUNDARIO", None)            
            if peso_sec and peso_sec in df_sec.columns and peso_sec != "ponderacion":
                df_sec = df_sec.rename(columns={peso_sec: "ponderacion"})
                logging.info(f"⚖️ Columna '{peso_sec}' renombrada a 'ponderacion' para el motor.")
            
            banner_sec, master_col_sec = utils.prepare_banner_info(df_sec, banners_sec_config, meta_sec.variable_value_labels)
            logging.info("✅ Base Secundaria cargada en la sombra.")
            
    except Exception as e:
        logging.warning(f"No hay base secundaria o falló su carga: {e}")

    # ==============================================================
    # 3. DICCIONARIO Y MOTORES
    # ==============================================================
    ruta_cuestionario = getattr(config, "QUESTIONNAIRE_EXCEL", "cuestionario.xlsx")
    diccionario_cuestionario = utils.load_questionnaire_dict(ruta_cuestionario)
    
    engine = TabulationEngine(df, meta, banner_info, quest_dict=diccionario_cuestionario)

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

    basura_prin = getattr(config, "BASURA_SPSS", [])
    if basura_prin:
        df = df.drop(columns=basura_prin, errors='ignore')
        logging.info(f"🧹 Se eliminaron {len(basura_prin)} variables basura de la base Principal.")

    if df_sec is not None:
        basura_sec = getattr(config, "BASURA_SPSS_SECUNDARIO", [])
        if basura_sec:
            df_sec = df_sec.drop(columns=basura_sec, errors='ignore')
            logging.info(f"🧹 Se eliminaron {len(basura_sec)} variables basura de la base Secundaria.")

    vars_a_rescatar = ["Vinculo"]
    vars_a_excluir = [var for var in vars_intocables if var not in vars_a_rescatar]

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
    # 🚀 ORDENAMIENTO DE TAREAS Y "PASE VIP" PARA BATERÍAS
    # ==============================================================
    column_order = list(df.columns)
    def get_task_index(task):
        var_name = task.get("VARIABLE_NAME", "")
        tipo_tarea = task.get("TYPE", task.get("VARIABLE_TYPE", ""))
        
        # 1. Si es una variable normal que existe en la base
        if var_name in column_order:
            return column_order.index(var_name)
            
        # 2. Si es una batería (Grid) buscamos por su primera sub-columna
        exact_cols = task.get("EXACT_COLS")
        if exact_cols and isinstance(exact_cols, list) and len(exact_cols) > 0:
            # Aunque la variable madre no exista, si la primera hija existe, la dejamos pasar
            if exact_cols[0] in column_order:
                return column_order.index(exact_cols[0])
                
        # 3. Si es una batería por prefijo (ej: "P119_")
        prefix = task.get("COLS_PREFIX") or task.get("ITEMS_PREFIX") or var_name
        for i, col in enumerate(column_order):
            if str(col).startswith(str(prefix)):
                return i
                
        # 4. PASE VIP DE EMERGENCIA: Si es un Grid explícito, lo mandamos al final pero NO lo borramos
        if "GRID" in str(tipo_tarea).upper() or "CATEGORICAL" in str(tipo_tarea).upper():
            return len(column_order) 
            
        return len(column_order)

    # Ordenamos y mantenemos TODAS las tareas (las que devuelven len(column_order) van al final)
    final_tasks = dict(sorted(final_tasks.items(), key=lambda item: get_task_index(item[1])))

    # =====================================================================
    # 5. EL SÚPER BUCLE: PREPARACIÓN DE LAS DOS BASES
    # =====================================================================
    all_findings = []
    excel_results_prin = []
    excel_results_sec = []

    paquetes_a_procesar = [
        {
            "nombre": "PRINCIPAL",
            "df": df, "meta": meta, "banner": banner_info, "engine": engine, 
            "tareas": final_tasks, "resultados": excel_results_prin,
            "master_col": master_col 
        }
    ]

    if df_sec is not None and engine_sec is not None:
        logging.info("Generando mapa de tareas COMPLETO para la Base Secundaria...")
        auto_tasks_sec = utils.generate_default_tasks(df_sec, meta_sec, vars_a_excluir)
        
        manuales_sec = {k: v for k, v in tareas_extra.items() if v.get("ORIGEN") == "secundaria"}
        auto_tasks_sec.update(manuales_sec)
        
        paquetes_a_procesar.append({
            "nombre": "SECUNDARIA",
            "df": df_sec, "meta": meta_sec, "banner": banner_sec, "engine": engine_sec, 
            "tareas": auto_tasks_sec, "resultados": excel_results_sec,
            "master_col": master_col_sec 
        })

    # =====================================================================
    # EJECUCIÓN DEL SÚPER BUCLE (Procesa ambas cajas limpiamente)
    # =====================================================================
    for paquete in paquetes_a_procesar:
        _p_nombre = paquete["nombre"]
        _p_df = paquete["df"]
        _p_meta = paquete["meta"]
        _p_banner = paquete["banner"]
        _p_engine = paquete["engine"]
        _p_tareas = paquete["tareas"]
        _p_resultados = paquete["resultados"]
        _p_master_col = paquete["master_col"] 
        
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
                        if "split" in str(e):
                            logging.debug(f"⚠️ Omitiendo textos IA para '{v_name}': Variable sin datos o inexistente.")
                        else:
                            logging.debug(f"Aviso menor en '{v_name}': {e}")
                    except Exception as e:
                        pass
                    
                    if v_type == "SRQ":
                        cajas_solicitadas = task.get("BOXES", ["T2B", "B2B"])
                        tab = _p_engine.tabulate_srq(v_name)
                    elif v_type == "MRQ":
                        tab = _p_engine.tabulate_mrq(v_name, task.get("COLS_PREFIX"))
                    elif task["VARIABLE_TYPE"] == "MRQ_CATEGORICAL":
                        cols = task.get("EXACT_COLS")
                        tab = _p_engine.tabulate_mrq_categorical(v_name, cols)
                    elif v_type == "NUMERIC":
                        tab = _p_engine.tabulate_numeric(v_name)                        
                    # =========================================================
                    # 🚀 EL NUEVO CARRIL: BATERÍA NUMÉRICA
                    # =========================================================
                    elif v_type == "NUMERIC_GRID" or task.get("TYPE") == "NUMERIC_GRID" or task.get("VARIABLE_TYPE") == "NUMERIC_GRID":
                        # Buscamos la lista de sub-preguntas en el task (igual que en MRQ_CAT)
                        cols = task.get("EXACT_COLS", []) 
                        if not cols:
                            # Por si en tu config le llamás de otra forma, un plan B:
                            cols = task.get("COLS", [])

                        # 👇 ESTO NOS VA A AVISAR SI ENTRÓ BIEN 👇
                        print(f"✅ [RUTEO OK] Procesando Batería Numérica: {v_name}")
                        print(f"   Columnas detectadas: {cols}")                            
                        # Pasamos el nombre general (v_name) y la lista de columnas (cols)
                        tab = _p_engine.tabulate_numeric_grid(v_name, cols)
                        if tab is None:
                            print(f"❌ [FALLO] La tabla {v_name} devolvió None (¿datos vacíos?)")
                        else:
                            print(f"🎉 [ÉXITO] Tabla {v_name} generada correctamente")
                    # =========================================================  

                elif task["TYPE"] == "SCALE_PROFILE":
                    try:
                        res = process_data.process_scale(_p_df, _p_meta, task, _p_banner, _p_master_col)
                    except AttributeError as e:
                        if "split" in str(e):
                            logging.debug(f"⚠️ Omitiendo textos IA para '{v_name}': Variable sin datos o inexistente.")
                    except Exception:
                        pass

                    if "EXACT_COLS" in task:
                        cols_grid = task["EXACT_COLS"]
                    else:
                        prefix = task.get("ITEMS_PREFIX") or v_name
                        cols_grid = [c for c in _p_df.columns if str(c).startswith(prefix)]

                    cajas_solicitadas = task.get("BOXES", ["T2B", "B2B"])
                    
                    tab = _p_engine.tabulate_smart_grid(
                        group_name=v_name, 
                        cols=cols_grid, 
                        boxes=cajas_solicitadas
                    )

                if tab:
                    _p_resultados.append(tab)

            except Exception as e:
                logging.error(f"Error procesando tarea {t_id} en base {_p_nombre}: {e}")

    # =====================================================================
    # 6. SECCIÓN ESPECIAL Y PPTX (CON PUENTE LEVADIZO)
    # =====================================================================
    solo_tablas = getattr(config, "ONLY_GENERATE_TABLES", False)
    
    mochila_ia = {}

    if not solo_tablas:
        logging.info("Iniciando armado de PowerPoint...")
        
        prs = utils.setup_presentation(config.TEMPLATE_PPX)
        funnel_map = utils.get_funnel_variables_map(meta)
        create_slides.create_summary_slide_with_llm(prs, all_findings)

        try:
            create_slides.renombrar_por_geometria(prs)
            mes_nuevo = getattr(config, "NEW_WAVE_NAME", "Nueva Ola")
            mapa_graficos = getattr(config, "TRACKING_CHARTS", [])

            logging.info(f"RADAR: Tablas listas en Principal: {len(excel_results_prin)} | Secundaria: {len(excel_results_sec)}")

            for chart_config in mapa_graficos:
                c_name = chart_config.get("chart_name")

                if chart_config.get("is_header"):
                    exito = create_slides.update_header_table_in_presentation(prs, c_name, mes_nuevo)
                    if exito:
                        logging.info(f"ÉXITO: Encabezado '{c_name}' actualizado con {mes_nuevo}.")
                    else:
                        logging.warning(f"No se encontró el encabezado '{c_name}' en el PPT.")
                    continue


                if chart_config.get("is_ytd_calculated"):
                    ref_chart = chart_config.get("ref_chart_name")
                    target_year = chart_config.get("target_year", "YTD 2026")
                    year_suffix = chart_config.get("year_suffix", "26")
                    es_porcentaje = chart_config.get("is_percentage", False)
                    mapa_metricas = chart_config.get("metrics", {}) 
                    remove_percentage_sign=chart_config.get("remove_percentage_sign", False),
                    decimals=chart_config.get("decimals", 0)
                    multiplier=chart_config.get("multiplier", 1.0)                    
                    exito = create_slides.update_ytd_calculated_from_chart(
                        prs, c_name, ref_chart, target_year, year_suffix, 
                        metrics_map=mapa_metricas, is_percentage=es_porcentaje,
                        remove_percentage_sign=remove_percentage_sign,decimals=decimals,
                        multiplier=multiplier
                    )
                    if exito:
                        logging.info(f"ÉXITO: YTD '{c_name}' recalculado desde '{ref_chart}'.")
                    else:
                        logging.warning(f"No se pudo calcular el YTD para '{c_name}'.")
                    continue

                metrics_map = chart_config.get("metrics", {})
                target_box = chart_config.get("target_box", "t2b").lower()
                
                if "4" in target_box: box_keywords = ["top 4 box", "t4b"]
                elif "3" in target_box: box_keywords = ["top 3 box", "t3b"]
                elif "5" in target_box: box_keywords = ["top 5 box", "t5b"]
                elif "bottom" in target_box or "b2b" in target_box: box_keywords = ["bottom 2 box", "b2b"]
                else: box_keywords = ["top 2 box", "t2b"]

                if chart_config.get("origen") == "secundaria":
                    lista_a_buscar = excel_results_sec
                else:
                    lista_a_buscar = excel_results_prin

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
                        # 1. ÍNDICE ORIGINAL (Sin romper retrocompatibilidad)
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

                        fila_real = None
                        valor_crudo = 0.0 
                        encontrado = False
                        
                        # 👇 EL INTERRUPTOR: ¿Usamos el modo nuevo o el viejo?
                        es_multi_marca = any("|" in str(kw) for kw in keywords)
                        contexto_grid_actual = ""
                        
                        for pos, indice in enumerate(df_var.index):
                            indice_str = str(indice).lower()
                            
                            if es_multi_marca:
                                # =========================================================
                                # 🚀 MODO NUEVO: Baterías Multi-Marca (Solo si usamos "|")
                                # =========================================================
                                if "grid_attr:" in indice_str:
                                    contexto_grid_actual = indice_str.replace("grid_attr:", "").strip()
                                    
                                for kw in keywords:
                                    kw_lower = str(kw).lower().strip()
                                    if "|" in kw_lower:
                                        attr_buscado, metrica_buscada = [x.strip() for x in kw_lower.split("|")]
                                        # Buscamos el atributo en el contexto, y la métrica en la fila actual
                                        if attr_buscado in contexto_grid_actual and metrica_buscada == indice_str:
                                            val_temp = df_var.iloc[pos]["TOTAL"]
                                            if pd.notna(val_temp):
                                                valor_crudo += float(val_temp)
                                                encontrado = True
                                                break 
                                if encontrado:
                                    break
                                    
                            else:
                                # =========================================================
                                # 🛡️ MODO TRADICIONAL (Literalmente tu código original)
                                # =========================================================
                                if any(str(kw).lower() in indice_str for kw in keywords):
                                    fila_real = indice
                                    # 👇 CAMBIO SEGURO: Usamos iloc[pos] en vez de loc para evitar doble conteo
                                    val_temp = df_var.iloc[pos]["TOTAL"]
                                    
                                    if pd.notna(val_temp):
                                        print(f"  -> ¡Atrapé '{fila_real}' en {var_actual}! Sumando: {val_temp}")
                                        valor_crudo += float(val_temp)
                                        encontrado = True
                                        # (Borramos el break acá de forma segura)
                                        
                                elif fila_real is not None and not encontrado and any(kw in indice_str for kw in box_keywords):
                                    val_temp = df_var.iloc[pos]["TOTAL"]
                                    if pd.notna(val_temp):
                                        valor_crudo += float(val_temp)
                                        encontrado = True
                                        break # Este break sí lo dejamos por seguridad de las escalas

                        if encontrado:
                            try:
                                valor_redondeado = int(round(valor_crudo))
                                valores_para_promedio.append(valor_redondeado)
                                datos_a_inyectar[row_name] = valor_redondeado
                            except Exception as e:
                                logging.warning(f"Error al extraer dato de '{fila_real}': {e}")
                        else:
                            logging.warning(f"No se encontró fila para '{row_name}' en {var_actual}.")
                    else:
                        logging.warning(f"No se encontró la tabla {var_actual} para '{row_name}'.")

                if chart_config.get("reporcentualizar") and datos_a_inyectar:
                    nueva_base = sum(datos_a_inyectar.values())
                    if nueva_base > 0:
                        for clave, valor in datos_a_inyectar.items():
                            datos_a_inyectar[clave] = int(round((valor / nueva_base) * 100))
                        logging.info(f"REPORCENTUALIZADO: Nueva base={nueva_base}")

                if chart_config.get("calcular_promedio") and valores_para_promedio:
                    promedio_final = int(round(sum(valores_para_promedio) / len(valores_para_promedio)))
                    datos_a_inyectar["promedio"] = promedio_final
                    logging.info(f"Promedio calculado para {c_name}: {promedio_final}")

                if datos_a_inyectar:
                    if chart_config.get("is_table"):
                        if chart_config.get("is_static"):
                            columna_destino = chart_config.get("target_col")
                            # 👇 Lo hacemos dinámico. Si no le decís nada, busca en la primera columna (0) 👇
                            col_etiqueta = chart_config.get("label_col", 0) 
                            
                            exito = create_slides.update_static_table_in_presentation(
                                prs, c_name, columna_destino, datos_a_inyectar, label_col=col_etiqueta
                            )
                            tipo_obj = f"Tabla Estática (Col {columna_destino})"
                        else:
                            col_datos = chart_config.get("start_data_col", 1)
                            col_etiqueta = chart_config.get("label_col", col_datos - 1)
                            es_porcentaje_tabla = chart_config.get("is_percentage", False)
                            tiene_encabezado = chart_config.get("has_header", True) 

                            exito = create_slides.update_tracking_table_in_presentation(
                                prs, c_name, mes_nuevo, datos_a_inyectar, 
                                start_data_col=col_datos, label_col=col_etiqueta,
                                is_percentage=es_porcentaje_tabla, has_header=tiene_encabezado
                            )
                            tipo_obj = "Tabla Tracking"
                    else:
                        es_porcentaje = chart_config.get("is_percentage", False)
                        solo_agregar = chart_config.get("append_only", False)
                        
                        if es_porcentaje:
                            for clave in datos_a_inyectar:
                                datos_a_inyectar[clave] = datos_a_inyectar[clave] / 100.0

                        colores_lineas = chart_config.get("line_colors", {})
                        sin_signo = chart_config.get("remove_percentage_sign", False)
                        
                        # 👇 1. LEEMOS EL DATO DESDE EL CONFIG (Si no existe, asume 0)
                        decimales = chart_config.get("decimals", 0)
                        ola_impar=chart_config.get("ola_impar", False)
                        exito = create_slides.update_tracking_chart_in_presentation(
                            prs, c_name, mes_nuevo, datos_a_inyectar, 
                            is_percentage=es_porcentaje, append_only=solo_agregar,
                            line_colors=colores_lineas, remove_percentage_sign=sin_signo,
                            decimals=decimales, ola_impar=ola_impar  # 👈 2. ENCHUFAMOS EL CABLE ACÁ
                        )
                        tipo_obj = "Gráfico Tracking"
                    
                    if exito:
                        logging.info(f"ÉXITO: {tipo_obj} '{c_name}' actualizado -> Datos: {datos_a_inyectar}")
                        if not chart_config.get("is_header"):
                            # 👇 ACÁ VA EL INTERRUPTOR AHORA 👇
                            if chart_config.get("skip_insight", False):
                                logging.info(f"   ⏭️ Saltando guardado en Mochila IA para '{c_name}'.")                            
                            else:
                                if chart_config.get("is_table"):
                                    datos_ia = create_slides.extract_table_data_for_ai(prs, c_name)
                                    if datos_ia and chart_config.get("ai_table_headers"):
                                        datos_ia["datos_tabla"][0] = chart_config.get("ai_table_headers")
                                else:
                                    datos_ia = create_slides.extract_chart_data_for_ai(prs, c_name, ultimos_n_meses=12)
                            
                            if datos_ia:
                                mochila_ia[c_name] = datos_ia
                    else:
                        logging.warning(f"No se encontró el {tipo_obj} '{c_name}' en la plantilla.")

        except Exception as e:
            logging.error(f"Error en la actualización masiva de gráficos: {e}")

        # ==============================================================
        # 7. IA Y ETIQUETAS YTD GLOBALES
        # ==============================================================
# 🧹 FILTRO DE ADUANA 1: Redondea todo a 1 decimal 
        def limpiar_decimales_para_ia(obj):
            if isinstance(obj, float) or "float" in str(type(obj)).lower():
                return round(float(obj), 4)
            elif isinstance(obj, dict):
                return {k: limpiar_decimales_para_ia(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [limpiar_decimales_para_ia(i) for i in obj]
            return obj

        # 🧹 FILTRO DE ADUANA 2: Expulsa los gráficos de detalle a la fuerza
        claves_a_borrar = [k for k in mochila_ia.keys() if "Chart_Detalle" in k]
        for k in claves_a_borrar:
            del mochila_ia[k]

        # Aplicamos la limpieza matemática y SOBREESCRIBIMOS la mochila original
        mochila_ia = limpiar_decimales_para_ia(mochila_ia)
        
        logging.info(f"🧹 Mochila IA purificada. Se eliminaron {len(claves_a_borrar)} gráficos de detalle.")

        usar_ia = getattr(config, "USE_AI_INSIGHTS", False) 
        
        if mochila_ia and usar_ia:
            print("\n" + "="*50)
            print("🧠 CONECTANDO CON GEMINI PARA ANALIZAR DATOS...")
            MI_API_KEY = "MI_API_KEY" 
            
            print("\n📝 1. Redactando títulos e insights por diapositiva...")
            diccionario_titulos = generador_ia.redactar_titulos_con_gemini(MI_API_KEY, mochila_ia)
            
            if diccionario_titulos:
                print("✅ Títulos generados con éxito.")
                print("💉 Inyectando textos en los gráficos del PowerPoint...")
                create_slides.inject_ai_insights_into_presentation(prs, diccionario_titulos)
            else:
                print("⚠️ No se generaron títulos o hubo un error con la API.")

            usar_summary = getattr(config, "USE_AI_SUMMARY", False)
            if usar_summary:
                print("\n📊 2. Redactando el Executive Summary Global...")
                texto_summary = generador_ia.redactar_executive_summary(MI_API_KEY, mochila_ia)
                
                if texto_summary:
                    print("✅ Executive Summary generado.")
                    print("💉 Inyectando el Summary en el PowerPoint...")
                    inyectado_ok = False
                    for slide in prs.slides:
                        for shape in slide.shapes:
                            if shape.has_text_frame and shape.name == "Text_Executive_Summary":
                                shape.text = texto_summary
                                inyectado_ok = True
                                print("   -> ¡Caja 'Text_Executive_Summary' actualizada con éxito!")
                                break 
                        if inyectado_ok: break 
                    
                    if not inyectado_ok:
                        print("   ⚠️ No se encontró la caja 'Text_Executive_Summary' en el PPT.")
                else:
                    print("⚠️ No se pudo generar el Executive Summary.")
            else:
                print("\n📊 2. Módulo de Executive Summary DESACTIVADO (Saltando...)")
            print("="*50 + "\n")
        elif not usar_ia:
            print("\n" + "="*50)
            print("⏸️  MÓDULO DE IA DESACTIVADO EN CONFIG.PY")
            print("="*50 + "\n")

        cant_ytd, texto_ytd = create_slides.update_global_ytd_labels(prs, mes_nuevo)
        logging.info(f"🧹 LIMPIEZA: Se actualizaron {cant_ytd} etiquetas a '{texto_ytd}'")

        output_ppt = f"informe_{config.STUDY_ID}.pptx"
        prs.save(output_ppt)
        logging.info(f"➡️ PowerPoint: {output_ppt}")

    else:
        print("\n" + "="*50)
        logging.info("⏭️ MODO SOLO TABLAS ACTIVADO: Omitiendo PowerPoint e IA.")
        print("="*50 + "\n")

    # =========================================================
    # 8. GUARDADO FINAL DE EXCEL
    # =========================================================
    output_xls_prin = f"Tablas_Principal_{config.STUDY_ID}.xlsx"
    engine.export_to_excel(excel_results_prin, output_xls_prin)
    logging.info(f"➡️ Excel Principal: {output_xls_prin}")

    if excel_results_sec and engine_sec is not None:
        output_xls_sec = f"Tablas_Secundaria_{config.STUDY_ID}.xlsx"
        engine_sec.export_to_excel(excel_results_sec, output_xls_sec)
        logging.info(f"➡️ Excel Secundario: {output_xls_sec}")

    logging.info("="*60)
    logging.info("🎉 PROCESO COMPLETADO EXITOSAMENTE")
    logging.info("="*60)

if __name__ == '__main__':
    run_brand_audit()