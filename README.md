# MANACO BI | Preparación, análisis comercial y módulos ejecutivos

Aplicación estática para cargar, inspeccionar y preparar archivos comerciales Excel y CSV directamente en el navegador. No incluye datos de MANACO ni envía los archivos a un servidor.

## Uso local

Abre `index.html` en un navegador moderno. Para evitar restricciones del navegador al cargar recursos, también puedes servir la carpeta con cualquier servidor estático local. La biblioteca SheetJS se obtiene desde jsDelivr; los archivos seleccionados permanecen en el navegador.

1. Entra en **Preparación de datos** y selecciona un archivo `.xlsx`, `.xls` o `.csv`.
2. Si el libro tiene varias hojas, selecciona la hoja que quieras inspeccionar.
3. Revisa la vista previa, el diagnóstico y las filas vacías, duplicadas o con posibles agregados «Mundo».
4. Descarga la copia preparada o el informe JSON. La copia preparada retira solo filas completamente vacías; no elimina duplicados ni candidatos «Mundo».
5. Abre **Dashboard ejecutivo**, **Inventarios**, **Pronósticos** o **Rentabilidad** para analizar la hoja activa, sin volver a cargar el archivo. Los gráficos y filtros se basan en las columnas reconocidas; cada módulo también explica qué campos faltan para los indicadores que no puede calcular.
6. En **Caso de estudio**, completa las cuatro estaciones, revisa la procedencia y el alcance, y descarga el informe integrador HTML (imprimible/guardable como PDF) y/o una copia JSON del trabajo.

Se usa la primera fila no vacía como encabezado. Los nombres normalizados se proponen por separado y se usan en la exportación preparada; el informe conserva los encabezados originales y su correspondencia. El diagnóstico describe cálculos automáticos, no conclusiones comerciales.

## Ruta del caso de estudio

La vista **Caso de estudio** organiza los productos requeridos por el caso:

- **Estación 1:** hasta cinco problemas prioritarios, justificación/impacto, preguntas analíticas y datos necesarios.
- **Estación 2:** clasificación manual de procedencia, tres hallazgos con evidencia e interpretación, dos limitaciones y una pregunta estratégica. Presenta indicadores, calidad/tipos inferidos y una tabla de valor y pares por flujo/categoría; permite filtrar periodo y país reportante para evitar mezclar alcances y habilitar el valor por par en un periodo comparable. El Dashboard conserva además filtros de socio, flujo, producto, gráficos y revisión de filas «Mundo».
- **Estación 3:** problema, solución analítica, datos, decisión, coordinación, tres objetivos SMART con KPI/metas/plazos y dos riesgos con mitigación.
- **Estación 4:** comparación de dos alternativas por beneficios, costos, riesgos y KPI; selección justificada, segmento, acción comercial, datos faltantes y tres indicadores de seguimiento.
- **Producto final:** informe HTML con el alcance de la fuente, tablas/gráficos disponibles, respuestas de las estaciones y nivel de completitud. Se puede imprimir o guardar como PDF desde el navegador. La copia JSON permite respaldar y volver a importar las respuestas.

Las respuestas se guardan en el `localStorage` del navegador y no se envían al servidor. Descarga la copia JSON si necesitas trasladar el trabajo a otro dispositivo o navegador. La clasificación de procedencia es manual y debe verificarse con el diccionario/fuente original. Los agregados de valor se bloquean ante monedas mezcladas, datos de reportante incompletos o varios países reportantes sin un alcance único. La app no genera estimaciones financieras, decisiones ni datos de MANACO si el archivo no los contiene; los objetivos, supuestos y recomendaciones deben ser completados y validados por el equipo.

## Pruebas

Requiere Node.js 18 o posterior. No se necesitan dependencias de npm.

```sh
node --test tests/*.test.js
for file in assets/js/*.js tests/*.js; do node --check "$file" || exit 1; done
git diff --check
```

Las pruebas usan filas sintéticas declaradas en los archivos de `tests/`; no representan datos de MANACO.

## Inteligencia de mercado

El módulo usa los encabezados reales de la hoja cargada y presenta la columna detectada para cada rol. Incluye tarjetas KPI, líneas de evolución anual, barras de importaciones y exportaciones, barras horizontales de los diez principales socios, una dona del valor comercial por producto/categoría y barras del valor ponderado por par según categoría y flujo. Este último gráfico requiere pares explícitos, moneda confirmada y un único periodo válido (selecciona un año si la hoja contiene varios). Los gráficos se actualizan al cambiar filtros o la hoja y solo se dibujan cuando la unidad monetaria es comparable y los datos disponibles respaldan la visualización. Sin una columna de producto, se explica por qué no está disponible el gráfico de categorías.

