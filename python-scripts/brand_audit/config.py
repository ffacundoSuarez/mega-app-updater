# config.py

import os
from pptx.enum.chart import XL_CHART_TYPE

# --- CONFIGURACIÓN GLOBAL DEL ESTUDIO (MIGRADO DEL JSON) ---
STUDY_ID = "Ypf Abril 2026- Prueba Automatizacion" 
#BANNER_VARIABLES = [],
BANNER_VARIABLES = ["Genero", "Edad", "NSE", "Region", "Auto", "Vinculo", "Region2"]
WAVE_VAR = "Wave"
WEIGHT_VAR = "ponderacion"
# --- FILTROS DE BASE ---
APPLY_WAVE_FILTER = True  # Ponelo en True cuando quieras filtrar una ola específica
WAVE_FILTER = 48           # ¿Qué ola querés filtrar si el interruptor está prendido?

# --- MÓDULOS ACTIVOS ---
ONLY_GENERATE_TABLES = False   # <--- NUEVO: Si es True, ignora el PPTX y la IA.
USE_AI_INSIGHTS = False      # Prende la IA para los títulos de cada slide
USE_AI_SUMMARY = False      # Prende/Apaga la creación del Mega Resumen Ejecutivo

SRQ_DEFAULT_CHART = "BAR_HORIZONTAL"
MRQ_DEFAULT_CHART = "BAR_HORIZONTAL"
RUN_LLM = False # Asegúrate de que esta variable exista o esté definida.

# --- ARCHIVOS Y RUTAS ---
SAV_FILE = "YPF ABRIL.sav"
TEMPLATE_PPX = 'INFORME COMPLETO YPF MONITOR.pptx'
MANIFEST_FILE = 'study_manifest.json' 
MANUAL_TASKS_CSV = "manual_tasks.csv"

# =========================================================
# 🚀 BASE SECUNDARIA (MVP AUTOMATIZACIÓN DUAL)
# =========================================================
# 1. La ruta de tu nuevo archivo (asegurate de que exista en la carpeta)
SAV_FILE_SECUNDARIO = "CONDUCTORES.sav" 

# 2. Banners y Ponderación para la base secundaria
# Si la base secundaria tiene las mismas columnas, podés dejar las mismas variables.
# Si en esta base la ponderación se llama distinto (ej: "peso_nuevo"), cambialo acá.
BANNER_VARIABLES_SECUNDARIO = ["ZONA_RECOD"] 
WEIGHT_VAR_SECUNDARIO = "Ponderador_reg"

# --- FILTROS DE OLA SECUNDARIA ---
APPLY_WAVE_FILTER_SECUNDARIO = True
WAVE_FILTER_SECUNDARIO = 26
WAVE_VAR_SECUNDARIO = "OLA"  # <--- ¡LA LLAVE MÁGICA!
# =========================================================    

QUESTIONNAIRE_EXCEL = "cuestionario.xlsx" # El de la principal
QUESTIONNAIRE_EXCEL_SECUNDARIO = None     # Poné el nombre de otro Excel acá si algún día lo necesitás








#MANUAL_TASKS_CSV = os.path.join(BASE_DIR, "manual_tasks.csv") # <-- MODIFICAR ESTA LÍNEA
# --- CONSTANTES DE ANÁLISIS Y CONTROL ---
Z_CRITICO = 1.96 
#RUN_LLM = True 

# LÍMITES PREDETERMINADOS
TOP_N_LIMIT = 10
MIN_CATEGORIES_FOR_TOP_N = 10

# --- DISEÑO Y FORMATO ---
CHART_LAYOUT_NAME_SINGLE = 'Chart layout 1' 
CHART_LAYOUT_NAME_DUAL = 'Chart layout 2' 

# ÍNDICES DE PLACEHOLDER (SINGLE)
IDX_TITLE = 0
IDX_CHART = 13
IDX_TABLE = 14
IDX_SUBTITLE = 15 
IDX_QUESTION_LABEL = 16
CHART_LAYOUT_INDEX = 1 # Índice del layout "Chart layout 1" 

# ÍNDICES DE PLACEHOLDER (DUAL)
IDX_CHART_DUAL_1 = 13 
IDX_CHART_DUAL_2 = 15 
IDX_BODY_DUAL = 14 

# COLORES Y FUENTES
FONT_NAME = 'Nunito Light'
BAR_COLOR_HEX = '00A5A3'
HEADER_COLOR_HEX = '423F40'
HIGHLIGHT_COLOR_HEX = 'EDF7DE' 

# PALETA DE COLORES PARA LA ESCALA (1 a 5)
SERIES_COLORS_P29 = [
    'C00000', 'FF5050', 'FEDD3D', '92D050', '00B050'
]

# MAPEO DE TIPOS DE GRÁFICO
CHART_TYPES = {
  'BAR_HORIZONTAL': XL_CHART_TYPE.BAR_CLUSTERED,
  'COLUMN_VERTICAL': XL_CHART_TYPE.COLUMN_CLUSTERED,
  'BAR_STACKED_100': XL_CHART_TYPE.BAR_STACKED_100
}

