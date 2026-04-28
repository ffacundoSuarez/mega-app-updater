import pandas as pd
import numpy as np
import logging
# DESPUÉS (Correcto para paquetes)
from . import utils
from .utils import get_sig_letters

class TabulationEngine:
    def __init__(self, df, meta, banner_info, quest_dict=None):
        self.df = df
        self.meta = meta
        # Guardamos el banner_info que viene de run_test()
        self.banner_info = banner_info if banner_info is not None else {}
        # Extraemos el nombre de la variable para los encabezados del Excel
        self.banner_variable_name = "SEGMENTACIÓN"
        self.segments = banner_info["segment_keys"] if "segment_keys" in banner_info else {}
        self.quest_dict = quest_dict

    def tabulate_master_funnel(self, brands_logic_map):
        all_brand_data = []
        clean_brand_names = [] # Lista para guardar los nombres cortos

        # 1. Calcular funnels individuales
        for brand_name, logic in brands_logic_map.items():
            res = self.tabulate_brand_funnel(brand_name, logic)
            if res:
                df_brand = res['percentages'].copy()
                # --- LIMPIEZA DE NOMBRE DE MARCA CON PROTECCIÓN ---
                brand_str = str(brand_name)
                clean_brand = brand_str.split(" - ")[-1].strip() if " - " in brand_str else brand_str
                clean_brand_names.append(clean_brand)
                # Nivel superior temporal: Marca
                df_brand.columns = pd.MultiIndex.from_product([[clean_brand], df_brand.columns])
                all_brand_data.append(df_brand)
        
        if not all_brand_data:
            print("⚠️ No se generaron datos para ninguna marca.")
            return None

        # 2. Unión lateral
        df_master = pd.concat(all_brand_data, axis=1)

        # 3. REORDENAMIENTO
        segments_to_show = ["TOTAL"] + [seg for seg in self.segments.keys() if seg != "TOTAL"]
        brands = df_master.columns.get_level_values(0).unique()
        
        new_columns = []
        for seg in segments_to_show:
            for br in brands:
                # Nota: En este punto el orden es (Marca, Segmento)
                if (br, seg) in df_master.columns:
                    new_columns.append((br, seg))

        # Validación de seguridad para evitar el TypeError
        if not new_columns:
            print("❌ ERROR: No se pudo mapear ninguna columna. Revisar concordancia de nombres.")
            return None

        df_final = df_master.reindex(columns=pd.MultiIndex.from_tuples(new_columns))

        # 4. SWAP E INDEXACIÓN
        df_final.columns = df_final.columns.swaplevel(0, 1)
        df_final.columns = pd.MultiIndex.from_tuples(df_final.columns)
        
        print(f"\n ESTRUCTURA FINAL DEL FUNNEL:")
        print(f" > Columnas Nivel 0 (Segmentos): {list(df_final.columns.get_level_values(0).unique())}")
        print(f" > Columnas Nivel 1 (Marcas): {list(df_final.columns.get_level_values(1))}")

        # 5. CÁLCULO DE BASES
        raw_bases = self._calculate_all_bases(self.df)
        master_bases = {}
        
        for col_tuple in df_final.columns:
            seg_name = col_tuple[0]
            master_bases[col_tuple] = raw_bases.get(seg_name, {"unweighted": 0, "weighted": 0})

        return {
            "type": "MASTER_FUNNEL",
            "variable": "BRAND_HEALTH_COMPARATIVE",
            "label": "COMPARATIVO DE SALUD DE MARCA",
            "percentages": df_final,
            "bases": master_bases
        }

    def tabulate_brand_funnel(self, brand_name, logic_dict):
        """
        Genera un funnel de salud de marca. 
        Si una variable no existe en el estudio, la etapa se muestra como 0.0.
        """
        base_var = None
        for stage in logic_dict.values():
            if stage['var'] in self.df.columns:
                base_var = stage['var']
                break
        
        if not base_var:
            print(f"DEBUG: No se encontraron variables para el funnel de {brand_name}")
            return None
            
        df_valid = self.df[self.df[base_var].notna()].copy()

        def evaluate_stage(data_subset, config):
            var = config['var']
            if var not in data_subset.columns:
                return 0
            
            op, val = config['op'], config['val']
            column_values = pd.to_numeric(data_subset[var], errors='coerce')

            if op == "==":
                return (column_values == float(val)).sum()
            elif op == ">=":
                return (column_values >= float(val)).sum()
            elif op == "in":
                return column_values.isin(val).sum()
            return 0

        def calculate_funnel_col(subset):
            n = len(subset)
            if n == 0: return pd.Series(dtype=float)
            
            steps_pct = {}
            for label, config in logic_dict.items():
                menciones = evaluate_stage(subset, config)
                steps_pct[label] = (float(menciones) / float(n)) * 100 if n > 0 else 0

            print(f"DEBUG VALORES REALES ({brand_name}): {steps_pct}")
            return pd.Series(steps_pct) 

        banner_data = {"TOTAL": calculate_funnel_col(df_valid)}

        for seg_label, seg_filter in self.segments.items():
            if not seg_filter: continue
            vf = list(seg_filter.keys())[0]
            vl = list(seg_filter.values())[0]
            subset_seg = df_valid[df_valid[vf] == vl]
            banner_data[seg_label] = calculate_funnel_col(subset_seg)

        df_final = pd.DataFrame(banner_data).fillna(0)

        # 3. Cálculo de Tasas de Conversión
        try:
            steps = [
                "1. TOM", "2. SOM", "3. CONOCIMIENTO", 
                "4. KNOWLEDGE", "5. ALGUNA VEZ", 
                "6. HABITUAL (U3M)", "7. PREFERIDA"
            ]
            
            conversion_rows = {}
            df_final.loc["--- (Ratios) ---"] = ""

            for i in range(1, len(steps)):
                superior = steps[i-1]
                inferior = steps[i]
                
                if superior in df_final.index and inferior in df_final.index:
                    val_sup = df_final.loc[superior]
                    val_inf = df_final.loc[inferior]
                    
                    label_ratio = f"Ratio: {inferior.split('. ')[1]} / {superior.split('. ')[1]}"
                    conversion_rows[label_ratio] = (val_inf / val_sup.replace(0, pd.NA) * 100).fillna(0)

            df_ratios = pd.DataFrame(conversion_rows).T
            df_final = pd.concat([df_final, df_ratios])

        except Exception as e:
            logging.error(f"Error calculando ratios de conversión: {e}")
        
        return {
            "type": "BRAND_FUNNEL",
            "variable": brand_name,
            "label": f"BRAND HEALTH: {brand_name}",
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid)
        }

    def tabulate_srq(self, var_name):
        """Replica la lógica de SRQ respetando el orden original de la base."""
        value_labels = utils.get_label_dict(self.meta.variable_value_labels, var_name)
        df_proc = self.df.dropna(subset=[var_name]).copy()
        df_proc = df_proc[df_proc[var_name].astype(str).str.strip() != ""]

        def map_to_label(val):
            if isinstance(val, str):
                return val.strip()
            try:
                num_val = float(val)
                if num_val in value_labels:
                    return str(value_labels[num_val])
                return f"{int(num_val) if num_val == int(num_val) else num_val}"
            except (ValueError, TypeError):
                return str(val).strip()

        df_proc['Categoria'] = df_proc[var_name].apply(map_to_label)
        df_valid_data = df_proc.copy()

        if df_valid_data.empty: 
            print(f"DEBUG: Variable {var_name} no tiene datos válidos.")
            return None

        # --- AUTO-DETECTAR T2B Y B2B ---
        t2b_keys, b2b_keys = [], []
        t2b_label = "T2B"
        b2b_label = "B2B"
        
        if len(value_labels) >= 4 and utils.is_truly_ordinal(value_labels):
            try:
                valid_keys = sorted([float(k) for k in value_labels.keys() if float(k) <= 10])
                if len(valid_keys) >= 4:
                    first_lbl = str(value_labels.get(valid_keys[0], "")).lower()
                    last_lbl = str(value_labels.get(valid_keys[-1], "")).lower()
                    
                    pos_words = ['buena', 'excelente', 'acuerdo', 'gusta', 'satisfecho', 'mejor', 'fácil', 'mucho', 'ganas', 'probable', 'seguro', 'siempre']
                    neg_words = ['mala', 'pésima', 'desacuerdo', 'disgusta', 'insatisfecho', 'peor', 'difícil', 'nada', 'nunca', 'improbable']

                    if any(w in first_lbl for w in pos_words) or any(w in last_lbl for w in neg_words):
                        t2b_keys = valid_keys[:2]
                        b2b_keys = valid_keys[-2:]
                    elif any(w in first_lbl for w in neg_words) or any(w in last_lbl for w in pos_words):
                        t2b_keys = valid_keys[-2:]
                        b2b_keys = valid_keys[:2]
            except Exception:
                pass

        def get_code_from_label(lbl):
            if lbl == "Ns/Nc": return None
            for k, v in value_labels.items():
                if str(v).strip() == str(lbl).strip():
                    return float(k)
            return None

        pesos_total = df_valid_data['ponderacion'] if 'ponderacion' in df_valid_data.columns else pd.Series(1, index=df_valid_data.index)
        n_total_weighted = pesos_total.sum()
        
        if 'ponderacion' in df_valid_data.columns:
            total_counts = df_valid_data.groupby('Categoria')['ponderacion'].sum()
        else:
            total_counts = df_valid_data['Categoria'].value_counts()
            
        total_pct = (total_counts / n_total_weighted * 100)
        total_df = total_pct.reset_index()
        total_df.columns = ['Categoria', 'Porcentaje']
        
        categories_list = []
        for k in sorted([float(x) for x in value_labels.keys()]):
            lbl = value_labels.get(k) or value_labels.get(int(k))
            if pd.notna(lbl):
                clean_lbl = str(lbl).strip()
                if clean_lbl not in categories_list:
                    categories_list.append(clean_lbl)

        for cat in total_df['Categoria'].tolist():
            if cat not in categories_list:
                categories_list.append(cat)

        if t2b_keys:
            tot_t2b, tot_b2b = 0.0, 0.0
            for idx, row in total_df.iterrows():
                code = get_code_from_label(row['Categoria'])
                if code in t2b_keys: tot_t2b += row['Porcentaje']
                if code in b2b_keys: tot_b2b += row['Porcentaje']
            
            total_df = pd.concat([total_df, pd.DataFrame([
                {'Categoria': t2b_label, 'Porcentaje': tot_t2b},
                {'Categoria': b2b_label, 'Porcentaje': tot_b2b}
            ])], ignore_index=True)
            categories_list.extend([t2b_label, b2b_label])

        banner_pct_data = {}
        for segment_label, segment_filter in self.segments.items():
            if not segment_filter:
                df_segment = df_valid_data.copy()
            else:
                var_filter = list(segment_filter.keys())[0] 
                val_filter = list(segment_filter.values())[0]
                df_segment = df_valid_data[df_valid_data[var_filter] == val_filter].copy()
            
            pesos_seg = df_segment['ponderacion'] if 'ponderacion' in df_segment.columns else pd.Series(1, index=df_segment.index)
            N_segment_weighted = pesos_seg.sum()
            
            if N_segment_weighted > 0:
                if 'ponderacion' in df_segment.columns:
                    counts = df_segment.groupby('Categoria')['ponderacion'].sum()
                else:
                    counts = df_segment['Categoria'].value_counts()
                
                seg_pcts = (counts / N_segment_weighted * 100).to_dict()
                
                if t2b_keys:
                    seg_t2b, seg_b2b = 0.0, 0.0
                    for lbl, val in seg_pcts.items():
                        code = get_code_from_label(lbl)
                        if code in t2b_keys: seg_t2b += val
                        if code in b2b_keys: seg_b2b += val
                    seg_pcts[t2b_label] = seg_t2b
                    seg_pcts[b2b_label] = seg_b2b
                    
                banner_pct_data[segment_label] = pd.Series(seg_pcts)
            else:
                banner_pct_data[segment_label] = pd.Series(dtype=float)

        df_final = pd.DataFrame(banner_pct_data).fillna(0.0)
        
        if "TOTAL" not in df_final.columns:
            total_col = total_df.set_index('Categoria')['Porcentaje']
            df_final.insert(0, "TOTAL", total_col)
        
        df_final = df_final.reindex(categories_list).fillna(0.0)

        bases_dict = self._calculate_all_bases(df_valid_data)
        
        try:
            sig_matrix = self.calculate_significance_matrix(df_final, bases_dict)
        except Exception as e:
            sig_matrix = pd.DataFrame("", index=df_final.index, columns=df_final.columns)

        # 🚀 PROTECCIÓN PARA ETIQUETAS NULAS
        label_bruta = utils.get_variable_label(self.meta, var_name)
        label_segura = str(label_bruta).strip() if label_bruta else var_name

        return {
            "type": "SRQ",
            "variable": var_name,
            "label": label_segura,
            "percentages": df_final,
            "sig_matrix": sig_matrix,    
            "bases": bases_dict
        }

    def tabulate_mrq(self, var_name, cols_prefix):
        """Procesa MRQ limpiando etiquetas duplicadas y ponderando correctamente."""
        cols = [c for c in self.df.columns if str(c).startswith(str(cols_prefix))]
        if not cols: return None

        df_valid = self.df[self.df[cols].any(axis=1)].copy()
        if df_valid.empty: return None

        for c in cols:
            col_numerica = pd.to_numeric(df_valid[c], errors='coerce').fillna(0)
            df_valid[c] = (col_numerica > 0).astype(int)
        
        col_labels = {}
        seen_labels = {} 
        for c in cols:
            label_excel = None
            if hasattr(self, 'quest_dict') and self.quest_dict:
                label_excel = self.quest_dict.get(c)

            if label_excel:
                clean_label = str(label_excel).strip()
            else:
                cvl = utils.get_label_dict(self.meta.variable_value_labels, c)
                
                if 1.0 in cvl: raw_label = str(cvl[1.0])
                elif len(cvl) == 1: raw_label = str(list(cvl.values())[0])
                else: 
                    lbl = utils.get_variable_label(self.meta, c)
                    raw_label = str(lbl) if lbl else c
                    
                if " - " in raw_label: clean_label = raw_label.split(" - ")[-1].strip()
                elif ":" in raw_label: clean_label = raw_label.split(":")[-1].strip()
                else: clean_label = raw_label.strip()
                
                if not clean_label or clean_label.lower() == 'none': clean_label = c
                
            if clean_label in seen_labels:
                seen_labels[clean_label] += 1
                final_label = f"{clean_label} ({c})" 
            else:
                seen_labels[clean_label] = 1
                final_label = clean_label

            col_labels[c] = final_label

        banner_data = {}
        pesos_total = df_valid['ponderacion'] if 'ponderacion' in df_valid.columns else pd.Series(1, index=df_valid.index)
        n_total_weighted = pesos_total.sum()

        total_pct = (df_valid[cols].multiply(pesos_total, axis=0).sum() / n_total_weighted * 100)
        total_pct.index = total_pct.index.map(col_labels)
        
        total_series = total_pct.sort_values(ascending=False)
        categories_list = total_series.index.tolist()
        banner_data["TOTAL"] = total_series

        for segment_label, segment_filter in self.segments.items():
            if not segment_filter: continue
            vf = list(segment_filter.keys())[0]
            vl = list(segment_filter.values())[0]
            df_seg = df_valid[df_valid[vf] == vl]
            
            pesos_seg = df_seg['ponderacion'] if 'ponderacion' in df_seg.columns else pd.Series(1, index=df_seg.index)
            n_seg_weighted = pesos_seg.sum()
            
            if n_seg_weighted > 0:
                pcts = (df_seg[cols].multiply(pesos_seg, axis=0).sum() / n_seg_weighted * 100)
                pcts.index = pcts.index.map(col_labels)
                banner_data[segment_label] = pcts
            else:
                banner_data[segment_label] = pd.Series(0.0, index=categories_list)

        df_final = pd.DataFrame(banner_data).fillna(0.0)
        df_final = df_final.reindex(categories_list)

        titulo_excel = self.quest_dict.get(var_name) if hasattr(self, 'quest_dict') and self.quest_dict else None
        
        # 🚀 PROTECCIÓN PARA ETIQUETAS NULAS
        if titulo_excel:
            titulo_final = str(titulo_excel).strip()
        else:
            lbl = utils.get_variable_label(self.meta, var_name)
            titulo_final = str(lbl).strip() if lbl else var_name
        
        return {
            "type": "MRQ",
            "variable": var_name,
            "label": titulo_final,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid)
        }

    def tabulate_mrq_categorical(self, var_name, cols):
        """Procesa menciones espontáneas categóricas (SOM)."""
        if not cols: return None
        
        # =========================================================
        # 🚀 AUTdef tabulate_mrq_categorical(self, var_name, cols):
        """Procesa menciones espontáneas categóricas (SOM)."""
        print(f"\n" + "▼"*50)
        print(f"🕵️‍♂️ [DEBUG MRQ_CAT] Analizando tarea: '{var_name}'")
        print(f"📥 Columnas recibidas desde el config: {cols}")

        if not cols: 
            print("❌ Cancelado: No se recibieron columnas.")
            return None
        
        # =========================================================
        # 🚀 AUTO-RESCATE INTELIGENTE 
        # =========================================================
        if len(cols) == 1:
            col_name = str(cols[0])
            
            if str(var_name).strip() != col_name.strip():
                import re
                raiz = re.sub(r'\d+$', '', col_name) 
                
                hermanas = [c for c in self.df.columns if str(c).startswith(raiz)]
                print(f"🔍 [Buscando hermanas] Raíz buscada: '{raiz}' -> Encontradas en base: {hermanas}")
                
                if len(hermanas) > 1:
                    print(f"🤖 [AUTO-EXPANSIÓN] Aplicada. Se usarán {len(hermanas)} columnas.")
                    cols = hermanas
            else:
                print(f"🛑 [TOM DETECTADO] El nombre de tarea ('{var_name}') es igual a la columna. NO se expande.")
        
        print(f"🚀 Columnas FINALES que cruzará Pandas: {cols}")
        print("▲"*50 + "\n")
        # =========================================================

        first_col = cols[0]
        val_labels = utils.get_label_dict(self.meta.variable_value_labels, first_col)
        if not val_labels: return None

        for code in list(val_labels.keys()):
            label_spss = val_labels[code]
            label_excel = None
            clave_busqueda = f"{var_name}_{int(code)}"
            
            if hasattr(self, 'quest_dict') and self.quest_dict:
                label_excel = self.quest_dict.get(clave_busqueda)
            
            if label_excel:
                val_labels[code] = str(label_excel).strip()
            else:
                val_labels[code] = str(label_spss).strip()

        df_valid = self.df[self.df[first_col].notna()].copy()
        if df_valid.empty: return None

    # 🛡️ Blindaje de tipos de datos
        for c in cols:
            # 👇 ESCÁNER NIVEL 2: Vemos los datos crudos antes de la conversión 👇
            if c != first_col:
                crudos = df_valid[c].dropna().unique()
                print(f"👀 DATOS CRUDOS EN {c} (Primeros 10): {crudos[:10]}")
                
            # Intentamos limpiar espacios en blanco o textos nulos si la columna es de tipo Object/String
            if df_valid[c].dtype == 'object':
                df_valid[c] = df_valid[c].astype(str).str.strip().replace({'': np.nan, 'nan': np.nan, 'None': np.nan})
                
            df_valid[c] = pd.to_numeric(df_valid[c], errors='coerce')
            
        print(f"📊 [DATOS REALES POST-CONVERSIÓN]")
        for c in cols:
            print(f"   -> {c}: {df_valid[c].notna().sum()} respuestas válidas")

        banner_data = {}
        pesos_total = df_valid['ponderacion'] if 'ponderacion' in df_valid.columns else pd.Series(1, index=df_valid.index)
        n_total_weighted = int(round(pesos_total.sum()))
        
        total_pcts = {}
        for code, label in val_labels.items():
            try: num_code = float(code)
            except: num_code = code

            mask = df_valid[cols].isin([num_code]).any(axis=1)
            w_sum = df_valid.loc[mask, 'ponderacion'].sum() if 'ponderacion' in df_valid.columns else mask.sum()
            total_pcts[label] = (w_sum / n_total_weighted * 100) if n_total_weighted > 0 else 0.0

        total_series = pd.Series(total_pcts).sort_values(ascending=False)
        sorted_categories = total_series.index.tolist()
        banner_data["TOTAL"] = total_series

        for segment_label, segment_filter in self.segments.items():
            if not segment_filter: continue
            vf = list(segment_filter.keys())[0]
            vl = list(segment_filter.values())[0]
            df_seg = df_valid[df_valid[vf] == vl]
            
            pesos_seg = df_seg['ponderacion'] if 'ponderacion' in df_seg.columns else pd.Series(1, index=df_seg.index)
            n_seg_weighted = int(round(pesos_seg.sum()))
            
            seg_pcts = {}
            for code, label in val_labels.items():
                try: num_code = float(code)
                except: num_code = code

                mask = df_seg[cols].isin([num_code]).any(axis=1)
                w_sum = df_seg.loc[mask, 'ponderacion'].sum() if 'ponderacion' in df_seg.columns else mask.sum()
                seg_pcts[label] = (w_sum / n_seg_weighted * 100) if n_seg_weighted > 0 else 0.0
                
            banner_data[segment_label] = pd.Series(seg_pcts)

        df_final = pd.DataFrame(banner_data).fillna(0.0)
        df_final = df_final.reindex(sorted_categories)

        titulo_excel = self.quest_dict.get(var_name) if hasattr(self, 'quest_dict') and self.quest_dict else None
        
        if titulo_excel:
            titulo_final = str(titulo_excel).strip()
        else:
            lbl = utils.get_variable_label(self.meta, first_col)
            titulo_final = str(lbl).strip() if lbl else var_name

        return {
            "type": "MRQ_CATEGORICAL",
            "variable": var_name,
            "label": titulo_final,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid)
        }


    def tabulate_scale(self, var_name, cols_prefix=None, boxes=None):
        if boxes is None:
            boxes = ["T2B", "B2B"] 

        value_labels = utils.get_label_dict(self.meta.variable_value_labels, var_name)
        if not value_labels: return None

        codes = sorted([float(k) for k in value_labels.keys()])
        num_options = len(codes)
        max_code = max(codes)
        min_code = min(codes)

        t2b_codes, b2b_codes, t3b_codes, b3b_codes, t4b_codes = [], [], [], [], []
        
        if num_options >= 4:
            t2b_codes = [max_code, max_code - 1]
            b2b_codes = [min_code, min_code + 1]
        if num_options >= 3:
            t3b_codes = [max_code, max_code - 1, max_code - 2]
            b3b_codes = [min_code, min_code + 1, min_code + 2]
        if num_options >= 4:
            t4b_codes = [max_code, max_code - 1, max_code - 2, max_code - 3]

        df_valid = self.df[self.df[var_name].notna()].copy()
        if df_valid.empty: return None

        scale_indices = sorted([float(k) for k in value_labels.keys()])

        def process_stats(df_subset, variable):
            if df_subset.empty: return pd.Series(dtype=float)
            
            pesos = df_subset['ponderacion'] if 'ponderacion' in df_subset.columns else pd.Series(1.0, index=df_subset.index)
            n_weighted = pesos.sum()
            if n_weighted == 0: return pd.Series(dtype=float)
            
            if 'ponderacion' in df_subset.columns:
                counts = df_subset.groupby(variable)['ponderacion'].sum()
            else:
                counts = df_subset[variable].value_counts()
                
            pcts = (counts / n_weighted * 100)
            res = pcts.reindex(scale_indices).fillna(0.0)
            res.index = [value_labels[i] for i in res.index]
            
            metrics_dict = {"---": ""}
            
            def calc_box(codes_list):
                mask = df_subset[variable].isin(codes_list)
                if 'ponderacion' in df_subset.columns:
                    return (df_subset.loc[mask, 'ponderacion'].sum() / n_weighted * 100)
                return (mask.sum() / n_weighted * 100)

            if "T2B" in boxes and t2b_codes: metrics_dict["T2B"] = calc_box(t2b_codes)
            if "T3B" in boxes and t3b_codes: metrics_dict["T3B"] = calc_box(t3b_codes)
            if "T4B" in boxes and t4b_codes: metrics_dict["T4B"] = calc_box(t4b_codes)
            if "B2B" in boxes and b2b_codes: metrics_dict["B2B"] = calc_box(b2b_codes)
            if "B3B" in boxes and b3b_codes: metrics_dict["B3B"] = calc_box(b3b_codes)

            if 'ponderacion' in df_subset.columns:
                mean = (df_subset[variable] * df_subset['ponderacion']).sum() / n_weighted
            else:
                mean = df_subset[variable].mean()
            
            metrics_dict["Media (Promedio)"] = mean
            
            return pd.concat([res, pd.Series(metrics_dict)])

        banner_data = {"TOTAL": process_stats(df_valid, var_name)}
        
        for seg_label, seg_filter in self.segments.items():
            if not seg_filter: continue
            vf = list(seg_filter.keys())[0]
            vl = list(seg_filter.values())[0]
            df_seg = df_valid[df_valid[vf] == vl]
            banner_data[seg_label] = process_stats(df_seg, var_name)

        df_final = pd.DataFrame(banner_data).fillna(0.0)

        # 🚀 PROTECCIÓN PARA ETIQUETAS NULAS
        lbl = utils.get_variable_label(self.meta, var_name)
        label_segura = str(lbl).strip() if lbl else var_name

        return {
            "type": "SCALE",
            "variable": var_name,
            "label": label_segura,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid)
        }

    def tabulate_scale_grid(self, group_name, cols, boxes=None):
        if boxes is None:
            boxes = ["T2B", "B2B"]

        print(f"\n--- INICIANDO PROCESO GRID PARA {group_name} ---")
        print(f" > Cajas solicitadas: {boxes}")
        all_blocks = []

        for c in cols:
            res = self.tabulate_scale(c, cols_prefix=c, boxes=boxes)

            if res is None:
                # 🚀 MENSAJE MEJORADO
                print(f"   ⏭️ Omitiendo ítem '{c}' (Sin datos válidos).")
                continue

            df_p = res['percentages'].copy()

            elementos_a_ignorar = ["Media (Promedio)", "T2B", "T3B", "T4B", "B2B", "B3B", "---"]
            columns_to_keep = [col for col in df_p.columns if col not in elementos_a_ignorar]
            df_p = df_p[columns_to_keep]

            # 🚀 PROTECCIÓN DE ETIQUETAS (GRID SCALE)
            lbl_raw = utils.get_variable_label(self.meta, c)
            full_label = str(lbl_raw).strip() if lbl_raw else c
            clean_label = full_label.split(" - ")[-1].strip().upper() if " - " in full_label else full_label.upper()

            header_label = f"GRID_ATTR:{clean_label}"
            header_row = pd.DataFrame(np.nan, index=[header_label], columns=df_p.columns)

            base_n_row = pd.DataFrame(np.nan, index=["Base Ponderada (n)"], columns=df_p.columns)
            base_N_row = pd.DataFrame(np.nan, index=["Base No Ponderada (N)"], columns=df_p.columns)
            
            bases_del_atributo = res.get("bases", {})
            for col in df_p.columns:
                base_n_row.at["Base Ponderada (n)", col] = bases_del_atributo.get(col, {}).get("weighted", 0)
                base_N_row.at["Base No Ponderada (N)", col] = bases_del_atributo.get(col, {}).get("unweighted", 0)

            spacer = pd.DataFrame(np.nan, index=[" "], columns=df_p.columns)
            block = pd.concat([header_row, base_n_row, base_N_row, df_p, spacer], axis=0)
            all_blocks.append(block)

        if not all_blocks:
            # 🚀 MENSAJE MEJORADO (Ya no es Error Crítico)
            print(f"⚠️ AVISO: La batería '{group_name}' está completamente vacía. Se omite.")
            return None

        df_final = pd.concat(all_blocks)
        df_valid_grid = self.df[self.df[cols[0]].notna()]

        lbl_limpia_raw = utils.get_variable_label(self.meta, group_name, getattr(self, 'quest_dict', None))
        label_limpia = str(lbl_limpia_raw).replace(" (BATERÍA ESCALA)", "").replace("BATERÍA: ", "").strip() if lbl_limpia_raw else group_name
        
        return {
            "type": "SCALE_GRID",
            "variable": group_name.replace(" (BATERÍA ESCALA)", ""),
            "label": label_limpia,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid_grid)
        }

    def tabulate_srq_grid(self, group_name, cols):
        print(f"\n--- INICIANDO PROCESO GRID DICOTÓMICO PARA {group_name} ---")
        all_blocks = []

        for c in cols:
            res = self.tabulate_srq(c)

            if res is None:
                # 🚀 MENSAJE MEJORADO
                print(f"   ⏭️ Omitiendo ítem '{c}' (Sin datos válidos).")
                continue

            df_p = res['percentages'].copy()

            # 🚀 PROTECCIÓN DE ETIQUETAS (GRID SRQ)
            lbl_raw = utils.get_variable_label(self.meta, c)
            full_label = str(lbl_raw).strip() if lbl_raw else c
            clean_label = full_label.split(" - ")[-1].strip().upper() if " - " in full_label else full_label.upper()

            header_label = f"GRID_ATTR:{clean_label}"
            header_row = pd.DataFrame(np.nan, index=[header_label], columns=df_p.columns)

            base_n_row = pd.DataFrame(np.nan, index=["Base Ponderada (n)"], columns=df_p.columns)
            base_N_row = pd.DataFrame(np.nan, index=["Base No Ponderada (N)"], columns=df_p.columns)
            
            bases_del_atributo = res.get("bases", {})
            for col in df_p.columns:
                base_n_row.at["Base Ponderada (n)", col] = bases_del_atributo.get(col, {}).get("weighted", 0)
                base_N_row.at["Base No Ponderada (N)", col] = bases_del_atributo.get(col, {}).get("unweighted", 0)

            spacer = pd.DataFrame(np.nan, index=[" "], columns=df_p.columns)
            block = pd.concat([header_row, base_n_row, base_N_row, df_p, spacer], axis=0)
            all_blocks.append(block)

        if not all_blocks:
            # 🚀 MENSAJE MEJORADO
            print(f"⚠️ AVISO: La batería dicotómica '{group_name}' está completamente vacía. Se omite.")
            return None

        df_final = pd.concat(all_blocks)
        df_valid_grid = self.df[self.df[cols[0]].notna()].copy()

        lbl_limpia_raw = utils.get_variable_label(self.meta, group_name, getattr(self, 'quest_dict', None))
        label_limpia = str(lbl_limpia_raw).replace("BATERÍA: ", "").strip() if lbl_limpia_raw else group_name
        
        return {
            "type": "SRQ_GRID",  
            "variable": group_name,
            "label": label_limpia,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid_grid)
        }

    def tabulate_frequency(self, var_name):
        value_labels = utils.get_label_dict(self.meta.variable_value_labels, var_name)
        weights = utils.get_frequency_weights(value_labels)
        
        df_valid = self.df[self.df[var_name].notna()].copy()
        if df_valid.empty: return None

        res_srq = self.tabulate_srq(var_name)
        df_final = res_srq["percentages"]

        def calc_monthly_avg(data_subset):
            if data_subset.empty: return 0.0
            return data_subset.map(weights).mean()

        avg_row = {"TOTAL": calc_monthly_avg(df_valid[var_name])}
        
        for seg_label, seg_filter in self.segments.items():
            if not seg_filter: continue
            vf = list(seg_filter.keys())[0]
            vl = list(seg_filter.values())[0]
            df_seg = df_valid[df_valid[vf] == vl]
            avg_row[seg_label] = calc_monthly_avg(df_seg[var_name])

        if 'Categoria' in df_final.columns:
            df_final = df_final.set_index('Categoria')

        df_final.loc["---"] = ""
        df_final.loc["Promedio veces al mes"] = pd.Series(avg_row)

        res_srq["type"] = "FREQUENCY"
        res_srq["percentages"] = df_final
        res_srq["bases"] = self._calculate_all_bases(df_valid)
        
        return res_srq

    def tabulate_smart_grid(self, group_name, cols, boxes=None):
        if not cols: 
            return None
        
        val_labels = utils.get_label_dict(self.meta.variable_value_labels, cols[0])
        
        if not val_labels:
            print(f"⚠️ Sin metadatos para {cols[0]}, asumiendo escala por defecto.")
            return self.tabulate_scale_grid(group_name, cols, boxes)

        # =========================================================
        # 🚀 NUEVO: HEURÍSTICA PARA DETECTAR MENCIONES MÚLTIPLES (MRQ_CAT)
        # =========================================================
        # 1. Buscamos si la columna tiene "Cod" o "cod" en su nombre
        es_cod = any("_cod" in str(c).lower() for c in cols)
        
        # 2. Si tiene "Cod" o si tiene más de 11 opciones, 100% NO es una escala.
        if es_cod or len(val_labels) > 11:
            print(f"🤖 [AUTO-DETECT] '{group_name}' -> Menciones Múltiples ({len(val_labels)} opciones). Ruteando a MRQ_CATEGORICAL...")
            # Limpiamos el nombre porque la tarea automática le pegó "(BATERÍA ESCALA)"
            clean_name = group_name.replace(" (BATERÍA ESCALA)", "").strip()
            # Lo mandamos directo al procesador de menciones
            return self.tabulate_mrq_categorical(clean_name, cols)
        # =========================================================

        palabras_basura = ["ns/nc", "no sabe", "dk/na", "no contesta", "ninguna"]
        opciones_reales = [
            lbl for lbl in val_labels.values() 
            if str(lbl).strip().lower() not in palabras_basura
        ]
        
        if len(opciones_reales) <= 2:
            print(f"🤖 [AUTO-DETECT] '{group_name}' -> Batería Dicotómica ({len(opciones_reales)} opciones). Ruteando a SRQ...")
            return self.tabulate_srq_grid(group_name, cols)
        else:
            print(f"🤖 [AUTO-DETECT] '{group_name}' -> Batería de Escalas ({len(opciones_reales)} opciones). Ruteando a SCALE...")
            return self.tabulate_scale_grid(group_name, cols, boxes)

    def tabulate_numeric(self, var_name):
        """Calcula Promedios Ponderados cruzados por banner para variables numéricas puras."""
        # 👇 AGREGÁ ESTE PRINT 👇
        print(f"📊 [PROCESANDO NUMÉRICA] Calculando promedio para: {var_name}")

        df_valid = self.df[self.df[var_name].notna()].copy()
        if df_valid.empty: return None

        # Forzamos a número (por si vino como texto desde el SPSS)
        df_valid[var_name] = pd.to_numeric(df_valid[var_name], errors='coerce')
        df_valid = df_valid[df_valid[var_name].notna()]
        if df_valid.empty: return None

        banner_data = {}
        
        # 1. Promedio TOTAL ponderado
        pesos_total = df_valid['ponderacion'] if 'ponderacion' in df_valid.columns else pd.Series(1, index=df_valid.index)
        mean_total = np.average(df_valid[var_name], weights=pesos_total)
        banner_data["TOTAL"] = pd.Series({"Media (Promedio)": mean_total})

        # 2. Promedios por SEGMENTOS
        for seg_label, seg_filter in self.segments.items():
            if not seg_filter: continue
            vf = list(seg_filter.keys())[0]
            vl = list(seg_filter.values())[0]
            df_seg = df_valid[df_valid[vf] == vl]
            
            if df_seg.empty:
                banner_data[seg_label] = pd.Series({"Media (Promedio)": 0.0})
                continue
                
            pesos_seg = df_seg['ponderacion'] if 'ponderacion' in df_seg.columns else pd.Series(1, index=df_seg.index)
            mean_seg = np.average(df_seg[var_name], weights=pesos_seg)
            banner_data[seg_label] = pd.Series({"Media (Promedio)": mean_seg})

        df_final = pd.DataFrame(banner_data).fillna(0.0)

        lbl = utils.get_variable_label(self.meta, var_name)
        return {
            "type": "NUMERIC",
            "variable": var_name,
            "label": str(lbl).strip() if lbl else var_name,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid)
        }

    def tabulate_numeric_grid(self, group_name, cols):
        """Calcula Promedios Ponderados para una batería de variables numéricas."""
        if not cols: return None

        # Filtramos casos que tengan al menos una respuesta válida en la batería
        df_valid = self.df[self.df[cols].notna().any(axis=1)].copy()
        if df_valid.empty: return None

        col_labels = {}
        for c in cols:
            df_valid[c] = pd.to_numeric(df_valid[c], errors='coerce')
            
            label_excel = self.quest_dict.get(c) if hasattr(self, 'quest_dict') and self.quest_dict else None
            if label_excel:
                clean_label = str(label_excel).strip()
            else:
                lbl = utils.get_variable_label(self.meta, c)
                raw_label = str(lbl) if lbl else c
                if " - " in raw_label: clean_label = raw_label.split(" - ")[-1].strip()
                elif ":" in raw_label: clean_label = raw_label.split(":")[-1].strip()
                else: clean_label = raw_label.strip()
            col_labels[c] = clean_label

        banner_data = {}
        pesos_total = df_valid['ponderacion'] if 'ponderacion' in df_valid.columns else pd.Series(1, index=df_valid.index)
        
        # 1. Promedios TOTAL
        means_total = {}
        for c in cols:
            mask = df_valid[c].notna()
            if mask.sum() > 0:
                means_total[col_labels[c]] = np.average(df_valid.loc[mask, c], weights=pesos_total[mask])
            else:
                means_total[col_labels[c]] = 0.0
        banner_data["TOTAL"] = pd.Series(means_total).sort_values(ascending=False)
        
        sorted_categories = banner_data["TOTAL"].index.tolist()

        # 2. Promedios por SEGMENTO
        for segment_label, segment_filter in self.segments.items():
            if not segment_filter: continue
            vf = list(segment_filter.keys())[0]
            vl = list(segment_filter.values())[0]
            df_seg = df_valid[df_valid[vf] == vl]
            
            pesos_seg = df_seg['ponderacion'] if 'ponderacion' in df_seg.columns else pd.Series(1, index=df_seg.index)
            
            means_seg = {}
            for c in cols:
                mask = df_seg[c].notna()
                if mask.sum() > 0:
                    means_seg[col_labels[c]] = np.average(df_seg.loc[mask, c], weights=pesos_seg[mask])
                else:
                    means_seg[col_labels[c]] = 0.0
            banner_data[segment_label] = pd.Series(means_seg)

        df_final = pd.DataFrame(banner_data).fillna(0.0)
        df_final = df_final.reindex(sorted_categories)

        lbl_limpia_raw = utils.get_variable_label(self.meta, group_name, getattr(self, 'quest_dict', None))
        label_limpia = str(lbl_limpia_raw).replace("BATERÍA: ", "").strip() if lbl_limpia_raw else group_name

        return {
            "type": "NUMERIC_GRID", # <--- Tipo de tabla exclusivo
            "variable": group_name,
            "label": label_limpia,
            "percentages": df_final,
            "bases": self._calculate_all_bases(df_valid)
        }

    def _calculate_all_bases(self, df_valid):
        if isinstance(df_valid, pd.Series):
            df_valid = self.df.loc[df_valid.index[df_valid]]
            
        n_unweighted = len(df_valid)
        pesos_totales = df_valid['ponderacion'] if 'ponderacion' in df_valid.columns else pd.Series(1, index=df_valid.index)
        n_weighted = int(round(pesos_totales.sum()))
        
        bases = {
            "TOTAL": {"unweighted": n_unweighted, "weighted": n_weighted}
        }
        
        for seg_label, seg_filter in self.segments.items():
            if not seg_filter: continue
                
            v_filt = list(seg_filter.keys())[0]
            val_filt = list(seg_filter.values())[0]
            df_seg = df_valid[df_valid[v_filt] == val_filt]
            
            n_seg_unweighted = len(df_seg)
            pesos_seg = df_seg['ponderacion'] if 'ponderacion' in df_seg.columns else pd.Series(1, index=df_seg.index)
            n_seg_weighted = int(round(pesos_seg.sum()))
            
            bases[seg_label] = {
                "unweighted": n_seg_unweighted, 
                "weighted": n_seg_weighted 
            }
            
        return bases

    def calculate_significance_matrix(self, df_pct, bases):
        sig_df = pd.DataFrame("", index=df_pct.index, columns=df_pct.columns)
        
        display_map = self.banner_info.get("display_map", {})
        mask = self.banner_info.get("comparison_mask", {})
        
        sorted_segments = [s for s in self.banner_info.get("labels", {}).keys() if s in df_pct.columns]

        for r_idx in range(len(df_pct)):
            row_label = df_pct.index[r_idx]
            
            for seg_i in sorted_segments:
                val_i = df_pct.iloc[r_idx, df_pct.columns.get_loc(seg_i)]
                
                if isinstance(val_i, (pd.Series, np.ndarray)):
                    val_i = val_i[0]
                
                p1_val = pd.to_numeric(val_i, errors='coerce')
                if pd.isna(p1_val): 
                    continue 
                
                p1 = float(p1_val) / 100
                n1 = bases.get(seg_i, {}).get("unweighted", 0)
                
                res_letras = ""
                for seg_j in sorted_segments:
                    if seg_i == seg_j: continue
                    if isinstance(mask, list):
                        if (seg_i, seg_j) not in mask and (seg_j, seg_i) not in mask:
                            continue
                    else:
                        if not mask.get((seg_i, seg_j), False): 
                            continue
                        
                    val_j = df_pct.iloc[r_idx, df_pct.columns.get_loc(seg_j)]
                    if isinstance(val_j, (pd.Series, np.ndarray)):
                        val_j = val_j[0]
                        
                    p2_val = pd.to_numeric(val_j, errors='coerce')
                    if pd.isna(p2_val): 
                        continue
                    
                    p2 = float(p2_val) / 100
                    n2 = bases.get(seg_j, {}).get("unweighted", 0)
                    
                    letra_col_j = display_map.get(seg_j, "")
                    if letra_col_j:
                        res_letras += utils.get_sig_letters(p1, p2, n1, n2, letra_col_j)
                
                sig_df.iloc[r_idx, sig_df.columns.get_loc(seg_i)] = res_letras
                    
        return sig_df

    def set_banner_complex(self, banner_vars_info):
        self.banner_info = banner_vars_info
        self.segments = banner_vars_info["segment_keys"] 
        self.banner_groups = banner_vars_info["comparison_mask"]

    def export_to_excel(self, results_list, output_path):
        try:
            writer = pd.ExcelWriter(output_path, engine='xlsxwriter')
        except ImportError:
            logging.error("Debe instalar xlsxwriter: pip install xlsxwriter")
            return

        workbook  = writer.book

        ws_index = workbook.add_worksheet('Índice')
        ws_tabs = workbook.add_worksheet('Tabulaciones')
        ws_sig  = workbook.add_worksheet('Significancia')

        ws_index.activate()

        fmt_head = workbook.add_format({'bold': True, 'bg_color': '#423F40', 'font_color': 'white', 'border': 1, 'align': 'center'})
        fmt_idx = workbook.add_format({'bold': True, 'border': 1})
        fmt_title = workbook.add_format({'bold': True, 'font_size': 11, 'font_color': '#00A5A3'})
        fmt_num = workbook.add_format({'border': 1, 'num_format': '0"%"', 'align': 'center'})
        fmt_decimal = workbook.add_format({'border': 1, 'num_format': '0.00', 'align': 'center'})
        fmt_sep = workbook.add_format({'bg_color': '#F2F2F2', 'border': 1})
        fmt_base = workbook.add_format({'bold': True, 'border': 1, 'align': 'center', 'bg_color': '#F8F9F9', 'font_size': 9})
        fmt_idx_base = workbook.add_format({'bold': True, 'border': 1, 'bg_color': '#F8F9F9', 'font_size': 9})
        fmt_grid = workbook.add_format({'bold': True, 'bg_color': '#D9D9D9', 'border': 1})
        fmt_brand = workbook.add_format({'bold': True, 'bg_color': '#F2F2F2', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})
        
        fmt_link = workbook.add_format({'font_color': 'blue', 'underline': True, 'valign': 'vcenter'})
        fmt_text_index = workbook.add_format({'valign': 'vcenter', 'text_wrap': True})
        fmt_type_index = workbook.add_format({'valign': 'vcenter', 'align': 'center', 'italic': True, 'font_color': '#595959'})

        fmt_sig_pct = workbook.add_format({
            'border': 1, 
            'align': 'center', 
            'font_color': '#0070C0', 
            'bold': True
        })

        nombres_tipos = {
            "SRQ": "Respuesta Única",
            "MRQ": "Respuesta Múltiple",
            "MRQ_CATEGORICAL": "Múltiple (Menciones)",
            "SCALE": "Escala Simple",
            "SCALE_GRID": "Batería de Escalas",
            "SRQ_GRID": "Batería Dicotómica",            
            "SCALE_PROFILE": "Batería de Escalas", 
            "NUMERIC": "Numérica",
            "MASTER_FUNNEL": "Funnel de Marcas",
            "NUMERIC_GRID": "Batería Numérica"  # 👈 AGREGAR ESTA LÍNEA
        }

        sheet_configs = [
            {"ws": ws_tabs, "is_sig_sheet": False},
            {"ws": ws_sig,  "is_sig_sheet": True}
        ]

        index_data = []

        for config in sheet_configs:
            worksheet = config["ws"]
            is_sig_sheet = config["is_sig_sheet"]
            start_row = 1

            for res in results_list:
                if res is None:
                    continue

                if not is_sig_sheet:
                    tipo_crudo = res.get("type", "Desconocido")
                    tipo_limpio = nombres_tipos.get(tipo_crudo, tipo_crudo)

                    index_data.append({
                        "var": res.get("variable", "N/D"),
                        "tipo": tipo_limpio,                  
                        "label": res.get("label", ""),
                        "row": start_row + 1  
                    })

                df_p = res['percentages'].copy()
                if 'Categoria' in df_p.columns:
                    df_p = df_p.set_index('Categoria')
                elif 'index' in df_p.columns:
                    df_p = df_p.set_index('index')

                if isinstance(df_p.columns, pd.MultiIndex):
                    cols_to_keep = [c for c in df_p.columns if not any('Unnamed' in str(lvl) for lvl in c)]
                    df_p = df_p[cols_to_keep]
                else:
                    df_p = df_p.loc[:, ~df_p.columns.astype(str).str.contains('^Unnamed')]

                bases = res.get("bases", {})
                tipo_tabla = res.get('type')

                sig_matrix = None
                if is_sig_sheet:
                    sig_matrix = self.calculate_significance_matrix(df_p, bases)
                    if isinstance(sig_matrix, pd.DataFrame):
                        sig_matrix.index = df_p.index

                worksheet.write(start_row, 0, f"{res['variable']}: {res['label']}", fmt_title)
                start_row += 2

                if tipo_tabla == "MASTER_FUNNEL":
                    num_cols_datos = len(df_p.columns)
                    banner_label = getattr(self, 'banner_variable_name', "SEGMENTACIÓN").upper()
                    worksheet.merge_range(start_row, 1, start_row, num_cols_datos, banner_label, fmt_head)
                    start_row += 1

                    segmentos_full = df_p.columns.get_level_values(0)
                    current_col = 1
                    i = 0
                    while i < len(segmentos_full):
                        seg_actual = segmentos_full[i]
                        count = list(segmentos_full).count(seg_actual)
                        if count > 1:
                            worksheet.merge_range(start_row, current_col, start_row, current_col + count - 1, seg_actual, fmt_head)
                        else:
                            worksheet.write(start_row, current_col, seg_actual, fmt_head)
                        current_col += count
                        i += count
                    start_row += 1

                    worksheet.set_row(start_row, 30)
                    worksheet.write(start_row, 0, "ETAPAS / MARCAS", fmt_head)
                    for c_idx, col_tuple in enumerate(df_p.columns):
                        marca_nombre = col_tuple[1]
                        worksheet.write(start_row, c_idx + 1, marca_nombre, fmt_brand)
                    start_row += 1
                
                    for c_idx, col_tuple in enumerate(df_p.columns):
                        letra_display = self.banner_info.get("display_map", {}).get(col_tuple[0], "")
                        worksheet.write(start_row, c_idx + 1, f"({letra_display})" if letra_display else "", fmt_head)
                    start_row += 1
                
                else:
                    worksheet.write(start_row, 0, "Categoría", fmt_head)
                    for c_idx, col in enumerate(df_p.columns):
                        col_display = col[-1] if isinstance(col, tuple) else col
                        worksheet.write(start_row, c_idx + 1, col_display, fmt_head)
                    start_row += 1

                    worksheet.write(start_row, 0, "", fmt_head)
                    for c_idx, col in enumerate(df_p.columns):
                        letra_display = self.banner_info.get("display_map", {}).get(col, "")
                        worksheet.write(start_row, c_idx + 1, f"({letra_display})" if letra_display else "", fmt_head)
                    start_row += 1

                worksheet.write(start_row, 0, "Base Ponderada (n)", fmt_idx_base)
                for c_idx, col in enumerate(df_p.columns):
                    worksheet.write(start_row, c_idx + 1, bases.get(col, {}).get("weighted", 0), fmt_base)
                start_row += 1

                worksheet.write(start_row, 0, "Base No Ponderada (N)", fmt_idx_base)
                for c_idx, col in enumerate(df_p.columns):
                    worksheet.write(start_row, c_idx + 1, bases.get(col, {}).get("unweighted", 0), fmt_base)
                start_row += 1

                row_offset = 0
                for r_idx in range(len(df_p)):
                    raw_cat = str(df_p.index[r_idx])
                    target_row = start_row + r_idx + row_offset
                    
                    if "GRID_ATTR:" in raw_cat:
                        clean_attr = raw_cat.replace("GRID_ATTR:", "").strip()
                        worksheet.merge_range(target_row, 0, target_row, len(df_p.columns), clean_attr, fmt_grid)
                        continue

                    cat_name = raw_cat
                    
                    if "Base Ponderada" in cat_name or "Base No Ponderada" in cat_name:
                        worksheet.write(target_row, 0, cat_name, fmt_idx_base)
                    else:
                        worksheet.write(target_row, 0, cat_name, fmt_idx)

                    for c_idx, col in enumerate(df_p.columns):
                        val = df_p.iloc[r_idx, c_idx]
                        
                        if pd.isna(val) or cat_name == "---" or cat_name == " ":
                            worksheet.write_blank(target_row, c_idx + 1, None, fmt_sep)
                        elif isinstance(val, (int, float)):
                            #if "Media" in cat_name:
                            # 🚀 NUEVO: NUMERIC_GRID usa decimales, no %
                            if "Media" in cat_name or tipo_tabla == "NUMERIC_GRID":
                                worksheet.write(target_row, c_idx + 1, val, fmt_decimal)                            
                            elif "Base Ponderada" in cat_name or "Base No Ponderada" in cat_name:
                                worksheet.write(target_row, c_idx + 1, val, fmt_base)
                                
                            else:
                                if is_sig_sheet and sig_matrix is not None:
                                    letras = sig_matrix.iloc[r_idx, c_idx]
                                    txt_celda = f"{val:.0f}% {letras}".strip()
                                    worksheet.write(target_row, c_idx + 1, txt_celda, fmt_sig_pct)
                                else:
                                    worksheet.write(target_row, c_idx + 1, val, fmt_num) 
                        else:
                            worksheet.write(target_row, c_idx + 1, val, fmt_idx)

                base_row = start_row + len(df_p) + row_offset
                worksheet.write(base_row, 0, "Base (Casos)", fmt_idx_base)
                for c_idx, col in enumerate(df_p.columns):
                    worksheet.write(base_row, c_idx + 1, bases.get(col, {}).get("unweighted", 0), fmt_base)

                start_row = base_row + 4
        
        ws_index.set_column('A:A', 15) 
        ws_index.set_column('B:B', 25) 
        ws_index.set_column('C:C', 80) 
        
        ws_index.write('A1', 'Variable', fmt_head)
        ws_index.write('B1', 'Tipo', fmt_head)
        ws_index.write('C1', 'Pregunta', fmt_head)
        
        for i, data in enumerate(index_data):
            row_idx = i + 1
            link = f"internal:'Tabulaciones'!A{data['row']}"
            
            ws_index.write_url(row_idx, 0, link, string=str(data['var']), cell_format=fmt_link)
            ws_index.write_string(row_idx, 1, str(data['tipo']), fmt_type_index)
            ws_index.write_string(row_idx, 2, str(data['label']), fmt_text_index)

        writer.close()
        logging.info(f"Excel generado correctamente con solapa de significancia en: {output_path}")

if __name__ == "__main__":
    print(">> Ejecutando TabulationEngine en modo test")