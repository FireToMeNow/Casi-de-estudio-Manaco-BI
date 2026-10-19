# MANACO BI | Etapas 1–3: preparación, inteligencia de mercado y dashboard ejecutivo

Aplicación estática para cargar, inspeccionar y preparar archivos comerciales Excel y CSV directamente en el navegador. No incluye datos de MANACO ni envía los archivos a un servidor.

## Uso local

Abre `index.html` en un navegador moderno. Para evitar restricciones del navegador al cargar recursos, también puedes servir la carpeta con cualquier servidor estático local. La biblioteca SheetJS se obtiene desde jsDelivr; los archivos seleccionados permanecen en el navegador.

1. Entra en **Preparación de datos** y selecciona un archivo `.xlsx`, `.xls` o `.csv`.
2. Si el libro tiene varias hojas, selecciona la hoja que quieras inspeccionar.
3. Revisa la vista previa, el diagnóstico y las filas vacías, duplicadas o con posibles agregados «Mundo».
4. Descarga la copia preparada o el informe JSON. La copia preparada retira solo filas completamente vacías; no elimina duplicados ni candidatos «Mundo».
5. Abre **Dashboard ejecutivo** para analizar la misma hoja activa, sin volver a cargar el archivo. Los filtros aparecen solo cuando se reconocen las columnas necesarias.

Se usa la primera fila no vacía como encabezado. Los nombres normalizados se proponen por separado y se usan en la exportación preparada; el informe conserva los encabezados originales y su correspondencia. El diagnóstico describe cálculos automáticos, no conclusiones comerciales.

## Pruebas

Requiere Node.js 18 o posterior. No se necesitan dependencias de npm.

```sh
node --test tests/*.test.js
```

Las pruebas de mercado usan únicamente filas sintéticas declaradas en `tests/market-analysis.test.js`; no representan datos de MANACO.

## Inteligencia de mercado

El módulo usa los encabezados reales de la hoja cargada y presenta la columna detectada para cada rol. No se encontró un archivo comercial real en el repositorio, por lo que la lista de columnas reales solo puede mostrarse después de cargar datos del usuario.

La detección usa alias de encabezados como país/socio/partner, flujo/trade flow, producto/commodity, cantidad de pares/pairs, valor/trade value y fecha/periodo/año. Si varios encabezados encajan con un rol, se marca como ambiguo y no se elige automáticamente. Los filtros de país, flujo, producto y periodo dependen de esas columnas detectadas.

Los flujos reconocidos son importaciones/imports y exportaciones/exports del archivo, no ventas reales de MANACO. Solo se atribuye un país reportante si la fuente contiene un encabezado explícito identificable; un valor de España, por ejemplo, no se atribuye a Bolivia ni a la empresa. Si existen encabezados como «País reportante»/«Reporting country», se habilita un filtro separado del socio comercial; una columna genérica «País» se trata solo como país socio y no se inventa el país reportante.

Los totales se calculan por separado con valores numéricos válidos. Se distingue un cero real de un dato ausente o ambiguo. El saldo se calcula como exportaciones menos importaciones, únicamente cuando se reconocen ambos flujos, hay registros válidos en cada uno, la moneda/unidad común está indicada en el encabezado o en una columna de moneda completa y uniforme, y ambos flujos tienen exactamente la misma cobertura de periodos normalizados. Los códigos reconocidos incluyen USD, EUR, BOB, MXN, ARS, PEN, CLP y BRL; símbolos como `$` no identifican una moneda. Las escalas declaradas como miles/millones se muestran en la unidad, pero los valores no se reescalan. Sin unidad confirmada, se mantienen sumas separadas por flujo, pero se bloquean saldo y gráficos comparativos; monedas mezcladas o incompletas bloquean las sumas agregadas. Sin periodos reconocibles o con cobertura dispareja, se muestran totales separados, sin saldo ni ranking combinado de socios.

El valor ponderado por par usa suma de valores dividida entre suma de cantidades positivas y solo está disponible cuando el encabezado confirma pares individuales (no miles/millones de pares), la moneda es comparable y el análisis cubre un único periodo normalizado. Para fuentes multianuales, debe aplicarse el filtro de periodo; no se mezclan precios/cantidades de años distintos. No se promedian razones por fila. La evolución temporal acepta años, fechas estándar y periodos normalizados; valores no reconocidos se excluyen de ese gráfico y se cuentan. Los socios se ordenan por la suma de flujos solo si la unidad es comparable y ambos flujos cubren los mismos periodos. Los hallazgos descriptivos identifican el indicador y muestran el valor, unidad y registros que los sustentan; no extrapolan tendencias ni formulan recomendaciones causales.

Las filas «Mundo» se excluyen de forma predeterminada del desglose por país. Se pueden inspeccionar en alcance separado; nunca se suman junto a países. Los duplicados exactos se advierten, se cuentan y se conservan para que se evalúe el posible doble conteo. La vista informa registros fuente, filtrados, en alcance, incluidos y excluidos. Los indicadores describen cálculos automáticos y requieren validar unidades, periodo y significado de cada columna antes de interpretarlos.

Los gráficos interactivos usan Chart.js 4.4.8. Las hojas del archivo exportado incluyen resumen, socios, periodos, registros incluidos, columnas usadas, supuestos/filtros y, si existen, filas «Mundo». El procesamiento es local; las bibliotecas estáticas se cargan desde jsDelivr.

## Publicar en GitHub Pages

El flujo `.github/workflows/deploy-pages.yml` publica el sitio estático al hacer push a `main` y también se puede ejecutar manualmente. En GitHub, abre **Settings > Pages** y configura **Build and deployment > Source: GitHub Actions**. La acción utiliza los permisos mínimos de lectura de contenido, escritura de Pages y emisión de token OIDC.

Las rutas de CSS y JavaScript son relativas, por lo que funcionan en Codespaces y bajo la subruta de GitHub Pages. No guardes archivos comerciales en el repositorio; `.gitignore` excluye Excel y CSV.

## Alcance

Funcionan la carga local, selección de hoja, vista previa, diagnóstico, detección de filas vacías/duplicadas y exportación de la Etapa 1, el análisis de mercado de la Etapa 2 y su reutilización en el Dashboard ejecutivo de la Etapa 3. Inventarios, pronósticos y rentabilidad siguen pendientes y no generan indicadores. La detección de roles depende de encabezados explícitos; no sustituye la validación del diccionario de datos, los incoterms, la moneda, unidades, periodos ni reglas de negocio del archivo fuente.