# =========================================================
# 🧹 LIMPIEZA DE BASES (VARIABLES A ELIMINAR)
# =========================================================
# Pegá acá tu lista gigante original:
BASURA_SPSS = [
        "P18_1T2B","Progress","Duration__in_seconds_","Finished",
        "Q6_Page_Submit","Q79_First_Click","Q79_Last_Click","Q79_Page_Submit",
        "Q79_Click_Count","SC0","Wave","Total","P107T2B","P108T2B",
        "Q215_First_Click","Q215_Last_Click","Q215_Page_Submit","Q215_Click_Count",
        "P149_T2B","P150_T2B","Q","GG4_T2B","GG5_T2B","GG8_T2B","GG9_T2B",            
        "P161_1_T2B","P161_2_T2B","P161_3_T2B","P161_4_T2B","P161_5_T2B","P161_6_T2B","P161_7_T2B",   
        "P164_1_T2B","P164_2_T2B","P164_3_T2B",         
        "BL1_1","BL1_2","BL1_3","BL1_4","BL1_5","BL1_6",
        "BS1_1","BS1_2","BS1_3","BS1_4","BS1_5","BS1_6","BS1_7","BS1_8","BS1_9",
        "BP1_1","BP1_2","BP1_3","BP1_4","BP1_5","BP1_6","BP1_7","BP1_8","BP1_9",
        "BP2_1","BP2_2","BP2_3","BP2_4","BP2_5","BP2_6","BP2_7","BP2_8","BP2_9",
        "P05","P06","P06_97_TEXT","P07",
        "P13","P14","P14_1","P14_2",
        "P15_1","P15_2","P15_3","P15_4",
        "G01","G02","G04","G05",
        "G06_1","G06_2","G06_3","G06_4","G06_98","G06_99","G06_98_TEXT",
        "G07",
        "G08_1","G08_2","G08_3","G08_4","G08_5","G08_6",
        "G09","G10","G11","G12",
        "ER1_1","ER1_2","ER1_3","ER1_4","ER1_5","ER1_6",
        "ER2","ER3",
        "ER4_1","ER4_2","ER4_3","ER4_4","ER4_5","ER4_6",
        "ER5","ER6","ER7",
        "ER8_1","ER8_2","ER8_3",
        "P104","P109",
        "P110_1","P110_2","P110_3","P110_4","P110_5","P110_6","P110_7","P110_8","P110_9","P110_97",
        "P111","P111_1",
        "p112_1","P112_2","P112_3",
        "P119",
        "P125_1","P125_2","P125_3","P125_4","P125_99",
        "P128","P129","P130",
        "P131_1","P131_2","P131_3","P131_4","P131_5","P131_6","P131_99",
        "P19","P20","P21","P22","P23",
        "P200","P202","P203","P205",
        "P205_1_1","P205_1_2","P205_1_3","P205_1_4","P205_1_5","P205_1_6","P205_1_7","P205_1_8","P205_1_9","P205_1_10","P205_1_11","P205_1_97","P205_1_99",
        "P205_2_1","P205_2_2","P205_2_3","P205_2_4","P205_2_97","P205_2_99",
        "P206_1","P206_2","P206_3","P206_4","P206_5","P206_8","P206_1.0",
        "P207_1","P207_2","P207_3","P207_4","P207_90","P207_99",
        "P208","P209",
        "P211_1","P211_2","P211_3","P211_4","P211_5",
        "P211_1_1","P211_1_2","P211_1_3","P211_1_99",
        "P212_1","P212_2","P212_3","P212_4","P212_97","P212_97_TEXT",
        "OLA","Q_TerminateFlag","CUOTA_FULL","ESTRATO_ARG","CUOTA_FULL_2","COMPLETAS",
        "CaseId","ABR_MAY_ORIGEN","ABR_MAY_CAMP",
        "EDAD_RECOD","REGION_RECOD","REGION_CUOTA",
        "F4","SELECTOR_P04","SELECTOR_P04B",
        "P04_A1","P04_A2","P04_A3","P04_A4","P04_A5","P04_A6","P04_A7","P04_A8","P04_A9","P04_A10","P04_A11","P04_A12","P04_A13","P04_A14","P04_A15",
        "P04B_A1","P04B_A2","P04B_A3","P04B_A4","P04B_A5","P04B_A6","P04B_A7","P04B_A8","P04B_A9","P04B_A10","P04B_A11","P04B_A12","P04B_A13","P04B_A14","P04B_A15",
        "P31_A1","P31_A2","P31_A3","P31_A4","P31_A5",
        "NSE_ARG_4_1","NSE_ARG_4_2","NSE_ARG_4_3","NSE_ARG_4_4","NSE_ARG_4_5","NSE_ARG_4_6","NSE_ARG_4_7",
        "ESTRATO_ARG_cod","Aprobacion",
        "O_P05COD1","O_P05COD2","O_P05COD3","O_P05COD4",
        "O_P08COD1","O_P08COD2","O_P08COD3",
        "O_P35COD1","O_P35COD2","O_P35COD3",
        "O_P29COD1","O_P29COD2","O_P29COD3",
        "O_P24COD1","O_P39COD1","O_P107COD1",
        "O_P106_BCOD1","O_P24COD2","O_P106_CCOD1","O_P106_BCOD2",
        "source01","ESTRATO_ARG_C","O_P39COD2",
        "O_P106_B_COD1","O_P106_C_COD1",
        "Julio",
        "P02_A1_junio","P02_A2_junio","P02_A3_junio","P02_A4_junio","P02_A5_junio","P02_A6_junio","P02_A7_junio","P02_A8_junio","P02_A9_junio",
        "ESTRATO_ARG_cod1",
        "P204_Cod1","P204_Cod2","P204_Cod3","P204_Cod4",
        "P201_Cod1","P201_Cod2","P201_Cod3",
        "P210_Cod1","P210_Cod2",
        "P205_1_97_TEXT_Cod1",
        "P02_1_Cod2","P02_1_Cod3","P02_1_Cod4","P02_1_Cod5","P02_1_Cod6","P02_1_Cod7","P02_1_Cod8","P02_1_Cod9","P02_1_Cod10","P02_1_Cod11","P02_1_Cod12","P02_1_Cod13","P02_1_Cod14","P02_1_Cod15","P02_1_Cod16",
        "P06_COD1","P09_Cod1","P09_Cod2","P09_Cod3","P09_Cod4","P105_97_TEXT_Cod1","P105_97_TEXT_Cod2","P105_97_TEXT_Cod3",
        "P110_97_TEXT_Cod1","P110_97_TEXT_Cod2",
        "P121_98_TEXT_Cod1","P121_98_TEXT_Cod2","P121_98_TEXT_Cod3","P121_98_TEXT_Cod4","P121_98_TEXT_Cod5",
        "P122_97_TEXT_Cod1","P122_97_TEXT_Cod2","P122_97_TEXT_Cod3",
        "P127_97_TEXT_Cod1","P126C_97_TEXT_Cod1","P126B_97_TEXT_Cod1",
        "P212_97_TEXT_Cod1",
        "P02_A1T4B","P02_A2T4B","P02_A3T4B","P02_A4T4B","P02_A5T4B","P02_A6T4B","P02_A7T4B","P02_A8T4B","P02_A9T4B",
        "P01_A1T3B","P01_A2T3B","P01_A3T3B","P01_A4T3B","P01_A5T3B","P01_A6T3B","P01_A7T3B","P01_A8T3B","P01_A9T3B",
        "P01_A1T4B","P01_A2T4B","P01_A3T4B","P01_A4T4B","P01_A5T4B","P01_A6T4B","P01_A7T4B","P01_A8T4B","P01_A9T4B",
        "P14_2_Cod1","P126_COD1","P126C_97_TEXT_Cod2",
        "P03_01_Indi","P03_02_Indi","P03_08_Indi","P03_09_Indi","P03_11_Indi","P03_12_Indi","P03_14_Indi",
        "BVI","Atri_Prod","Atri_MP","Atri_Resp","Atri_cercania","G12_Cod1","G12_Cod2","G12_Cod3","NSEx","A_O",
        "ER2_T2B","ER2_Imp","ER8_1_Imp","ER8_2_Imp","ER8_3_Imp","pond_NSE","pond_Edad",
        "P03_16","P03_17","P03_18","P03_19","P03_20","P03_21","P03_22","P03_23","P03_24","P03_25","P03_26","P03_27",
        "T01_17","T01_32","T01_33","T01_34","T01_35","T01_36","T01_37","T01_38","T01_39",
        "T02_1","T02_2","T02_3","T02_4","T02_5","T02_6","T02_7","T02_97",
        "T03_1_4","T03_1_7","T03_1_8","T03_1_9","T03_1_10",
        "T03_2_4","T03_2_7","T03_2_8","T03_2_9","T03_2_10",
        "T03_3_4","T03_3_7","T03_3_8","T03_3_9","T03_3_10",
        "T03_4_4","T03_4_7","T03_4_8","T03_4_9","T03_4_10",
        "T03_5_4","T03_5_7","T03_5_8","T03_5_9","T03_5_10",
        "T03_6_4","T03_6_7","T03_6_8","T03_6_9","T03_6_10",
        "T03_7_4","T03_7_7","T03_7_8","T03_7_9","T03_7_10",
        "T03_97_4","T03_97_7","T03_97_8","T03_97_9","T03_97_10",
        "T04","T05","T07",
        "T08_1","T08_2","T08_3","T08_4","T08_5","T08_6","T08_7","T08_97","T08_99",
        "P03_17T2B","P03_18T2B","P03_19T2B","P03_20T2B","P03_21T2B","P03_22T2B","P03_23T2B","P03_24T2B","P03_25T2B","P03_26T2B","P03_27T2B",
        "P03_28T2B","P03_29T2B","P03_30T2B","P03_31T2B",
        "P11_1T2B","P11_2T2B","P11_3T2B","P11_4T2B","P11_5T2B","P11_6T2B","P11_7T2B","P11_8T2B",
        "P12_1T2B","P12_2T2B","P12_3T2B","P12_4T2B","P12_5T2B","P12_6T2B","P12_7T2B","P12_8T2B",
        "P03_16T2B",
        "T06_Cod1","T06_Cod2","T06_Cod3","T06_Cod4","T06_Cod5","T06_Cod6",
        "P09_Cod5","P09_Cod6","P09_Cod7","G12_Cod4","G12_Cod5",
        "P132","P134","P136",
        "P03_16_Auxiliar","P03_17_Auxiliar","P03_18_Auxiliar","P03_19_Auxiliar","P03_20_Auxiliar","P03_21_Auxiliar","P03_22_Auxiliar","P03_23_Auxiliar","P03_24_Auxiliar","P03_25_Auxiliar","P03_26_Auxiliar","P03_27_Auxiliar",
        "P03_01_Auxiliar","P03_02_Auxiliar","P03_03_Auxiliar","P03_04_Auxiliar","P03_05_Auxiliar","P03_06_Auxiliar","P03_07_Auxiliar","P03_08_Auxiliar","P03_09_Auxiliar","P03_10_Auxiliar","P03_11_Auxiliar","P03_12_Auxiliar","P03_13_Auxiliar","P03_14_Auxiliar","P03_15_Auxiliar",
        "P4C_1_Cod_1","P4C_1_Cod_2","P4C_1_Cod_3","P4C_1_Cod_4","P4C_1_Cod_5","P4C_1_cod_6",
        "P4C_2_Cod_1","P4C_2_Cod_2","P4C_2_Cod_3",
        "P4C_3_Cod_1","P4C_3_Cod_2","P4C_3_Cod_3","P4C_3_Cod_4",
        "P4C_4_Cod_1","P4C_4_Cod_2","P4C_4_Cod_3","P4C_4_Cod_4",
        "P4C_5_Cod_1","P4C_5_Cod_2","P4C_5_Cod_3","P4C_5_Cod_4",
        "P4C_6_Cod_1","P4C_6_Cod_2","P4C_6_Cod_3","P4C_6_Cod_4",
        "P4C_7_Cod_1","P4C_7_Cod_2","P4C_7_Cod_3","P4C_7_Cod_4",
        "P4C_8_Cod_1","P4C_8_Cod_2","P4C_8_Cod_3","P4C_8_Cod_4","P4C_8_Cod_5",
        "P4C_9_Cod_1","P4C_9_Cod_2","P4C_9_Cod_3",
        "Index_YPF",
        "P133_Cod_1","P133_Cod_2",
        "P135_Cod_1","P135_Cod_2","P02_1_Cod17","P02_1_Cod18","P02_1_Cod19","P02_1_Cod20","P02_1_Cod21","P02_1_Cod22","P137",
        "Edad2","G12_Cod6",
        "T06_Cod7","T06_Cod8","T06_Cod9","T06_Cod10","T06_Cod11","T06_Cod12","T06_Cod13",
        "P138","P139","P140",
        "P141_1","P141_4","P141_5","P141_6","P141_7","P141_8","P141_9","T01_97_TEXT",
        "P144","P145",
        "GG1","P09_Privatizacion","NOCON_SOLAR","EVAL_YPF_SOLAR","P09",
        "BL1_7",
        "S1","S2_1","S2_2","S2_3","S2_4","S2_5",
        "S3_1","S3_2","S3_3","S3_4","S3_5",
        "Elemento","Edad_astro",
        "GG6","GG7",
        "P152","P_TRAMPA","ID","Completas_num",
        "NSE_agrupado","Edad_agrupada","Zona_recod",
        "P153","P154",
        "PRIMER_PREGUNTA","SEGUNDA_PREGUNTA",
        "P155","P156","P157","P157_97_TEXT",
        "P158_1","P158_2","P158_3",
        "pond_genero",
        "P159",
        "P4C_6_cod_5",
        "Zona_agrupado",
        "P4C_7_cod2","P4C_2_cod2","P4C_5_cod2","P4C_8_cod3","P4C_4_cod1",
        "P4C_1_cod3","P4C_6_cod2","P4C_8_cod1","P4C_3_cod1","P4C_1_cod1",
        "P4C_5_cod3","P4C_9_cod1","P4C_4_cod2","P4C_1_cod4","P4C_6_cod3",
        "P4C_8_cod2","P4C_3_cod2","P4C_1_cod2","P4C_6_cod1","P4C_9_cod2",
        "P4C_5_cod1","P4C_2_cod1","P4C_7_cod1","P4C_2_cod3","P4C_4_cod3",
        "P4C_3_cod3","P02_1.0","P113c","P113d"
    ]

# Y acá creás la lista para tu base secundaria (dejala vacía [] si no querés borrar nada por ahora):
BASURA_SPSS_SECUNDARIO = ["StartDate","ResponseId","P10_97_TEXT","P13","P14","P15_1","P15_2",
"P15_3","P15_4","P15_5","P15_6","P15_7","P15_8","P15_9","P15_10","P15_11","P15_97","P16","P_TRAMPA_1","P_TRAMPA_2","P_TRAMPA_3","P_TRAMPA_4","P_TRAMPA_5",
"P21_YPF","P21_SHELL","P21_AXION","P21_PUMA","P22_YPF","P22_SHELL","P22_AXION","P22_PUMA",
"P23_YPF","P23_SHELL","P23_AXION","P23_PUMA","P24_1","P24_2","P24_3","P25_1","P25_2","P25_3",
"P25_4","P25_5","P26_1","P26_2","P26_3","P27_1","P28","P29_1","P29_2","P29_3","P29_9","ESTRATO_ARG",
"Ponderador","Pond_GENERO","Pond_EDAD","Pond_NSE","Pond_TIPO","Pond_REGIONES","EndDate","IPAddress",
"Duration__in_seconds_","Finished","ExternalReference","LocationLatitude","LocationLongitude","DistributionChannel",
"cper","capor","ned","estado","cat_ocup_A","cat_ocup_B","categ","c_medica","ID","CAMP",
"A_O","FILTRO","P9_TEXTO","CUOTAFULL_1","cat_ocup","nse_sim","CUOTAFULL_2","COMPLETAS","Status","Progress",
"RecordedDate","RecipientLastName","RecipientFirstName","RecipientEmail","UserLanguage","Q63_First_Click",
"Q63_Last_Click","Q63_Page_Submit","Q63_Click_Count","Q67_First_Click","Q67_Last_Click","Q67_Page_Submit",
"Q67_Click_Count","ORIGEN","Q_TerminateFlag","Q_TotalDuration","P13.0",
"tempo1","pap","Total","edad_rec","P17_1_T2B","P17_2_T2B","P17_3_T2B","P17_9_T2B",
"P17_1_T3B","P17_2_T3B","P17_3_T3B","P17_9_T3B","P18_YPF_1_T2B","P18_YPF_2_T2B","P18_YPF_3_T2B","P18_YPF_4_T2B",
"P18_YPF_5_T2B","P18_YPF_6_T2B","P18_YPF_7_T2B","P18_YPF_8_T2B","P18_YPF_9_T2B","P18_YPF_10_T2B",
"P18_YPF_11_T2B","P18_YPF_12_T2B","P18_YPF_13_T2B","P18_YPF_14_T2B","P18_YPF_15_T2B","P18_YPF_16_T2B",
"P18_YPF_17_T2B","P18_YPF_18_T2B","P18_YPF_19_T2B","P18_YPF_20_T2B","P18_SHELL_1_T2B","P18_SHELL_2_T2B",
"P18_SHELL_3_T2B","P18_SHELL_4_T2B","P18_SHELL_5_T2B","P18_SHELL_6_T2B","P18_SHELL_7_T2B","P18_SHELL_8_T2B",
"P18_SHELL_9_T2B","P18_SHELL_10_T2B","P18_SHELL_11_T2B","P18_SHELL_12_T2B","P18_SHELL_13_T2B","P18_SHELL_14_T2B",
"P18_SHELL_15_T2B","P18_SHELL_16_T2B","P18_SHELL_17_T2B","P18_SHELL_18_T2B","P18_SHELL_19_T2B",
"P18_SHELL_20_T2B","P18_AXION_1_T2B","P18_AXION_2_T2B","P18_AXION_3_T2B","P18_AXION_4_T2B","P18_AXION_5_T2B",
"P18_AXION_6_T2B","P18_AXION_7_T2B","P18_AXION_8_T2B","P18_AXION_9_T2B","P18_AXION_10_T2B","P18_AXION_11_T2B",
"P18_AXION_12_T2B","P18_AXION_13_T2B","P18_AXION_14_T2B","P18_AXION_15_T2B","P18_AXION_16_T2B","P18_AXION_17_T2B",
"P18_AXION_18_T2B","P18_AXION_19_T2B","P18_AXION_20_T2B","P18_PUMA_1_T2B","P18_PUMA_2_T2B",
"P18_PUMA_3_T2B","P18_PUMA_4_T2B","P18_PUMA_5_T2B","P18_PUMA_6_T2B","P18_PUMA_7_T2B","P18_PUMA_8_T2B",
"P18_PUMA_9_T2B","P18_PUMA_10_T2B","P18_PUMA_11_T2B","P18_PUMA_12_T2B","P18_PUMA_13_T2B","P18_PUMA_14_T2B",
"P18_PUMA_15_T2B","P18_PUMA_16_T2B","P18_PUMA_17_T2B","P18_PUMA_18_T2B","P18_PUMA_19_T2B",
"P18_PUMA_20_T2B","P19_YPF_1_T2B","P19_YPF_2_T2B","P19_YPF_3_T2B","P19_YPF_4_T2B","P19_YPF_5_T2B",
"P19_AXION_1_T2B","P19_AXION_2_T2B","P19_AXION_3_T2B","P19_AXION_4_T2B","P19_AXION_5_T2B","P19_SHELL_1_T2B",
"P19_SHELL_2_T2B","P19_SHELL_3_T2B","P19_SHELL_4_T2B","P19_SHELL_5_T2B","P19_PUMA_1_T2B","P19_PUMA_2_T2B",
"P19_PUMA_3_T2B","P19_PUMA_4_T2B","P19_PUMA_5_T2B","P20_1_T2B","P20_2_T2B","P20_3_T2B",
"P20_4_T2B","P20_5_T2B","P20_6_T2B","P20B_1_T2B","P24_1_T2B","P24_2_T2B","P24_3_T2B","P25_1_T2B",
"P25_2_T2B","P25_3_T2B","P25_4_T2B","P25_5_T2B","P26_1_T2B","P26_2_T2B","P26_3_T2B","P27_1_T2B",
"P28_T2B","P29_1_T2B","P29_2_T2B","P29_3_T2B","P29_9_T2B","P21_YPF_T2B","P21_SHELL_T2B","P21_AXION_T2B",
"P21_PUMA_T2B","P22_YPF_T2B","P22_SHELL_T2B","P22_AXION_T2B","P22_PUMA_T2B","P23_YPF_T2B","P23_SHELL_T2B","P23_AXION_T2B",
"P23_PUMA_T2B","P21_YPF_T3B","P21_SHELL_T3B","P21_AXION_T3B","P21_PUMA_T3B","P22_YPF_T3B","P22_SHELL_T3B","P22_AXION_T3B",
"P22_PUMA_T3B","P23_YPF_T3B","P23_SHELL_T3B","P23_AXION_T3B","P23_PUMA_T3B","H17_97_TEXT","H23_16_TEXT","H26_T2B",
"NSE_rec","H5_banner","H23_banner","H8_Carga","H8_Actividad","H8_Compra","H8_Uso","H20_1_Neto",
"H20_2_Neto","H20_3_Neto","H8_Multi","H8_Solo","H8_cargayotro","H8_Otro","Vinculo","APP1_1_T2B",
"APP1_2_T2B","APP1_3_T2B","APP1_4_T2B","APP1_5_T2B","APP1_6_T2B","APP1_7_T2B","H31_97_TEXT","H23_98_TEXT",
"BANK1_98_TEXT","filter_$"
]




