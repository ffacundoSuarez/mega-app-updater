* Encoding: UTF-8.


compute Total =1000.
EXECUTE.




VALUE LABELS Wave
1 'Abril 2022'
2 'Mayo 2022'
3 'Junio 2022'
4 'Julio 2022'
5 'Agosto 2022'
6 'Septiembre 2022'
7 'Octubre 2022'
8 'Noviembre 2022'
9 'Diciembre 2022'
10 'Enero 2023'
11 'Febrero 2023'
12 'Marzo 2023'
13 'Abril 2023'
14 'Mayo 2023'
15 'Junio 2023'
16 'Julio 2023'
17 'Agosto 2023'
18 'Septiembre 2023'
19 'Octubre 2023'
20 'Noviembre 2023'
21 'Diciembre 2023'
22 'Enero 2024'
23 'Febrero 2024'
24 'Marzo 2024'
25 'Abril 2024'
26 'Mayo 2024'
27 'Junio 2024'
28 'Julio 2024'
29 'Agosto 2024'
30 'Septiembre 2024'
31 'Octubre 2024'
32 'Noviembre 2024'
33 'Diciembre 2024'
34 'Enero 2025'
35 'Febrero 2025'
36 'Marzo 2025'
37 'Abril 2025'
38 'Mayo 2025'
39 'Junio 2025'
40 'Julio 2025'
41 'Agosto 2025'
42 'Septiembre 2025'
43 'Octubre 2025'
44 'Noviembre 2025'
45 'Diciembre 2025'
46 'Enero 2026'
47 'Febrero 2026'
48 'Marzo 2026'
49 'Abril 2026'
50 'Mayo 2026'
51 'Junio 2026'
52 'Julio 2026'
53 'Agosto 2026'.


RECODE Wave (52 thru 53=18) (1 thru 3=1) (4 thru 6=2) (7 thru 9=3) (10 thru 12=4) (13 thru 15=5) (16 thru 
    18=6) (19 thru 21=7) (22 thru 24=8) (25 thru 27=9) (28 thru 30=10) (31 thru 33=11) (34 thru 36=12) 
    (37 thru 39=13) (40 thru 42=14) (43 thru 45=15) (46 thru 48=16) (49 thru 51=17) INTO Trimestral.
VARIABLE LABELS  Trimestral 'Trimestral'.
EXECUTE.

VALUE LABELS Trimestral
1 'Q2 2022'
2 'Q3 2022'
3 'Q4 2022'
4 'Q1 2023'
5 'Q2 2023'
6 'Q3 2023'
7 'Q4 2023'
8 'Q1 2024'
9 'Q2 2024'
10 'Q3 2024'
11 'Q4 2024'
12 'Q1 2025'
13 'Q2 2025'
14 'Q3 2025'
15 'Q4 2025'
16 'Q1 2026'
17 'Q2 2026'
18 'Q3 2026-proceso'.

RECODE Wave (1 thru 9=1) (10 thru 21=2) (22 thru 33=3) (34 thru 45=4) (46 thru 52=5) INTO YTD.
VARIABLE LABELS  YTD 'YTD'.
EXECUTE.

VALUE LABELS YTD
1 'YTD 2022'
2 'YTD 2023'
3 'YTD 2024'
4 'YTD 2025'
5 'YTD 2026'.

***Genero


COMPUTE Genero=F1.
EXECUTE.

VALUE LABELS Genero
1 'Masculino'
2 'Femenino'
3 "Otro".


***Edad

RECODE F2 (16 thru 25=1) (26 thru 35=2) (36 thru 45=3) (46 thru 55=4) (56 thru Highest=5) INTO Edad. 
EXECUTE.

VALUE LABELS Edad
1 '16-25'
2 '26-35'
3 '36-45'
4 '46-55'
5 '56 y +'.




RECODE F2 (16  thru 35=1) (36 thru 55=2) (56 thru Highest=3) INTO Edad2. 
EXECUTE.

VALUE LABELS Edad2
1 '16-35'
2 '36-55'
3 '56 y +'.
***NSE


AUTORECODE VARIABLES=ESTRATO_ARG 
 /INTO @NSE
 /PRINT.
EXECUTE.


if (@NSE>0) ESTRATO_ARG_cod= @NSE-1.


fre ESTRATO_ARG_cod .

*do if (wave=11).
if ESTRATO_ARG ="AB" NSE=1.
if ESTRATO_ARG ="C1" NSE=1.
if ESTRATO_ARG ="C2" NSE=2.
if ESTRATO_ARG ="C3" NSE=2.
if ESTRATO_ARG ="D" NSE=3.
if ESTRATO_ARG ="E" NSE=3.

EXECUTE.

If ESTRATO_ARGA1=1 NSE=1.
If ESTRATO_ARGA2=1 NSE=1.
If ESTRATO_ARGA3=1 NSE=2.
If ESTRATO_ARGA4=1 NSE=2.
If ESTRATO_ARGA5=1 NSE=3.
If ESTRATO_ARGA6=1 NSE=3.
exe. 


VALUE LABELS NSE
1 'ABC1'
2 'C2C3'
3 'D1D2'.

***Region

*do if (wave=11).

RECODE F3 (1 thru 2=1) (3 thru 25=2) INTO Region. 
EXECUTE.

VALUE LABELS Region
1 'AMBA'
2 'Resto del País'.



**RegionAmplia

*do if (wave=11).
RECODE F3 (14 15 16 =1) (6 4 =2) (23 7 24 8 =3) (5 =4) (1 2 =5) (3 17 = 6) (11 13 12 10 9 =7) (18 21 25 20 22 19 = 8) INTO Region2. 
end if.
EXECUTE.

VALUE LABELS Region2
1 "Área del sol"
2 "De los ríos"
3 "Noroeste"
4 "Mediterránea"
5 "Metropolitana"
6 "Pampena"
7 "Patagonia"
8 "Valles".


****Aprobación gob nac

*do if (wave=11).
RECODE P104 (1 thru 2=1) (3 thru 4=2) INTO Aprobacion. 
EXECUTE.

VALUE LABELS Aprobacion
1 'Aprueba'
2 'Desaprueba'.

****Auto

*do if (wave=11).
RECODE P125_4 (1=2) (0=1) INTO Auto.
RECODE P125A4 (1=2) (0=1) INTO Auto. 
EXECUTE.

VALUE LABELS Auto
1 'Posee Auto'
2 'No Posee Auto'.




***Vin

*do if (wave=11).
IF ((P126_1=1) and P126B=1) Vinculo=1.
EXECUTE.


*do if (wave=11).
IF ((P126_1=1) and P126B>1) Vinculo=2.
EXECUTE.


*do if (wave=11).
IF (Missing (P126_1=1) and  P126B=1) Vinculo=3.
EXECUTE.


*do if (wave=11).
IF (Missing (P126_1=1) and  P126B>1) Vinculo=4.
EXECUTE.

*do if (wave=11).
IF ((P125_4=1) and  missing(Vinculo)) Vinculo=5.
EXECUTE.


VARIABLE LABELS Vinculo 'Vínculo con YPF'. 

VALUE LABELS Vinculo
1 'Actual Leal'
2 'Abandonador'
3 'Nuevo'
4 'Competencia'
5 'No Posee Auto'. 

FREQUENCIES vinculo.



***********************************************


MRSETS
 /MDGROUP NAME=$Tipo LABEL='Tipo de Auto' CATEGORYLABELS=VARLABELS VARIABLES=P125_1 P125_2 P125_3
 VALUE=1
 /DISPLAY NAME=[$Tipo].


MRSETS
 /MDGROUP NAME=$P125 LABEL='Posesión de Auto' CATEGORYLABELS=VARLABELS VARIABLES=P125_1 P125_2 P125_3 P125_4 P125_99 
 VALUE=1
 /DISPLAY NAME=[$P125].


MRSETS
 /MCGROUP NAME=$P110 LABEL='Tipo de deuda' VARIABLES=
 P110_1 P110_2 P110_3 P110_4 P110_5 P110_6 P110_7 P110_8 P110_9 P110_97 
 /DISPLAY NAME=[$P110].


MRSETS
 /MDGROUP NAME=$P205_1 LABEL='Petrolera responsable' CATEGORYLABELS=VARLABELS VARIABLES=
 P205_1_1 P205_1_2 P205_1_3 P205_1_4 P205_1_5 P205_1_6 P205_1_7 P205_1_8 P205_1_9 P205_1_10 
 P205_1_11 P205_1_97 P205_1_99 VALUE=1 
 /DISPLAY NAME=[$P205_1].


MRSETS
 /MDGROUP NAME=$P205_2 LABEL='Estacion de servicio responsable' CATEGORYLABELS=VARLABELS VARIABLES=
 P205_2_1 P205_2_2 P205_2_3 P205_2_4 P205_2_97 P205_2_99 VALUE=1 
 /DISPLAY NAME=[$P205_2].

MRSETS
 /MDGROUP NAME=$P207 LABEL='Petrolera responsable' CATEGORYLABELS=VARLABELS VARIABLES=
 P205_1_1 P205_1_2 P205_1_3 P205_1_4 P205_1_5 P205_1_6 P205_1_7 P205_1_8 P205_1_9 P205_1_10 
 P205_1_11 P205_1_97 P205_1_99 VALUE=1 
 /DISPLAY NAME=[$P207].




MRSETS
 /MDGROUP NAME=$P211 LABEL='Conoce a alguien que le pasó' CATEGORYLABELS=VARLABELS VARIABLES=
 P211_1_1 P211_1_2 P211_1_3 P211_1_99 VALUE=1 
 /DISPLAY NAME=[$P211].



MRSETS
 /MDGROUP NAME=$P212 LABEL='EESS donde sucedió' CATEGORYLABELS=VARLABELS VARIABLES=
 P212_1 P212_2 P212_3 P212_4 P212_97 VALUE=1 
 /DISPLAY NAME=[$P212].



MRSETS
 /MDGROUP NAME=$P114 LABEL='Petroleras que más aumentaron' CATEGORYLABELS=VARLABELS VARIABLES=
 P114_1 P114_2 P114_3 P114_4 P114_5 P114_6 P114_7 P114_8 P114_9 P114_10 P114_11 P114_98 P114_99 VALUE=1 
 /DISPLAY NAME=[$P114].



MRSETS
 /MDGROUP NAME=$P121 LABEL='Bienes y servicios que aumentaron mas-TOP 3' CATEGORYLABELS=VARLABELS VARIABLES=
 P121_1 P121_2 P121_3 P121_4 P121_5 P121_6 P121_7 P121_8 P121_9 P121_10 P121_98 P121_99 VALUE=1 
 /DISPLAY NAME=[$P121].



MRSETS
 /MDGROUP NAME=$P122 LABEL='Bienes y servicios que aumentaron mas-TOP 3' CATEGORYLABELS=VARLABELS VARIABLES=
 P122_1 P122_2 P122_3 P122_4 P122_5 P122_6 P122_7 P122_8 P122_9 P122_10 P122_97 P122_99 VALUE=1 
 /DISPLAY NAME=[$P122].




MRSETS
 /MDGROUP NAME=$P126A LABEL='¿Dónde cargaba hace 1 año?' CATEGORYLABELS=VARLABELS VARIABLES=
 P126_1 P126_2 P126_3 P126_4 P126_97 P126_99 VALUE=1 
 /DISPLAY NAME=[$P126A].


MRSETS
 /MDGROUP NAME=$P126C LABEL='¿Dónde cargaba hace 1 año?' CATEGORYLABELS=VARLABELS VARIABLES=
 P126C_1 P126C_2 P126C_3 P126C_4 P126C_5 P126C_6 P126C_7 P126C_97 VALUE=1 
 /DISPLAY NAME=[$P126C].


MRSETS
 /MDGROUP NAME=$P131 LABEL='Bienes y Servicios del hogar' CATEGORYLABELS=VARLABELS VARIABLES=
 P131_1 P131_2 P131_3 P131_4 P131_5 P131_6 P131_99 VALUE=1 
 /DISPLAY NAME=[$P131].



*do if (wave=11).

recode p104 (3 THRU 4 = 33) ( 1 THRU 2=11) (99=99) into P104T2B.
recode P202 P203 P209 P211_1 P211_2 P211_3 P211_4 P211_5 P112_2 P112_3 P112_1 (4 thru 5=33) (3=sys) ( 1 thru 2 =11 )(99=99) into
P202T2B P203T2B P209T2B P211_1T2B P211_2T2B P211_3T2B P211_4T2B P211_5T2B P112_2T2B P112_3T2B P112_1T2B .
recode P206_1 P206_2 P206_3 P206_4 P206_5 P206_8 (4 thru 5=11) (3=sys) ( 1 thru 2 =33 )(99=99) into P206_1T2B P206_2T2B P206_3T2B P206_4T2B P206_5T2B P206_8T2B .
recode P01_A1 P01_A2 P01_A3 P01_A4 P01_A5 P01_A6 P01_A7 P01_A8 P01_A9 ( 4 thru 5 =11 ) into P01_A1T2B P01_A2T2B P01_A3T2B P01_A4T2B P01_A5T2B P01_A6T2B P01_A7T2B P01_A8T2B P01_A9T2B.
recode P01_A1 P01_A2 P01_A3 P01_A4 P01_A5 P01_A6 P01_A7 P01_A8 P01_A9 ( 3 thru 5 =111 ) into P01_A1T3B P01_A2T3B P01_A3T3B P01_A4T3B P01_A5T3B P01_A6T3B P01_A7T3B P01_A8T3B P01_A9T3B.
recode P01_A1 P01_A2 P01_A3 P01_A4 P01_A5 P01_A6 P01_A7 P01_A8 P01_A9 ( 2 thru 5 =1111)(99=99) into P01_A1T4B P01_A2T4B P01_A3T4B P01_A4T4B P01_A5T4B P01_A6T4B P01_A7T4B P01_A8T4B P01_A9T4B.
recode P107 P108 P40_A1 P40_A2 P40_A3 P40_A4 P40_A5 P40_A6 P40_A7 P40_A8 (4 thru 5=11) (3=sys) ( 1 thru 2 =33 )(99=99) into
P107T2B P108T2B P40_A1T2B P40_A2T2B P40_A3T2B P40_A4T2B P40_A5T2B P40_A6T2B P40_A7T2B P40_A8T2B.
recode P142B (5=33) (4=33) (3=99) (1=11 ) (2=11 ) into P142B_T2B.
EXECUTE.

