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
// GET /api/schools?q=texto
router.get('/schools', auth_1.requireAuth, async (req, res) => {
    const q = String(req.query.q || '').trim();
    const rows = await db_1.prisma.school.findMany({
        where: q
            ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }
            : undefined,
        orderBy: { name: 'asc' },
        take: 50,
    });
    res.json({ schools: rows.map((s) => ({ code: s.code, name: s.name })) });
});
// GET /api/sections?schoolCode=XXXX&q=texto
router.get('/sections', auth_1.requireAuth, async (req, res) => {
    const schoolCode = String(req.query.schoolCode || '');
    const q = String(req.query.q || '').trim();
    if (!schoolCode) {
        res.status(400).json({ error: 'Falta schoolCode.' });
        return;
    }
    const rows = await db_1.prisma.section.findMany({
        where: {
            schoolCode,
            active: true,
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
        },
        orderBy: [{ grade: 'asc' }, { sectionLetter: 'asc' }, { subject: 'asc' }, { tipoClase: 'asc' }],
        take: 300,
    });
    res.json({ sections: rows.map(mapSection) });
});
// POST /api/admin/sections/import (multipart, campo "file")
router.post('/admin/sections/import', auth_1.requireAuth, auth_1.requireAdmin, upload.single('file'), async (req, res) => {
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
});
exports.default = router;