TAREAS_MANUALES_EXTRA = {
    "P01": {
        "TASK_ID": "P01",
        "TYPE": "SCALE_PROFILE",
        "VARIABLE_NAME": "P01",
        "ITEMS_PREFIX": "P01_",
        "BOXES": ["T2B","T3B","T4B"] # <--- ACÁ ESTÁ LA MAGIA
    },    
    "P02": {
        "TASK_ID": "P02",
        "TYPE": "SCALE_PROFILE",
        "VARIABLE_NAME": "P02",
        "ITEMS_PREFIX": "P02_A",
        "BOXES": ["T2B","T3B", "Media (Promedio)"] # <--- ACÁ ESTÁ LA MAGIA
    },
    "P11": {
        "TASK_ID": "P11",
        "TYPE": "SCALE_PROFILE",
        "VARIABLE_NAME": "P11",
        "ITEMS_PREFIX": "P11_",
        "BOXES": ["T2B","B2B","T4B","Media (Promedio)"] # <--- ACÁ ESTÁ LA MAGIA
    },
    "P12": {
        "TASK_ID": "P12",
        "TYPE": "SCALE_PROFILE",
        "VARIABLE_NAME": "P12",
        "ITEMS_PREFIX": "P12_",
        "BOXES": ["T2B","B2B","T3B","Media (Promedio)"] # <--- ACÁ ESTÁ LA MAGIA
    },
    "P162": {
        "TASK_ID": "P162",
        "TYPE": "SCALE_PROFILE",
        "VARIABLE_NAME": "P162",
        "ITEMS_PREFIX": "P162_"
    },
    "P160": {
        "TASK_ID": "P160",
        "TYPE": "SCALE_PROFILE",
        "VARIABLE_NAME": "P160",
        "ITEMS_PREFIX": "P160_"
    },
    "P119B": {
        "TASK_ID": "P119B",
        "TYPE": "SINGLE",
        "VARIABLE_TYPE": "NUMERIC_GRID", # 👈 La instrucción real para nuestra función        
        "VARIABLE_NAME": "P119B",
        "EXACT_COLS": ["P119B_1", "P119B_2", "P119B_3", "P119B_4", "P119B_5"]
    }                              
}
# =========================================================
# --- PANEL DE CONTROL: ACTUALIZACIÓN DE GRÁFICOS PPTX ---
# =========================================================

# El nombre del nuevo mes/ola (con "\n" para que quede en dos renglones en la tabla)
NEW_WAVE_NAME = "Abr 26" 

# --- DICCIONARIO MAESTRO DE ATRIBUTOS ---
# Lo definimos acá arriba para usarlo en las dos tablas sin tener que copiar y pegar todo
ATRIBUTOS_COMUNES = {
    "Es una empresa con productos y servicios de calidad": ["productos y servicios de calidad"],
    "Es una empresa manejada por profesionales": ["manejada por profesionales"],
    "Es una empresa líder en innovación y desarrollo tecnológico": ["innovación y desarrollo tecnológico"],
    "Tiene prácticas de negocios éticas y transparentes": ["negocios éticas y transparentes"],
    "Es una compañía en la que me gustaría trabajar": ["compañía en la que me gustaría trabajar"],
    "Es una empresa cercana, que está presente en mi vida cotidiana": ["cercana", "cotidiana"],
    "Es una marca confiable / responsable": ["confiable / responsable"],
    "Es una empresa que me genera orgullo": ["orgullo"],
    "Contribuye a la generación de empleo": ["empleo"],
    "Es una empresa fundamental para la economía del país": ["empresa fundamental para la economía del país"],
    "Tiene historia y trayectoria arraigada al país": ["historia", "trayectoria"],
    "Es una empresa muy comprometida con el desarrollo del país": ["desarrollo del país"],
    "Tiene presencia/cobertura en todo el país": ["cobertura en todo el país"],
    "Es una empresa responsable/comprometida con el medioambiente": ["comprometida con el medioambiente"],
    "Participa activamente y es responsable en las comunidades en las que opera": ["comunidades en las que opera"]
}

ATRIBUTOS_COMUNES_CONDUCTORES = {
    "Es una empresa con productos y servicios de calidad": ["productos y servicios de calidad"],
    "Es una empresa fundamental para la economía del país": ["empresa fundamental para la economía del país"],
    "Es una empresa manejada por profesionales": ["manejada por profesionales"],
    "Participa activamente y es responsable en las comunidades en las que opera": ["comunidades en las que opera"],
    "Es una empresa que me genera orgullo": ["orgullo"],
    "Es una empresa muy comprometida con el desarrollo del país": ["desarrollo del país"],    
    "Es una empresa líder en innovación y desarrollo tecnológico": ["innovación y desarrollo tecnológico"],
    "Es una empresa responsable con el medioambiente": ["comprometida con el medioambiente"],
    "Es una empresa cercana, que está presente en mi vida cotidiana": ["cercana", "cotidiana"],
    "Tiene prácticas de negocios éticas y transparentes": ["negocios éticas y transparentes"],
    "Es una compañía en la que me gustaría trabajar": ["compañía en la que me gustaría trabajar"],
    "Contribuye a la generación de empleo": ["empleo"],
    "Tiene presencia en todo el país": ["presencia en todo el país"],
    "Tiene historia y trayectoria": ["historia", "trayectoria"],
    "Es una marca confiable / responsable": ["confiable / responsable"],
    "Ofrecen una buena relación precio calidad de combustibles": ["precio calidad"],
    "Es una empresa más, igual a cualquier otra empresa": ["igual a"],
    "Es una empresa que ya no es lo que era": ["ya no es lo que era"],
    "Es una empresa con productos de calidad internacional": ["calidad inter"]        
}

