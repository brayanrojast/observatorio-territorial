import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

const prisma = new PrismaClient();

async function procesarArchivo(filePath: string, datasetName: string) {
  const registros: any[] = [];
  const filasCrudas: any[] = [];

  // Leer todo el CSV primero para analizar su estructura (columnas)
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => filasCrudas.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  if (filasCrudas.length === 0) {
    console.log(`   ⚠️ [${datasetName}] -> Archivo vacío.`);
    return;
  }

  const primeraFila = filasCrudas[0];
  const keys = Object.keys(primeraFila);

  // Detectar si el formato es "ancho" (ej. columnas son años como '2007', '2008', etc.)
  const aniosColumnas = keys.filter(k => /^\d{4}$/.test(k.trim()));

  if (aniosColumnas.length > 0) {
    // FORMATO ANCHO (ej. Población total con años en columnas)
    const colDepto = keys.find(k => 
      ['departamento', 'region', 'depto', 'municipio', 'territorio'].some(c => k.toLowerCase().includes(c))
    ) || keys[0];

    for (const row of filasCrudas) {
      const depto = row[colDepto];
      if (!depto) continue;

      for (const anioStr of aniosColumnas) {
        const valorRaw = row[anioStr];
        const anio = parseInt(anioStr.trim(), 10);
        
        // Limpiar strings con comas de miles (ej. "5,593,000" -> 5593000)
        let valorClean = null;
        if (valorRaw !== undefined && valorRaw !== null && String(valorRaw).trim() !== '') {
          const numStr = String(valorRaw).replace(/["$,]/g, '').trim();
          const parsed = parseFloat(numStr);
          if (!isNaN(parsed)) valorClean = parsed;
        }

        registros.push({
          dataset: datasetName,
          region: String(depto).trim(),
          codigoDane: null,
          indicador: datasetName.replace(/_/g, ' '),
          unidad: 'personas / valor',
          anio: anio,
          valor: valorClean,
        });
      }
    }
  } else {
    // FORMATO LARGO / TIDY (ej. Empleo GEIH)
    for (const row of filasCrudas) {
      const getVal = (candidatos: string[]) => {
        for (const c of candidatos) {
          const found = keys.find(k => k.trim().toLowerCase().includes(c.toLowerCase()));
          if (found) return row[found];
        }
        return undefined;
      };

      const anioRaw = getVal(['anio', 'año', 'ano', 'periodo']);
      const depto = getVal(['departamento', 'region', 'depto', 'municipio']);
      const concepto = getVal(['concepto', 'indicador', 'variable']);
      const unidad = getVal(['tipo_de_dato', 'tipo', 'unidad']);
      const valorRaw = getVal(['valor', 'dato', 'tasa']);

      const anio = anioRaw ? parseInt(String(anioRaw).trim(), 10) : NaN;
      const valor = valorRaw !== undefined && valorRaw !== '' && !isNaN(Number(String(valorRaw).replace(',', '.')))
        ? parseFloat(String(valorRaw).replace(',', '.'))
        : null;

      if (depto && concepto && !isNaN(anio)) {
        registros.push({
          dataset: datasetName,
          region: String(depto).trim(),
          codigoDane: null,
          indicador: String(concepto).trim(),
          unidad: unidad ? String(unidad).trim() : 'valor',
          anio: anio,
          valor: valor,
        });
      }
    }
  }

  if (registros.length > 0) {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const lote = registros.slice(i, i + BATCH_SIZE);
      await prisma.datosEconomicos.createMany({ data: lote });
    }
    console.log(`   📦 [${datasetName}] -> ${registros.length} registros insertados exitosamente.`);
  } else {
    console.log(`   ⚠️ [${datasetName}] -> No se pudieron extraer registros válidos.`);
  }
}

async function main() {
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    console.error(`❌ No se encontró la carpeta: ${dataDir}`);
    process.exit(1);
  }

  const archivos = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith('.csv'));
  console.log(`🚀 Encontrados ${archivos.length} archivos CSV. Iniciando ingesta universal inteligente...\n`);

  for (const archivo of archivos) {
    const filePath = path.join(dataDir, archivo);
    const datasetName = path.basename(archivo, path.extname(archivo));
    console.log(`➡️ Procesando: ${archivo}`);
    await procesarArchivo(filePath, datasetName);
  }

  console.log(`\n✅ ¡Ingesta masiva total completada! Todos los datasets están listos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });