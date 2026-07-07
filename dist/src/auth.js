"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.COOKIE_NAME = void 0;
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
/** Crea o actualiza el usuario en la base de datos y calcula su rol. */
async function upsertUser({ sub, email, name }) {
    const role = adminEmailSet().has(email) ? 'administrador' : 'reportante';
    const user = await db_1.prisma.user.upsert({
        where: { email },
        create: { googleSub: sub, email, name, role, lastLoginAt: new Date() },
        update: { googleSub: sub, name, role, lastLoginAt: new Date() },
    });
    return { id: user.id, email: user.email, name: user.name || user.email, role: user.role };
}
function issueToken(user) {
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}
function setAuthCookie(res, token) {
    res.cookie(exports.COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
function clearAuthCookie(res) {
    res.clearCookie(exports.COOKIE_NAME);
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