ATRIBUTOS_COMUNES_CONDUCTORES2 = {
    "Es una empresa con productos y servicios de calidad": ["productos y servicios de calidad"],
    "Es una empresa fundamental para la economía del país": ["empresa fundamental para la economía del país"],
    "Es una empresa manejada por profesionales": ["manejada por profesionales"],
    "Participa activamente y es responsable en las comunidades en las que opera": ["comunidades en las que opera"],
    "Es una empresa que me genera orgullo": ["orgullo"],
    "Es una empresa muy comprometida con el desarrollo del país": ["desarrollo del país"],    
    "Es una empresa líder en innovación y desarrollo tecnológico": ["innovación y desarrollo tecnológico"],
    "Es una empresa responsable/comprometida con el medioambiente": ["responsable con el medioambiente"],
    "Es una empresa cercana, que está presente en mi vida cotidiana": ["cercana", "cotidiana"],
    "Tiene prácticas de negocios éticas y transparentes": ["transparentes"],
    "Es una compañía en la que me gustaría trabajar": ["compañía en la que me gustaría trabajar"],
    "Contribuye a la generación de empleo": ["empleo"],
    "Tiene presencia en todo el país": ["presencia en todo el país"],
    "Tiene historia y trayectoria": ["historia", "trayectoria"],
    "Es una marca confiable / responsable": ["confiable / responsable"],
    "Ofrecen una buena relación precio calidad de combustibles": ["precio calidad"],
    "Es una empresa más, igual a cualquier otra empresa": ["igual a"],
    "Es una empresa que ya no es lo que era": ["ya no es lo que era"],
    "Es una empresa con productos de calidad internacional": ["calidad inter"]        
}
# =========================================================
# --- 1. GRÁFICOS Y TABLAS TRACKING (Cinta Transportadora) 
# =========================================================
TRACKING_CHARTS = [
    # --- GRÁFICOS DE LÍNEAS / BARRAS ---
    {
        "chart_name": "Chart_P107", 
        "variable": "P107", 
        "metrics": {"Muy buena + algo buena": ["t2b"], "Algo mala + muy mala": ["b2b"], "Ni buena ni mala": ["ni buena ni mala"]}
    },    
    {
        "chart_name": "Chart_P108", 
        "variable": "P108", 
        "metrics": {"Muy buena + algo buena": ["t2b"], "Algo mala + muy mala": ["b2b"]}
    },
    {
        "chart_name": "Chart_P105",
        "variable": "P105",
        "metrics": {
            "Inflación": ["inflación","precios"], "La Inseguridad": ["inseguridad"], "Desempleo": ["Desempleo"],
            "La pobreza": ["pobreza"], "La grieta política/ social": ["grieta"], "La educación": ["educación"],
            "El endeudamiento externo": ["endeudamiento"], "La salud / el covid19": ["salud", "covid"]
        }
    },
    {
        "chart_name": "Chart_P106", 
        "variable": "P106", 
        "metrics": {"Peor": ["peor"], "Igual": ["igual"], "Mejor": ["mejor"]}
    },
    {
        "chart_name": "Chart_Lineas_P01",
        "variable": "P01",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T4B",
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma","puma energy"],
            "Mercado Libre": ["mercado libre"],
            "Aerolíneas Argentinas": ["aerolíneas Argentinas"],
            "McDonald’s": ["mcDonald’s"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca cola"]
        }
    },
    {
        "chart_name": "Chart_Lineas_P02_T3B",
        "variable": "P02",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T3B",
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma","puma energy"],
            "Mercado Libre": ["mercado libre"],
            "Aerolíneas Argentinas": ["aerolíneas Argentinas"],
            "McDonald’s": ["mcDonald’s"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca cola"]
        }
    },      
    {
        "chart_name": "Chart_Lineas_P02_T2B",
        "variable": "P02",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T2B",
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma","puma energy"],
            "Mercado Libre": ["mercado libre"],
            "Aerolíneas Argentinas": ["aerolíneas Argentinas"],
            "McDonald’s": ["mcDonald’s"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca cola"]
        }
    },               
    # --- GRÁFICO DE BARRAS APILADAS (Lealtad) ---
    {
        "chart_name": "Chart_Barras_Lealtad", 
        "variable": "Vinculo",              
        "reporcentualizar": True,             
        "is_percentage": True,          
        "metrics": {
            "Leal YPF": ["leal"],
            "Nuevo": ["nuevo"],
            "Abandonador": ["abandonador"],
            "Competencia": ["competencia"]
        }
    },
    # --- TABLAS EVOLUTIVAS ---
    {
        "chart_name": "Table_ATT_YPF",  
        "variable": "P03", 
        "is_table": True, 
        "is_static": False,             
        "is_percentage": False,        
        "start_data_col": 2,          
        "label_col": 1,               
        "has_header": True,          
        "calcular_promedio": True,
        "metrics": ATRIBUTOS_COMUNES    
    },
    {
        "chart_name": "Header_Meses_Lealtad",  
        "is_header": True                      
    },
    {
        "chart_name": "Tabla_Valor_de_Marca",  
        "variable": "P03", 
        "is_table": True, 
        "is_static": False,             
        "is_percentage": True,        
        "start_data_col": 1,          
        "label_col": 0,               
        "has_header": False,          
        "calcular_promedio": False,
        "metrics": ATRIBUTOS_COMUNES    
    },
    {
        "chart_name": "Header_Meses_ValordeMarca",  
        "is_header": True                      
    },
    # --- GRÁFICOS DE DETALLE (P03) ---
    {
        "chart_name": "Chart_Detalle_P03_1",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"TIENE PRODUCTOS Y SERVICIOS DE CALIDAD": ["calid"]}
    },
    {
        "chart_name": "Chart_Detalle_P03_2",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,           
        "target_box": "T2B",
        "metrics": {"CONTRIBUYE A LA GENERACIÓN DE EMPLEO": ["CONTRIBUYE A LA GENERACIÓN DE EMPLEO"]} 
    },
    {
        "chart_name": "Chart_Detalle_P03_3",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA RESPONSABLE CON EL MEDIO AMBIENTE": ["medioambiente"]} 
    },
    {
        "chart_name": "Chart_Detalle_P03_4",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA EN LA QUE ME GUSTARÍA TRABAJAR": ["trabajar"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_5",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA FUNDAMENTAL PARA LA ECONOMÍA DEL PAÍS": ["ES UNA EMPRESA FUNDAMENTAL PARA LA ECONOMÍA DEL PAÍS"]} 
    },
    {
        "chart_name": "Chart_Detalle_P03_6",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"MUY COMPROMETIDA CON EL DESARROLLO DEL PAÍS": ["MUY COMPROMETIDA CON EL DESARROLLO DEL PAÍS"]} 
    },           
    {
        "chart_name": "Chart_Detalle_P03_7",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA CERCANA, QUE ESTÁ PRESENTE EN MI VIDA COTIDIANA": ["ES UNA EMPRESA CERCANA, QUE ESTÁ PRESENTE EN MI VIDA COTIDIANA"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_8",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"TIENE HISTORIA Y TRAYECTORIA": ["TIENE HISTORIA Y TRAYECTORIA ARRAIGADA AL PAÍS"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_9",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA MARCA CONFIABLE / RESPONSABLE": ["ES UNA MARCA CONFIABLE / RESPONSABLE"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_10",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA MANEJADA POR PROFESIONALES": ["manejada por profesionales"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_11",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"TIENE PRÁCTICAS DE NEGOCIOS ÉTICAS Y TRANSPARENTES": ["TIENE PRÁCTICAS DE NEGOCIOS ÉTICAS Y TRANSPARENTES"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_12",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"PARTICIPA ACTIVAMENTE Y ES RESPONSABLE EN LAS COMUNIDADES EN LAS QUE OPERA": ["PARTICIPA ACTIVAMENTE Y ES RESPONSABLE EN LAS COMUNIDADES EN LAS QUE OPERA"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_13",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA LÍDER EN INNOVACIÓN Y DESARROLLO TECNOLÓGICO": ["innovaci"]} 
    },
    {
        "chart_name": "Chart_Detalle_P03_14",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA QUE ME GENERA ORGULLO": ["me genera orgullo"]} 
    },       
    {
        "chart_name": "Chart_Detalle_P03_15",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "skip_insight": True,        
        "target_box": "T2B",
        "metrics": {"TIENE PRESENCIA EN TODO EL PAÍS": ["cobertura","presencia"]} 
    },
    {
        "chart_name": "Chart_Detalle_P03E_1",
        "variable": "P03_E",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"SE VIENE MODERNIZANDO Y RENOVANDO EN LOS ÚLTIMOS AÑOS": ["modernizando"]}
    },
    {
        "chart_name": "Chart_Detalle_P03E_2",
        "variable": "P03_E",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"TIENE UN ROL ESTRATÉGICO EN EL DESARROLLO ENERGÉTICO DE ARGENTINA": ["rol estrat"]}
    },
    {
        "chart_name": "Chart_Detalle_P03_29",
        "variable": "P03",
        "is_table": False,
        "is_percentage": True,
        "append_only": True,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"ES UNA EMPRESA CON PRODUCTOS DE CALIDAD INTERNACIONAL": ["internacional"]}
    },
    {
        "chart_name": "Chart_Detalle_P03E_3",
        "variable": "P03_E",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"LOS COMBUSTIBLES YPF TIENEN LOS PRECIOS MÁS ACCESIBLES": ["combustibles"]}
    },
    {
        "chart_name": "Chart_Detalle_P03E_4",
        "variable": "P03_E",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"LA APP DE YPF MUESTRA QUE ESTÁN A LA VANGUARDIA EN TECNOLOGÍA": ["app"]}
    },
    {
        "chart_name": "Chart_Detalle_P03E_5",
        "variable": "P03_E",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,
        "skip_insight": True,                              
        "target_box": "T2B",
        "metrics": {"LOS PLAYEROS DE YPF TIENEN MUY BUENA ATENCIÓN": ["playeros"]}
    },
    # =========================================================
    # 📈 OTROS GRÁFICOS VARIOS
    # =========================================================
    {
        "chart_name": "Chart_P143_1", 
        "variable": "P143",               
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {"Mejor": ["1 año mejor"], "Igual": ["1 año igual"], "Peor":  ["1 año peor"]}
    },
    {
        "chart_name": "Chart_P143_2", 
        "variable": "P143",                
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {"Mejor": ["5 años mejor"], "Igual": ["5 años igual"], "Peor":  ["5 años peor"]}
    },
    {
        "chart_name": "Chart_P08", 
        "variable": "P08",        
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {"Si": ["si","Sí"], "No + Ns/Nc": ["no", "recuerdo"]}
    },
    {
        "chart_name": "Chart_P10", 
        "variable": "P10",        
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {
            "La mejora": ["mejora"], "La empeora": ["empeora"],
            "La mantiene igual": ["igual"], "No sé/ prefiero no responder": ["no responder"]
        }
    },
    {
        "chart_name": "Chart_P16", 
        "variable": "P16",        
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {"Si": ["Sí"], "No": ["no"]}
    },
    {
        "chart_name": "Chart_P18_1", 
        "variable": "P18_1",        
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {
            "Definitivamente + Probablemente si": ["definitivamente","probablemente"],
            "Estoy en duda": ["duda"], "No tiene la capacidad": ["no"]            
        }
    },
    {
        "chart_name": "Chart_P17",
        "variable": "P17",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T2B",
        "metrics": {
            "Es muy importante para nuestro país desarrollar Vaca Muerta": ["importante"],
            "Nuestro país tiene la capacidad y el conocimiento de desarrollar Vaca Muerta": ["capacidad"],
            "Para poder desarrollar Vaca Muerta será necesario atraer inversiones extranjeras": ["inversiones"],
            "Desarrollar Vaca Muerta genera un impacto muy negativo en el medioambiente": ["negativo"],
            "Desarrollar Vaca Muerta genera un impacto positivo a nivel de desarrollo social": ["positivo"],
            "El desarrollo de Vaca Muerta justifica el aumento de los combustibles": ["aumento"]
        }
    },
    {
        "chart_name": "Chart_P18", 
        "variable": "P18",        
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "metrics": {"YPF": ["ypf"], "Chevron": ["chevron"], "No lo sé": ["no lo"]}
    },
    {
        "chart_name": "Chart_P11",
        "variable": "P11",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T4B",
        "metrics": {
            "YPF Gas": ["gas"], "YPF Agro": ["agro"], "Fundación YPF": ["fundac"],
            "YPF Luz": ["luz"], "Y-TEC": ["tec"], "YPF Química": ["mica"],
            "Argentina LNG": ["lng"], "YPF Minería": ["mine"]            
        }
    },
    {
        "chart_name": "Chart_P12",
        "variable": "P12",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T2B",
        "metrics": {
            "YPF Gas": ["gas"], "YPF Agro": ["agro"], "Fundación YPF": ["fundac"],
            "YPF Luz": ["luz"], "Y-TEC": ["tec"], "YPF Química": ["mica"],
            "Argentina LNG": ["lng"], "YPF Minería": ["mine"]            
        }
    },        
    {
        "chart_name": "Chart_P126",
        "variable": "P126",
        "metrics": {
            "YPF": ["ypf"], "Shell": ["shell"], "Axion": ["axion"],
            "Puma": ["puma"], "Otras": ["¿c"], "No sé/ prefiero no responder": ["prefiero"]
        }
    },
    {
        "chart_name": "Chart_P126b",
        "variable": "P126B",
        "metrics": {
            "YPF": ["ypf"], "Shell": ["shell"], "Axion": ["axion"],
            "Puma": ["puma"], "Otras": ["otra"], "No sé/ prefiero no responder": ["prefiero"]
        }
    },
    {
        "chart_name": "Chart_P126c",
        "variable": "P126C",
        "metrics": {
            "La actual me queda más cerca": ["cerca"],
            "La anterior aumentó mas los precios": ["precios"],
            "La actual tiene mejores combustibles": ["combustibles"],
            "La actual parece mas confiable": ["confiable"],
            "La actual tiene un programa que me permite sumar puntos para canjear premios y beneficios": ["beneficios"],
            "La actual tiene más y/o mejores servicios adicionales": ["servicios"],
            "La actual tienen mejor atención": ["atenc"], "Otros": ["otra"]
        }
    },
    {
        "chart_name": "Chart_P127",
        "variable": "P127",
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,        
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Otras": ["otra"],
            "No sé/ prefiero no responder": ["no responder"]
        }
    },         
    {
        "chart_name": "Chart_GG1A", 
        "variable": "GG1A",              
        "reporcentualizar": False,             
        "is_percentage": True,
        "append_only": True,                  
        "metrics": {"Si": ["Sí"], "NO": ["no"]}
    },
    {
        "chart_name": "Chart_GG9", 
        "variable": "GG9",              
        "reporcentualizar": False,             
        "is_percentage": True,          
        "metrics": {
            "Algo + muy en desacuerdo": ["T2B"], "Ni de acuerdo ni en desacuerdo": ["ni"], "Algo + muy de acuerdo": ["B2B"]            
        }  
    },
    {
        "chart_name": "Chart_GG3", 
        "variable": "GG3",              
        "reporcentualizar": False,             
        "is_percentage": True,          
        "metrics": {"Si": ["Sí"]}  
    },
    {
        "chart_name": "Chart_GG4", 
        "variable": "GG4",              
        "reporcentualizar": False,             
        "is_percentage": True,          
        "metrics": {"T2B": ["T2B"]}  
    },
    {
        "chart_name": "Chart_GG5", 
        "variable": "GG5",              
        "reporcentualizar": False,             
        "is_percentage": True,          
        "metrics": {"T2B": ["B2B"]}  
    },
    {
        "chart_name": "Chart_GG2",
        "variable": "GG2",
        "is_percentage": True,         
        "metrics": {
            "YPF": ["ypf"], "Empresas internacionales": ["internacionales"],
            "Empresas nacionales": ["sas nacionales"], "Estado": ["estado"], "No sé": ["no"]
        }
    },
    {
        "chart_name": "Chart_GG8", 
        "variable": "GG8",              
        "reporcentualizar": False,             
        "is_percentage": True,          
        "metrics": {"Algo": ["Algo"], "Poco + Ninguna": ["Poco","Ninguna"], "Bastante + Mucha": ["Bastante","Mucha"]}  
    },
    {
        "chart_name": "Chart_P151", 
        "variable": "P151",              
        "reporcentualizar": False,             
        "is_percentage": True,          
        "metrics": {"SÍ": ["Sí"], "NO": ["no"]}
    },
    {
        "chart_name": "Chart_P20B_1", # O el nombre que tenga
        "variable": "P20B_1",
        "is_table": False,
        "is_percentage": True,
        "remove_percentage_sign": True,
        "origen": "secundaria",         
        "metrics": {
            # En vez de pasarle ["t2b"], le pasamos partes de las palabras reales:
            "Algo + muy de acuerdo": ["totalmente de acuerdo", "algo de acuerdo"],
            "Ni de acuerdo ni en desacuerdo": ["ni"],
            "Algo + muy en desacuerdo": ["totalmente en desacuerdo", "algo en desacuerdo"]                         
        }
    },
    {
        "chart_name": "Chart_Index_YPF",       # El nombre exacto de tu gráfico en el Panel de Selección de PPT
        "variable": "Index_YPF_ajustado",      # El nombre de tu variable numérica en SPSS
        "is_table": False,
        "is_percentage": False,                # Dejalo en False si es un número puro (Ej: 85.4). Ponelo en True si lleva "%"
        "decimals": 1,          # 👈 ¡LA MAGIA SE ENCIENDE ACÁ!
        "remove_percentage_sign": False,       # Si no lleva %, esto no hace falta
        "metrics": {
            # "Nombre de la línea" : ["palabra que aparece en el Excel"]
            "Índice YPF": ["promedio", "mean", "media"] 
        }
    },
    {
        "chart_name": "Chart_Index_YPF_Conductores",       # El nombre exacto de tu gráfico en el Panel de Selección de PPT
        "variable": "Index_YPF",      # El nombre de tu variable numérica en SPSS
        "origen": "secundaria",              
        "is_table": False,
        "is_percentage": False,                # Dejalo en False si es un número puro (Ej: 85.4). Ponelo en True si lleva "%"
        "decimals": 1,          # 👈 ¡LA MAGIA SE ENCIENDE ACÁ!
        "remove_percentage_sign": False,       # Si no lleva %, esto no hace falta
        "metrics": {
            # "Nombre de la línea" : ["palabra que aparece en el Excel"]
            "INDICE VDM": ["promedio", "mean", "media"] 
        }
    },    
    {
        "chart_name": "Chart_P148", 
        "variable": "P148",              
        "reporcentualizar": False,             
        "is_percentage": True,
        "remove_percentage_sign": True,       # Si no lleva %, esto no hace falta                          
        "metrics": {"Sí": ["Sí"]}  
    },
    {
        "chart_name": "Chart_P149", 
        "variable": "P149",              
        "reporcentualizar": False,             
        "is_percentage": True,
        "remove_percentage_sign": True,       # Si no lleva %, esto no hace falta                  
        "metrics": {"B2B": ["b2b"], "Ni relevante ni irrelevante": ["ni rele"], "T2B": ["t2b"]}  
    },
    {
        "chart_name": "Chart_P150", 
        "variable": "P150",              
        "reporcentualizar": False,             
        "is_percentage": True,
        "remove_percentage_sign": True,       # Si no lleva %, esto no hace falta                  
        "metrics": {"B2B": ["muy en desacuerdo", "algo en desacuerdo"], "Ni relevante ni irrelevante": ["ni de acuerdo"], "T2B": ["algo de acuerdo","muy de acuerdo"]}  
    },
    # --- TABLAS EVOLUTIVAS ---
    {
        "chart_name": "Table_ATT_YPF_Conductores",  
        "variable": "P18_YPF", 
        "is_table": True, 
        "is_static": False,             
        "origen": "secundaria",         
        "is_percentage": True,        
        "start_data_col": 3,          
        "label_col": 2,               
        "has_header": True,          
        "calcular_promedio": True,
        "metrics": ATRIBUTOS_COMUNES_CONDUCTORES2    
    },
    {
        "chart_name": "Chart_P113", 
        "variable": "P113",
        "ola_impar": True, # <--- ¡La llave mágica!         
        "metrics": {"Es más caro": ["caro"], "Tiene el mismo precio": ["mismo"], "Es más barato": ["barato"], "Ns/Nc": ["no sabe"]}
    },    
    {
        "chart_name": "Chart_P118", 
        "variable": "P118",
        "ola_impar": True, # <--- ¡La llave mágica!         
        "metrics": {"Subiendo más que la inflación": ["más"], "Subiendo a la par de la inflación": ["par"], "Subiendo menos que la inflación": ["menos"]}
    },
    {
        "chart_name": "Chart_P113b", 
        "variable": "P113b",
        "ola_impar": True,
        "metrics": {"El estado/gobierno": ["estado"],
        "Inflacion": ["inflac"],
        "Suba del dólar/devaluacion": ["devaluaci"],
        "Las empresas": ["empresas"],
        "El presidente/Milei": ["milei"],
        "Otros": ["otros"],
        "Impuestos": ["impuestos"],
        "No se": ["no se"]}
    },
    {
        "chart_name": "Chart_P124",
        "variable": "P40",
        "ola_impar": True,        
        "is_table": False,
        "is_percentage": True,
        "append_only": False,
        "remove_percentage_sign": True,                       
        "target_box": "T2B",
        "metrics": {
            "es negativo ya que impacta en el precio de otros productos y genera más inflación": ["impacta en el precio de"],
            "en ningún caso puede justificarse, la gente no puede pagar más": ["la gente no puede pagar"],
            "hace que utilice menos el auto": ["utilice menos"],
            "hara que busque una marca más económico": ["busque una marca"],
            "es necesario para realizar inversiones y no importar combustibles en el futuro": ["inversiones y no importar combustibles"],
            "es inevitable ya que los precios se encuentran atrasados": ["atrasados"],
            "hará que le coloque GNC al auto": ["coloque un equipo"]
        }
    },
    {
        "chart_name": "Chart_P114", 
        "variable": "P114",
        "ola_impar": True,
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Oil": ["oil"],
            "Refinor": ["refinor"],
            "Gulf": ["gulf"],
            "Voy": ["voy"],
            "Otras": ["otras"],            
            "Ns/Nc": ["no sabe"]              
            }
    },
    {
        "chart_name": "Chart_P115", 
        "variable": "P115",
        "ola_impar": True,
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],           
            "Ns/Nc": ["no sabe"]              
            }
    },
    {
        "chart_name": "Chart_P116", 
        "variable": "P116",
        "ola_impar": True,
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],           
            "Ns/Nc": ["no sabe"]              
            }
    },
    {
        "chart_name": "Chart_P117", 
        "variable": "P117",
        "ola_impar": True,
        "metrics": {
            "Dólar": ["dólar"],
            "Guerra": ["guerra"],
            "Inflación": ["inflaci"],
            "Devaluación": ["devaluaci"],
            "Impuestos": ["impuestos"],
            "Precio Internacional": ["precio internacional"],
            "Situacion economica del pais": ["situacion economica"],
            "Falta de acuerdo de precios": ["acuerdo de precios"],
            "Otras": ["otras"],
            "Ns/Nc": ["no sabe"]             
            }
    },
    {
        "chart_name": "Chart_P121", 
        "variable": "P121",
        "ola_impar": True,
        "metrics": {
            "Alimentos y bebidas": ["alimentos"],
            "Combustibles": ["combustibles"],
            "Telefonia": ["telefon"],
            "Internet/cable": ["internet"],
            "Medicina prepaga": ["prepaga"],
            "Colegio/materiales": ["colegio"],
            "Servicios públicos": ["servicios"],
            "Productos de cuidado personal": ["productos de cuidado"],
            "Transporte": ["transporte"],
            "Indumentaria": ["indumentaria"]           
            }
    },
    {
        "chart_name": "Chart_P122", 
        "variable": "P122",
        "ola_impar": True,
        "metrics": {
            "Alimentos y bebidas": ["alimentos"],
            "Combustibles": ["combustibles"],
            "Telefonia": ["telefon"],
            "Internet/cable": ["internet"],
            "Medicina prepaga": ["prepaga"],
            "Colegio/materiales": ["colegio"],
            "Servicios públicos": ["servicios"],
            "Productos de cuidado personal": ["productos de cuidado"],
            "Transporte": ["transporte"],
            "Indumentaria": ["indumentaria"]           
            }
    },
    {
        "chart_name": "Chart_P142", 
        "variable": "P142",
        "ola_impar": True,
        "metrics": {
            "Muy de acuerdo + Algo de acuerdo": ["b2b"],
            "Algo en desacuerdo + Muy en desacuerdo": ["t2b"]        
            }
    },
    {
        "chart_name": "Chart_P113c", 
        "variable": "P113c (MENCIONES TOTALES / SOM)",
        "ola_impar": True,
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Ninguna": ["ninguna"],                       
            "Ns/Nc": ["ns/nc"]              
            }
    },
    {
        "chart_name": "Chart_P113d", 
        "variable": "P113d (MENCIONES TOTALES / SOM)",
        "ola_impar": True,
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],           
            "Puma": ["puma"],
            "Ninguna": ["ninguna"],            
            "Ns/Nc": ["ns/nc"]              
            }
    },
    {
        "chart_name": "Chart_P119b", # 👈 El nombre exacto del gráfico de líneas en tu PPT
        "variable": "P119B",                # 👈 Debe coincidir con el nombre de la tabla en Excel (ver image_4.png)
        "decimals": 0,                      # 👈 Opcional: cuántos decimales mostrar en las etiquetas de datos del gráfico
        "metrics": {
            # Mapeo: "Nombre de la línea en PPT" : ["Texto exacto de la fila en Excel"]
            "Alimentos y bebidas": ["Alimentos"],
            "Servicios públicos": ["Servicios"],  # Usamos el texto completo que genera el motor
            "Combustibles": ["combustibles"], # Asegurate de usar el texto tal cual sale en Excel (image_4.png)
            "Internet/cable/telefonía": ["internet"],
            "Transporte": ["Transporte"]
        }
    },
    {
        "chart_name": "Chart_P146", 
        "variable": "P146",
        "ola_impar": True,
        "metrics": {
            "No sabe o no contesta": ["no sabe"],
            "Mala + Muy Mala": ["b2b"],
            "Buena + Muy Buena": ["t2b"]                    
            }
    },
    {
        "chart_name": "Chart_P147", 
        "variable": "P147",
        "ola_impar": True,
        "metrics": {
            "El cuidado del medioambiente debe ser prioritario, aunque esto signifique desaprovechar nuestras reservas de petróleo y gas y su potencial para generar divisas": ["cuidado del medioambiente"],
            "NS/NC": ["no sabe"],
            "El desarrollo de la industria petrolera debe ser una prioridad para el desarrollo del país a pesar de los efectos negativos en el medioambiente": ["desarrollo de la industria"]                  
            }
    },
    {
        "chart_name": "Chart_IM1", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["calidad | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["calidad | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["calidad | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["calidad | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["calidad | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["calidad | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["calidad | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["calidad | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["calidad | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM2", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["trabajar | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["trabajar | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["trabajar | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["trabajar | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["trabajar | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["trabajar | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["trabajar | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["trabajar | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["trabajar | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM3", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["cercana | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["cercana | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["cercana | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["cercana | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["cercana | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["cercana | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["cercana | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["cercana | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["cercana | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM4", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["contribuye a la genera | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["contribuye a la genera | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["contribuye a la genera | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["contribuye a la genera | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["contribuye a la genera | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["contribuye a la genera | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["contribuye a la genera | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["contribuye a la genera | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["contribuye a la genera | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM5", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["fundamental para la eco | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["fundamental para la eco | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["fundamental para la eco | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["fundamental para la eco | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["fundamental para la eco | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["fundamental para la eco | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["fundamental para la eco | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["fundamental para la eco | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["fundamental para la eco | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM6", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["tiene historia | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["tiene historia | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["tiene historia | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["tiene historia | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["tiene historia | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["tiene historia | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["tiene historia | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["tiene historia | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["tiene historia | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM7", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["comprometida con el medio | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["comprometida con el medio | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["comprometida con el medio | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["comprometida con el medio | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["comprometida con el medio | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["comprometida con el medio | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["comprometida con el medio | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["comprometida con el medio | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["comprometida con el medio | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM8", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["comprometida con el desarrollo | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["comprometida con el desarrollo | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["comprometida con el desarrollo | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM9", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["presencia | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["presencia | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["presencia | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["presencia | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["presencia | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["presencia | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["presencia | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["presencia | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["presencia | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM10", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["manejada por profesionales | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["manejada por profesionales | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["manejada por profesionales | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["manejada por profesionales | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["manejada por profesionales | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["manejada por profesionales | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["manejada por profesionales | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["manejada por profesionales | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["manejada por profesionales | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM11", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["desarrollo tecno | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["desarrollo tecno | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["desarrollo tecno | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["desarrollo tecno | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["desarrollo tecno | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["desarrollo tecno | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["desarrollo tecno | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["desarrollo tecno | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["desarrollo tecno | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM12", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["comunidades en las que opera | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["comunidades en las que opera | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["comunidades en las que opera | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["comunidades en las que opera | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["comunidades en las que opera | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["comunidades en las que opera | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["comunidades en las que opera | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["comunidades en las que opera | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["comunidades en las que opera | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM13", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["transparentes | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["transparentes | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["transparentes | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["transparentes | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["transparentes | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["transparentes | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["transparentes | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["transparentes | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["transparentes | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM14", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["genera orgullo | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["genera orgullo | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["genera orgullo | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["genera orgullo | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["genera orgullo | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["genera orgullo | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["genera orgullo | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["genera orgullo | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["genera orgullo | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM15", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03", "keywords": ["confiable | t2b"]},
            "Shell": {"variable": "P04_2", "keywords": ["confiable | t2b"]},
            "Axion": {"variable": "P04_1", "keywords": ["confiable | t2b"]},
            "Puma Energy": {"variable": "P04_3", "keywords": ["confiable | t2b"]},
            "Mercado Libre": {"variable": "P04B_5", "keywords": ["confiable | t2b"]},
            "Quilmes": {"variable": "P04B_8", "keywords": ["confiable | t2b"]},
            "Aerolíneas Argentinas": {"variable": "P04B_6", "keywords": ["confiable | t2b"]},
            "Coca Cola": {"variable": "P04B_7", "keywords": ["confiable | t2b"]},
            "McDonald’s": {"variable": "P04B_4", "keywords": ["confiable | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM17", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03_E", "keywords": ["desarrollo ener | t2b"]},
            "Shell": {"variable": "P4_E_2", "keywords": ["desarrollo ener | t2b"]},
            "Axion": {"variable": "P4_E_1", "keywords": ["desarrollo ener | t2b"]},
            "Puma Energy": {"variable": "P4_E_3", "keywords": ["desarrollo ener | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM18", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03_E", "keywords": ["modernizando y renovando | t2b"]},
            "Shell": {"variable": "P4_E_2", "keywords": ["modernizando y renovando | t2b"]},
            "Axion": {"variable": "P4_E_1", "keywords": ["modernizando y renovando | t2b"]},
            "Puma Energy": {"variable": "P4_E_3", "keywords": ["modernizando y renovando | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM19", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03_E", "keywords": ["vanguardia en tecno | t2b"]},
            "Shell": {"variable": "P4_E_2", "keywords": ["vanguardia en tecno | t2b"]},
            "Axion": {"variable": "P4_E_1", "keywords": ["vanguardia en tecno | t2b"]},
            "Puma Energy": {"variable": "P4_E_3", "keywords": ["vanguardia en tecno | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM20", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03_E", "keywords": ["los playeros | t2b"]},
            "Shell": {"variable": "P4_E_2", "keywords": ["los playeros | t2b"]},
            "Axion": {"variable": "P4_E_1", "keywords": ["los playeros | t2b"]},
            "Puma Energy": {"variable": "P4_E_3", "keywords": ["los playeros | t2b"]}
        }
    },
    {
        "chart_name": "Chart_IM21", # 👈 Nombre del gráfico de líneas en PPT
        "is_percentage": True,
        "append_only": False,        
        "remove_percentage_sign": True,        
        "metrics": {
            # "Línea PPT" : {"variable": "Tabla Excel", "keywords": ["Fragmento del atributo | métrica"]}
            "YPF": {"variable": "P03_E", "keywords": ["los combustibles | t2b"]},
            "Shell": {"variable": "P4_E_2", "keywords": ["los combustibles | t2b"]},
            "Axion": {"variable": "P4_E_1", "keywords": ["los combustibles | t2b"]},
            "Puma Energy": {"variable": "P4_E_3", "keywords": ["los combustibles | t2b"]}
        }
    },                                                                                                                                                                                                                                
    # =========================================================
    # --- GRÁFICOS YTD (Promedios calculados leyendo el PPT) ---
    # ¡Van al final para asegurarse de que el PPT ya esté actualizado!
    # =========================================================        
    {
        "chart_name": "Chart_YTD_P107",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_P107",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"T2B": ["muy buena"], "ni buena ni mala": ["ni"], "B2B": ["muy mala"]}
    },
    {
        "chart_name": "Chart_YTD_P108",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_P108",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"T2B": ["buena"], "B2B": ["mala"]}
    },
    {
        "chart_name": "Chart_YTD_P105",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_P105",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {
            "Inflación": ["Inflación"], "La Inseguridad": ["inseguridad"], "Desempleo": ["desempleo"],
            "La pobreza": ["La pobreza"], "La grieta política/ social": ["grieta política/ social"],
            "La educación": ["educación"], "El endeudamiento externo": ["endeudamiento"], "La salud / el covid19": ["salud"]
        }
    },
    {
        "chart_name": "Chart_YTD_P106",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_P106",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Peor": ["Peor"], "Igual": ["Igual"], "Mejor": ["Mejor"]}
    },
    {
        "chart_name": "Chart_YTD_Barras_Lealtad",  
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_Barras_Lealtad",  
        "target_year": "YTD 2026",                 
        "year_suffix": "26",               
        "is_percentage": True,                     
        "metrics": {
            "Leal YPF": ["leal"], "Abandonador": ["abandonador"],
            "Nuevo": ["nuevo"], "Competencia": ["competencia"]
        }
    },
    {
        "chart_name": "Chart_YTD_P01",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_Lineas_P01",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {
            "YPF": ["YPF"], "Shell": ["Shell"], "Axion": ["Axion"],
            "Puma": ["Puma"], "Aerolíneas Argentinas": ["aerolíneas Argentinas"],
            "McDonald’s": ["McDonald’s"], "Quilmes": ["quilmes"], "Coca Cola": ["coca cola"]
        }
    },
    {
        "chart_name": "Chart_YTD_P02_T2B",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_Lineas_P02_T2B",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {
            "YPF": ["YPF"], "Shell": ["Shell"], "Axion": ["Axion"],
            "Puma": ["Puma"], "Aerolíneas Argentinas": ["aerolíneas Argentinas"],
            "McDonald’s": ["McDonald’s"], "Quilmes": ["quilmes"], "Coca Cola": ["coca cola"]
        }
    },       
    {
        "chart_name": "Chart_YTD_P02_T3B",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_Lineas_P02_T3B",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {
            "YPF": ["YPF"], "Shell": ["Shell"], "Axion": ["Axion"],
            "Puma": ["Puma"], "Aerolíneas Argentinas": ["aerolíneas Argentinas"],
            "McDonald’s": ["McDonald’s"], "Quilmes": ["quilmes"], "Coca Cola": ["coca cola"]
        }
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_1", "ref_chart_name": "Chart_Detalle_P03_1", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"TIENE PRODUCTOS Y SERVICIOS DE CALIDAD": ["calid"]}
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_2", "ref_chart_name": "Chart_Detalle_P03_2", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"CONTRIBUYE A LA GENERACIÓN DE EMPLEO": ["CONTRIBUYE A LA GENERACIÓN DE EMPLEO"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_3", "ref_chart_name": "Chart_Detalle_P03_3", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA RESPONSABLE CON EL MEDIO AMBIENTE": ["medioambiente"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_4", "ref_chart_name": "Chart_Detalle_P03_4", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA EN LA QUE ME GUSTARÍA TRABAJAR": ["trabajar"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_5", "ref_chart_name": "Chart_Detalle_P03_5", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA FUNDAMENTAL PARA LA ECONOMÍA DEL PAÍS": ["ES UNA EMPRESA FUNDAMENTAL PARA LA ECONOMÍA DEL PAÍS"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_6", "ref_chart_name": "Chart_Detalle_P03_6", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"MUY COMPROMETIDA CON EL DESARROLLO DEL PAÍS": ["MUY COMPROMETIDA CON EL DESARROLLO DEL PAÍS"]} 
    },          
    {
        "chart_name": "Chart_YTD_Detalle_P03_7", "ref_chart_name": "Chart_Detalle_P03_7", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA CERCANA, QUE ESTÁ PRESENTE EN MI VIDA COTIDIANA": ["ES UNA EMPRESA CERCANA, QUE ESTÁ PRESENTE EN MI VIDA COTIDIANA"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_8", "ref_chart_name": "Chart_Detalle_P03_8", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"TIENE HISTORIA Y TRAYECTORIA": ["TIENE HISTORIA Y TRAYECTORIA ARRAIGADA AL PAÍS"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_9", "ref_chart_name": "Chart_Detalle_P03_9", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA MARCA CONFIABLE / RESPONSABLE": ["ES UNA MARCA CONFIABLE / RESPONSABLE"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_10", "ref_chart_name": "Chart_Detalle_P03_10", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA MANEJADA POR PROFESIONALES": ["manejada por profesionales"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_11", "ref_chart_name": "Chart_Detalle_P03_11", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"TIENE PRÁCTICAS DE NEGOCIOS ÉTICAS Y TRANSPARENTES": ["TIENE PRÁCTICAS DE NEGOCIOS ÉTICAS Y TRANSPARENTES"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_12", "ref_chart_name": "Chart_Detalle_P03_12", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"PARTICIPA ACTIVAMENTE Y ES RESPONSABLE EN LAS COMUNIDADES EN LAS QUE OPERA": ["PARTICIPA ACTIVAMENTE Y ES RESPONSABLE EN LAS COMUNIDADES EN LAS QUE OPERA"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_13", "ref_chart_name": "Chart_Detalle_P03_13", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA LÍDER EN INNOVACIÓN Y DESARROLLO TECNOLÓGICO": ["innovaci"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_14", "ref_chart_name": "Chart_Detalle_P03_14", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA QUE ME GENERA ORGULLO": ["me genera orgullo"]} 
    },      
    {
        "chart_name": "Chart_YTD_Detalle_P03_15", "ref_chart_name": "Chart_Detalle_P03_15", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"TIENE PRESENCIA EN TODO EL PAÍS": ["cobertura","presencia"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03E_1", "ref_chart_name": "Chart_Detalle_P03E_1", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"SE VIENE MODERNIZANDO Y RENOVANDO EN LOS ÚLTIMOS AÑOS": ["modernizando"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03E_2", "ref_chart_name": "Chart_Detalle_P03E_2", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"TIENE UN ROL ESTRATÉGICO EN EL DESARROLLO ENERGÉTICO DE ARGENTINA": ["rol estrat"]}
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03_29", "ref_chart_name": "Chart_Detalle_P03_29", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"ES UNA EMPRESA CON PRODUCTOS DE CALIDAD INTERNACIONAL": ["internacional"]}
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03E_3", "ref_chart_name": "Chart_Detalle_P03E_3", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"LOS COMBUSTIBLES YPF TIENEN LOS PRECIOS MÁS ACCESIBLES": ["combustibles"]} 
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03E_4", "ref_chart_name": "Chart_Detalle_P03E_4", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"LA APP DE YPF MUESTRA QUE ESTÁN A LA VANGUARDIA EN TECNOLOGÍA": ["app"]}
    },
    {
        "chart_name": "Chart_YTD_Detalle_P03E_5", "ref_chart_name": "Chart_Detalle_P03E_5", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "skip_insight": True, "year_suffix": "26",
        "metrics": {"LOS PLAYEROS DE YPF TIENEN MUY BUENA ATENCIÓN": ["playeros"]}
    },
    {
        "chart_name": "Chart_YTD_P143_1", "ref_chart_name": "Chart_P143_1", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"Mejor": ["mejor"], "Igual": ["igual"], "Peor":  ["peor"]}
    },
    {
        "chart_name": "Chart_YTD_P143_2", "ref_chart_name": "Chart_P143_2", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"Mejor": ["mejor"], "Igual": ["igual"], "Peor":  ["peor"]}
    },
    {
        "chart_name": "Chart_YTD_P08", "ref_chart_name": "Chart_P08", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"Sí": ["si","Sí"], "No + Ns/Nc": ["no", "no sé", "no recuerdo", "ns/nc"]}
    },
    {
        "chart_name": "Chart_YTD_P10", "ref_chart_name": "Chart_P10", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"La mejora": ["mejora"], "La empeora": ["empeora"], "La mantiene igual": ["igual"], "No sabe/No contesta": ["no responder"]}
    },    
    {
        "chart_name": "Chart_YTD_P16", "ref_chart_name": "Chart_P16", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"Sí": ["si","Sí"], "No": ["no"]}
    },
    {
        "chart_name": "Chart_YTD_P18_1", "ref_chart_name": "Chart_P18_1", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"Definitivamente + Probablemente si": ["definitivamente","probablemente"], "Estoy en duda": ["duda"], "No tiene la capacidad": ["no"]}
    },
    {
        "chart_name": "Chart_YTD_P17", "ref_chart_name": "Chart_P17", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 2026", "year_suffix": "26",
        "metrics": {
            "Es muy importante para nuestro país desarrollar Vaca Muerta": ["importante"],
            "Nuestro país tiene la capacidad y el conocimiento de desarrollar Vaca Muerta": ["capacidad"],
            "Para poder desarrollar Vaca Muerta será necesario atraer inversiones extranjeras": ["inversiones"],
            "Desarrollar Vaca Muerta genera un impacto muy negativo en el medioambiente": ["negativo"],
            "Desarrollar Vaca Muerta genera un impacto positivo a nivel de desarrollo social": ["positivo"],
            "El desarrollo de Vaca Muerta justifica el aumento de los combustibles": ["aumento"]
        }
    },
    {
        "chart_name": "Chart_YTD_P18", "ref_chart_name": "Chart_P18", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"YPF": ["ypf"], "Chevron": ["chevron"], "No + Ns/Nc": ["no lo"]}
    },
    {
        "chart_name": "Chart_YTD_P11", "ref_chart_name": "Chart_P11", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"YPF Gas": ["gas"], "YPF Agro": ["agro"], "Fundación YPF": ["fundac"],
            "YPF Luz": ["luz"], "Y-TEC": ["tec"], "YPF Química": ["mica"],
            "Argentina LNG": ["lng"], "YPF Minería": ["mine"]}
    },
    {
        "chart_name": "Chart_YTD_P12", "ref_chart_name": "Chart_P12", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"YPF Gas": ["gas"], "YPF Agro": ["agro"], "Fundación YPF": ["fundac"],
            "YPF Luz": ["luz"], "Y-TEC": ["tec"], "YPF Química": ["mica"],
            "Argentina LNG": ["lng"], "YPF Minería": ["mine"]}
    },    
    {
        "chart_name": "Chart_YTD_P126", "ref_chart_name": "Chart_P126", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"YPF": ["ypf"], "Shell": ["shell"], "Axion": ["axion"], "Puma": ["puma"], "Otras": ["otra"], "No sé/ prefiero no responder": ["prefiero"]}
    },
    {
        "chart_name": "Chart_YTD_P126b", "ref_chart_name": "Chart_P126b", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"YPF": ["ypf"], "Shell": ["shell"], "Axion": ["axion"], "Puma": ["puma"]}   
    },
    {
        "chart_name": "Chart_YTD_P126c", "ref_chart_name": "Chart_P126c", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {
            "La actual me queda más cerca": ["cerca"], "La anterior aumentó mas los precios": ["precios"],
            "La actual tiene mejores combustibles": ["combustibles"], "La actual parece mas confiable": ["confiable"],
            "La actual tiene un programa que me permite sumar puntos para canjear premios y beneficios": ["beneficios"],
            "La actual tiene más y/o mejores servicios adicionales": ["servicios"], "La actual tienen mejor atención": ["atenc"],
            "Otros": ["otro"] 
        }
    },
    {
        "chart_name": "Chart_YTD_P127", "ref_chart_name": "Chart_P127", "is_ytd_calculated": True,"is_percentage": False,"decimals": 0, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {
            "YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Otras": ["otra"],
            "No sé/ prefiero no responder": ["no responder"]
        }
    },         
    {
        "chart_name": "Chart_YTD_GG9", "ref_chart_name": "Chart_GG9", "is_ytd_calculated": True, "is_percentage": False,
        "remove_percentage_sign": True,"multiplier": 100.0, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"T2B": ["Algo + muy de acuerdo"], "B2B": ["Algo + muy en desacuerdo"], "No sabe/No contesta": ["Ni de acuerdo ni en desacuerdo"]}
    },
    {
        "chart_name": "Chart_YTD_GG3", "ref_chart_name": "Chart_GG3", "is_ytd_calculated": True, "is_percentage": True, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"T2B": ["si"]}
    },
    {
        "chart_name": "Chart_YTD_GG4", "ref_chart_name": "Chart_GG4", "is_ytd_calculated": True, "is_percentage": True, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"T2B": ["T2B"]}
    },
    {
        "chart_name": "Chart_YTD_GG5", "ref_chart_name": "Chart_GG5", "is_ytd_calculated": True, "is_percentage": True, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"T2B": ["T2B"]}
    },
    {
        "chart_name": "Chart_YTD_GG2", "ref_chart_name": "Chart_GG2", "is_ytd_calculated": True, "is_percentage": True, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"YPF": ["ypf"], "Empresas internacionales": ["internacionales"], "Empresas nacionales": ["nacion"], "Estado": ["estado"], "No sé": ["no"]}
    },    
    {
        "chart_name": "Chart_YTD_GG8", "ref_chart_name": "Chart_GG8", "is_ytd_calculated": True, "is_percentage": True, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"Algo": ["Algo"], "Poco + Ninguna": ["Poco + Ninguna"], "Bastante + Mucha": ["Bastante + Mucha"]}  
    },
    {
        "chart_name": "Chart_YTD_P148", "ref_chart_name": "Chart_P148", "is_ytd_calculated": True, "is_percentage": True, "multiplier": 0.01, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"T2B": ["Sí"]}  
    },            
    {
        "chart_name": "Chart_YTD_P149", "ref_chart_name": "Chart_P149", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"B2B": ["B2B"], "Ni relevante ni irrelevante": ["ni"], "T2B": ["T2B"]}  
    },
    {
        "chart_name": "Chart_YTD_P150", "ref_chart_name": "Chart_P150", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"B2B": ["B2B"], "Ni relevante ni irrelevante": ["Ni relevante ni irrelevante"], "T2B": ["T2B"]}  
    },  
    {
        "chart_name": "Chart_YTD_P20B_1", "ref_chart_name": "Chart_P20B_1", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {
            # "Nombre de la barra en el YTD (PPT)" : ["Nombre exacto de la línea en el gráfico tracking"]
            "T2B": ["Algo + muy de acuerdo"],
            "B2B": ["Algo + muy en desacuerdo"],
            "Ni de acuerdo ni en desacuerdo": ["Ni de acuerdo ni en desacuerdo"]                       
        }
    },              
    {
        "chart_name": "Chart_YTD_Index_YPF",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_Index_YPF", # Lee el gráfico que declaramos arriba
        "target_year": "YTD 26",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {
            "Índice YPF": ["Índice YPF"] # Busca la línea que se llama así en el gráfico principal
        }
    },
    {
        "chart_name": "Chart_YTD_Index_YPF_Conductores",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_Index_YPF", # Lee el gráfico que declaramos arriba
        "target_year": "YTD 26",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {
            "INDICE VDM": ["index"] # Busca la línea que se llama así en el gráfico principal
        }
    },
    {
        "chart_name": "Chart_YTD_P149", "ref_chart_name": "Chart_P149", "is_ytd_calculated": True, "is_percentage": False, "target_year": "YTD 26", "year_suffix": "26",
        "metrics": {"B2B": ["B2B"], "Ni relevante ni irrelevante": ["ni"], "T2B": ["T2B"]}  
    },    
    {
        "chart_name": "Chart_YTD_P113",
        "ref_chart_name": "Chart_P113",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Es más caro": ["caro"], "Tiene el mismo precio": ["mismo"], "Es más barato": ["barato"], "No sabe/No contesta": ["ns/nc"]}
    },
    {
        "chart_name": "Chart_YTD_P118",
        "ref_chart_name": "Chart_P118",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Subiendo más que la inflación": ["más que"], "Subiendo a la par de la inflación": ["a la par"], "Subiendo menos que la inflación": ["menos que"], "No sabe/No contesta": ["ns/nc"]}
    },
    {
        "chart_name": "Chart_YTD_P113b",
        "ref_chart_name": "Chart_P113b",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"El estado/gobierno": ["estado"],
            "Inflacion": ["inflaci"],
            "Suba del dólar/devaluacion": ["suba del"],
            "Las empresas": ["empresas"],
            "El presidente/Milei": ["milei"],
            "Otros": ["otros"],
            "Impuestos": ["impuestos"],
            "No se": ["no se"]
        }
    },
    {
        "chart_name": "Chart_YTD_P124",
        "ref_chart_name": "Chart_P124",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"es negativo ya que impacta en el precio de otros productos y genera más inflación": ["precio de otros"],
            "en ningún caso puede justificarse, la gente no puede pagar más": ["la gente no puede"],
            "hace que utilice menos el auto": ["utilice menos"],
            "hara que busque una marca más económico": ["busque una marca"],
            "es necesario para realizar inversiones y no importar combustibles en el futuro": ["realizar inversiones"],
            "es inevitable ya que los precios se encuentran atrasados": ["precios se encuentran atrasados"],
            "hará que le coloque GNC al auto": ["le coloque gnc"]
        }
    },
    {
        "chart_name": "Chart_YTD_P114",
        "ref_chart_name": "Chart_P114",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Oil": ["oil"],
            "Refinor": ["refinor"],
            "Gulf": ["gulf"],
            "Voy": ["voy"],
            "Otras": ["otras"],
            "Ns/Nc": ["ns/nc"]
        }
    },
    {
        "chart_name": "Chart_YTD_P115",
        "ref_chart_name": "Chart_P115",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Ns/Nc": ["ns/nc"]
        }
    },
    {
        "chart_name": "Chart_YTD_P116",
        "ref_chart_name": "Chart_P116",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Ns/Nc": ["ns/nc"]
        }
    },    
    {
        "chart_name": "Chart_YTD_P117",
        "ref_chart_name": "Chart_P117",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Dólar": ["dólar"],
            "Guerra": ["guerra"],
            "Inflación": ["inflación"],
            "Devaluación": ["devaluación"],
            "Impuestos": ["impuestos"],
            "Precio Internacional": ["precio internacional"],
            "Situacion economica del pais": ["situacion economica"],
            "Falta de acuerdo de precios": ["falta de acuerdo"],
            "Otras": ["otras"],
            "Ns/Nc": ["ns/nc"]
        }
    },
    {
        "chart_name": "Chart_YTD_P113c",
        "ref_chart_name": "Chart_P113c",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Ninguna": ["ninguna"],
            "Ns/Nc": ["ns/nc"]
        }
    },
    {
        "chart_name": "Chart_YTD_P113d",
        "ref_chart_name": "Chart_P113d",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Ninguna": ["ninguna"],
            "Ns/Nc": ["ns/nc"]
        }
    },
    {
        "chart_name": "Chart_YTD_P119b",
        "ref_chart_name": "Chart_P119b",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Alimentos y bebidas": ["alimentos"],
            "Servicios públicos": ["servicios"],
            "Combustibles": ["combustibles"],
            "Internet/cable/telefonía": ["internet"],	
            "Transporte": ["transporte"]
        }
    },
    {
        "chart_name": "Chart_YTD_P121",
        "ref_chart_name": "Chart_P121",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Alimentos y bebidas": ["alimentos"],
            "Combustibles": ["combustibles"],
            "Telefonia": ["telefon"],
            "Internet/cable": ["internet"],
            "Medicina prepaga": ["medicina"],
            "Colegio/materiales": ["colegio"],
            "Servicios públicos": ["servicios"],
            "Productos de cuidado personal": ["productos"],
            "Transporte": ["transporte"],
            "Indumentaria": ["indumentaria"]
        }
    },
    {
        "chart_name": "Chart_YTD_P122",
        "ref_chart_name": "Chart_P122",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"Alimentos y bebidas": ["alimentos"],
            "Combustibles": ["combustibles"],
            "Telefonia": ["telefon"],
            "Internet/cable": ["internet"],
            "Medicina prepaga": ["medicina"],
            "Colegio/materiales": ["colegio"],
            "Servicios públicos": ["servicios"],
            "Productos de cuidado personal": ["productos"],
            "Transporte": ["transporte"],
            "Indumentaria": ["indumentaria"]
        }
    },
    {
        "chart_name": "Chart_YTD_P142",
        "ref_chart_name": "Chart_P142",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"T2B": ["muy de acuerdo"],
            "B2B": ["muy en desacuerdo"]
        }
    },
    {
        "chart_name": "Chart_YTD_P146",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_P146",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"T2B": ["buena"], "B2B": ["mala"], "No sabe/No contesta": ["no sabe"]}
    },
    {
        "chart_name": "Chart_YTD_P147",
        "is_ytd_calculated": True,         
        "ref_chart_name": "Chart_P147",    
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"El cuidado del medioambiente debe ser prioritario, aunque esto signifique desaprovechar nuestras reservas de petróleo y gas y su potencial para generar divisas": ["cuidado del medioambiente"],
            "NS/NC": ["no sabe"],
            "El desarrollo de la industria petrolera debe ser una prioridad para el desarrollo del país a pesar de los efectos negativos en el medioambiente": ["desarrollo de la industria"]}
    },
    {
        "chart_name": "Chart_YTD_IM1",
        "ref_chart_name": "Chart_IM1",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM2",
        "ref_chart_name": "Chart_IM2",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM3",
        "ref_chart_name": "Chart_IM3",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM4",
        "ref_chart_name": "Chart_IM4",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM5",
        "ref_chart_name": "Chart_IM5",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM6",
        "ref_chart_name": "Chart_IM6",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM7",
        "ref_chart_name": "Chart_IM7",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM8",
        "ref_chart_name": "Chart_IM8",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM9",
        "ref_chart_name": "Chart_IM9",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM10",
        "ref_chart_name": "Chart_IM10",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM11",
        "ref_chart_name": "Chart_IM11",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM12",
        "ref_chart_name": "Chart_IM12",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM13",
        "ref_chart_name": "Chart_IM13",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM14",
        "ref_chart_name": "Chart_IM14",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM15",
        "ref_chart_name": "Chart_IM15",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"],
            "Mercado Libre": ["mercado"],
            "Aerolíneas Argentinas": ["argentinas"],
            "McDonald’s": ["mcdo"],
            "Quilmes": ["quilmes"],
            "Coca Cola": ["coca"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM17",
        "ref_chart_name": "Chart_IM17",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM18",
        "ref_chart_name": "Chart_IM18",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM19",
        "ref_chart_name": "Chart_IM19",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM20",
        "ref_chart_name": "Chart_IM20",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"]
        }
    },
    {
        "chart_name": "Chart_YTD_IM21",
        "ref_chart_name": "Chart_IM21",    
        "is_ytd_calculated": True,         
        "target_year": "YTD 2026",         
        "year_suffix": "26",               
        "is_percentage": False,
        "metrics": {"YPF": ["ypf"],
            "Shell": ["shell"],
            "Axion": ["axion"],
            "Puma": ["puma"]
        }
    }                                                                                                                                                                                                                                                                                                                                            
]
# =================================================================
# 🤖 GENERADOR AUTOMÁTICO DE GRÁFICOS DE ATRIBUTOS (P18) + YTD
# =================================================================

# 1. Sumamos el nombre de la forma YTD para tener control total
lista_atributos = [
    {
        "ppt_shape": "Chart_P18_1_Conductores", 
        "ytd_shape": "Chart_YTD_P18_1_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "productos y servicios"
    },
    {
        "ppt_shape": "Chart_P18_2_Conductores", 
        "ytd_shape": "Chart_YTD_P18_2_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "la econ"
    },
    {
        "ppt_shape": "Chart_P18_3_Conductores", 
        "ytd_shape": "Chart_YTD_P18_3_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "profesionales"
    },
    {
        "ppt_shape": "Chart_P18_4_Conductores", 
        "ytd_shape": "Chart_YTD_P18_4_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "comunidades en las que"
    },
    {
        "ppt_shape": "Chart_P18_5_Conductores", 
        "ytd_shape": "Chart_YTD_P18_5_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "orgullo"
    },                  
    {
        "ppt_shape": "Chart_P18_6_Conductores", 
        "ytd_shape": "Chart_YTD_P18_6_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "desarrollo del"
    },   
    {
        "ppt_shape": "Chart_P18_7_Conductores", 
        "ytd_shape": "Chart_YTD_P18_7_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "desarrollo tecno"
    },   
    {
        "ppt_shape": "Chart_P18_8_Conductores", 
        "ytd_shape": "Chart_YTD_P18_8_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "con el medio"
    },   
    {
        "ppt_shape": "Chart_P18_9_Conductores", 
        "ytd_shape": "Chart_YTD_P18_9_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "cercana"
    },   
    {
        "ppt_shape": "Chart_P18_10_Conductores", 
        "ytd_shape": "Chart_YTD_P18_10_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "transparentes"
    },   
    {
        "ppt_shape": "Chart_P18_11_Conductores", 
        "ytd_shape": "Chart_YTD_P18_11_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "trabajar"
    },   
    {
        "ppt_shape": "Chart_P18_12_Conductores", 
        "ytd_shape": "Chart_YTD_P18_12_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "empleo"
    },   
    {
        "ppt_shape": "Chart_P18_13_Conductores", 
        "ytd_shape": "Chart_YTD_P18_13_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "presencia"
    },   
    {
        "ppt_shape": "Chart_P18_14_Conductores", 
        "ytd_shape": "Chart_YTD_P18_14_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "trayectoria"
    },   
    {
        "ppt_shape": "Chart_P18_15_Conductores", 
        "ytd_shape": "Chart_YTD_P18_15_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "confiable"
    },   
    {
        "ppt_shape": "Chart_P18_16_Conductores", 
        "ytd_shape": "Chart_YTD_P18_16_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "buena rela"
    },   
    {
        "ppt_shape": "Chart_P18_17_Conductores", 
        "ytd_shape": "Chart_YTD_P18_17_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "igual a"
    },   
    {
        "ppt_shape": "Chart_P18_18_Conductores", 
        "ytd_shape": "Chart_YTD_P18_18_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "ya no es"
    },   
    {
        "ppt_shape": "Chart_P18_19_Conductores", 
        "ytd_shape": "Chart_YTD_P18_19_Conductores", # <-- Nombre de la forma en PPT
        "keyword": "calidad int"
    }   
]

# 2. El loop arma LOS DOS diccionarios automáticamente
graficos_bateria_P18 = []

for attr in lista_atributos:
    
    # A) EL GRÁFICO PRINCIPAL (Evolutivo Mensual)
    graficos_bateria_P18.append({
        "chart_name": attr["ppt_shape"],
        "is_table": False,
        "origen": "secundaria",
        "target_box": "t2b",
        "metrics": {
            "YPF": {"variable": "P18_YPF", "keywords": [attr["keyword"]]},
            "Shell": {"variable": "P18_SHELL", "keywords": [attr["keyword"]]},
            "Axion": {"variable": "P18_AXION", "keywords": [attr["keyword"]]},
            "Puma": {"variable": "P18_PUMA", "keywords": [attr["keyword"]]}
        }
    })

    # B) EL GRÁFICO YTD (Se calcula leyendo el gráfico anterior)
    graficos_bateria_P18.append({
        "chart_name": attr["ytd_shape"],
        "is_ytd_calculated": True,         # <--- Prende el escáner
        "ref_chart_name": attr["ppt_shape"], # <--- Le dice que lea el gráfico principal que acabamos de inyectar
        "target_year": "YTD 26",           # Ajustá esto a "YTD 2026" si en el PPT dice 2026
        "year_suffix": "26",               # El texto que busca en el eje X para promediar
        "is_percentage": False,            # Ponelo en True si las barras del YTD llevan %
        "metrics": {
            # "Nombre de la barra en el YTD" : ["Palabra a buscar en las líneas del gráfico principal"]
            # Como arriba le pusimos YPF, Shell, etc... acá buscamos exactamente eso.
            "YPF": ["YPF"],
            "Shell": ["Shell"],
            "Axion": ["Axion"],
            "Puma": ["Puma"]
        }
    })

# 3. Lo inyectamos al final de la lista principal
TRACKING_CHARTS.extend(graficos_bateria_P18)

# =========================================================
# --- 2. TABLAS ESTÁTICAS (Mapa de calor Multimarca) ------
# =========================================================

# El "Mapa de Columnas" (Variable SPSS : Número de columna en la tabla de PPT)
MAPA_MARCAS = {
    "P03": 2,      # YPF
    "P04_2": 3,    # Shell
    "P04_1": 4,    # Axion
    "P04_3": 5,    # Puma Energy
    "P04B_5": 6,   # MercadoLibre
    "P04B_8": 7,   # Quilmes
    "P04B_6": 8,   # Aerolineas Argentinas
    "P04B_7": 9,   # Coca Cola
    "P04B_4": 10   # Mc Donalds
}

# EL LOOP MÁGICO: Arma la configuración para cada marca y la suma a TRACKING_CHARTS
for variable_spss, numero_columna in MAPA_MARCAS.items():
    TRACKING_CHARTS.append({
        "chart_name": "Tabla_Heatmap_Marcas",  # ¡Asegurate de ponerle este nombre a la 2da tabla en PPT!
        "variable": variable_spss,
        "is_table": True,
        "target_box": "t2b",                   # 🎯 Fuerza matemáticamente el Top 2 Box        
        "is_static": True,                     # True = Dispara el dato a una columna fija
        "target_col": numero_columna,
        "calcular_promedio": True,
        "metrics": ATRIBUTOS_COMUNES,           # Reutilizamos el diccionario maestro
        # EL SALVAVIDAS PARA LA IA:
        "ai_table_headers": ["Atributo", "YPF", "Shell", "Axion", "Puma", "Mercado Libre", "Quilmes", "Aerolineas Argentinas", "Coca Cola", "McDonalds"]    
    })











# El "Mapa de Columnas" (Variable SPSS : Número de columna en la tabla de PPT)
MAPA_MARCAS = {
    "P18_YPF": 1,      # YPF
    "P18_SHELL": 2,    # Shell
    "P18_AXION": 3,    # Axion
    "P18_PUMA": 4
}

# EL LOOP MÁGICO: Arma la configuración para cada marca y la suma a TRACKING_CHARTS
for variable_spss, numero_columna in MAPA_MARCAS.items():
    TRACKING_CHARTS.append({
        "chart_name": "Tabla_Heatmap_Marcas_Conductores",  # ¡Asegurate de ponerle este nombre a la tabla en PPT!
        "variable": variable_spss,
        "origen": "secundaria",                # 🚀 ¡EL SALVAVIDAS! Le dice que busque en la base de conductores
        "target_box": "t2b",                   # 🎯 Fuerza matemáticamente el Top 2 Box
        "is_table": True,
        "is_static": True,                     
        "target_col": numero_columna,
        "calcular_promedio": True,
        "metrics": ATRIBUTOS_COMUNES_CONDUCTORES,           
        "ai_table_headers": ["Atributo", "YPF", "Shell", "Axion", "Puma"]    
    })