*end if.
exe.

MRSETS /MCGROUP VARIABLES = P206_1 P206_1T2B name = $P206_1 LABEL= " ¿qué tan responsable del desabastecimiento es cada uno de los siguientes actores? - Gobierno Nacional".
MRSETS /MCGROUP VARIABLES = P206_2 P206_2T2B name = $P206_2 LABEL= " ¿qué tan responsable del desabastecimiento es cada uno de los siguientes actores? - Conflicto Ruso-Ukraniano".
MRSETS /MCGROUP VARIABLES = P206_3 P206_3T2B name = $P206_3 LABEL= " ¿qué tan responsable del desabastecimiento es cada uno de los siguientes actores? - El campo".
MRSETS /MCGROUP VARIABLES = P206_4 P206_4T2B name = $P206_4 LABEL= " ¿qué tan responsable del desabastecimiento es cada uno de los siguientes actores? - Los medios de comunicación".
MRSETS /MCGROUP VARIABLES = P206_5 P206_5T2B name = $P206_5 LABEL= " ¿qué tan responsable del desabastecimiento es cada uno de los siguientes actores? - Los países limítrofes".
MRSETS /MCGROUP VARIABLES = P206_8 P206_8T2B name = $P206_8 LABEL= " ¿qué tan responsable del desabastecimiento es cada uno de los siguientes actores? - Las empresas petroleras".

MRSETS /MCGROUP VARIABLES = P211_1 P211_1T2B name = $P211_1 LABEL= " - El desabastecimiento va a impactar en los precios de otros productos de consumo masivo".
MRSETS /MCGROUP VARIABLES = P211_2 P211_2T2B name = $P211_2 LABEL= " - Los medios se esfuerzan en visibilizar en conflicto".
MRSETS /MCGROUP VARIABLES = P211_3 P211_3T2B name = $P211_3 LABEL= " - El desabastecimiento va a afectar el desarrollo del país a largo plazo".
MRSETS /MCGROUP VARIABLES = P211_4 P211_4T2B name = $P211_4 LABEL= " - El problema del desabastecimiento hace que empeore mi opinión del Gobierno Nacional".
MRSETS /MCGROUP VARIABLES = P211_5 P211_5T2B name = $P211_5 LABEL= " - Es un conflicto que perjudica a todo el país".


MRSETS /MCGROUP VARIABLES = P112_1 P112_1T2B name = $P112_1 LABEL= "Comparando con el costo de vida de hace 2 años atrás, ¿Cuánto dirías que aumentó el precio del combustible?".
MRSETS /MCGROUP VARIABLES = P112_2 P112_2T2B name = $P112_2 LABEL= "Comparando con el costo de vida de hace 5 años atrás, ¿Cuánto dirías que aumentó el precio del combustible?".
MRSETS /MCGROUP VARIABLES = P112_3 P112_3T2B name = $P112_3 LABEL= "Comparando con el costo de vida de hace 10 años atrás, ¿Cuánto dirías que aumentó el precio del combustible?".

MRSETS /MCGROUP VARIABLES = P40_A1 P40_A1T2B name = $P40_A1 LABEL= "El aumento de precios de combustibles… - … es inevitable ya que los precios se encuentran atrasados".
MRSETS /MCGROUP VARIABLES = P40_A2 P40_A2T2B name = $P40_A2 LABEL= "El aumento de precios de combustibles… - … en ningún caso puede justificarse, ya que la gente no puede pagar más".
MRSETS /MCGROUP VARIABLES = P40_A3 P40_A3T2B name = $P40_A3 LABEL= "El aumento de precios de combustibles… - … es negativo ya que impacta en el precio de otros productos y por lo tanto genera más inflación".
MRSETS /MCGROUP VARIABLES = P40_A4 P40_A4T2B name = $P40_A4 LABEL= "El aumento de precios de combustibles… - … hará que busque una marca o tipo de combustible más económico".
MRSETS /MCGROUP VARIABLES = P40_A5 P40_A5T2B name = $P40_A5 LABEL= "El aumento de precios de combustibles… - … hace que utilice menos el auto".
MRSETS /MCGROUP VARIABLES = P40_A6 P40_A6T2B name = $P40_A6 LABEL= "El aumento de precios de combustibles… - … hará que le coloque un equipo GNC al aut".
MRSETS /MCGROUP VARIABLES = P40_A7 P40_A7T2B name = $P40_A7 LABEL= "El aumento de precios de combustibles… - …es necesario para realizar inversiones y no importar combustibles en el futuro".
MRSETS /MCGROUP VARIABLES = P40_A8 P40_A8T2B name = $P40_A8 LABEL= "El aumento de precios de combustibles… - ... hará que esté mas pendiente de los descuentos y beneficios de las marcas de combustible".

MRSETS /MCGROUP VARIABLES = P142B P142B_T2B name = $P142B LABEL= "Indícanos por favor tu grado de acuerdo/desacuerdo con la frase “El precio del combustible de YPF está en sintonía con el aumento general de los productos que consumo”".


VALUE LABELS P142B_T2B
11 'T2B'
33 'B2B'
99 'NINI'.

VALUE LABELS P01_A1T2B P01_A2T2B P01_A3T2B P01_A4T2B P01_A5T2B P01_A6T2B P01_A7T2B P01_A8T2B P01_A9T2B
11 "T2B"
111 "T3B"
1111 "T4B"
33 "B2B"
99 "NR".


VALUE LABELS P104T2B P107T2B P108T2B P202T2B P203T2B P206_1T2B P206_2T2B P206_3T2B P206_4T2B P206_5T2B P206_8T2B P209T2B P211_1T2B P211_2T2B P211_3T2B P211_4T2B P211_5T2B P112_2T2B P112_3T2B P112_1T2B
P40_A1T2B P40_A2T2B P40_A3T2B P40_A4T2B P40_A5T2B P40_A6T2B P40_A7T2B P40_A8T2B 
P02_A2_junioT2B P02_A3_junioT2B P02_A4_junioT2B P02_A5_junioT2B P02_A6_junioT2B P02_A7_junioT2B P02_A8_junioT2B P02_A1_junioT2B
 P02_A9_junioT2B P02_A1T2B P02_A2T2B P02_A3T2B P02_A4T2B P02_A5T2B P02_A6T2B P02_A7T2B P02_A8T2B P02_A9T2B
11 "T2B"
33 "B2B"
99 "NR".


*do if (wave=11).

Recode P02_A1 P02_A2 P02_A3 P02_A4 P02_A5 P02_A6 P02_A7 P02_A8 P02_A9 (1 THRU 2 = 33) (6 THRU 7 = 11) into P02_A1T2B P02_A2T2B P02_A3T2B P02_A4T2B P02_A5T2B P02_A6T2B P02_A7T2B P02_A8T2B P02_A9T2B.
Recode P02_A1 P02_A2 P02_A3 P02_A4 P02_A5 P02_A6 P02_A7 P02_A8 P02_A9 (1 THRU 3 = 333) (5 THRU 7 = 111) into P02_A1T3B P02_A2T3B P02_A3T3B P02_A4T3B P02_A5T3B P02_A6T3B P02_A7T3B P02_A8T3B P02_A9T3B.
Recode P03_01 P03_02 P03_03 P03_04 P03_05 P03_06 P03_07 P03_08 P03_09 P03_10 P03_11 P03_12 P03_13 P03_14 P03_15 P04_1_A1 P04_1_A2 P04_1_A3 P04_1_A4 P04_1_A5 P04_1_A6 P04_1_A7 P04_1_A8 P04_1_A9 P04_1_A10 P04_1_A11 P04_1_A12 P04_1_A13 P04_1_A14 P04_1_A15 P04_2_A1 P04_2_A2 P04_2_A3 P04_2_A4 P04_2_A5 P04_2_A6 P04_2_A7 P04_2_A8 P04_2_A9 P04_2_A10 P04_2_A11 P04_2_A12 P04_2_A13 P04_2_A14 P04_2_A15 P04_3_A1 P04_3_A2 P04_3_A3 P04_3_A4 P04_3_A5 P04_3_A6 P04_3_A7 P04_3_A8 P04_3_A9 P04_3_A10 P04_3_A11 P04_3_A12 P04_3_A13 P04_3_A14 P04_3_A15 P04B_4_A1 P04B_4_A2 P04B_4_A3 P04B_4_A4 P04B_4_A5 P04B_4_A6 P04B_4_A7 P04B_4_A8 P04B_4_A9 P04B_4_A10 P04B_4_A11 P04B_4_A12 P04B_4_A13 P04B_4_A14 P04B_4_A15 P04B_5_A1 P04B_5_A2 P04B_5_A3 P04B_5_A4 P04B_5_A5 P04B_5_A6 P04B_5_A7 P04B_5_A8 P04B_5_A9 P04B_5_A10 P04B_5_A11 P04B_5_A12 P04B_5_A13 P04B_5_A14 P04B_5_A15 P04B_6_A1 P04B_6_A2 P04B_6_A3 P04B_6_A4 P04B_6_A5 P04B_6_A6 P04B_6_A7 P04B_6_A8 P04B_6_A9 P04B_6_A10 P04B_6_A11 P04B_6_A12 P04B_6_A13 P04B_6_A14 P04B_6_A15 P04B_7_A1 P04B_7_A2 P04B_7_A3 P04B_7_A4 P04B_7_A5 P04B_7_A6 P04B_7_A7 P04B_7_A8 P04B_7_A9 P04B_7_A10 P04B_7_A11 P04B_7_A12 P04B_7_A13 P04B_7_A14 P04B_7_A15 P04B_8_A1 P04B_8_A2 P04B_8_A3 P04B_8_A4 P04B_8_A5 P04B_8_A6 P04B_8_A7 P04B_8_A8 P04B_8_A9 P04B_8_A10 P04B_8_A11 P04B_8_A12 P04B_8_A13 P04B_8_A14 P04B_8_A15
P04_1_28 P04_2_28 P04_3_28  P04B_4_28 P04B_5_28 P04B_6_28 P04B_7_28 P04B_8_28
 P03_29 P04_1_29 P04_2_29 P04_3_29 P04B_4_29 P04B_5_29 P04B_6_29 P04B_7_29 P04B_8_29 
