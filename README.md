# MANACO BI | Etapa 1: preparación y validación de datos

Aplicación estática para cargar, inspeccionar y preparar archivos comerciales Excel y CSV directamente en el navegador. No incluye datos de MANACO ni envía los archivos a un servidor.

## Uso local

Abre `index.html` en un navegador moderno. Para evitar restricciones del navegador al cargar recursos, también puedes servir la carpeta con cualquier servidor estático local. La biblioteca SheetJS se obtiene desde jsDelivr; los archivos seleccionados permanecen en el navegador.

1. Entra en **Preparación de datos** y selecciona un archivo `.xlsx`, `.xls` o `.csv`.
2. Si el libro tiene varias hojas, selecciona la hoja que quieras inspeccionar.
3. Revisa la vista previa, el diagnóstico y las filas vacías, duplicadas o con posibles agregados «Mundo».
4. Descarga la copia preparada o el informe JSON. La copia preparada retira solo filas completamente vacías; no elimina duplicados ni candidatos «Mundo».

Se usa la primera fila no vacía como encabezado. Los nombres normalizados se proponen por separado y se usan en la exportación preparada; el informe conserva los encabezados originales y su correspondencia. El diagnóstico describe cálculos automáticos, no conclusiones comerciales.

## Pruebas

Requiere Node.js 18 o posterior. No se necesitan dependencias de npm.

```sh
node --test tests/*.test.js
```

## Publicar en GitHub Pages

El flujo `.github/workflows/deploy-pages.yml` publica el sitio estático al hacer push a `main` y también se puede ejecutar manualmente. En GitHub, abre **Settings > Pages** y configura **Build and deployment > Source: GitHub Actions**. La acción utiliza los permisos mínimos de lectura de contenido, escritura de Pages y emisión de token OIDC.

Las rutas de CSS y JavaScript son relativas, por lo que funcionan en Codespaces y bajo la subruta de GitHub Pages. No guardes archivos comerciales en el repositorio; `.gitignore` excluye Excel y CSV.

## Alcance

En esta etapa funcionan la carga local, selección de hoja, vista previa, diagnóstico, detección de filas vacías y duplicados exactos, búsqueda de posibles agregados «Mundo» y exportación. Inteligencia de mercado, inventarios, pronósticos y rentabilidad se muestran como etapas pendientes y no generan indicadores.