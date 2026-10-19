# MANACO BI | Preparación, análisis comercial y módulos ejecutivos

Aplicación estática para cargar, inspeccionar y preparar archivos comerciales Excel y CSV directamente en el navegador. No incluye datos de MANACO ni envía los archivos a un servidor.

## Uso local

Abre `index.html` en un navegador moderno. Para evitar restricciones del navegador al cargar recursos, también puedes servir la carpeta con cualquier servidor estático local. La biblioteca SheetJS se obtiene desde jsDelivr; los archivos seleccionados permanecen en el navegador.

1. Entra en **Preparación de datos** y selecciona un archivo `.xlsx`, `.xls` o `.csv`.
2. Si el libro tiene varias hojas, selecciona la hoja que quieras inspeccionar.
3. Revisa la vista previa, el diagnóstico y las filas vacías, duplicadas o con posibles agregados «Mundo».
4. Descarga la copia preparada o el informe JSON. La copia preparada retira solo filas completamente vacías; no elimina duplicados ni candidatos «Mundo».
5. Abre **Dashboard ejecutivo**, **Inventarios**, **Pronósticos** o **Rentabilidad** para analizar la hoja activa, sin volver a cargar el archivo. Cada módulo calcula solo cuando reconoce los campos necesarios; en otro caso, describe los datos faltantes.

Se usa la primera fila no vacía como encabezado. Los nombres normalizados se proponen por separado y se usan en la exportación preparada; el informe conserva los encabezados originales y su correspondencia. El diagnóstico describe cálculos automáticos, no conclusiones comerciales.

## Pruebas

Requiere Node.js 18 o posterior. No se necesitan dependencias de npm.

```sh
node --test tests/*.test.js
node --check assets/js/app.js
node --check assets/js/data-analysis.js
node --check assets/js/market-analysis.js
node --check assets/js/market-dashboard.js
node --check assets/js/business-modules.js
git diff --check
```

Las pruebas usan filas sintéticas declaradas en los archivos de `tests/`; no representan datos de MANACO.

## Inteligencia de mercado

El módulo usa los encabezados reales de la hoja cargada y presenta la columna detectada para cada rol. No se encontró un archivo comercial real en el repositorio, por lo que la lista de columnas reales solo puede mostrarse después de cargar datos del usuario.

La detección usa alias de encabezados como país/socio/partner, flujo/trade flow, producto/commodity, cantidad de pares/pairs, valor/trade value y fecha/periodo/año. Si varios encabezados encajan con un rol, se marca como ambiguo y no se elige automáticamente. Los filtros de país, flujo, producto y periodo dependen de esas columnas detectadas.

Los flujos reconocidos son importaciones/imports y exportaciones/exports del archivo, no ventas reales de MANACO. Solo se atribuye un país reportante si la fuente contiene un encabezado explícito identificable; un valor de España, por ejemplo, no se atribuye a Bolivia ni a la empresa. Si existen encabezados como «País reportante»/«Reporting country», se habilita un filtro separado del socio comercial. Si el archivo incluye varios países reportantes, se debe elegir uno antes de calcular totales para evitar consolidarlos. Una columna genérica «País» se trata solo como país socio y no se inventa el país reportante.

Los totales se calculan por separado con valores numéricos válidos. Se distingue un cero real de un dato ausente o ambiguo. El saldo se calcula como exportaciones menos importaciones, únicamente cuando se reconocen ambos flujos, hay registros válidos en cada uno, la moneda común está indicada en el encabezado o en una columna de moneda completa y uniforme, y ambos flujos tienen exactamente la misma cobertura de periodos normalizados. Los códigos reconocidos incluyen USD, EUR, BOB, MXN, ARS, PEN, CLP y BRL; símbolos como `$` no identifican una moneda. Las escalas declaradas como miles/millones se muestran en la unidad, pero los valores no se reescalan. Sin unidad confirmada, se mantienen sumas separadas por flujo, pero se bloquean saldo y gráficos comparativos; monedas mezcladas o incompletas bloquean sumas. Sin periodos reconocibles o con cobertura dispareja, se muestran totales separados, sin saldo ni ranking combinado de socios.

El valor ponderado por par es `suma del valor comercial de filas con valor válido y pares > 0 / suma de esos pares`. Solo se calcula cuando el encabezado confirma pares individuales (no miles/millones de pares), la moneda está confirmada y todas las filas usadas pertenecen a un único periodo normalizado. Para fuentes multianuales debe aplicarse el filtro de periodo; no se promedian razones por fila. La evolución temporal usa años, fechas estándar, trimestres o meses reconocidos; fechas/meses imposibles se excluyen. Los socios se ordenan por suma de flujos solo cuando unidad y periodo son comparables. Los hallazgos descriptivos citan las cifras y registros que los sustentan; no extrapolan tendencias ni formulan recomendaciones causales.