(4 thru 5=11) (3=sys) ( 1 thru 2 =33 )(99=99) into P03_01T2B P03_02T2B P03_03T2B P03_04T2B P03_05T2B P03_06T2B P03_07T2B P03_08T2B P03_09T2B P03_10T2B P03_11T2B P03_12T2B P03_13T2B P03_14T2B P03_15T2B P04_1_A1T2B P04_1_A2T2B P04_1_A3T2B P04_1_A4T2B P04_1_A5T2B P04_1_A6T2B P04_1_A7T2B P04_1_A8T2B P04_1_A9T2B P04_1_A10T2B P04_1_A11T2B P04_1_A12T2B P04_1_A13T2B P04_1_A14T2B P04_1_A15T2B P04_2_A1T2B P04_2_A2T2B P04_2_A3T2B P04_2_A4T2B P04_2_A5T2B P04_2_A6T2B P04_2_A7T2B P04_2_A8T2B P04_2_A9T2B P04_2_A10T2B P04_2_A11T2B P04_2_A12T2B P04_2_A13T2B P04_2_A14T2B P04_2_A15T2B P04_3_A1T2B P04_3_A2T2B P04_3_A3T2B P04_3_A4T2B P04_3_A5T2B P04_3_A6T2B P04_3_A7T2B P04_3_A8T2B P04_3_A9T2B P04_3_A10T2B P04_3_A11T2B P04_3_A12T2B P04_3_A13T2B P04_3_A14T2B P04_3_A15T2B P04B_4_A1T2B P04B_4_A2T2B P04B_4_A3T2B P04B_4_A4T2B P04B_4_A5T2B P04B_4_A6T2B P04B_4_A7T2B P04B_4_A8T2B P04B_4_A9T2B P04B_4_A10T2B P04B_4_A11T2B P04B_4_A12T2B P04B_4_A13T2B P04B_4_A14T2B P04B_4_A15T2B P04B_5_A1T2B P04B_5_A2T2B P04B_5_A3T2B P04B_5_A4T2B P04B_5_A5T2B P04B_5_A6T2B P04B_5_A7T2B P04B_5_A8T2B P04B_5_A9T2B P04B_5_A10T2B P04B_5_A11T2B P04B_5_A12T2B P04B_5_A13T2B P04B_5_A14T2B P04B_5_A15T2B P04B_6_A1T2B P04B_6_A2T2B P04B_6_A3T2B P04B_6_A4T2B P04B_6_A5T2B P04B_6_A6T2B P04B_6_A7T2B P04B_6_A8T2B P04B_6_A9T2B P04B_6_A10T2B P04B_6_A11T2B P04B_6_A12T2B P04B_6_A13T2B P04B_6_A14T2B P04B_6_A15T2B P04B_7_A1T2B P04B_7_A2T2B P04B_7_A3T2B P04B_7_A4T2B P04B_7_A5T2B P04B_7_A6T2B P04B_7_A7T2B P04B_7_A8T2B P04B_7_A9T2B P04B_7_A10T2B P04B_7_A11T2B P04B_7_A12T2B P04B_7_A13T2B P04B_7_A14T2B P04B_7_A15T2B P04B_8_A1T2B P04B_8_A2T2B P04B_8_A3T2B P04B_8_A4T2B P04B_8_A5T2B P04B_8_A6T2B P04B_8_A7T2B P04B_8_A8T2B P04B_8_A9T2B P04B_8_A10T2B P04B_8_A11T2B P04B_8_A12T2B P04B_8_A13T2B P04B_8_A14T2B P04B_8_A15T2B
P04_1_28T2B P04_2_28T2B P04_3_28T2B P04B_4_28T2B P04B_5_28T2B P04B_6_28T2B P04B_7_28T2B P04B_8_28T2B
 P03_29T2B P04_1_29T2B P04_2_29T2B P04_3_29T2B P04B_4_29T2B P04B_5_29T2B P04B_6_29T2B P04B_7_29T2B P04B_8_29T2B .
recode P03_16 P03_17 P03_18 P03_19 P03_20 P03_21 P03_22 P03_23 P03_24 P03_25 P03_26 P03_27 P03_28
(4 thru 5=11) (3=sys) ( 1 thru 2 =33 )(99=99) into P03_16T2B P03_17T2B P03_18T2B P03_19T2B P03_20T2B P03_21T2B P03_22T2B P03_23T2B P03_24T2B P03_25T2B P03_26T2B P03_27T2B P03_28T2B.
End if.

EXECUTE.


MRSETS /MCGROUP VARIABLES = P02_A1 P02_A1T2B P02_A1T3B  name = $P02_A1 LABEL= "¿Qué imagen tenés de las siguientes empresas? - YPF".
MRSETS /MCGROUP VARIABLES = P02_A2 P02_A2T2B P02_A2T3B  name = $P02_A2 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Shell".
MRSETS /MCGROUP VARIABLES = P02_A3 P02_A3T2B P02_A3T3B  name = $P02_A3 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Axion".
MRSETS /MCGROUP VARIABLES = P02_A4 P02_A4T2B P02_A4T3B  name = $P02_A4 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Puma Energy".
MRSETS /MCGROUP VARIABLES = P02_A5 P02_A5T2B P02_A5T3B  name = $P02_A5 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Mercado Libre".

MRSETS /MCGROUP VARIABLES = P02_A6 P02_A6T2B P02_A6T3B  name = $P02_A6 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Aerolíneas Argentinas".
MRSETS /MCGROUP VARIABLES = P02_A7 P02_A7T2B P02_A7T3B  name = $P02_A7 LABEL= "¿Qué imagen tenés de las siguientes empresas? - McDonald’s".
MRSETS /MCGROUP VARIABLES = P02_A8 P02_A8T2B P02_A8T3B  name = $P02_A8 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Quilmes".
MRSETS /MCGROUP VARIABLES = P02_A9 P02_A9T2B P02_A9T3B  name = $P02_A9 LABEL= "¿Qué imagen tenés de las siguientes empresas? - Coca Cola".


 VALUE LABELS P03_01T2B P03_02T2B P03_03T2B P03_04T2B P03_05T2B P03_06T2B P03_07T2B P03_08T2B P03_09T2B P03_10T2B P03_11T2B P03_12T2B P03_13T2B P03_14T2B P03_15T2B P04_1_A1T2B P04_1_A2T2B P04_1_A3T2B P04_1_A4T2B P04_1_A5T2B P04_1_A6T2B P04_1_A7T2B P04_1_A8T2B P04_1_A9T2B P04_1_A10T2B P04_1_A11T2B P04_1_A12T2B P04_1_A13T2B P04_1_A14T2B P04_1_A15T2B P04_2_A1T2B P04_2_A2T2B P04_2_A3T2B P04_2_A4T2B P04_2_A5T2B P04_2_A6T2B P04_2_A7T2B P04_2_A8T2B P04_2_A9T2B P04_2_A10T2B P04_2_A11T2B P04_2_A12T2B P04_2_A13T2B P04_2_A14T2B P04_2_A15T2B P04_3_A1T2B P04_3_A2T2B P04_3_A3T2B P04_3_A4T2B P04_3_A5T2B P04_3_A6T2B P04_3_A7T2B P04_3_A8T2B P04_3_A9T2B P04_3_A10T2B P04_3_A11T2B P04_3_A12T2B P04_3_A13T2B P04_3_A14T2B P04_3_A15T2B P04B_4_A1T2B P04B_4_A2T2B P04B_4_A3T2B P04B_4_A4T2B P04B_4_A5T2B P04B_4_A6T2B P04B_4_A7T2B P04B_4_A8T2B P04B_4_A9T2B P04B_4_A10T2B P04B_4_A11T2B P04B_4_A12T2B P04B_4_A13T2B P04B_4_A14T2B P04B_4_A15T2B P04B_5_A1T2B P04B_5_A2T2B P04B_5_A3T2B P04B_5_A4T2B P04B_5_A5T2B P04B_5_A6T2B P04B_5_A7T2B P04B_5_A8T2B P04B_5_A9T2B P04B_5_A10T2B P04B_5_A11T2B P04B_5_A12T2B P04B_5_A13T2B P04B_5_A14T2B P04B_5_A15T2B P04B_6_A1T2B P04B_6_A2T2B P04B_6_A3T2B P04B_6_A4T2B P04B_6_A5T2B P04B_6_A6T2B P04B_6_A7T2B P04B_6_A8T2B P04B_6_A9T2B P04B_6_A10T2B P04B_6_A11T2B P04B_6_A12T2B P04B_6_A13T2B P04B_6_A14T2B P04B_6_A15T2B P04B_7_A1T2B P04B_7_A2T2B P04B_7_A3T2B P04B_7_A4T2B P04B_7_A5T2B P04B_7_A6T2B P04B_7_A7T2B P04B_7_A8T2B P04B_7_A9T2B P04B_7_A10T2B P04B_7_A11T2B P04B_7_A12T2B P04B_7_A13T2B P04B_7_A14T2B P04B_7_A15T2B P04B_8_A1T2B P04B_8_A2T2B P04B_8_A3T2B P04B_8_A4T2B P04B_8_A5T2B P04B_8_A6T2B P04B_8_A7T2B P04B_8_A8T2B P04B_8_A9T2B P04B_8_A10T2B P04B_8_A11T2B P04B_8_A12T2B P04B_8_A13T2B P04B_8_A14T2B P04B_8_A15T2B
P04_1_28T2B
P04_2_28T2B
P04_3_28T2B
P04B_4_28T2B
P04B_5_28T2B
P04B_6_28T2B
P04B_7_28T2B
P04B_8_28T2B P03_16T2B P03_17T2B P03_18T2B P03_19T2B P03_20T2B P03_21T2B P03_22T2B P03_23T2B P03_24T2B P03_25T2B P03_26T2B P03_27T2B P03_28T2B
 P03_29T2B P04_1_29T2B P04_2_29T2B P04_3_29T2B P04B_4_29T2B P04B_5_29T2B P04B_6_29T2B P04B_7_29T2B P04B_8_29T2B
11 "T2B"
33 "B2B"
99 "NR".

*do if (wave=11).
recode BL1_1 BL1_2 BL1_3 BL1_4 BL1_5 BL1_6 BL1_7 (4 thru 5=11) (3=sys) ( 1 thru 2 =33 )(99=99) Into BL1_1T2B BL1_2T2B BL1_3T2B BL1_4T2B BL1_5T2B BL1_6T2B BL1_7T2B.


VALUE LABELS BL1_1T2B BL1_2T2B BL1_3T2B BL1_4T2B BL1_5T2B BL1_6T2B BL1_7T2B
11 "T2B"
33 "B2B"
99 "NR".
EXECUTE.

MRSETS /MCGROUP VARIABLES = BL1_1 BL1_1T2B name = $BL1_1 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - Me considero un consumidor leal a la marca YPF".
MRSETS /MCGROUP VARIABLES = BL1_2 BL1_2T2B name = $BL1_2 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - YPF sería mi primera opción de carga de combustible".
MRSETS /MCGROUP VARIABLES = BL1_3 BL1_3T2B name = $BL1_3 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - No iría a otra estación de servicio si YPF estuviese disponible en la zona donde circulo".
MRSETS /MCGROUP VARIABLES = BL1_4 BL1_4T2B name = $BL1_4 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - Recomendaría YPF a otros conductores".
MRSETS /MCGROUP VARIABLES = BL1_5 BL1_5T2B name = $BL1_5 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - El precio de otra marca debería ser considerablemente inferior para no elegir YPF".
MRSETS /MCGROUP VARIABLES = BL1_6 BL1_6T2B name = $BL1_6 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - Si hay otra marca tan buena como YPF, prefiero ir a YPF".
MRSETS /MCGROUP VARIABLES = BL1_7 BL1_7T2B name = $BL1_7 LABEL= "Indica tu nivel de acuerdo con las siguientes frases en relación con YPF. - YPF es una empresa argentina".




*do if (wave=11).

Recode BS1_1 BS1_2 BS1_3 BS1_4 BS1_5 BS1_6 BS1_7 BS1_8 BS1_9 BP1_1 BP1_2 BP1_3 BP1_4 BP1_5 BP1_6 BP1_7 BP1_8 BP1_9 BP2_1 BP2_2 BP2_3 BP2_4 BP2_5 BP2_6 BP2_7 BP2_8 BP2_9
(9 thru 10 = 11) (1 THRU 2 =33 ) Into BS1_1T2B BS1_2T2B BS1_3T2B BS1_4T2B BS1_5T2B BS1_6T2B BS1_7T2B BS1_8T2B BS1_9T2B BP1_1T2B BP1_2T2B BP1_3T2B BP1_4T2B BP1_5T2B BP1_6T2B BP1_7T2B BP1_8T2B BP1_9T2B BP2_1T2B BP2_2T2B BP2_3T2B BP2_4T2B BP2_5T2B BP2_6T2B BP2_7T2B BP2_8T2B BP2_9T2B.

Recode BS1_1 BS1_2 BS1_3 BS1_4 BS1_5 BS1_6 BS1_7 BS1_8 BS1_9 BP1_1 BP1_2 BP1_3 BP1_4 BP1_5 BP1_6 BP1_7 BP1_8 BP1_9 BP2_1 BP2_2 BP2_3 BP2_4 BP2_5 BP2_6 BP2_7 BP2_8 BP2_9
(8 thru 10 = 111)(1 THRU 3 =333 ) Into BS1_1T3B BS1_2T3B BS1_3T3B BS1_4T3B BS1_5T3B BS1_6T3B BS1_7T3B BS1_8T3B BS1_9T3B BP1_1T3B BP1_2T3B BP1_3T3B BP1_4T3B BP1_5T3B BP1_6T3B BP1_7T3B BP1_8T3B BP1_9T3B BP2_1T3B BP2_2T3B BP2_3T3B BP2_4T3B BP2_5T3B BP2_6T3B BP2_7T3B BP2_8T3B BP2_9T3B.

Recode BS1_1 BS1_2 BS1_3 BS1_4 BS1_5 BS1_6 BS1_7 BS1_8 BS1_9 BP1_1 BP1_2 BP1_3 BP1_4 BP1_5 BP1_6 BP1_7 BP1_8 BP1_9 BP2_1 BP2_2 BP2_3 BP2_4 BP2_5 BP2_6 BP2_7 BP2_8 BP2_9
(7 thru 10 = 1111)(1 THRU 4 =3333 ) Into BS1_1T4B BS1_2T4B BS1_3T4B BS1_4T4B BS1_5T4B BS1_6T4B BS1_7T4B BS1_8T4B BS1_9T4B BP1_1T4B BP1_2T4B BP1_3T4B BP1_4T4B BP1_5T4B BP1_6T4B BP1_7T4B BP1_8T4B BP1_9T4B BP2_1T4B BP2_2T4B BP2_3T4B BP2_4T4B BP2_5T4B BP2_6T4B BP2_7T4B BP2_8T4B BP2_9T4B.