Cuando varias columnas pueden representar un mismo rol, se prioriza el encabezado con coincidencia más específica; si dos o más encabezados tienen la misma prioridad, el rol permanece ambiguo y requiere revisión manual. Por ejemplo, `Valor_USD` se prefiere a `Valor_miles_USD` y `Valor_USD_por_par` como valor comercial.

Los filtros de periodo/año, país reportante, socio comercial, flujo y producto/categoría aparecen solo cuando existen columnas reconocidas. La serie temporal agrupa por año los periodos compatibles, incluidos meses, trimestres y fechas. Si varios encabezados encajan con un rol, se marcan como ambiguos y no se escoge uno automáticamente.

Los flujos reconocidos son importaciones/imports y exportaciones/exports del archivo, no ventas reales de MANACO. Solo se atribuye un país reportante si la fuente contiene un encabezado explícito identificable; un valor de España, por ejemplo, no se atribuye a Bolivia ni a la empresa. Si existen encabezados como «País reportante»/«Reporting country», se habilita un filtro separado del socio comercial. Si el archivo incluye varios países reportantes, se debe elegir uno antes de calcular totales para evitar consolidarlos. Una columna genérica «País» se trata solo como país socio y no se inventa el país reportante.

Los totales se calculan por separado con valores numéricos válidos. Se distingue un cero real de un dato ausente o ambiguo. Se aceptan decimales de precisión extendida, incluidos valores numéricos exportados como texto por Excel; formatos con separadores ambiguos siguen excluyéndose para no reinterpretar miles como decimales. El saldo se calcula como exportaciones menos importaciones, únicamente cuando se reconocen ambos flujos, hay registros válidos en cada uno, la moneda común está indicada en el encabezado o en una columna de moneda completa y uniforme, y ambos flujos tienen exactamente la misma cobertura de periodos normalizados. Los códigos reconocidos incluyen USD, EUR, BOB, MXN, ARS, PEN, CLP y BRL; símbolos como `$` no identifican una moneda. Las escalas declaradas como miles/millones se muestran en la unidad, pero los valores no se reescalan. Sin unidad confirmada, se mantienen sumas separadas por flujo, pero se bloquean saldo y gráficos comparativos; monedas mezcladas o incompletas bloquean sumas. Sin periodos reconocibles o con cobertura dispareja, se muestran totales separados, sin saldo ni ranking combinado de socios.

El valor ponderado por par es `suma del valor comercial de filas con valor válido y pares > 0 / suma de esos pares`. Solo se calcula cuando el encabezado confirma pares individuales (no miles/millones de pares), la moneda está confirmada y todas las filas usadas pertenecen a un único periodo normalizado. Para fuentes multianuales debe aplicarse el filtro de periodo; no se promedian razones por fila. Los socios se ordenan por suma de flujos solo cuando unidad y periodo son comparables. Los hallazgos descriptivos citan las cifras y registros que los sustentan; no extrapolan tendencias ni formulan recomendaciones causales.

Las filas agregadas «Mundo» (y rótulos equivalentes reconocidos) se excluyen de forma predeterminada del desglose por país. Se pueden inspeccionar en alcance separado; nunca se suman junto a países. Los duplicados exactos se advierten, se cuentan y se conservan en preparación/análisis de mercado; el pronóstico y los cálculos de rentabilidad se bloquean si hay duplicados que podrían inflar agregados. El Dashboard informa filas fuente, filtradas, en alcance, incluidas y excluidas; las tablas/exportaciones de registros incluidos solo contienen filas usadas para indicadores válidos.

## Inventarios

El módulo muestra KPI de entradas, salidas, existencia, productos y alertas, gráficos reales de los diez productos con más movimiento y, si se reconocen unidades y valores consistentes, existencias frente al punto de reposición. Los filtros disponibles son país reportante, socio, producto/categoría, periodo y tipo de movimiento. Requiere encabezados únicos de producto, tipo de movimiento y cantidad numérica; clasifica los movimientos explícitos de entrada/ingreso/recepción/compra y salida/egreso/despacho/venta. Agrupa cantidades no negativas por producto y dimensiones reconocidas de país/reportante/almacén. Cuando no hay información suficiente para movimientos, explica qué columnas hacen falta y no sustituye el gráfico con una tabla.

Los movimientos no reconocidos, cantidades ausentes/negativas, productos faltantes, duplicados y filas «Mundo» se advierten; no se corrigen ni se eliminan datos silenciosamente.

