import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// 1. Datasets
app.get('/api/datasets', async (_req: Request, res: Response) => {
  try {
    const datasets = await prisma.datosEconomicos.findMany({
      distinct: ['dataset'],
      select: { dataset: true },
    });
    res.json(datasets.map((d) => d.dataset));
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar datasets' });
  }
});

// 2. Metadata
app.get('/api/metadata', async (req: Request, res: Response) => {
  try {
    const dataset = String(req.query.dataset || 'empleo_geih');
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
    res.status(500).json({ error: 'Error al consultar metadata' });
  }
});

// 3. Datos series históricas
const DatosQuerySchema = z.object({
  dataset: z.string().min(1),
  region: z.string().min(1),
  indicador: z.string().min(1),
});

app.get('/api/datos', async (req: Request, res: Response) => {
  const parseResult = DatosQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }
  const { dataset, region, indicador } = parseResult.data;
  try {
    const datos = await prisma.datosEconomicos.findMany({
      where: { dataset, region, indicador },
      select: { anio: true, valor: true, unidad: true },
      orderBy: { anio: 'asc' },
    });
    res.json(datos);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar datos' });
  }
});

// 4. Ficha Departamental por Año
app.get('/api/departamento/ficha', async (req: Request, res: Response) => {
  const dataset = String(req.query.dataset || 'empleo_geih');
  const region = String(req.query.region || '');
  const anio = parseInt(String(req.query.anio || '2023'), 10);

  if (!region) {
    return res.status(400).json({ error: 'Falta el parámetro region' });
  }

  try {
    const indicadoresAnio = await prisma.datosEconomicos.findMany({
      where: { dataset, region, anio },
      select: { indicador: true, valor: true, unidad: true },
      orderBy: { indicador: 'asc' },
    });

    res.json({
      region,
      anio,
      dataset,
      indicadores: indicadoresAnio,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar ficha' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});