Recode BS1_1 BS1_2 BS1_3 BS1_4 BS1_5 BS1_6 BS1_7 BS1_8 BS1_9 BP1_1 BP1_2 BP1_3 BP1_4 BP1_5 BP1_6 BP1_7 BP1_8 BP1_9 BP2_1 BP2_2 BP2_3 BP2_4 BP2_5 BP2_6 BP2_7 BP2_8 BP2_9
(6 thru 10 = 11111)(1 THRU 5 =33333 ) Into BS1_1T5B BS1_2T5B BS1_3T5B BS1_4T5B BS1_5T5B BS1_6T5B BS1_7T5B BS1_8T5B BS1_9T5B BP1_1T5B BP1_2T5B BP1_3T5B BP1_4T5B BP1_5T5B BP1_6T5B BP1_7T5B BP1_8T5B BP1_9T5B BP2_1T5B BP2_2T5B BP2_3T5B BP2_4T5B BP2_5T5B BP2_6T5B BP2_7T5B BP2_8T5B BP2_9T5B.



EXECUTE.


Value labels BS1_1T2B BS1_2T2B BS1_3T2B BS1_4T2B BS1_5T2B BS1_6T2B BS1_7T2B BS1_8T2B BS1_9T2B BP1_1T2B BP1_2T2B BP1_3T2B BP1_4T2B BP1_5T2B BP1_6T2B BP1_7T2B BP1_8T2B BP1_9T2B BP2_1T2B BP2_2T2B BP2_3T2B BP2_4T2B BP2_5T2B BP2_6T2B BP2_7T2B BP2_8T2B BP2_9T2B
BS1_1T3B BS1_2T3B BS1_3T3B BS1_4T3B BS1_5T3B BS1_6T3B BS1_7T3B BS1_8T3B BS1_9T3B BP1_1T3B BP1_2T3B BP1_3T3B BP1_4T3B BP1_5T3B BP1_6T3B BP1_7T3B BP1_8T3B BP1_9T3B BP2_1T3B BP2_2T3B BP2_3T3B BP2_4T3B BP2_5T3B BP2_6T3B BP2_7T3B BP2_8T3B BP2_9T3B
BS1_1T4B BS1_2T4B BS1_3T4B BS1_4T4B BS1_5T4B BS1_6T4B BS1_7T4B BS1_8T4B BS1_9T4B BP1_1T4B BP1_2T4B BP1_3T4B BP1_4T4B BP1_5T4B BP1_6T4B BP1_7T4B BP1_8T4B BP1_9T4B BP2_1T4B BP2_2T4B BP2_3T4B BP2_4T4B BP2_5T4B BP2_6T4B BP2_7T4B BP2_8T4B BP2_9T4B
BS1_1T5B BS1_2T5B BS1_3T5B BS1_4T5B BS1_5T5B BS1_6T5B BS1_7T5B BS1_8T5B BS1_9T5B BP1_1T5B BP1_2T5B BP1_3T5B BP1_4T5B BP1_5T5B BP1_6T5B BP1_7T5B BP1_8T5B BP1_9T5B BP2_1T5B BP2_2T5B BP2_3T5B BP2_4T5B BP2_5T5B BP2_6T5B BP2_7T5B BP2_8T5B BP2_9T5B
 11 "T2B"
111 "T3B"
1111 "T4B"
11111 "T5B"
33 "B2B"
333 "B3B"
3333 "B4B"
33333 "B5B"



Value labels 
 P02_A1T3B P02_A2T3B P02_A3T3B P02_A4T3B P02_A5T3B P02_A6T3B P02_A7T3B P02_A8T3B P02_A9T3B
P02_A1T2B P02_A2T2B P02_A3T2B P02_A4T2B P02_A5T2B P02_A6T2B P02_A7T2B P02_A8T2B P02_A9T2B
 11 "T2B"
111 "T3B"
33 "B2B"
333 "B3B".


Value labels 
 P01_A1T2B P01_A2T2B P01_A3T2B P01_A4T2B P01_A5T2B P01_A6T2B P01_A7T2B P01_A8T2B P01_A9T2B
P01_A1T3B P01_A2T3B P01_A3T3B P01_A4T3B P01_A5T3B P01_A6T3B P01_A7T3B P01_A8T3B P01_A9T3B
P01_A1T4B P01_A2T4B P01_A3T4B P01_A4T4B P01_A5T4B P01_A6T4B P01_A7T4B P01_A8T4B P01_A9T4B
 11 "T2B"
111 "T3B"
1111 "T4B".



MRSETS /MCGROUP VARIABLES = BS1_1 BS1_1T2B BS1_1T3B BS1_1T4B BS1_1T5B name = $BS1_1 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de YPF.".
MRSETS /MCGROUP VARIABLES = BS1_2 BS1_2T2B BS1_2T3B BS1_2T4B BS1_2T5B name = $BS1_2 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Shell.".
MRSETS /MCGROUP VARIABLES = BS1_3 BS1_3T2B BS1_3T3B BS1_3T4B BS1_3T5B name = $BS1_3 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Axion.".
MRSETS /MCGROUP VARIABLES = BS1_4 BS1_4T2B BS1_4T3B BS1_4T4B BS1_4T5B name = $BS1_4 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Puma Energy.".
MRSETS /MCGROUP VARIABLES = BS1_5 BS1_5T2B BS1_5T3B BS1_5T4B BS1_5T5B name = $BS1_5 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Mercado Libre.".
MRSETS /MCGROUP VARIABLES = BS1_6 BS1_6T2B BS1_6T3B BS1_6T4B BS1_6T5B name = $BS1_6 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Aerolíneas Argentinas.".
MRSETS /MCGROUP VARIABLES = BS1_7 BS1_7T2B BS1_7T3B BS1_7T4B BS1_7T5B name = $BS1_7 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de McDonald’s.".
MRSETS /MCGROUP VARIABLES = BS1_8 BS1_8T2B BS1_8T3B BS1_8T4B BS1_8T5B name = $BS1_8 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Quilmes.".
MRSETS /MCGROUP VARIABLES = BS1_9 BS1_9T2B BS1_9T3B BS1_9T4B BS1_9T5B name = $BS1_9 LABEL= "Califica en una escala de 1 a 10 qué tan cerca te sientes de Coca Cola.".
MRSETS /MCGROUP VARIABLES = BP1_1 BP1_1T2B BP1_1T3B BP1_1T4B BP1_1T5B name = $BP1_1 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a YPF en términos de la siguiente frase: “una empresa comprometida con el desarrollo del país”.".
MRSETS /MCGROUP VARIABLES = BP1_2 BP1_2T2B BP1_2T3B BP1_2T4B BP1_2T5B name = $BP1_2 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Shell en términos de la siguiente frase: “una empresa comprometida con el desarrollo del país”.".
MRSETS /MCGROUP VARIABLES = BP1_3 BP1_3T2B BP1_3T3B BP1_3T4B BP1_3T5B name = $BP1_3 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Axion en términos de la siguiente frase: “una empresa comprometida con el desarrollo del país”.".
MRSETS /MCGROUP VARIABLES = BP1_4 BP1_4T2B BP1_4T3B BP1_4T4B BP1_4T5B name = $BP1_4 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP1_5 BP1_5T2B BP1_5T3B BP1_5T4B BP1_5T5B name = $BP1_5 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP1_6 BP1_6T2B BP1_6T3B BP1_6T4B BP1_6T5B name = $BP1_6 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP1_7 BP1_7T2B BP1_7T3B BP1_7T4B BP1_7T5B name = $BP1_7 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP1_8 BP1_8T2B BP1_8T3B BP1_8T4B BP1_8T5B name = $BP1_8 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP1_9 BP1_9T2B BP1_9T3B BP1_9T4B BP1_9T5B name = $BP1_9 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Coca Cola en términos de la siguiente frase: “una empresa comprometida con el desarrollo del país”.".
MRSETS /MCGROUP VARIABLES = BP2_1 BP2_1T2B BP2_1T3B BP2_1T4B BP2_1T5B name = $BP2_1 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a YPF en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_2 BP2_2T2B BP2_2T3B BP2_2T4B BP2_2T5B name = $BP2_2 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Shell en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_3 BP2_3T2B BP2_3T3B BP2_3T4B BP2_3T5B name = $BP2_3 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Axion en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_4 BP2_4T2B BP2_4T3B BP2_4T4B BP2_4T5B name = $BP2_4 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Puma Energy en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_5 BP2_5T2B BP2_5T3B BP2_5T4B BP2_5T5B name = $BP2_5 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Mercado Libre en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_6 BP2_6T2B BP2_6T3B BP2_6T4B BP2_6T5B name = $BP2_6 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Aerolíneas Argentinas en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_7 BP2_7T2B BP2_7T3B BP2_7T4B BP2_7T5B name = $BP2_7 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_8 BP2_8T2B BP2_8T3B BP2_8T4B BP2_8T5B name = $BP2_8 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".
MRSETS /MCGROUP VARIABLES = BP2_9 BP2_9T2B BP2_9T3B BP2_9T4B BP2_9T5B name = $BP2_9 LABEL= "Califica en una escala de 1 (pésima) a 10 (excelente) a Quilmes en términos de la siguiente frase: “una empresa comprometida con el medio ambiente”.".


*do if (wave=11).

rECODE BS1_1 BS1_2 BS1_3 BS1_4 BS1_5 BS1_6 BS1_7 BS1_8 P20 P23
(4 thru 5=33) (3=sys) ( 1 thru 2 =11 )(99=99) Into BS1_1T2B BS1_2T2B BS1_3T2B BS1_4T2B BS1_5T2B BS1_6T2B BS1_7T2B BS1_8T2B P20T2B P23T2B.
rECODE P13  ( 1 THRU 2=11) (3 THRU 4 =33 )(99=99) into P13T2B   .
rECODE  P18_1 ( 1 THRU 2=11) (99=99) into  P18_1T2B  .
rECODE P12_1 P12_2 P12_3 P12_4 P12_5 P12_6 P12_7 P12_8 P12_9 P12_13 P11_1 P11_2 P11_3 P11_4 P11_5 P11_6 P11_7 P11_8 P11_9 P11_12 P16_A1 P16_A2 P16_A3 P16_A4 P16_A5 P16_A6
(4 thru 5=11) (3=sys) ( 1 thru 2 =33 )(99=99) into P12_1T2B P12_2T2B P12_3T2B P12_4T2B P12_5T2B P12_6T2B P12_7T2B P12_8T2B P12_9T2B P12_13T2B P11_1T2B P11_2T2B P11_3T2B P11_4T2B P11_5T2B P11_6T2B P11_7T2B P11_8T2B P11_9T2B P11_12T2B P16_A1T2B P16_A2T2B P16_A3T2B P16_A4T2B P16_A5T2B P16_A6T2B.
rECODE	P12_1	P12_2	P12_3	P12_4	P12_5	P12_6	P12_7	P12_8	P12_9  P12_13
(3 THRU 5 = 111) 	into							
	P12_1T3B	P12_2T3B	P12_3T3B	P12_4T3B	P12_5T3B	P12_6T3B	P12_7T3B	P12_8T3B	P12_9T3B  P12_13T3B.
								
rECODE	P11_1	P11_2	P11_3	P11_4	P11_5	P11_6	P11_7	P11_8	P11_9  P11_12
(2 THRU 5 = 1111) 	into							
	P11_1T4B	P11_2T4B	P11_3T4B	P11_4T4B	P11_5T4B	P11_6T4B	P11_7T4B	P11_8T4B	P11_9T4B  P11_12T4B.

*end if.
EXECUTE.



Value labels BS1_1T2B BS1_2T2B BS1_3T2B BS1_4T2B BS1_5T2B BS1_6T2B BS1_7T2B BS1_8T2B P11_1T2B P11_2T2B P11_3T2B P11_4T2B P11_5T2B P11_6T2B P11_7T2B P11_8T2B P11_9T2B  P11_12T2B P16_A1T2B P16_A2T2B P16_A3T2B P16_A4T2B P16_A5T2B P16_A6T2B P20T2B P23T2B
P13T2B P18_1T2B P12_1T2B P12_2T2B P12_3T2B P12_4T2B P12_5T2B P12_6T2B P12_7T2B P12_8T2B P12_9T2B P12_13T2B 
11 "T2B"
33 "B2B".
EXECUTE.

Value labels P12_1T3B	P12_2T3B	P12_3T3B	P12_4T3B	P12_5T3B	P12_6T3B	P12_7T3B	P12_8T3B P12_9T3B  P12_13T3B
111 "T3B".

Value labels P11_1T4B	P11_2T4B	P11_3T4B	P11_4T4B	P11_5T4B	P11_6T4B	P11_7T4B	P11_8T4B P11_9T4B  P11_12T4B
1111 "T4B".