Las filas agregadas «Mundo» (y rótulos equivalentes reconocidos) se excluyen de forma predeterminada del desglose por país. Se pueden inspeccionar en alcance separado; nunca se suman junto a países. Los duplicados exactos se advierten, se cuentan y se conservan en preparación/análisis de mercado; el pronóstico y los cálculos de rentabilidad se bloquean si hay duplicados que podrían inflar agregados. El Dashboard informa filas fuente, filtradas, en alcance, incluidas y excluidas; las tablas/exportaciones de registros incluidos solo contienen filas usadas para indicadores válidos.

## Inventarios

El módulo requiere encabezados únicos de producto, tipo de movimiento y cantidad numérica. Clasifica valores explícitos de entrada/ingreso/recepción/compra y salida/egreso/despacho/venta, y suma cantidades no negativas por producto y dimensiones reconocidas de país/reportante/almacén. Los movimientos no reconocidos, cantidades ausentes/negativas, productos faltantes, duplicados y filas «Mundo» se advierten; no se corrigen ni se eliminan datos silenciosamente.

Las alertas de reposición requieren además columnas reconocibles de existencia actual y punto de reposición, unidades explícitas iguales en ambos encabezados, valores consistentes y completos por producto/dimensión, un solo periodo si hay fecha, y ausencia de duplicados o dimensiones ambiguas. Fórmula: `alerta = existencia actual ≤ punto de reposición`. Sin un stock actual no se infiere stock a partir de entradas menos salidas, pues puede faltar el inventario inicial.

## Pronósticos

Se calcula una línea base solo si hay una columna explícita con exactamente un país reportante completo, moneda confirmada y uniforme, al menos tres años calendario consecutivos, valores/periodos reconocibles en las filas del alcance y ningún duplicado exacto. Cada flujo se pronostica por separado solo si está observado en todos los años. Método: persistencia naïve, `valor del siguiente año = valor observado en el último año`; horizonte fijo: un año. No estima tendencia/estacionalidad, no modela causas ni cambios futuros, y no es una promesa de ventas. Si no se cumplen las condiciones, el módulo muestra los criterios faltantes y no presenta una proyección.

## Rentabilidad

No se usa el valor comercial/FOB/CIF ni el valor por par como ingreso de MANACO. Se requieren columnas explícitas de ingresos/ventas y costo de ventas, moneda reconocida coincidente (por encabezado o columna uniforme de moneda), escala declarada compatible, y cero filas duplicadas; los países reportantes deben ser únicos y completos cuando ese campo exista. Los renglones con ingresos/costos ausentes, no numéricos o negativos se excluyen y se cuentan. Fórmulas: `margen bruto = ingresos por ventas − costo de ventas`; `margen bruto % = margen bruto / ingresos por ventas × 100`, solo si los ingresos totales son mayores que cero. No calcula margen neto, impuestos, costos indirectos, rentabilidad por producto ni retorno sobre inversión. Confirma que las columnas correspondan al mismo nivel de detalle y al negocio antes de interpretar resultados.

Los gráficos interactivos usan Chart.js 4.4.8. La exportación del Dashboard contiene resumen, socios, periodos, solo registros incluidos en indicadores, columnas usadas, filtros/supuestos y, si existen, filas «Mundo». El procesamiento de archivos es local; las bibliotecas estáticas se cargan desde jsDelivr.

## Alcance y limitaciones

El repositorio no contiene un archivo comercial real ni un diccionario de datos de MANACO. Por ello no se puede verificar la cobertura real de columnas, códigos de movimiento, unidades, costos ni la granularidad de una fuente productiva. La detección depende de encabezados explícitos; no sustituye la validación del diccionario de datos, incoterms, unidades, moneda, periodos, almacenes, SKU ni reglas del negocio. Los módulos operan solo con los archivos cargados; una condición insuficiente muestra requisitos, nunca cifras de ejemplo.

## Publicar en GitHub Pages

El flujo [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) sube el sitio estático cuando se ejecuta manualmente o cuando se publica un cambio en `main`.

1. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
2. Antes de publicar, ejecuta localmente `node --test tests/*.test.js` y las comprobaciones de sintaxis descritas arriba.
3. Con autorización del responsable, envía los cambios a la rama `main` o abre **Actions → Deploy static site to Pages → Run workflow** y selecciona `main`.
4. Espera a que los jobs de build y deploy terminen correctamente; abre la URL de Pages que aparece en el entorno `github-pages`.
5. En la URL publicada, carga un archivo de usuario, cambia de hoja, prueba filtros/exportación y confirma los módulos vacíos/incompatibles. No incluyas archivos comerciales en Git.

El repositorio no ejecuta ni configura publicación remota desde este trabajo. Las rutas a CSS/JS locales son relativas y compatibles con la subruta de Pages. SheetJS y Chart.js se cargan desde jsDelivr; la carga/análisis del archivo ocurre en el navegador, pero la primera descarga de bibliotecas requiere conectividad.