"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../auth");
const asyncHandler_1 = require("../lib/asyncHandler");
const router = (0, express_1.Router)();
// Prisma devuelve requiereSeccion/createdAt en camelCase; el frontend
// espera requiere_seccion en snake_case (mismo patron que mapSection en
// routes/sections.ts). Sin este mapeo, requiere_seccion llega undefined
// al frontend y el filtro de tipos disponibles queda siempre vacio.
function mapIncidentType(t) {
    return {
        id: t.id,
        nombre: t.nombre,
        categoria: t.categoria,
        descripcion: t.descripcion,
        requiere_seccion: t.requiereSeccion,
        activo: t.activo,
        orden: t.orden,
    };
}
// GET /api/incident-types?includeInactive=1
router.get('/', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const includeInactive = req.query.includeInactive === '1' && req.user?.role === 'administrador';
    const rows = await db_1.prisma.incidentType.findMany({
        where: includeInactive ? undefined : { activo: true },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
    res.json({ incident_types: rows.map(mapIncidentType) });
}));
// POST /api/incident-types (admin) { nombre, categoria, descripcion, requiere_seccion }
router.post('/', auth_1.requireAuth, auth_1.requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { nombre, categoria, descripcion, requiere_seccion } = req.body || {};
    if (!nombre || !categoria) {
        res.status(400).json({ error: 'Falta nombre o categoria.' });
        return;
    }
    try {
        const maxOrden = await db_1.prisma.incidentType.aggregate({ _max: { orden: true } });
        const incident_type = await db_1.prisma.incidentType.create({
            data: {
                nombre: String(nombre).trim(),
                categoria,
                descripcion: descripcion || null,
                requiereSeccion: requiere_seccion !== false,
                orden: (maxOrden._max.orden ?? 0) + 10,
            },
        });
        res.status(201).json({ incident_type: mapIncidentType(incident_type) });
    }
    catch {
        res.status(400).json({ error: 'No se pudo crear el tipo (nombre duplicado?).' });
    }
}));
// PATCH /api/incident-types/:id (admin) { activo }
router.patch('/:id', auth_1.requireAuth, auth_1.requireAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { activo } = req.body || {};
    if (typeof activo !== 'boolean') {
        res.status(400).json({ error: 'Falta "activo" (boolean).' });
        return;
    }
    try {
        const incident_type = await db_1.prisma.incidentType.update({
            where: { id: Number(req.params.id) },
            data: { activo },
        });
        res.json({ incident_type: mapIncidentType(incident_type) });
    }
    catch {
        res.status(404).json({ error: 'No encontrado.' });
    }
}));
exports.default = router;
