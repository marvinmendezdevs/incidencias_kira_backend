"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../db");
const auth_1 = require("../auth");
const importSections_1 = require("../lib/importSections");
const asyncHandler_1 = require("../lib/asyncHandler");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
// Prisma devuelve los campos del modelo en camelCase (schoolCode, className, ...);
// el resto del API y el frontend usan snake_case, asi que mapeamos aca.
function mapSection(s) {
    return {
        id: s.id,
        school_code: s.schoolCode,
        class_name: s.className,
        grade: s.grade,
        track: s.track,
        subtrack: s.subtrack,
        section_letter: s.sectionLetter,
        tipo_clase: s.tipoClase,
        subject: s.subject,
        class_period: s.classPeriod,
        active: s.active,
    };
}
// GET /api/schools?q=texto&page=1&pageSize=20
router.get('/schools', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '20'), 10) || 20, 1), 100);
    const where = q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }
        : undefined;
    const [total, rows] = await Promise.all([
        db_1.prisma.school.count({ where }),
        db_1.prisma.school.findMany({
            where,
            orderBy: { name: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
    ]);
    res.json({ schools: rows.map((s) => ({ code: s.code, name: s.name })), total, page, pageSize });
}));
// GET /api/schools/:code
router.get('/schools/:code', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const school = await db_1.prisma.school.findUnique({ where: { code: req.params.code } });
    if (!school) {
        res.status(404).json({ error: 'Escuela no encontrada.' });
        return;
    }
    res.json({ school });
}));
// GET /api/sections/physical?schoolCode=X
// Agrupa las clases en secciones fisicas reales (escuela+grado+letra+turno),
// que es lo que una persona reconoce como "un aula". Cada seccion fisica
// puede tener varias clases (materia + tipo de clase) por debajo.
router.get('/sections/physical', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schoolCode = String(req.query.schoolCode || '');
    if (!schoolCode) {
        res.status(400).json({ error: 'Falta schoolCode.' });
        return;
    }
    const grouped = await db_1.prisma.section.groupBy({
        by: ['grade', 'sectionLetter', 'classPeriod'],
        where: { schoolCode, active: true },
        _count: { _all: true },
    });
    const physicalSections = grouped
        .map((g) => ({
        grade: g.grade,
        section_letter: g.sectionLetter,
        class_period: g.classPeriod,
        clases_count: g._count._all,
    }))
        .sort((a, b) => {
        const grade = (a.grade || '').localeCompare(b.grade || '', undefined, { numeric: true });
        if (grade !== 0)
            return grade;
        const letter = (a.section_letter || '').localeCompare(b.section_letter || '');
        if (letter !== 0)
            return letter;
        return (a.class_period || '').localeCompare(b.class_period || '');
    });
    res.json({ physical_sections: physicalSections });
}));
// GET /api/sections?schoolCode=XXXX&q=texto&grade=&sectionLetter=&classPeriod=&id=&page=&pageSize=
// page/pageSize son OPCIONALES para no romper a quien ya consume esto sin
// paginar (ej. buscar por id): si ninguno de los dos viene en el query, se
// devuelve el shape viejo { sections } (hasta 300). Si viene alguno, se
// devuelve paginado { sections, total, page, pageSize } (para "Cargar más"
// en la lista de secciones de una escuela, que puede tener miles de filas).
router.get('/sections', auth_1.requireAuth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schoolCode = String(req.query.schoolCode || '');
    const q = String(req.query.q || '').trim();
    const { grade, sectionLetter, classPeriod, id } = req.query;
    if (!schoolCode) {
        res.status(400).json({ error: 'Falta schoolCode.' });
        return;
    }
    const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '60'), 10) || 60, 1), 300);
    const where = {
        schoolCode,
        active: true,
        ...(id ? { id: Number(id) } : {}),
        ...(grade ? { grade } : {}),
        ...(sectionLetter ? { sectionLetter } : {}),
        ...(classPeriod ? { classPeriod } : {}),
        ...(q
            ? {
                OR: [
                    { className: { contains: q, mode: 'insensitive' } },
                    { grade: { contains: q, mode: 'insensitive' } },
                    { subject: { contains: q, mode: 'insensitive' } },
                    { tipoClase: { contains: q, mode: 'insensitive' } },
                ],
            }
            : {}),
    };
    const orderBy = [
        { grade: 'asc' },
        { sectionLetter: 'asc' },
        { subject: 'asc' },
        { tipoClase: 'asc' },
    ];
    if (!paginated) {
        const rows = await db_1.prisma.section.findMany({ where, orderBy, take: 300 });
        res.json({ sections: rows.map(mapSection) });
        return;
    }
    const [total, rows] = await Promise.all([
        db_1.prisma.section.count({ where }),
        db_1.prisma.section.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ sections: rows.map(mapSection), total, page, pageSize });
}));
// POST /api/admin/sections/import (multipart, campo "file")
router.post('/admin/sections/import', auth_1.requireAuth, auth_1.requireAdmin, upload.single('file'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'Falta el archivo CSV (campo "file").' });
        return;
    }
    try {
        const csvContent = req.file.buffer.toString('utf-8');
        const summary = await (0, importSections_1.applySectionsImport)(db_1.prisma, csvContent);
        res.json({ ok: true, summary });
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[sections/import]', err);
        res.status(400).json({ error: 'No se pudo procesar el archivo CSV. Verifica el formato.' });
    }
}));
exports.default = router;
