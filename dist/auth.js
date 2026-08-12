"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserNotAuthorizedError = exports.COOKIE_NAME = void 0;
exports.verifyGoogleIdToken = verifyGoogleIdToken;
exports.upsertUser = upsertUser;
exports.issueToken = issueToken;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const db_1 = require("./db");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
exports.COOKIE_NAME = 'incidencias_token';
const googleClient = GOOGLE_CLIENT_ID ? new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID) : null;
function adminEmailSet() {
    return new Set((process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean));
}
/** Verifica un ID token de Google y devuelve { sub, email, name }. */
async function verifyGoogleIdToken(idToken) {
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
/**
 * Se lanza cuando alguien intenta iniciar sesion con un correo que no esta
 * registrado (o que un administrador desactivo) en la tabla users. Antes
 * cualquier cuenta de Google podia entrar y se auto-creaba en la primera
 * visita; ahora el acceso esta restringido a quienes ya fueron dados de alta
 * desde el panel de administrador.
 */
class UserNotAuthorizedError extends Error {
    constructor() {
        super('Tu correo no esta registrado en la plataforma. Pide a un administrador que te agregue.');
        this.name = 'UserNotAuthorizedError';
    }
}
exports.UserNotAuthorizedError = UserNotAuthorizedError;
/** Verifica que el usuario ya exista y este activo, y actualiza sus datos de login. */
async function upsertUser({ sub, email, name }) {
    const existing = await db_1.prisma.user.findUnique({ where: { email } });
    if (!existing || !existing.activo) {
        throw new UserNotAuthorizedError();
    }
    const role = adminEmailSet().has(email) ? 'administrador' : existing.role;
    const user = await db_1.prisma.user.update({
        where: { email },
        data: { googleSub: sub, name, role, lastLoginAt: new Date() },
    });
    return { id: user.id, email: user.email, name: user.name || user.email, role: user.role };
}
function issueToken(user) {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
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
        sameSite: (IS_LOCAL_DEV ? 'lax' : 'none'),
    };
}
function setAuthCookie(res, token) {
    res.cookie(exports.COOKIE_NAME, token, {
        ...cookieOptions(),
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
function clearAuthCookie(res) {
    // clearCookie debe usar las mismas opciones (sameSite/secure/path) con las
    // que se creo la cookie; si no coinciden, algunos navegadores no la borran.
    res.clearCookie(exports.COOKIE_NAME, cookieOptions());
}
function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies[exports.COOKIE_NAME];
    if (!token) {
        res.status(401).json({ error: 'No autenticado.' });
        return;
    }
    try {
        req.user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        next();
    }
    catch {
        res.status(401).json({ error: 'Sesion invalida o expirada.' });
    }
}
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'administrador') {
        res.status(403).json({ error: 'Se requiere rol administrador.' });
        return;
    }
    next();
}
