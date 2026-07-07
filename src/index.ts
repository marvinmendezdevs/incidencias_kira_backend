import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import sectionsRoutes from './routes/sections';
import incidentTypesRoutes from './routes/incidentTypes';
import incidentsRoutes from './routes/incidents';

const app = express();

// Red de seguridad a nivel de proceso: si algo (fuera de una ruta de Express
// envuelta en asyncHandler) rechaza una promesa sin atraparla, Node.js
// recientes MATAN el proceso completo por defecto. Eso es exactamente lo que
// paso antes: un error de Prisma tumbaba "npm run dev" entero y el navegador
// veia "Failed to fetch" en cualquier peticion despues. Con esto, en el peor
// caso queda un log del error en vez de un servidor caido.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[uncaughtException]', err);
});

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true, service: 'incidencias-kira-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api', sectionsRoutes); // /api/schools, /api/sections, /api/admin/sections/import
app.use('/api/incident-types', incidentTypesRoutes);
app.use('/api/incidents', incidentsRoutes);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = Number(process.env.PORT) || 4000;
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log('Backend Incidencias KIRA escuchando en puerto ' + PORT);
  });
}

export default app;
