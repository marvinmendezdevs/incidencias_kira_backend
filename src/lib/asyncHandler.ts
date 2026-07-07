import { Request, Response, NextFunction } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Envuelve un handler async de Express. Express 4 NO atrapa promesas
 * rechazadas dentro de un handler async por si solo: si algo dentro (ej. una
 * llamada a Prisma) rechaza, la promesa queda como "unhandled rejection", que
 * en versiones recientes de Node.js TERMINA el proceso completo en vez de
 * solo devolver un error HTTP (esto es exactamente lo que paso: un error de
 * Prisma tumbo el `npm run dev` entero, y por eso el navegador veia
 * "Failed to fetch" en vez de un error 500 normal).
 *
 * asyncHandler reenvia cualquier rechazo a next(err), que si llega al
 * middleware de errores en src/index.ts y responde con un 500 en JSON, sin
 * matar el servidor.
 */
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