MRSETS	/MCGROUP	VARIABLES	=	P11_1	P11_1T2B	P11_1T4B	name	=	$P11_A1	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF LUZ.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_2	P11_2T2B	P11_2T4B	name	=	$P11_A2	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - Y-TEC.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_3	P11_3T2B	P11_3T4B	name	=	$P11_A3	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF GAS.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_4	P11_4T2B	P11_4T4B	name	=	$P11_A4	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF AGRO.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_5	P11_5T2B	P11_5T4B	name	=	$P11_A5	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - Fundación YPF.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_6	P11_6T2B	P11_6T4B	name	=	$P11_A6	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF SOLAR.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_7	P11_7T2B	P11_7T4B	name	=	$P11_A7	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF QUIMICA.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_8	P11_8T2B	P11_8T4B	name	=	$P11_A8	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF LITIO.	".
MRSETS	/MCGROUP	VARIABLES	=	P11_9	P11_9T2B	P11_9T4B	name	=	$P11_A9	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - ARGENTINA LNG	".
MRSETS	/MCGROUP	VARIABLES	=	P11_12	P11_12T2B	P11_12T4B	name	=	$P11_A12	LABEL="	¿Cuál de las siguientes empresas / áreas de YPF conocés? ¿Cuánto las conocés? - YPF Minería	".
														
												
MRSETS	/MCGROUP	VARIABLES	=	P12_1	P12_1T2B	P12_1T3B	name	=	$P12_A1	LABEL="	¿Qué imagen tenés de cada una? - YPF LUZ.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_2	P12_2T2B	P12_2T3B	name	=	$P12_A2	LABEL="	¿Qué imagen tenés de cada una? - Y-TEC.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_3	P12_3T2B	P12_3T3B	name	=	$P12_A3	LABEL="	¿Qué imagen tenés de cada una? - YPF GAS.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_4	P12_4T2B	P12_4T3B	name	=	$P12_A4	LABEL="	¿Qué imagen tenés de cada una? - YPF AGRO.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_5	P12_5T2B	P12_5T3B	name	=	$P12_A5	LABEL="	¿Qué imagen tenés de cada una? - Fundación YPF.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_6	P12_6T2B	P12_6T3B	name	=	$P12_A6	LABEL="	¿Qué imagen tenés de cada una? - YPF SOLAR.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_7	P12_7T2B	P12_7T3B	name	=	$P12_A7	LABEL="	¿Qué imagen tenés de cada una? - YPF QUIMICA.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_8	P12_8T2B	P12_8T3B	name	=	$P12_A8	LABEL="	¿Qué imagen tenés de cada una? - YPF LITIO.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_9	P12_9T2B	P12_9T3B	name	=	$P12_A9	LABEL="	¿Qué imagen tenés de cada una? - ARGENTINA LNG.	".
MRSETS	/MCGROUP	VARIABLES	=	P12_13	P12_13T2B	P12_13T3B	name	=	$P12_A13	LABEL="	¿Qué imagen tenés de cada una? - YPF Minería	".



RECODE P15_1 P15_2 P15_3 P15_4 (9 thru 10 = 11) (0 THRU 1 =33 ) Into P15_1T2B P15_2T2B P15_3T2B P15_4T2B .
RECODE P15_1 P15_2 P15_3 P15_4 (8 thru 10 = 111)(0 THRU 2 =333 ) Into P15_1T3B P15_2T3B P15_3T3B P15_4T3B .
RECODE P15_1 P15_2 P15_3 P15_4 (7 thru 10 = 1111)(0 THRU 3 =3333 ) INTO P15_1T4B P15_2T4B P15_3T4B P15_4T4B .
RECODE P15_1 P15_2 P15_3 P15_4 (6 thru 10 = 11111)(0 THRU 4 =33333 ) (5=sys) Into P15_1T5B P15_2T5B P15_3T5B P15_4T5B .



Value labels P15_1T2B P15_2T2B P15_3T2B P15_4T2B
P15_1T3B P15_2T3B P15_3T3B P15_4T3B
P15_1T4B P15_2T4B P15_3T4B P15_4T4B
P15_1T5B P15_2T5B P15_3T5B P15_4T5B
P10_A1.0T2B_rec P10_A2.0T2B_rec P10_A3.0T2B_rec P10_A4.0T2B_rec P10_A5.0T2B_rec
11 "T2B"
111 "T3B"
1111 "T4B"
11111 "T5B"
33 "B2B"
333 "B3B"
3333 "B4B"
33333 "B5B".
EXECUTE.


MRSETS /MCGROUP VARIABLES = P15_1 P15_1T2B P15_1T3B P15_1T4B P15_1T5B name = $P15_1 LABEL= " Pensando en la transparencia/corrupción de las empresas ¿Dónde ubicarías a YPF?".
MRSETS /MCGROUP VARIABLES = P15_2 P15_2T2B P15_2T3B P15_2T4B P15_2T5B name = $P15_2 LABEL= " Pensando en la transparencia/corrupción de las empresas ¿Dónde ubicarías a SHELL?".
MRSETS /MCGROUP VARIABLES = P15_3 P15_3T2B P15_3T3B P15_3T4B P15_3T5B name = $P15_3 LABEL= " Pensando en la transparencia/corrupción de las empresas ¿Dónde ubicarías a AXION Energy?".
MRSETS /MCGROUP VARIABLES = P15_4 P15_4T2B P15_4T3B P15_4T4B P15_4T5B name = $P15_4 LABEL= " Pensando en la transparencia/corrupción de las empresas ¿Dónde ubicarías a PUMA Energy?".

MRSETS /MCGROUP VARIABLES = P16_A1 P16_A1T2B name = $P16_A1 LABEL= "Es muy importante para nuestro país desarrollar Vaca Muerta".
MRSETS /MCGROUP VARIABLES = P16_A2 P16_A2T2B name = $P16_A2 LABEL= "Nuestro país tiene la capacidad y el conocimiento de desarrollar Vaca Muerta".
MRSETS /MCGROUP VARIABLES = P16_A3 P16_A3T2B name = $P16_A3 LABEL= "Para poder desarrollar Vaca Muerta será necesario atraer inversiones extranjeras".
MRSETS /MCGROUP VARIABLES = P16_A4 P16_A4T2B name = $P16_A4 LABEL= "Desarrollar Vaca Muerta genera un impacto muy negativo en el medioambiente".
MRSETS /MCGROUP VARIABLES = P16_A5 P16_A5T2B name = $P16_A5 LABEL= "Desarrollar Vaca Muerta genera un impacto positivo a nivel de desarrollo social".
MRSETS /MCGROUP VARIABLES = P16_A6 P16_A6T2B name = $P16_A6 LABEL= "El desarrollo de Vaca Muerta justifica el aumento de los combustibles".






MRSETS /MCGROUP VARIABLES = P01_A1 P01_A1T2B P01_A1T3B P01_A1T4B name = $P01_A1 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - YPF ".
MRSETS /MCGROUP VARIABLES = P01_A2 P01_A2T2B P01_A2T3B P01_A2T4B name = $P01_A2 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Shell ".
MRSETS /MCGROUP VARIABLES = P01_A3 P01_A3T2B P01_A3T3B P01_A3T4B name = $P01_A3 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Axion ".
MRSETS /MCGROUP VARIABLES = P01_A4 P01_A4T2B P01_A4T3B P01_A4T4B name = $P01_A4 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Puma Energy ".
MRSETS /MCGROUP VARIABLES = P01_A5 P01_A5T2B P01_A5T3B P01_A5T4B name = $P01_A5 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Mercado Libre ".
MRSETS /MCGROUP VARIABLES = P01_A6 P01_A6T2B P01_A6T3B P01_A6T4B name = $P01_A6 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Aerolíneas Argentinas ".
MRSETS /MCGROUP VARIABLES = P01_A7 P01_A7T2B P01_A7T3B P01_A7T4B name = $P01_A7 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - McDonald’s ".
MRSETS /MCGROUP VARIABLES = P01_A8 P01_A8T2B P01_A8T3B P01_A8T4B name = $P01_A8 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Quilmes ".
MRSETS /MCGROUP VARIABLES = P01_A9 P01_A9T2B P01_A9T3B P01_A9T4B name = $P01_A9 LABEL= " ¿Qué nivel de conocimiento tenés de las siguientes empresas? - Coca Cola ".

***********************************


*do if (wave=11).
Recode P105_1 (1=1).
Recode P105_2 (1=2).
Recode P105_3 (1=3).
Recode P105_4 (1=4).
Recode P105_5 (1=5).
Recode P105_6 (1=6).
Recode P105_7 (1=7).
Recode P105_8 (1=8).
Recode P105_97 (1=97).
End if.
EXECUTE.


*do if (wave=11).
Recode P110_1 (1=11).
Recode P110_2 (1=12).
Recode P110_3 (1=13).
Recode P110_4 (1=14).
Recode P110_5 (1=15).
Recode P110_6 (1=16).
Recode P110_7 (1=17).
Recode P110_8 (1=18).
Recode P110_9 (1=19).
Recode P110_97 (1=97).
End if.
EXECUTE.

MRSETS /MCGROUP VARIABLES = P03_01 P03_01T2B name = $P03_01 LABEL= " YPF . - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P03_02 P03_02T2B name = $P03_02 LABEL= " YPF . - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P03_03 P03_03T2B name = $P03_03 LABEL= " YPF . - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P03_04 P03_04T2B name = $P03_04 LABEL= " YPF . - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P03_05 P03_05T2B name = $P03_05 LABEL= " YPF . - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P03_06 P03_06T2B name = $P03_06 LABEL= " YPF . - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P03_07 P03_07T2B name = $P03_07 LABEL= " YPF . - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P03_08 P03_08T2B name = $P03_08 LABEL= " YPF . - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P03_09 P03_09T2B name = $P03_09 LABEL= " YPF . - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P03_10 P03_10T2B name = $P03_10 LABEL= " YPF . - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P03_11 P03_11T2B name = $P03_11 LABEL= " YPF . - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P03_12 P03_12T2B name = $P03_12 LABEL= " YPF . - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P03_13 P03_13T2B name = $P03_13 LABEL= " YPF . - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P03_14 P03_14T2B name = $P03_14 LABEL= " YPF . - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P03_15 P03_15T2B name = $P03_15 LABEL= " YPF . - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P03_16 P03_16T2B name = $P03_16 LABEL = " YPF. - Tiene un rol estratégico en el desarrollo energético de Argentina ".
MRSETS /MCGROUP VARIABLES = P03_17 P03_17T2B name = $P03_17 LABEL = " YPF. - Se viene modernizando y renovando en los últimos años ".
MRSETS /MCGROUP VARIABLES = P03_18 P03_18T2B name = $P03_18 LABEL = " YPF. - YPF. - Es una empresa que trae innovaciones tecnológicas ".
MRSETS /MCGROUP VARIABLES = P03_19 P03_19T2B name = $P03_19 LABEL = " YPF. - Es una empresa que no progresa, está estancada ".
MRSETS /MCGROUP VARIABLES = P03_20 P03_20T2B name = $P03_20 LABEL = " YPF. - La APP de YPF muestra que están a la vanguardia en tecnología ".
MRSETS /MCGROUP VARIABLES = P03_21 P03_21T2B name = $P03_21 LABEL = " YPF. - Responde a las necesidades de sus clientes ".
MRSETS /MCGROUP VARIABLES = P03_22 P03_22T2B name = $P03_22 LABEL = " YPF. - Los playeros de YPF tienen muy buena atención ".
MRSETS /MCGROUP VARIABLES = P03_23 P03_23T2B name = $P03_23 LABEL = " YPF. - Es práctica, podes resolver un montón de cosas en el mismo lugar ".
MRSETS /MCGROUP VARIABLES = P03_24 P03_24T2B name = $P03_24 LABEL = " YPF. - Los combustibles YPF tienen los precios más accesibles ".
MRSETS /MCGROUP VARIABLES = P03_25 P03_25T2B name = $P03_25 LABEL = " YPF. - Tiene muy buenas promociones que te permite ahorrar ".
MRSETS /MCGROUP VARIABLES = P03_26 P03_26T2B name = $P03_26 LABEL = " YPF. - Cargar en YPF es una tradición familiar, lo herede de mi familia ".
MRSETS /MCGROUP VARIABLES = P03_27 P03_27T2B name = $P03_27 LABEL = " YPF. - Me siento cómodo en YPF, siento como si fuera mi casa ".
MRSETS /MCGROUP VARIABLES = P03_28 P03_28T2B name = $P03_28 LABEL = " YPF. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P03_29 P03_29T2B name = $P03_29 LABEL = " YPF. - Es una empresa con productos de calidad internacional".



