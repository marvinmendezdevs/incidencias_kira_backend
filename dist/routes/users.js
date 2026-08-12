"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../auth");
const asyncHandler_1 = require("../lib/asyncHandler");
const router = (0, express_1.Router)();
const ROLES = new Set(['reportante', 'administrador']);
function mapUser(u) {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        activo: u.activo,
        last_login_at: u.lastLoginAt,
        created_at: u.createdAt,
    };
}
// GET /api/admin/users?q=texto&role=&activo=&page=1&pageSize=20
router.get('/', auth_1.requireAuth, auth_1.requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const roleParam = String(req.query.role || '');
    const activoParam = String(req.query.activo || '');
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '20'), 10) || 20, 1), 100);
    const where = {};
    if (q) {
        where.OR = [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
        ];
    }
    if (ROLES.has(roleParam))
        where.role = roleParam;
    if (activoParam === 'true')
        where.activo = true;
    if (activoParam === 'false')
        where.activo = false;
    const [total, rows] = await Promise.all([
        db_1.prisma.user.count({ where }),
        db_1.prisma.user.findMany({ where, orderBy: { email: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ users: rows.map(mapUser), total, page, pageSize });
}));
// POST /api/admin/users { email, name?, role? }
router.post('/', auth_1.requireAuth, auth_1.requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, name, role } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
        res.status(400).json({ error: 'Correo invalido.' });
        return;
    }
    const finalRole = ROLES.has(role) ? role : 'reportante';
    try {
        const user = await db_1.prisma.user.create({
            data: { email: cleanEmail, name: name ? String(name).trim() : null, role: finalRole },
        });
        res.status(201).json({ user: mapUser(user) });
    }
    catch {
        res.status(400).json({ error: 'Ese correo ya esta registrado.' });
    }
}));
// PATCH /api/admin/users/:id { activo?, role? }
router.patch('/:id', auth_1.requireAuth, auth_1.requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { activo, role } = req.body || {};
    const data = {};
    if (typeof activo === 'boolean')
        data.activo = activo;
    if (role !== undefined) {
        if (!ROLES.has(role)) {
            res.status(400).json({ error: 'Rol invalido.' });
            return;
        }
        data.role = role;
    }
    if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'Nada para actualizar.' });
        return;
    }
    try {
        const user = await db_1.prisma.user.update({ where: { id: Number(req.params.id) }, data });
        res.json({ user: mapUser(user) });
    }
    catch {
        res.status(404).json({ error: 'No encontrado.' });
    }
}));
exports.default = router;