Las alertas de reposición requieren además columnas reconocibles de existencia actual y punto de reposición, unidades explícitas iguales en ambos encabezados, valores consistentes y completos por producto/dimensión, un solo periodo si hay fecha, y ausencia de duplicados o dimensiones ambiguas. Fórmula: `alerta = existencia actual ≤ punto de reposición`. Sin un stock actual no se infiere stock a partir de entradas menos salidas, pues puede faltar el inventario inicial.

## Pronósticos

Presenta en una gráfica las series anuales reales y las líneas discontinuas de proyección de cada flujo. Los filtros de país, socio, flujo y categoría se aplican antes del análisis; se conserva todo el historial anual necesario para el modelo. Se calcula una línea base solo si hay un país reportante explícito y completo, moneda confirmada y uniforme, al menos tres años calendario consecutivos, periodos y valores reconocibles y ningún duplicado exacto. Cada flujo se proyecta por separado solo si está observado en todos los años.

Método: persistencia naïve, `valor del siguiente año = valor observado en el último año`; horizonte de un año. A partir de cuatro años también se calcula MAE y MAPE retrospectivos de un paso, con la observación anual anterior como predicción y conteo explícito de observaciones. `MAE = promedio(abs(valor real − predicción))`; `MAPE = promedio(abs(valor real − predicción) / abs(valor real)) × 100` para valores reales distintos de cero. Si no hay observaciones válidas o los valores reales son cero, el error correspondiente se indica como no calculable, nunca como cero supuesto. El método no estima tendencia, estacionalidad, causas ni cambios futuros. Son proyecciones de flujos comerciales de la fuente; no representan demanda ni ventas futuras de MANACO. Si no se cumplen las condiciones, el módulo explica los datos faltantes y no genera una proyección.

## Rentabilidad

No se usa el valor comercial/FOB/CIF ni el valor por par como ingreso de MANACO. Se requieren columnas explícitas de ingresos/ventas y costo de ventas, moneda reconocida coincidente (por encabezado o columna uniforme de moneda), escala declarada compatible y cero filas duplicadas; los países reportantes deben ser únicos y completos en el alcance filtrado. Los renglones con ingresos/costos ausentes, no numéricos o negativos se excluyen y cuentan.

Fórmulas: `margen bruto = ingresos por ventas − costo de ventas`; `margen bruto % = margen bruto / ingresos por ventas × 100`, solo si los ingresos son mayores que cero. Se muestran tarjetas y un gráfico de ingresos, costos y margen bruto por categoría cuando hay un encabezado de producto/categoría reconocido; en su ausencia, se presenta solo la comparación gráfica de los totales y se explica qué falta para el desglose. No se calcula margen neto, impuestos, costos indirectos ni retorno sobre inversión.

Chart.js 4.4.8 dibuja y actualiza los gráficos en el navegador. La exportación del Dashboard contiene resumen, socios, periodos, solo registros incluidos en indicadores, columnas usadas, filtros/supuestos y, si existen, filas «Mundo». Los archivos se analizan localmente; las bibliotecas estáticas se cargan desde jsDelivr. Sin conectividad no se pueden dibujar gráficos cuando Chart.js no está disponible; el módulo informa el error y no sustituye los gráficos con tablas.

## Alcance y limitaciones

El repositorio no contiene un archivo comercial real ni un diccionario de datos de MANACO. Por ello no se puede verificar la cobertura real de columnas, códigos de movimiento, unidades, costos ni la granularidad de una fuente productiva. La detección depende de encabezados explícitos; no sustituye la validación del diccionario de datos, incoterms, unidades, moneda, periodos, almacenes, SKU ni reglas del negocio. Los módulos operan solo con los archivos cargados; una condición insuficiente muestra requisitos, nunca cifras de ejemplo.

## Publicar en GitHub Pages

El flujo [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) sube el sitio estático cuando se ejecuta manualmente o cuando se publica un cambio en `main`.

1. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
2. Antes de publicar, ejecuta localmente `node --test tests/*.test.js` y las comprobaciones de sintaxis descritas arriba.
3. Con autorización del responsable, envía los cambios a la rama `main` o abre **Actions → Deploy static site to Pages → Run workflow** y selecciona `main`.
4. Espera a que los jobs de build y deploy terminen correctamente; abre la URL de Pages que aparece en el entorno `github-pages`.
5. En la URL publicada, carga un archivo de usuario, cambia de hoja, prueba filtros/exportación y confirma los módulos vacíos/incompatibles. No incluyas archivos comerciales en Git.

El repositorio no ejecuta ni configura publicación remota desde este trabajo. Las rutas a CSS/JS locales son relativas y compatibles con la subruta de Pages. SheetJS y Chart.js se cargan desde jsDelivr; la carga/análisis de archivos ocurre en el navegador, pero la primera descarga de bibliotecas requiere conectividad.