MRSETS /MCGROUP VARIABLES = P04_1_A1 P04_1_A1T2B name = $P04_1_A1 LABEL= " AXION. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04_1_A2 P04_1_A2T2B name = $P04_1_A2 LABEL= " AXION. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04_1_A3 P04_1_A3T2B name = $P04_1_A3 LABEL= " AXION. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04_1_A4 P04_1_A4T2B name = $P04_1_A4 LABEL= " AXION. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04_1_A5 P04_1_A5T2B name = $P04_1_A5 LABEL= " AXION. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04_1_A6 P04_1_A6T2B name = $P04_1_A6 LABEL= " AXION. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04_1_A7 P04_1_A7T2B name = $P04_1_A7 LABEL= " AXION. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04_1_A8 P04_1_A8T2B name = $P04_1_A8 LABEL= " AXION. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04_1_A9 P04_1_A9T2B name = $P04_1_A9 LABEL= " AXION. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04_1_A10 P04_1_A10T2B name = $P04_1_A10 LABEL= " AXION. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04_1_A11 P04_1_A11T2B name = $P04_1_A11 LABEL= " AXION. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04_1_A12 P04_1_A12T2B name = $P04_1_A12 LABEL= " AXION. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04_1_A13 P04_1_A13T2B name = $P04_1_A13 LABEL= " AXION. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04_1_A14 P04_1_A14T2B name = $P04_1_A14 LABEL= " AXION. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04_1_A15 P04_1_A15T2B name = $P04_1_A15 LABEL= " AXION. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04_1_28 P04_1_28T2B name = $P04_1_28 LABEL = " AXION. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04_1_29 P04_1_29T2B name = $P04_1_29 LABEL = " AXION. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04_2_A1 P04_2_A1T2B name = $P04_2_A1 LABEL= " SHELL. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04_2_A2 P04_2_A2T2B name = $P04_2_A2 LABEL= " SHELL. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04_2_A3 P04_2_A3T2B name = $P04_2_A3 LABEL= " SHELL. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04_2_A4 P04_2_A4T2B name = $P04_2_A4 LABEL= " SHELL. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04_2_A5 P04_2_A5T2B name = $P04_2_A5 LABEL= " SHELL. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04_2_A6 P04_2_A6T2B name = $P04_2_A6 LABEL= " SHELL. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04_2_A7 P04_2_A7T2B name = $P04_2_A7 LABEL= " SHELL. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04_2_A8 P04_2_A8T2B name = $P04_2_A8 LABEL= " SHELL. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04_2_A9 P04_2_A9T2B name = $P04_2_A9 LABEL= " SHELL. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04_2_A10 P04_2_A10T2B name = $P04_2_A10 LABEL= " SHELL. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04_2_A11 P04_2_A11T2B name = $P04_2_A11 LABEL= " SHELL. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04_2_A12 P04_2_A12T2B name = $P04_2_A12 LABEL= " SHELL. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04_2_A13 P04_2_A13T2B name = $P04_2_A13 LABEL= " SHELL. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04_2_A14 P04_2_A14T2B name = $P04_2_A14 LABEL= " SHELL. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04_2_A15 P04_2_A15T2B name = $P04_2_A15 LABEL= " SHELL. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04_2_28 P04_2_28T2B name = $P04_2_28 LABEL = " SHELL. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04_2_29 P04_2_29T2B name = $P04_2_29 LABEL = " SHELL. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04_3_A1 P04_3_A1T2B name = $P04_3_A1 LABEL= " PUMA ENERGY. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04_3_A2 P04_3_A2T2B name = $P04_3_A2 LABEL= " PUMA ENERGY. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04_3_A3 P04_3_A3T2B name = $P04_3_A3 LABEL= " PUMA ENERGY. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04_3_A4 P04_3_A4T2B name = $P04_3_A4 LABEL= " PUMA ENERGY. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04_3_A5 P04_3_A5T2B name = $P04_3_A5 LABEL= " PUMA ENERGY. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04_3_A6 P04_3_A6T2B name = $P04_3_A6 LABEL= " PUMA ENERGY. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04_3_A7 P04_3_A7T2B name = $P04_3_A7 LABEL= " PUMA ENERGY. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04_3_A8 P04_3_A8T2B name = $P04_3_A8 LABEL= " PUMA ENERGY. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04_3_A9 P04_3_A9T2B name = $P04_3_A9 LABEL= " PUMA ENERGY. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04_3_A10 P04_3_A10T2B name = $P04_3_A10 LABEL= " PUMA ENERGY. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04_3_A11 P04_3_A11T2B name = $P04_3_A11 LABEL= " PUMA ENERGY. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04_3_A12 P04_3_A12T2B name = $P04_3_A12 LABEL= " PUMA ENERGY. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04_3_A13 P04_3_A13T2B name = $P04_3_A13 LABEL= " PUMA ENERGY. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04_3_A14 P04_3_A14T2B name = $P04_3_A14 LABEL= " PUMA ENERGY. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04_3_A15 P04_3_A15T2B name = $P04_3_A15 LABEL= " PUMA ENERGY. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04_3_28 P04_3_28T2B name = $P04_3_28 LABEL = " PUMA ENERGY. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04_3_29 P04_3_29T2B name = $P04_3_29 LABEL = " PUMA ENERGY. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04B_4_A1 P04B_4_A1T2B name = $P04B_4_A1 LABEL= " MCDONALD'S. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04B_4_A2 P04B_4_A2T2B name = $P04B_4_A2 LABEL= " MCDONALD'S. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04B_4_A3 P04B_4_A3T2B name = $P04B_4_A3 LABEL= " MCDONALD'S. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04B_4_A4 P04B_4_A4T2B name = $P04B_4_A4 LABEL= " MCDONALD'S. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04B_4_A5 P04B_4_A5T2B name = $P04B_4_A5 LABEL= " MCDONALD'S. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04B_4_A6 P04B_4_A6T2B name = $P04B_4_A6 LABEL= " MCDONALD'S. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04B_4_A7 P04B_4_A7T2B name = $P04B_4_A7 LABEL= " MCDONALD'S. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04B_4_A8 P04B_4_A8T2B name = $P04B_4_A8 LABEL= " MCDONALD'S. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04B_4_A9 P04B_4_A9T2B name = $P04B_4_A9 LABEL= " MCDONALD'S. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04B_4_A10 P04B_4_A10T2B name = $P04B_4_A10 LABEL= " MCDONALD'S. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04B_4_A11 P04B_4_A11T2B name = $P04B_4_A11 LABEL= " MCDONALD'S. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04B_4_A12 P04B_4_A12T2B name = $P04B_4_A12 LABEL= " MCDONALD'S. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04B_4_A13 P04B_4_A13T2B name = $P04B_4_A13 LABEL= " MCDONALD'S. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04B_4_A14 P04B_4_A14T2B name = $P04B_4_A14 LABEL= " MCDONALD'S. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04B_4_A15 P04B_4_A15T2B name = $P04B_4_A15 LABEL= " MCDONALD'S. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04B_4_28 P04B_4_28T2B name = $P04B_4_28 LABEL = " MCDONALD'S. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04B_4_29 P04B_4_29T2B name = $P04B_4_29 LABEL = " MCDONALD'S. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04B_5_A1 P04B_5_A1T2B name = $P04B_5_A1 LABEL= " MERCADO LIBRE. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04B_5_A2 P04B_5_A2T2B name = $P04B_5_A2 LABEL= " MERCADO LIBRE. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04B_5_A3 P04B_5_A3T2B name = $P04B_5_A3 LABEL= " MERCADO LIBRE. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04B_5_A4 P04B_5_A4T2B name = $P04B_5_A4 LABEL= " MERCADO LIBRE. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04B_5_A5 P04B_5_A5T2B name = $P04B_5_A5 LABEL= " MERCADO LIBRE. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04B_5_A6 P04B_5_A6T2B name = $P04B_5_A6 LABEL= " MERCADO LIBRE. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04B_5_A7 P04B_5_A7T2B name = $P04B_5_A7 LABEL= " MERCADO LIBRE. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04B_5_A8 P04B_5_A8T2B name = $P04B_5_A8 LABEL= " MERCADO LIBRE. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04B_5_A9 P04B_5_A9T2B name = $P04B_5_A9 LABEL= " MERCADO LIBRE. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04B_5_A10 P04B_5_A10T2B name = $P04B_5_A10 LABEL= " MERCADO LIBRE. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04B_5_A11 P04B_5_A11T2B name = $P04B_5_A11 LABEL= " MERCADO LIBRE. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04B_5_A12 P04B_5_A12T2B name = $P04B_5_A12 LABEL= " MERCADO LIBRE. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04B_5_A13 P04B_5_A13T2B name = $P04B_5_A13 LABEL= " MERCADO LIBRE. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04B_5_A14 P04B_5_A14T2B name = $P04B_5_A14 LABEL= " MERCADO LIBRE. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04B_5_A15 P04B_5_A15T2B name = $P04B_5_A15 LABEL= " MERCADO LIBRE. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04B_5_28 P04B_5_28T2B name = $P04B_5_28 LABEL = " MERCADO LIBRE. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04B_5_29 P04B_5_29T2B name = $P04B_5_29 LABEL = " MERCADO LIBRE. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04B_6_A1 P04B_6_A1T2B name = $P04B_6_A1 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04B_6_A2 P04B_6_A2T2B name = $P04B_6_A2 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04B_6_A3 P04B_6_A3T2B name = $P04B_6_A3 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04B_6_A4 P04B_6_A4T2B name = $P04B_6_A4 LABEL= " AEROLÍNEAS ARGENTINAS. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04B_6_A5 P04B_6_A5T2B name = $P04B_6_A5 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04B_6_A6 P04B_6_A6T2B name = $P04B_6_A6 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04B_6_A7 P04B_6_A7T2B name = $P04B_6_A7 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04B_6_A8 P04B_6_A8T2B name = $P04B_6_A8 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04B_6_A9 P04B_6_A9T2B name = $P04B_6_A9 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04B_6_A10 P04B_6_A10T2B name = $P04B_6_A10 LABEL= " AEROLÍNEAS ARGENTINAS. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04B_6_A11 P04B_6_A11T2B name = $P04B_6_A11 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04B_6_A12 P04B_6_A12T2B name = $P04B_6_A12 LABEL= " AEROLÍNEAS ARGENTINAS. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04B_6_A13 P04B_6_A13T2B name = $P04B_6_A13 LABEL= " AEROLÍNEAS ARGENTINAS. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04B_6_A14 P04B_6_A14T2B name = $P04B_6_A14 LABEL= " AEROLÍNEAS ARGENTINAS. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04B_6_A15 P04B_6_A15T2B name = $P04B_6_A15 LABEL= " AEROLÍNEAS ARGENTINAS. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04B_6_28 P04B_6_28T2B name = $P04B_6_28 LABEL = " AEROLÍNEAS ARGENTINAS. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04B_6_29 P04B_6_29T2B name = $P04B_6_29 LABEL = " AEROLÍNEAS ARGENTINAS. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04B_7_A1 P04B_7_A1T2B name = $P04B_7_A1 LABEL= " COCA COLA. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04B_7_A2 P04B_7_A2T2B name = $P04B_7_A2 LABEL= " COCA COLA. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04B_7_A3 P04B_7_A3T2B name = $P04B_7_A3 LABEL= " COCA COLA. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04B_7_A4 P04B_7_A4T2B name = $P04B_7_A4 LABEL= " COCA COLA. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04B_7_A5 P04B_7_A5T2B name = $P04B_7_A5 LABEL= " COCA COLA. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04B_7_A6 P04B_7_A6T2B name = $P04B_7_A6 LABEL= " COCA COLA. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04B_7_A7 P04B_7_A7T2B name = $P04B_7_A7 LABEL= " COCA COLA. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04B_7_A8 P04B_7_A8T2B name = $P04B_7_A8 LABEL= " COCA COLA. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04B_7_A9 P04B_7_A9T2B name = $P04B_7_A9 LABEL= " COCA COLA. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04B_7_A10 P04B_7_A10T2B name = $P04B_7_A10 LABEL= " COCA COLA. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04B_7_A11 P04B_7_A11T2B name = $P04B_7_A11 LABEL= " COCA COLA. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04B_7_A12 P04B_7_A12T2B name = $P04B_7_A12 LABEL= " COCA COLA. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04B_7_A13 P04B_7_A13T2B name = $P04B_7_A13 LABEL= " COCA COLA. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04B_7_A14 P04B_7_A14T2B name = $P04B_7_A14 LABEL= " COCA COLA. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04B_7_A15 P04B_7_A15T2B name = $P04B_7_A15 LABEL= " COCA COLA. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04B_7_28 P04B_7_28T2B name = $P04B_7_28 LABEL = " COCA COLA. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04B_7_29 P04B_7_29T2B name = $P04B_7_29 LABEL = " COCA COLA. - Es una empresa con productos de calidad internacional".

