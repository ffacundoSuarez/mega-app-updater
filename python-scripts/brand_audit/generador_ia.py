import google.generativeai as genai
import json
import logging

def redactar_titulos_con_gemini(api_key, mochila_datos):
    """
    Toma el diccionario histórico de gráficos (con su contexto), arma un mega-prompt,
    y le pide a Gemini que escriba un insight actualizado para cada diapositiva.
    """
    if not mochila_datos:
        logging.warning("La mochila de datos está vacía. No hay nada que mandarle a Gemini.")
        return {}

    genai.configure(api_key=api_key)
    
    # IMPORTANTE: Para forzar un formato de salida estricto (JSON), 
    # Gemini 1.5 Pro o Flash son excelentes. Mantenemos el que tenías.
    model = genai.GenerativeModel('gemini-2.5-flash') 

    datos_texto = json.dumps(mochila_datos, indent=2, ensure_ascii=False)

    # =========================================================
    # 🧠 EL MEGA-PROMPT EVOLUCIONADO (Storytelling con Datos)
    # =========================================================
    prompt = f"""
    Eres el Director de Inteligencia de Mercado (Insights Director) redactando los titulares ('Takeaways') para un informe ejecutivo mensual de Tracking de Marca.
    
    Tu audiencia es el C-Level de YPF. No tienen tiempo para leer lo que ya ven en el gráfico. Buscan la "lectura entre líneas": QUÉ significa el movimiento y POR QUÉ es estratégicamente relevante.
    
    Te daré un JSON con los datos de los gráficos en el orden exacto en el que aparecen en la presentación. 
    
    REGLAS DE ORO DEL COPYWRITING ANALÍTICO:
    1. CERO NÚMEROS (LEY DE HIERRO): El gráfico ya muestra los porcentajes. Está estrictamente PROHIBIDO usar el símbolo "%" o "pp" en el titular. Usa conceptos de magnitud estratégica ("crecimiento marginal", "caída abrupta", "estancamiento", "liderazgo consolidado", "quiebre de tendencia").
    2. HILO CONDUCTOR ENTRE SLIDES: Los datos están en orden secuencial. Construye una narrativa continua. Si el gráfico 2 (ej. Calidad) explica la caída del gráfico 1 (ej. Preferencia), conéctalos explícitamente (Ej: "Este retroceso en preferencia se explica por una fuerte penalización en la percepción de calidad...").
    3. EL PODER DE LA SÍNTESIS: El insight debe tener entre 12 y 20 palabras como máximo. Impactante, asertivo y fácil de leer de un vistazo.
    4. YPF ES EL PROTAGONISTA: En gráficos competitivos, YPF debe ser el sujeto principal de la oración. (Ej: En lugar de "Shell sube y alcanza a YPF", usa "YPF cede terreno y permite que Shell acorte la brecha").
    5. HERENCIA DE CONTEXTO TEMPORAL: Lee el "insight_anterior" que viene en los datos para entender de dónde venimos, pero NO repitas su estructura. Si veníamos de meses de caída y ahora subió, el titular debe enmarcarse como una "recuperación" o "freno a la sangría".
    
    FORMATO DE SALIDA ESTRICTO:
    Devuelve ÚNICAMENTE un JSON válido.
    - Claves: Nombres exactos de los gráficos.
    - Valores: El nuevo titular redactado.
    Ningún otro texto. Ningún formato Markdown fuera del JSON.

    DATOS A ANALIZAR (EN ORDEN DE PRESENTACIÓN):
    {datos_texto}
    """

    logging.info("🧠 Solicitando Insights Estratégicos a Gemini...")
    
    try:
        # Subimos un poco la temperatura (0.4) para darle riqueza de vocabulario, 
        # pero la mantenemos baja para no perder precisión numérica.
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.4, 
                # Opcional pero recomendado si usás API nativa: response_mime_type="application/json"
            )
        )
        
        texto_respuesta = response.text.strip()
        
        if texto_respuesta.startswith("```json"):
            texto_respuesta = texto_respuesta[7:]
        if texto_respuesta.startswith("```"):
            texto_respuesta = texto_respuesta[3:]
        if texto_respuesta.endswith("```"):
            texto_respuesta = texto_respuesta[:-3]
            
        texto_respuesta = texto_respuesta.strip()
            
        titulos_generados = json.loads(texto_respuesta)
        return titulos_generados

    except json.JSONDecodeError as e:
        logging.error(f"Error al decodificar el JSON de Gemini. Respuesta cruda: {response.text}")
        return {}
    except Exception as e:
        logging.error(f"Error al comunicarse con Gemini: {e}")
        return {}
    
def redactar_executive_summary(api_key, mochila_datos):
    """
    Redacta el Resumen Ejecutivo con formato de "Elevator Pitch" basado en datos.
    """
    if not mochila_datos:
        return ""

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash') 
    datos_texto = json.dumps(mochila_datos, indent=2, ensure_ascii=False)

    # =========================================================
    # 🧠 PROMPT PARA EXECUTIVE SUMMARY (Enfoque McKinsey)
    # =========================================================
    prompt = f"""
    Eres un Consultor Estratégico Senior (estilo McKinsey/Bain) redactando el "Executive Summary" para el Directorio de YPF.
    
    Vas a leer todos los datos de este Tracking Mensual y redactar un resumen implacable.
    
    ESTRUCTURA OBLIGATORIA (3 viñetas exactas):
    1. EL PANORAMA (The Big Picture): ¿Cuál es el estado de salud general de la marca YPF este mes frente a sus competidores principales? (Usa el dato más representativo).
    2. EL HALLAZGO (The Key Driver): Identifica el cambio más dramático o significativo del mes (positivo o negativo) en atributos específicos, campañas o conocimiento. ¿Qué movió la aguja?
    3. LA ADVERTENCIA / OPORTUNIDAD (The So-What): En base a los datos de tendencias, ¿qué luz amarilla hay que mirar el próximo mes o qué fortaleza hay que capitalizar de inmediato?
    
    REGLAS DE ESTILO:
    - Comienza cada viñeta con un concepto clave en MAYÚSCULAS y negritas (Ej: **LIDERAZGO SOSTENIDO:**).
    - Usa viñetas estándar (-).
    - Cada punto debe tener máximo 2 oraciones.
    - Ancla cada afirmación con un número real del JSON.
    - No uses lenguaje robótico ("El gráfico 1 muestra..."). Habla directo del negocio.
    
    DATOS DEL REPORTE:
    {datos_texto}
    """
    
    try:
        # Temperatura 0.5 para el Executive Summary, para permitirle "conectar los puntos"
        # y encontrar la narrativa global de forma más creativa.
        response = model.generate_content(
            prompt, 
            generation_config=genai.GenerationConfig(temperature=0.5)
        )
        return response.text.strip()
    except Exception as e:
        logging.error(f"Error generando el Summary: {e}")
        return "Error al generar el resumen ejecutivo."