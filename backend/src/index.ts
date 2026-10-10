import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import crypto from 'crypto';
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

// Clave simétrica fija para cifrado de payloads (AES-256)
const SECRET_KEY = Buffer.from('8f4a9b2c1d3e5f7a0b2c4d6e8f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a', 'hex');

function encryptPayload(data: any): { secure_payload: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return {
    secure_payload: encrypted,
    iv: iv.toString('hex')
  };
}

// Detector preventivo de Inyección SQL para parámetros libres
const sqlInjectionPattern = /(\b(SELECT|UNION|INSERT|DELETE|UPDATE|DROP|ALTER|EXEC|TRUNCATE)\b|--|\/\*|\*\/|;)/i;

const safeString = z.string().trim().min(1).max(100).refine((val) => !sqlInjectionPattern.test(val), {
  message: 'Parámetro inválido o sospechoso detectado',
});

// Middleware que intercepta respuestas y las cifra para la pestaña Network
function sendSecure(res: Response, data: any) {
  res.json(encryptPayload(data));
}

app.get('/api/datasets', async (_req: Request, res: Response) => {
  try {
    const datasets = await prisma.datosEconomicos.findMany({
      distinct: ['dataset'],
      select: { dataset: true },
    });
    sendSecure(res, datasets.map((d) => d.dataset));
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

app.get('/api/metadata', async (req: Request, res: Response) => {
  try {
    const datasetParse = safeString.safeParse(req.query.dataset || 'empleo_geih');
    if (!datasetParse.success) {
      return res.status(400).json({ error: 'Parámetros no permitidos' });
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
    sendSecure(res, {
      regiones: regiones.map((r) => r.region),
      indicadores,
    });
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

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
    return res.status(400).json({ error: 'Parámetros de consulta no permitidos' });
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
    sendSecure(res, datos);
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

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
    sendSecure(res, { region, anio: anioNum, dataset, indicadores: indicadoresAnio });
  } catch (error) {
    res.status(500).json({ error: 'Servicio no disponible' });
  }
});

export default app;