MRSETS /MCGROUP VARIABLES = P04B_8_A1 P04B_8_A1T2B name = $P04B_8_A1 LABEL= " QUILMES. - Es una empresa con productos y servicios de calidad".
MRSETS /MCGROUP VARIABLES = P04B_8_A2 P04B_8_A2T2B name = $P04B_8_A2 LABEL= " QUILMES. - Es una empresa fundamental para la economía del país".
MRSETS /MCGROUP VARIABLES = P04B_8_A3 P04B_8_A3T2B name = $P04B_8_A3 LABEL= " QUILMES. - Es una empresa manejada por profesionales".
MRSETS /MCGROUP VARIABLES = P04B_8_A4 P04B_8_A4T2B name = $P04B_8_A4 LABEL= " QUILMES. - Participa activamente y es responsable en las comunidades en las que opera".
MRSETS /MCGROUP VARIABLES = P04B_8_A5 P04B_8_A5T2B name = $P04B_8_A5 LABEL= " QUILMES. - Es una empresa que me genera orgullo".
MRSETS /MCGROUP VARIABLES = P04B_8_A6 P04B_8_A6T2B name = $P04B_8_A6 LABEL= " QUILMES. - Es una empresa muy comprometida con el desarrollo del país".
MRSETS /MCGROUP VARIABLES = P04B_8_A7 P04B_8_A7T2B name = $P04B_8_A7 LABEL= " QUILMES. - Es una empresa líder en innovación y desarrollo tecnológico".
MRSETS /MCGROUP VARIABLES = P04B_8_A8 P04B_8_A8T2B name = $P04B_8_A8 LABEL= " QUILMES. - Es una empresa responsable/comprometida con el medioambiente".
MRSETS /MCGROUP VARIABLES = P04B_8_A9 P04B_8_A9T2B name = $P04B_8_A9 LABEL= " QUILMES. - Es una empresa cercana, que está presente en mi vida cotidiana".
MRSETS /MCGROUP VARIABLES = P04B_8_A10 P04B_8_A10T2B name = $P04B_8_A10 LABEL= " QUILMES. - Tiene prácticas de negocios éticas y transparentes".
MRSETS /MCGROUP VARIABLES = P04B_8_A11 P04B_8_A11T2B name = $P04B_8_A11 LABEL= " QUILMES. - Es una compañía en la que me gustaría trabajar".
MRSETS /MCGROUP VARIABLES = P04B_8_A12 P04B_8_A12T2B name = $P04B_8_A12 LABEL= " QUILMES. - Contribuye a la generación de empleo".
MRSETS /MCGROUP VARIABLES = P04B_8_A13 P04B_8_A13T2B name = $P04B_8_A13 LABEL= " QUILMES. - Tiene presencia/cobertura en todo el país".
MRSETS /MCGROUP VARIABLES = P04B_8_A14 P04B_8_A14T2B name = $P04B_8_A14 LABEL= " QUILMES. - Tiene historia y trayectoria arraigada al país".
MRSETS /MCGROUP VARIABLES = P04B_8_A15 P04B_8_A15T2B name = $P04B_8_A15 LABEL= " QUILMES. - Es una marca confiable / responsable".
MRSETS /MCGROUP VARIABLES = P04B_8_28 P04B_8_28T2B name = $P04B_8_28 LABEL = " QUILMES. - Es una empresa referente para el desarrollo argentino".
MRSETS /MCGROUP VARIABLES = P04B_8_29 P04B_8_29T2B name = $P04B_8_29 LABEL = " QUILMES. - Es una empresa con productos de calidad internacional".

EXECUTE.

MRSETS /MDGROUP VALUE =1 CATEGORYLABELS =COUNTEDVALUES VARIABLES = G06_1 G06_2 G06_3 G06_4 G06_98 G06_99 NAME =$G06 LABEL = "¿Quiénes te parece que son los actores involucrados en el desarrollo de la industria del Gas?".
 
RECODE G08_1 G08_2 G08_3 G08_4 G08_5 G08_6 G11 (1 THRU 2 = 11)(4 THRU 5 =33) INTO G08_1_T2B G08_2_T2B G08_3_T2B G08_4_T2B G08_5_T2B G08_6_T2B G11_T2B.

MRSETS /MCGROUP VARIABLES = G08_1 G08_1_T2B name = $G08_1 LABEL= "Tendrá un impacto en el día a día, porque el precio de la tarifa de GAS no va a estar atada al precio del dólar".
MRSETS /MCGROUP VARIABLES = G08_2 G08_2_T2B name = $G08_2 LABEL= "El Estado gastara menos dinero en comprar GAS en el extranjero".
MRSETS /MCGROUP VARIABLES = G08_3 G08_3_T2B name = $G08_3 LABEL= "El desarrollo de la industria del GAS y la exportación del excedente reportará una fuente importante de ingresos para el país y tendrá un impacto positivo en el desarrollo social".
MRSETS /MCGROUP VARIABLES = G08_4 G08_4_T2B name = $G08_4 LABEL= "El desarrollo de la industria del gas es la solución para terminar con la crisis energética".
MRSETS /MCGROUP VARIABLES = G08_5 G08_5_T2B name = $G08_5 LABEL= "La reducción en la tarifa del GAS representará un alivio importante en el gasto de mi hogar".
MRSETS /MCGROUP VARIABLES = G08_6 G08_6_T2B name = $G08_6 LABEL= "La reducción en la tarifa del GAS representará un alivio importante en el gasto de mi hogar".

MRSETS /MCGROUP VARIABLES = G11 G11_T2B name = $G11 LABEL= "¿Cuál es tu opinión sobre el desarrollo del Gasoducto Néstor Kirchner?".


Recode ER2 (1 2 =33) (4 5 =11) into ER2_T2B.
EXECUTE.

VALUE LABELS ER2_T2B 
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = ER2 ER2_T2B  name = $ER2 LABEL= "¿Qué tan importante te parece el desarrollo de nuevas fuentes de energías alternativas y/o renovables".



Recode ER8_1 ER8_2 ER8_3 (1 2 =33) (4 5 =11) into ER8_1_T2B ER8_2_T2B ER8_3_T2B.
Recode ER8_1 ER8_2 ER8_3 (3 4 5 = 22 ) into ER8_1_Imp ER8_2_Imp ER8_3_Imp.
EXECUTE.

VALUE LABELS ER8_1_T2B ER8_2_T2B ER8_3_T2B ER8_1_Imp ER8_2_Imp ER8_3_Imp
11 "T2B"
22 "Importante"
33 "B2B".

MRSETS /MCGROUP VARIABLES = ER8_1 ER8_1_T2B ER8_1_Imp name = $ER8_1 LABEL= "¿Qué tan importante es para vos que el país posea…? - Soberanía energética".
MRSETS /MCGROUP VARIABLES = ER8_2 ER8_2_T2B ER8_2_Imp name = $ER8_2 LABEL= "¿Qué tan importante es para vos que el país posea…? - Soberanía alimenticia".
MRSETS /MCGROUP VARIABLES = ER8_3 ER8_3_T2B ER8_3_Imp name = $ER8_3 LABEL= "¿Qué tan importante es para vos que el país posea…? - Soberanía económica".

***********************

MRSETS /MDGROUP VALUE =1 VARIABLES = T01_17 T01_32 T01_33 T01_34 T01_35 T01_36 T01_37 T01_38 T01_39 NAME = $T01 CATEGORYLABELS =COUNTEDVALUES LABEL ="¿Cuál/es de las siguientes redes sociales tenés?".

MRSETS /MDGROUP VALUE =1 VARIABLES = T03_1_4 T03_1_7 T03_1_8 T03_1_9 T03_1_10 NAME = $T03_1 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en Instagram? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_2_4 T03_2_7 T03_2_8 T03_2_9 T03_2_10 NAME = $T03_2 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en Twitter? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_3_4 T03_3_7 T03_3_8 T03_3_9 T03_3_10 NAME = $T03_3 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en Facebook/Meta? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_4_4 T03_4_7 T03_4_8 T03_4_9 T03_4_10 NAME = $T03_4 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en LinkedIn? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_5_4 T03_5_7 T03_5_8 T03_5_9 T03_5_10 NAME = $T03_5 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en Youtube? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_6_4 T03_6_7 T03_6_8 T03_6_9 T03_6_10 NAME = $T03_6 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en TikTok? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_7_4 T03_7_7 T03_7_8 T03_7_9 T03_7_10 NAME = $T03_7 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en Twitch? " .
MRSETS /MDGROUP VALUE =1 VARIABLES = T03_97_4 T03_97_7 T03_97_8 T03_97_9 T03_97_10 NAME = $T03_97 CATEGORYLABELS =COUNTEDVALUES LABEL =" ¿Y seguís a alguna de las siguientes marcas en [QID164-ChoiceTextEntryValue-38]? " .

MRSETS /MDGROUP VALUE =1 VARIABLES = T08_1 T08_4 T08_5 T08_6 T08_7 T08_8 T08_9 T08_10 T08_11 NAME = $T08 CATEGORYLABELS =COUNTEDVALUES LABEL ="¿En cuales? ".
end if.


MRSETS /MCGROUP VARIABLES = P4C_1_Cod_1 P4C_1_Cod_2 P4C_1_Cod_3 NAME = $P4_8_2_YPF LABEL =" ¿Porque motivos NO estas acuerdo con que YPF “Es una empresa responsable/comprometida con el medioambiente” ? ".
MRSETS /MCGROUP VARIABLES = P4C_2_Cod_1 P4C_2_Cod_2 NAME = $P4_8_2_AXION LABEL =" ¿Porque motivos NO estas acuerdo con que AXION “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_3_Cod_1 P4C_3_Cod_2 P4C_3_Cod_3 NAME = $P4_8_2_SHELL LABEL =" ¿Porque motivos NO estas acuerdo con que SHELL “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_4_Cod_1 P4C_4_Cod_2 P4C_4_Cod_3 NAME = $P4_8_2_PUMA LABEL =" ¿Porque motivos NO estas acuerdo con que PUMA ENERGY “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_5_Cod_1 P4C_5_Cod_2 P4C_5_Cod_3 P4C_5_Cod_4 NAME = $P4_8_2_MCDONALD LABEL =" ¿Porque motivos NO estas acuerdo con que MCDONALD'S “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_6_Cod_1 P4C_6_Cod_2 NAME = $P4_8_2_MELI LABEL =" ¿Porque motivos NO estas acuerdo con que MERCADO LIBRE “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_7_Cod_1 P4C_7_Cod_2 P4C_7_Cod_3 NAME = $P4_8_2_AEROLINEAS LABEL =" ¿Porque motivos NO estas acuerdo con que AEROLINEAS ARGENTINAS “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_8_Cod_1 P4C_8_Cod_2 P4C_8_Cod_3 NAME = $P4_8_2_COCA LABEL =" ¿Porque motivos NO estas acuerdo con que COCA COLA “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".
MRSETS /MCGROUP VARIABLES = P4C_9_Cod_1 P4C_9_Cod_2 NAME = $P4_8_2_QUILMES LABEL =" ¿Porque motivos NO estas acuerdo con que QUILMES “Es una empresa responsable/comprometida con el medioambiente” ? Algo más? Profundizar ".

MRSETS /MCGROUP VARIABLES = P113b_Cod1 P113b_Cod2 P113b_Cod3 P113b_Cod4 P113b_cod5
 NAME = $P113b LABEL =" P113.B. Principal responsable del aumento del combustible".


MRSETS /MCGROUP VARIABLES =  P133_Cod_1 P133_Cod_2 NAME = $P133 LABEL =" ¿Qué es lo que sabes al respecto del acuerdo que alcanzo YPF en el caso Maxus?".

MRSETS /MCGROUP VARIABLES =  P135_Cod_1 P135_Cod_2 NAME = $P135 LABEL =" ¿Por qué la empeora?".

recode  T04   T05 (1 2 =33) (4 5 =11) into T04_T2B T05_T2B.
EXECUTE.

VALUE LABELS T04_T2B T05_T2B
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = T04  T04_T2B name = $T04 LABEL= "¿Cómo evalúas el contenido de la marca YPF en Instagram? ".

MRSETS /MCGROUP VARIABLES = T05  T05_T2B name = $T05 LABEL= "En general, ¿Cuan relevante te parece el contenido de YPF en las redes sociales? ".

recode   ER5 ER6  (1 2 =33) (3 4 =11) into ER5_T2B ER6_T2B.
EXECUTE.

VALUE LABELS ER5_T2B ER6_T2B
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = ER5  ER5_T2B name = $ER5 LABEL= "Según tu opinión ¿te parece que YPF tiene la capacidad de liderar el desarrollo de energías alternativas y/o renovables en el país? ".

MRSETS /MCGROUP VARIABLES = ER6  ER6_T2B name = $ER6 LABEL= "¿Cuánta responsabilidad debería tener YPF en el desarrollo de energías alternativas en el país?  ".



recode  P136  (1 2 =33) (4 5 =11) into P136_T2B.
EXECUTE.

VALUE LABELS P136_T2B
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = P136  P136_T2B name = $P136 LABEL= "¿Y Cuál es tu opinión sobre el impacto del acuerdo para la Argentina? ".


Recode P03_E_16	P03_E_17	P03_E_20	P03_E_22	P03_E_24	P4_E_1_16	P4_E_1_17	P4_E_1_20	P4_E_1_22	P4_E_1_24	P4_E_2_16	P4_E_2_17	P4_E_2_20	P4_E_2_22	P4_E_2_24	P4_E_3_16	P4_E_3_17	P4_E_3_20	P4_E_3_22	P4_E_3_24
 P142 (1 2 =33) (4 5 =11) into
 P03_E_16T2B	P03_E_17T2B	P03_E_20T2B	P03_E_22T2B	P03_E_24T2B	P4_E_1_16T2B	P4_E_1_17T2B	P4_E_1_20T2B	P4_E_1_22T2B	P4_E_1_24T2B	P4_E_2_16T2B	P4_E_2_17T2B	P4_E_2_20T2B	P4_E_2_22T2B	P4_E_2_24T2B	P4_E_3_16T2B	P4_E_3_17T2B	P4_E_3_20T2B	P4_E_3_22T2B	P4_E_3_24T2B  P142_T2B.

VALUE LABELS  P03_E_16T2B	P03_E_17T2B	P03_E_20T2B	P03_E_22T2B	P03_E_24T2B	P4_E_1_16T2B	P4_E_1_17T2B	P4_E_1_20T2B	P4_E_1_22T2B	P4_E_1_24T2B	P4_E_2_16T2B	P4_E_2_17T2B	P4_E_2_20T2B	P4_E_2_22T2B	P4_E_2_24T2B	P4_E_3_16T2B	P4_E_3_17T2B	P4_E_3_20T2B	P4_E_3_22T2B	P4_E_3_24T2B P142_T2B
11 "T2B"
33 "B2B".


