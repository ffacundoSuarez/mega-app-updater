import logging
from pptx import Presentation
import create_slides  # Importamos tus funciones preexistentes
from pptx.enum.chart import XL_CHART_TYPE

class VisualEngine:
    def __init__(self, template_path, banner_info):
        """
        template_path: Ruta al archivo .pptx con el Slide Master de la empresa.
        banner_info: El diccionario generado por prepare_banner_info (con display_map).
        """
        self.prs = Presentation(template_path)
        self.banner_info = banner_info
        
        # Mapeo Preestablecido: Tipo de pregunta -> Tipo de gráfico
        self.default_charts = {
            "SRQ": "BAR_CLUSTERED",
            "MRQ": "BAR_CLUSTERED",
            "MASTER_FUNNEL": "COLUMN_CLUSTERED",
            "SCALE": "BAR_STACKED_100",
            "GRID": "BAR_STACKED_100"
        }

    def process_srq_mrq(self, res, metadata, task, chart_key):
        """Prepara datos para SRQ/MRQ asegurando la extracción del Total."""
        import create_slides
        import pandas as pd
        
        # El DataFrame principal de porcentajes
        df_pct = res.get('percentages')
        
        # EXTRAER TOTAL PARA EL GRÁFICO:
        # Buscamos la columna 'TOTAL'. Si no existe, usamos la primera columna.
        if 'TOTAL' in df_pct.columns:
            total_series = df_pct['TOTAL']
        else:
            total_series = df_pct.iloc[:, 0]
        
        # Convertimos a la estructura que espera create_single_slide (DataFrame con 'Categoria' y 'Porcentaje')
        chart_data = total_series.reset_index()
        chart_data.columns = ['Categoria', 'Porcentaje']
        
        table_data = df_pct
        sig_matrix = res.get('sig_matrix') 

        create_slides.create_single_slide(
            self.prs,
            chart_data,    # Ahora sí lleva los datos para las barras
            table_data,    # Datos para la tabla
            sig_matrix,
            "", "", 
            task, 
            metadata, 
            self.banner_info, 
            chart_key
        )

 

    def generate_all_slides(self, results_list, metadata, output_pptx):
        """Genera el reporte completo extrayendo los datos correctamente."""
        import logging
        import create_slides
        import pandas as pd
        import traceback

        logging.info(f"Iniciando generación de PowerPoint: {len(results_list)} tablas.")

        for res in results_list:
            
            if res is None: continue
            
            #tipo_tabla = res.get('type')
            tipo_tabla = str(res.get('type', '')).upper().strip()
            # Forzamos detección de GRID si detectamos MultiIndex o múltiples marcas
            es_bateria = (tipo_tabla == "GRID" or tipo_tabla == "SCALE_GRID")
            
            var_name = res.get('variable')
            # ==========================================================
            # FILTRO DE AISLAMIENTO: SOLO PASA P34
            # ==========================================================
            #if var_name is None or "P34" not in str(var_name):
            #    continue 
            # ==========================================================            
            
            
            
            chart_key = self.default_charts.get(tipo_tabla, "BAR_CLUSTERED")
            
            task = {
                "VARIABLE_NAME": var_name,
                "CHART_TYPE": chart_key,
                "SLIDE_LAYOUT": 1 
            }

            try:
                df_pct = res.get('percentages')
                if df_pct is None: continue

                # 1. Limpieza de significancia
                sig_matrix = res.get('sig_matrix')
                if sig_matrix is not None:
                    if isinstance(sig_matrix.columns, pd.MultiIndex):
                        sig_matrix.columns = ['_'.join(map(str, col)).strip() for col in sig_matrix.columns.values]
                    sig_matrix.index = sig_matrix.index.astype(str).str.strip()
                    sig_matrix.columns = sig_matrix.columns.astype(str).str.strip()

                # --- 2. LÓGICA DIFERENCIADA POR TIPO ---
                
                if tipo_tabla == "MASTER_FUNNEL":
                    df_pct = res.get('percentages').copy()

                    # 1. Limpieza de nombres de Marcas/Segmentos
                    def clean_brand_name(name):
                        if isinstance(name, tuple):
                            name = " - ".join([str(l) for l in name if 'Unnamed' not in str(l)])
                        name = str(name)
                        for prefix in ["TOTAL - ", "F1: ", "Hombre - ", "Mujer - "]:
                            name = name.replace(prefix, "")
                        return name.strip()



                    all_step_rates_raw = res.get('conversion_rates', {})
                    all_step_rates = {clean_brand_name(k): v for k, v in all_step_rates_raw.items()}

                    # --- NUEVO FILTRO DE FILAS EXACTO ---
                    # 1. Identificar los segmentos únicos (Primer nivel del MultiIndex)
                    # Por ejemplo: 'TOTAL', 'Hombre', 'Mujer'
                    segmentos = df_pct.columns.get_level_values(0).unique()
                    # Buscamos solo las filas que empiecen con los números 3, 4, 5, 6 y 7 
                    # tal como se ve en tu imagen del Excel.
                    etapas_objetivo = ["3.", "4.", "5.", "6.", "7."]
                    indices_etapas = [
                    idx for idx in df_pct.index 
                    if any(str(idx).strip().startswith(n) for n in etapas_objetivo)
                    ]
                    # Ordenamos para asegurar que el funnel vaya de 3 a 7
                    indices_etapas.sort(key=lambda x: str(x))         
                    # Guardamos los nombres de las etapas (ej: "1. TOM", "3. CONOCIMIENTO")
                    etapas_nombres = [str(idx).split('.', 1)[-1].strip() for idx in indices_etapas]           
                    # Creamos el DataFrame explícitamente
                    #df_funnel_solo_barras = df_pct.loc[indices_etapas].copy()
                    #df_funnel_solo_barras = df_funnel_solo_barras.apply(lambda x: pd.to_numeric(x.astype(str).str.replace('%', ''), errors='coerce')).fillna(0.0)

                    # CONFIGURACIÓN DE LOTES
                    MARCAS_POR_SLIDE = 5

                    for segmento in segmentos:
                        # Filtrar el DataFrame: Solo las marcas de ESTE segmento específico
                        # df_segmento tendrá las marcas como columnas y las etapas como filas
                        df_segmento = df_pct.loc[indices_etapas, segmento].copy()
                        # Limpieza numérica de los datos del segmento
                        df_segmento = df_segmento.apply(lambda x: pd.to_numeric(x.astype(str).str.replace('%', ''), errors='coerce')).fillna(0.0)
                        # Lista de marcas en este segmento
                        marcas_segmento = df_segmento.columns.tolist()

                        # 3. DIVIDIR EN LOTES (Chunks)
                        for i in range(0, len(marcas_segmento), MARCAS_POR_SLIDE):
                            lote_marcas = marcas_segmento[i : i + MARCAS_POR_SLIDE]
                            df_lote = df_segmento[lote_marcas]
                            
                            # Título dinámico: Agrega "(1/2)" si hay más de un lote
                            num_lote = (i // MARCAS_POR_SLIDE) + 1
                            total_lotes = (len(marcas_segmento) + MARCAS_POR_SLIDE - 1) // MARCAS_POR_SLIDE
                            
                            suffix = f" ({num_lote}/{total_lotes})" if total_lotes > 1 else ""
                            titulo_slide = f"SALUD DE MARCA: {str(segmento).upper()}{suffix}"

                            all_step_rates_raw = res.get('conversion_rates', {})
                            logging.info(f"📊 Funnel: {len(indices_etapas)} etapas detectadas")

                            logging.info(f"Generando slide: {titulo_slide} con {len(lote_marcas)} marcas.")

                        # Definir título dinámico para la diapositiva
                        #titulo_slide = f"SALUD DE MARCA: {str(segmento).upper()}"
        
                        # Preparar tasas de conversión (opcional: filtrar por segmento si es necesario)
                        
                        # Aquí puedes ajustar la lógica de limpieza de nombres de marca según necesites

                        #logging.info(f"Generando diapositiva para segmento: {segmento}")


                        # DEBUG: Verificar si hay datos
                        
                            # 4. Enviar a graficar
                            task["SLIDE_LAYOUT"] = "Chart layout 8"
                            create_slides.create_brand_funnel_slide(
                                self.prs,
                                df_segmento.T,
                                titulo_slide, 
                                #res.get('label', 'Salud de Marca'), 
                                task, 
                                all_step_rates=all_step_rates, 
                                show_conversion_rates=True,
                                stage_names=etapas_nombres  # <-- PASAMOS LOS NOMBRES AQUÍ
                            )
                elif tipo_tabla in ["SCALE", "GRID", "SCALE_GRID"]:
                    filas_excluir_grafico = ['Top 2 Box', 'Bottom 2 Box', 'Media (Promedio)', '---']
                    table_data = df_pct.loc[df_pct.index.isin(['Top 2 Box'])].copy()
                    
                    chart_data_scale = pd.DataFrame() 
                    df_limpio = df_pct.loc[~df_pct.index.isin(filas_excluir_grafico)].copy()
                    tiene_pipes = any('|' in str(col) for col in df_pct.columns)

                    if tiene_pipes:
                        # --- ESCENARIO A: MEGA-GRID ---
                        new_rows = []
                        escala_ordenada = []
                        for col in df_pct.columns:
                            if '|' in str(col):
                                parts = str(col).split('|')
                                attr_name = parts[0].replace('GRID_ATTR:', '').strip()
                                scale_label = parts[1].strip()
                                if scale_label not in escala_ordenada: escala_ordenada.append(scale_label)
                                val = df_pct.iloc[0][col]
                                new_rows.append({'Item': attr_name, 'Escala': scale_label, 'Valor': val})
                        
                        df_pivot = pd.DataFrame(new_rows)
                        if not df_pivot.empty:
                            chart_data_scale = df_pivot.pivot(index='Item', columns='Escala', values='Valor')
                            cols_finales = [c for c in escala_ordenada if c in chart_data_scale.columns]
                            chart_data_scale = chart_data_scale[cols_finales].reset_index()
                            task["CHART_ORIENTATION"] = "BAR"

                    elif len(df_limpio) > 1:
                        # --- ESCENARIO B: GRID VERTICAL (P34) ---
                        new_grid_rows = []
                        current_attr, current_data = None, {}
                        for idx_val, row in df_limpio.iterrows():
                            label = str(idx_val).strip()
                            if "GRID_ATTR:" in label:
                                if current_attr and current_data:
                                    current_data['Item'] = current_attr
                                    new_grid_rows.append(current_data)
                                #clean_name = label.replace('GRID_ATTR:', '').split('|')[0].strip()
                                clean_name = label.replace('GRID_ATTR:', '').strip()
                                current_attr = clean_name.split(" - ")[-1] if " - " in clean_name else clean_name
                                current_data = {}
                            # Saltamos filas vacías o separadores para que no ensucien el gráfico
                            elif label == "" or label == "---" or label == " ":
                                continue
                            else:
                                val = row['TOTAL'] if 'TOTAL' in df_limpio.columns else row.iloc[0]
                                current_data[label] = val
                        
                        if current_attr and current_data:
                            current_data['Item'] = current_attr
                            new_grid_rows.append(current_data)
                        
                        if new_grid_rows:
                            chart_data_scale = pd.DataFrame(new_grid_rows)
                            task["CHART_ORIENTATION"] = "BAR"

                    # --- ESCENARIO C: FALLBACK / ESCALA SIMPLE ---
                    if chart_data_scale.empty and not df_limpio.empty:
                        # Transponemos y nos aseguramos de que el índice sea la columna 'Item'
                        chart_data_scale = df_limpio.T.reset_index()
                        chart_data_scale.columns = ['Item'] + list(df_limpio.index)
                        task["CHART_ORIENTATION"] = "COLUMN"

                    # --- VALIDACIÓN FINAL ANTES DE ENVIAR ---
                    if not chart_data_scale.empty:
                        # Aseguramos que 'Item' sea la primera columna y sea String
                        if 'Item' in chart_data_scale.columns:
                            cols = ['Item'] + [c for c in chart_data_scale.columns if c != 'Item']
                            chart_data_scale = chart_data_scale[cols]
                            chart_data_scale['Item'] = chart_data_scale['Item'].astype(str)
                        
                        task["SLIDE_LAYOUT"] = "Chart layout 9"
                        create_slides.create_scale_profile_slide(
                            self.prs, chart_data_scale, table_data, sig_matrix, 
                            "", "", task, metadata, self.banner_info
                        )
                    else:
                        print(f"!!! ADVERTENCIA: {var_name} no produjo datos para el gráfico.")


                else:
                    # Preparación de chart_data SOLO para SRQ, MRQ y Scales
                    if 'total_percentages' in res:
                        chart_data = res['total_percentages']
                    else:
                        target_col = 'TOTAL' if 'TOTAL' in df_pct.columns else df_pct.columns[0]
                        #chart_data = df_pct[target_col].reset_index()
                        #chart_data = df_solo_escala.T.reset_index().rename(columns={'index': 'Item'})
                        chart_data = df_pct[target_col].reset_index()
                        # Aquí el renombre es seguro porque solo hay 2 columnas
                        chart_data.columns = ['Categoria', 'Porcentaje']

                    if tipo_tabla in ["SRQ", "MRQ"]:
                        create_slides.create_single_slide(
                            self.prs, chart_data, df_pct, sig_matrix,
                            "", "", task, metadata, self.banner_info, chart_key
                        )

            except Exception as e:
                logging.error(f"Error al visualizar la variable {var_name}: {e}")
                logging.error(traceback.format_exc())

        self.prs.save(output_pptx)
        logging.info(f"Archivo guardado exitosamente en: {output_pptx}")