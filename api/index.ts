import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const app = express();
const prisma = new PrismaClient();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Endpoints migrados de tu backend
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

const DatosQuerySchema = z.object({
  dataset: z.string().min(1),
  region: z.string().min(1),
  indicador: z.string().min(1),
  anio_inicio: z.string().optional(),
  anio_fin: z.string().optional(),
});

app.get('/api/datos', async (req: Request, res: Response) => {
  const parseResult = DatosQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
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
    res.status(500).json({ error: 'Error al consultar datos' });
  }
});

app.get('/api/departamento/ficha', async (req: Request, res: Response) => {
  const dataset = String(req.query.dataset || 'empleo_geih');
  const region = String(req.query.region || '');
  const anio = parseInt(String(req.query.anio || '2023'), 10);

  if (!region) return res.status(400).json({ error: 'Falta la región' });

  try {
    const indicadoresAnio = await prisma.datosEconomicos.findMany({
      where: { dataset, region, anio },
      select: { indicador: true, valor: true, unidad: true },
      orderBy: { indicador: 'asc' },
    });
    res.json({ region, anio, dataset, indicadores: indicadoresAnio });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar ficha' });
  }
});

// Exportar para el runtime de Vercel (sin app.listen)
export default app;