MRSETS /MCGROUP VARIABLES =	P03_E_16	P03_E_16T2B	NAME =	$P03_E_16	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa YPF. - Tiene un rol estratégico en el desarrollo energético de Argentina	".
MRSETS /MCGROUP VARIABLES =	P03_E_17	P03_E_17T2B	NAME =	$P03_E_17	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa YPF. - Se viene modernizando y renovando en los últimos años	".
MRSETS /MCGROUP VARIABLES =	P03_E_20	P03_E_20T2B	NAME =	$P03_E_20	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa YPF. - La APP de YPF muestra que están a la vanguardia en tecnología	".
MRSETS /MCGROUP VARIABLES =	P03_E_22	P03_E_22T2B	NAME =	$P03_E_22	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa YPF. - Los playeros de YPF tienen muy buena atención	".
MRSETS /MCGROUP VARIABLES =	P03_E_24	P03_E_24T2B	NAME =	$P03_E_24	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa YPF. - Los combustibles YPF tienen los precios más accesibles	".
MRSETS /MCGROUP VARIABLES =	P4_E_1_16	P4_E_1_16T2B	NAME =	$P4_E_1_16	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Axion. - Tiene un rol estratégico en el desarrollo energético de Argentina	".
MRSETS /MCGROUP VARIABLES =	P4_E_1_17	P4_E_1_17T2B	NAME =	$P4_E_1_17	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Axion. - Se viene modernizando y renovando en los últimos años	".
MRSETS /MCGROUP VARIABLES =	P4_E_1_20	P4_E_1_20T2B	NAME =	$P4_E_1_20	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Axion. - La APP de Axion muestra que están a la vanguardia en tecnología	".
MRSETS /MCGROUP VARIABLES =	P4_E_1_22	P4_E_1_22T2B	NAME =	$P4_E_1_22	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Axion. - Los playeros de Axion tienen muy buena atención	".
MRSETS /MCGROUP VARIABLES =	P4_E_1_24	P4_E_1_24T2B	NAME =	$P4_E_1_24	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Axion. - Los combustibles Axion tienen los precios más accesibles	".
MRSETS /MCGROUP VARIABLES =	P4_E_2_16	P4_E_2_16T2B	NAME =	$P4_E_2_16	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Shell. - Tiene un rol estratégico en el desarrollo energético de Argentina	".
MRSETS /MCGROUP VARIABLES =	P4_E_2_17	P4_E_2_17T2B	NAME =	$P4_E_2_17	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Shell. - Se viene modernizando y renovando en los últimos años	".
MRSETS /MCGROUP VARIABLES =	P4_E_2_20	P4_E_2_20T2B	NAME =	$P4_E_2_20	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Shell. - La APP de Shell muestra que están a la vanguardia en tecnología	".
MRSETS /MCGROUP VARIABLES =	P4_E_2_22	P4_E_2_22T2B	NAME =	$P4_E_2_22	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Shell. - Los playeros de Shell tienen muy buena atención	".
MRSETS /MCGROUP VARIABLES =	P4_E_2_24	P4_E_2_24T2B	NAME =	$P4_E_2_24	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Shell. - Los combustibles Shell tienen los precios más accesibles	".
MRSETS /MCGROUP VARIABLES =	P4_E_3_16	P4_E_3_16T2B	NAME =	$P4_E_3_16	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Puma Energy. - Tiene un rol estratégico en el desarrollo energético de Argentina	".
MRSETS /MCGROUP VARIABLES =	P4_E_3_17	P4_E_3_17T2B	NAME =	$P4_E_3_17	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Puma Energy. - Se viene modernizando y renovando en los últimos años	".
MRSETS /MCGROUP VARIABLES =	P4_E_3_20	P4_E_3_20T2B	NAME =	$P4_E_3_20	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Puma Energy. - La APP de Puma Energy muestra que están a la vanguardia en tecnología	".
MRSETS /MCGROUP VARIABLES =	P4_E_3_22	P4_E_3_22T2B	NAME =	$P4_E_3_22	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Puma Energy. - Los playeros de Puma Energy tienen muy buena atención	".
MRSETS /MCGROUP VARIABLES =	P4_E_3_24	P4_E_3_24T2B	NAME =	$P4_E_3_24	LABEL= "	Sin importar cuánto sepas o conozcas, indica tu nivel de acuerdo con los siguientes atributos para describir a la empresa Puma Energy. - Los combustibles Puma Energy tienen los precios más accesibles	".

MRSETS /MCGROUP VARIABLES =	 P142  P142_T2B	NAME =	$P142 	LABEL= "	Indícanos por favor tu grado de acuerdo/desacuerdo con la frase El precio del combustible de YPF está en sintonía con el precio global de los combustibles".

EXECUTE.



recode   P158_1 P158_2 P158_3 (1 2 =33) (4 5 =11) into  P158_1_T2B P158_2_T2B P158_3_T2B.
EXECUTE.

VALUE LABELS P158_1_T2B P158_2_T2B P158_3_T2B
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = P158_1  P158_1_T2B name = $P158_1 LABEL= "Indica por favor tu grado de acuerdo/desacuerdo con las siguientes frases respecto a la campaña de YPF Gas que viste: - La campaña de YPF GAS me genera confianza".
MRSETS /MCGROUP VARIABLES = P158_2  P158_2_T2B name = $P158_2 LABEL= "Indica por favor tu grado de acuerdo/desacuerdo con las siguientes frases respecto a la campaña de YPF Gas que viste: - La campaña de YPF GAS me genera seguridad".
MRSETS /MCGROUP VARIABLES = P158_3  P158_3_T2B name = $P158_3 LABEL= "Indica por favor tu grado de acuerdo/desacuerdo con las siguientes frases respecto a la campaña de YPF Gas que viste: - La garrafa de YPF Gas rinde más".


********************************************************************


MRSETS /MDGROUP VALUE =1 VARIABLES = P141_1 P141_4 P141_5 P141_6 P141_7 P141_8 P141_9 NAME = $P141 CATEGORYLABELS =COUNTEDVALUES LABEL = "Y además de [QID218-ChoiceGroup-SelectedChoicesTextEntry], ¿Crees que hay otros responsables? ".



Do if (Wave=21).
Compute 	P40_A1	=	P124_A1	.
Compute 	P40_A2	=	P124_A2	.
Compute 	P40_A3	=	P124_A3	.
Compute 	P40_A4	=	P124_A4	.
Compute 	P40_A5	=	P124_A5	.
Compute 	P40_A6	=	P124_A6	.
Compute 	P40_A7	=	P124_A7	.
END IF. 
exe.

**********

recode  P149 P150 (1 2= 33 )(4 5=11 ) into P149_T2B P150_T2B.
exe. 

VALUE LABELS P149_T2B P150_T2B
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = P149_T2B P149 NAME = $P149 LABEL = "¿Cuan relevante te parece que YPF haya aprobado la venta de campos maduros que ya superaron su pico de producción?".

MRSETS /MCGROUP VARIABLES = P150_T2B P150 NAME = $P150 LABEL = "Indicanos tu grado de acuerdo / desacuerdo con la  aprobación de la venta de campos maduros por parte de YPF".


Count  P09_Privatizacion= P09_Cod1 P09_Cod2 P09_Cod3 P09_Cod4 P09_Cod5 P09_Cod6 (1).
Exe.

recode P09_Privatizacion (1=1)(0=2).
exe.

VALUE LABELS P09_Privatizacion 
1 "Si"
2 "No".

VARIABLE LABELS P09_Privatizacion "Privatizacion".

RECODE  GG4 GG5  GG8 GG9 (1 2= 33 )(4 5=11 ) into  GG4_T2B GG5_T2B  GG8_T2B  GG9_T2B .
EXE. 

VALUE LABELS GG4_T2B GG5_T2B GG8_T2B  GG9_T2B 
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = GG4 GG4_T2B NAME = $GG4 LABEL = "¿Qué tan relevante te parece el desarrollo de este proyecto para el país?".
MRSETS /MCGROUP VARIABLES = GG5 GG5_T2B NAME = $GG5 LABEL = "Indícanos tu grado de acuerdo/desacuerdo con la elección de YPF/ Petronas de realizar esta obra en la provincia de Río Negro y no en la de Buenos Aires.".
MRSETS /MCGROUP VARIABLES = GG8 GG8_T2B NAME = $GG8 LABEL = "¿Cuánta responsabilidad debería tener YPF en el desarrollo de GNL?".
MRSETS /MCGROUP VARIABLES = GG9 GG9_T2B NAME = $GG9 LABEL = "Indicanos tu grado de acuerdo / desacuerdo con Nuestro país tiene la infraestructura adecuada para llevar adelante el desarrollo de GNL".






***ASTROLOGIA




*Recode S1 (1 5 9=1)(2 6 10=2)(3 7 11=3)(4 8 12=4) into Elemento.
*EXECUTE.

*Value Labels Elemento
1 "FUEGO"
2 "TIERRA"
3 "AIRE"
4 "AGUA".


*RECODE F2 (16 thru 27=1) (28 thru hi=2) INTO Edad_astro. 
*EXECUTE.

*VALUE LABELS Edad_astro
1 '16-27'
2 '28 y +'.

*MRSETS /MDGROUP VALUE =1  VARIABLES =  S2_1 S2_2 S2_3 S2_4 S2_5 NAME = $S2 CATEGORYLABELS =COUNTEDVALUES LABEL = "¿Cuáles de estas afirmaciones te describe mejor cuando se trata de tecnología? ".

*MRSETS /MDGROUP VALUE =1 VARIABLES =  S3_1 S3_2 S3_3 S3_4 S3_5 NAME = $S3 CATEGORYLABELS =COUNTEDVALUES LABEL = "¿Cuáles de estas afirmaciones te describe mejor cuando se trata de alimentos y bebidas? ".

Recode  P161_1 P161_2 P161_3 P161_4 P161_5 P161_6 P161_7 P161_8 P161R9 P161R10 P161R11 P161R12 P164_1 P164_2 P164_3
(1 2 =33)(4 5 =11) into 
P161_1_T2B	P161_2_T2B	P161_3_T2B	P161_4_T2B	P161_5_T2B	P161_6_T2B	P161_7_T2B P161_8_T2B P161_9_T2B P161_10_T2B P161_11_T2B P161_12_T2B P164_1_T2B P164_2_T2B P164_3_T2B.

VALUE LABELS P161_1_T2B	P161_2_T2B	P161_3_T2B	P161_4_T2B	P161_5_T2B	P161_6_T2B	P161_7_T2B P161_8_T2B P161_9_T2B P161_10_T2B P161_11_T2B P161_12_T2B  P164_1_T2B P164_2_T2B P164_3_T2B
11 "T2B"
33 "B2B".

MRSETS /MCGROUP VARIABLES = 	P161_1	P161_1_T2B	NAME =	$P161_1	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Lionel Messi	 ".
MRSETS /MCGROUP VARIABLES = 	P161_2	P161_2_T2B	NAME =	$P161_2	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Rodrigo De Paul	 ".
MRSETS /MCGROUP VARIABLES = 	P161_3	P161_3_T2B	NAME =	$P161_3	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Franco Colapinto	 ".
MRSETS /MCGROUP VARIABLES = 	P161_4	P161_4_T2B	NAME =	$P161_4	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Sofi Martinez	 ".
MRSETS /MCGROUP VARIABLES = 	P161_5	P161_5_T2B	NAME =	$P161_5	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Adolfo Cambiasso	 ".
MRSETS /MCGROUP VARIABLES = 	P161_6	P161_6_T2B	NAME =	$P161_6	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Facundo Arana	 ".
MRSETS /MCGROUP VARIABLES = 	P161_7	P161_7_T2B	NAME =	$P161_7	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Agustin Poli	 ".
MRSETS /MCGROUP VARIABLES = 	P161_8	P161_8_T2B	NAME =	$P161_8	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Noel de Castro	 ".
MRSETS /MCGROUP VARIABLES = 	P161R9	P161_9_T2B	NAME =	$P161_9	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Valentin Perrone	 ".
MRSETS /MCGROUP VARIABLES = 	P161R10	P161_10_T2B	NAME =	$P161_10	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Nicolás Varrone	 ".
MRSETS /MCGROUP VARIABLES = 	P161R11	P161_11_T2B	NAME =	$P161_11	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Enzo Fernández	 ".
MRSETS /MCGROUP VARIABLES = 	P161R12	P161_12_T2B	NAME =	$P161_12	LABEL = "	¿Qué imagen tenés de cada uno de ellos? - Leandro Paredes	 ".

MRSETS /MCGROUP VARIABLES = 	P164_1	P164_1_T2B	NAME =	$P164_1	LABEL = "	¿Qué tan adecuadas crees que son las alianzas entre YPF y...? - Café Cabrales	 ".
MRSETS /MCGROUP VARIABLES = 	P164_2	P164_2_T2B	NAME =	$P164_2	LABEL = "	¿Qué tan adecuadas crees que son las alianzas entre YPF y...? - Guapaletas ".
MRSETS /MCGROUP VARIABLES = 	P164_3	P164_3_T2B	NAME =	$P164_3	LABEL = "	¿Qué tan adecuadas crees que son las alianzas entre YPF y...? - Selección de fútbol".
end if.


