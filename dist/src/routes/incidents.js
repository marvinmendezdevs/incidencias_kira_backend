"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../auth");
const router = (0, express_1.Router)();
const PRIORIDADES = new Set(['baja', 'media', 'alta']);
const ESTADOS = new Set(['nueva', 'en_proceso', 'resuelta']);
// GET /api/incidents?escuela=&tipo=&estado=&prioridad=&desde=&hasta=&q=&page=&pageSize=
router.get('/', auth_1.requireAuth, async (req, res) => {
    const { escuela, tipo, estado, prioridad, desde, hasta, q } = req.query;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '25'), 10) || 25, 1), 100);
    const where = {
        ...(escuela ? { schoolCode: escuela } : {}),
        ...(tipo ? { incidentTypeId: Number(tipo) } : {}),
        ...(estado ? { estado } : {}),
        ...(prioridad ? { prioridad } : {}),
        ...(desde || hasta
            ? {
                createdAt: {
                    ...(desde ? { gte: new Date(desde) } : {}),
                    ...(hasta ? { lte: new Date(hasta) } : {}),
                },
            }
            : {}),
        ...(q
            ? {
                OR: [
                    { descripcion: { contains: q, mode: 'insensitive' } },
                    { docenteNombre: { contains: q, mode: 'insensitive' } },
                    { estudiantes: { contains: q, mode: 'insensitive' } },
                ],
            }
            : {}),
    };
    const [total, rows] = await Promise.all([
        db_1.prisma.incident.count({ where }),
        db_1.prisma.incident.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { incidentType: true, school: true, section: true },
        }),
    ]);
    const incidents = rows.map(mapIncident);
    res.json({ incidents, total, page, pageSize });
});
// GET /api/incidents/:id
router.get('/:id', auth_1.requireAuth, async (req, res) => {
    const incident = await db_1.prisma.incident.findUnique({
        where: { id: Number(req.params.id) },
        include: { incidentType: true, school: true, section: true },
    });
    if (!incident) {
        res.status(404).json({ error: 'No encontrada.' });
        return;
    }
    res.json({ incident: mapIncident(incident) });
});
// POST /api/incidents
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { incident_type_id, school_code, section_id, descripcion, docente_nombre, estudiantes, contenido_detalle, prioridad, reportante_nombre, } = req.body || {};
    if (!incident_type_id || !school_code || !descripcion) {
        res.status(400).json({ error: 'Faltan campos obligatorios: incident_type_id, school_code, descripcion.' });
        return;
    }
    const tipo = await db_1.prisma.incidentType.findFirst({ where: { id: Number(incident_type_id), activo: true } });
    if (!tipo) {
        res.status(400).json({ error: 'Tipo de incidencia invalido o inactivo.' });
        return;
    }
    if (tipo.requiereSeccion && !section_id) {
        res.status(400).json({ error: 'Este tipo de incidencia requiere seleccionar una seccion.' });
        return;
    }
    const prioridadFinal = PRIORIDADES.has(prioridad) ? prioridad : 'media';
    const incident = await db_1.prisma.incident.create({
        data: {
            incidentTypeId: Number(incident_type_id),
            schoolCode: school_code,
            sectionId: section_id ? Number(section_id) : null,
            descripcion,
            docenteNombre: docente_nombre || null,
            estudiantes: estudiantes || null,
            contenidoDetalle: contenido_detalle || null,
            prioridad: prioridadFinal,
            reportanteUserId: req.user.id,
            reportanteNombre: reportante_nombre || req.user.name,
            reportanteEmail: req.user.email,
        },
    });
    res.status(201).json({ id: incident.id });
});
// PATCH /api/incidents/:id (admin) { estado, prioridad }
router.patch('/:id', auth_1.requireAuth, auth_1.requireAdmin, async (req, res) => {
    const { estado, prioridad } = req.body || {};
    const data = {};
    if (estado !== undefined) {
        if (!ESTADOS.has(estado)) {
            res.status(400).json({ error: 'Estado invalido.' });
            return;
        }
        data.estado = estado;
        data.resolvedAt = estado === 'resuelta' ? new Date() : null;
    }
    if (prioridad !== undefined) {
        if (!PRIORIDADES.has(prioridad)) {
            res.status(400).json({ error: 'Prioridad invalida.' });
            return;
        }
        data.prioridad = prioridad;
    }
    if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'Nada para actualizar.' });
        return;
    }
    try {
        const incident = await db_1.prisma.incident.update({ where: { id: Number(req.params.id) }, data });
        res.json({ incident: { id: incident.id, estado: incident.estado, prioridad: incident.prioridad } });
    }
    catch {
        res.status(404).json({ error: 'No encontrada.' });
    }
});
// Aplana los datos incluidos (incidentType/school/section) al formato plano
// que ya consume el frontend (tipo_nombre, school_name, class_name, etc.).
function mapIncident(row) {
    return {
        id: row.id,
        incident_type_id: row.incidentTypeId,
        tipo_nombre: row.incidentType?.nombre,
        categoria: row.incidentType?.categoria,
        school_code: row.schoolCode,
        school_name: row.school?.name,
        section_id: row.sectionId,
        class_name: row.section?.className,
        grade: row.section?.grade,
        section_letter: row.section?.sectionLetter,
        tipo_clase: row.section?.tipoClase,
        subject: row.section?.subject,
        class_period: row.section?.classPeriod,
        descripcion: row.descripcion,
        docente_nombre: row.docenteNombre,
        estudiantes: row.estudiantes,
        contenido_detalle: row.contenidoDetalle,
        prioridad: row.prioridad,
        estado: row.estado,
        reportante_nombre: row.reportanteNombre,
        reportante_email: row.reportanteEmail,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        resolved_at: row.resolvedAt,
    };
}
exports.default = router;
