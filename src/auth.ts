import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from './db';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const COOKIE_NAME = 'incidencias_token';

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

export type Role = 'reportante' | 'administrador';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export interface GooglePayload {
  sub: string;
  email: string;
  name: string;
}

function adminEmailSet(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Verifica un ID token de Google y devuelve { sub, email, name }. */
export async function verifyGoogleIdToken(idToken: string): Promise<GooglePayload> {
  if (!googleClient) {
    throw new Error('GOOGLE_CLIENT_ID no esta configurado en el servidor.');
  }
  const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new Error('Token de Google invalido.');
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email,
  };
}

/** Crea o actualiza el usuario en la base de datos y calcula su rol. */
export async function upsertUser({ sub, email, name }: GooglePayload): Promise<AuthUser> {
  const role: Role = adminEmailSet().has(email) ? 'administrador' : 'reportante';
  const user = await prisma.user.upsert({
    where: { email },
    create: { googleSub: sub, email, name, role, lastLoginAt: new Date() },
    update: { googleSub: sub, name, role, lastLoginAt: new Date() },
  });
  return { id: user.id, email: user.email, name: user.name || user.email, role: user.role as Role };
}

export function issueToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Frontend (Netlify) y backend (Render) viven en dominios distintos, asi que
// la cookie de sesion tiene que ser cross-site: SameSite=None + Secure. Antes
// esto dependia de poner NODE_ENV=production como variable de entorno en
// Render; si se olvidaba (facil de olvidar), la cookie quedaba SameSite=Lax
// y el navegador simplemente nunca la mandaba de vuelta en las peticiones a
// la API, dando "No autenticado" en todo despues del login. Para que esto no
// dependa de acordarse de una env var, ahora el default seguro (cross-site)
// se usa siempre EXCEPTO cuando estamos explicitamente en desarrollo local
// (NODE_ENV=development, que es lo que trae el .env de este proyecto).
const IS_LOCAL_DEV = process.env.NODE_ENV === 'development';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: !IS_LOCAL_DEV,
    sameSite: (IS_LOCAL_DEV ? 'lax' : 'none') as 'lax' | 'none',
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response): void {
  // clearCookie debe usar las mismas opciones (sameSite/secure/path) con las
  // que se creo la cookie; si no coinciden, algunos navegadores no la borran.
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'No autenticado.' });
    return;
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'Sesion invalida o expirada.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'administrador') {
    res.status(403).json({ error: 'Se requiere rol administrador.' });
    return;
  }
  next();
}
