import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

dotenv.config();

const app = express();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Filtro anti inyección SQL estricto
const sqlInjectionPattern = /(\b(SELECT|UNION|INSERT|DELETE|UPDATE|DROP|ALTER|EXEC|TRUNCATE)\b|--|\/\*|\*\/|;)/i;

const safeString = z.string().trim().min(1).max(100).refine((val) => !sqlInjectionPattern.test(val), {
  message: 'Parámetro sospechoso detectado',
});

// 1. Datasets
app.get('/api/datasets', async (_req: Request, res: Response) => {
  try {
    const datasets = await prisma.datosEconomicos.findMany({
      distinct: ['dataset'],
      select: { dataset: true },
    });
    res.json(datasets.map((d) => d.dataset));
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

// 2. Metadata
app.get('/api/metadata', async (req: Request, res: Response) => {
  try {
    const datasetParse = safeString.safeParse(req.query.dataset || 'empleo_geih');
    if (!datasetParse.success) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const dataset = datasetParse.data;

    const regiones = await prisma.datosEconomicos.findMany({
      where: { dataset },
      distinct: ['region'],
      select: { region: true },
      orderBy: { region: 'asc' },
    });
    const indicadores = await prisma.datosEconomicos.findMany({
      where: { dataset },
      distinct: ['indicador'],
      select: { indicador: true, unidad: true },
      orderBy: { indicador: 'asc' },
    });
    res.json({
      regiones: regiones.map((r) => r.region),
      indicadores,
    });
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

// 3. Datos
const DatosQuerySchema = z.object({
  dataset: safeString,
  region: safeString,
  indicador: safeString,
  anio_inicio: z.string().regex(/^\d{4}$/).optional(),
  anio_fin: z.string().regex(/^\d{4}$/).optional(),
});

app.get('/api/datos', async (req: Request, res: Response) => {
  const parseResult = DatosQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Parámetros no permitidos' });
  }
  const { dataset, region, indicador, anio_inicio, anio_fin } = parseResult.data;

  const whereClause: any = { dataset, region, indicador };
  if (anio_inicio || anio_fin) {
    whereClause.anio = {};
    if (anio_inicio) whereClause.anio.gte = parseInt(anio_inicio, 10);
    if (anio_fin) whereClause.anio.lte = parseInt(anio_fin, 10);
  }

  try {
    const datos = await prisma.datosEconomicos.findMany({
      where: whereClause,
      select: { anio: true, valor: true, unidad: true },
      orderBy: { anio: 'asc' },
    });
    res.json(datos);
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

// 4. Ficha Departamental
const FichaQuerySchema = z.object({
  dataset: safeString.default('empleo_geih'),
  region: safeString,
  anio: z.string().regex(/^\d{4}$/).default('2023'),
});

app.get('/api/departamento/ficha', async (req: Request, res: Response) => {
  const parseResult = FichaQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const { dataset, region, anio } = parseResult.data;
  const anioNum = parseInt(anio, 10);

  try {
    const indicadoresAnio = await prisma.datosEconomicos.findMany({
      where: { dataset, region, anio: anioNum },
      select: { indicador: true, valor: true, unidad: true },
      orderBy: { indicador: 'asc' },
    });
    res.json({ region, anio: anioNum, dataset, indicadores: indicadoresAnio });
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

export default app;
