import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Section } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireAdmin } from '../auth';
import { applySectionsImport } from '../lib/importSections';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Prisma devuelve los campos del modelo en camelCase (schoolCode, className, ...);
// el resto del API y el frontend usan snake_case, asi que mapeamos aca.
function mapSection(s: Section) {
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
router.get(
  '/schools',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '20'), 10) || 20, 1), 100);
    const where = q
      ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { code: { contains: q, mode: 'insensitive' as const } }] }
      : undefined;

    const [total, rows] = await Promise.all([
      prisma.school.count({ where }),
      prisma.school.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ schools: rows.map((s) => ({ code: s.code, name: s.name })), total, page, pageSize });
  })
);

// GET /api/schools/:code
router.get(
  '/schools/:code',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const school = await prisma.school.findUnique({ where: { code: req.params.code } });
    if (!school) {
      res.status(404).json({ error: 'Escuela no encontrada.' });
      return;
    }
    res.json({ school });
  })
);

// GET /api/sections/physical?schoolCode=X
// Agrupa las clases en secciones fisicas reales (escuela+grado+letra+turno),
// que es lo que una persona reconoce como "un aula". Cada seccion fisica
// puede tener varias clases (materia + tipo de clase) por debajo.
router.get(
  '/sections/physical',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schoolCode = String(req.query.schoolCode || '');
    if (!schoolCode) {
      res.status(400).json({ error: 'Falta schoolCode.' });
      return;
    }

    const grouped = await prisma.section.groupBy({
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
        if (grade !== 0) return grade;
        const letter = (a.section_letter || '').localeCompare(b.section_letter || '');
        if (letter !== 0) return letter;
        return (a.class_period || '').localeCompare(b.class_period || '');
      });

    res.json({ physical_sections: physicalSections });
  })
);

// GET /api/sections?schoolCode=XXXX&q=texto&grade=&sectionLetter=&classPeriod=&id=&page=&pageSize=
// page/pageSize son OPCIONALES para no romper a quien ya consume esto sin
// paginar (ej. buscar por id): si ninguno de los dos viene en el query, se
// devuelve el shape viejo { sections } (hasta 300). Si viene alguno, se
// devuelve paginado { sections, total, page, pageSize } (para "Cargar más"
// en la lista de secciones de una escuela, que puede tener miles de filas).
router.get(
  '/sections',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schoolCode = String(req.query.schoolCode || '');
    const q = String(req.query.q || '').trim();
    const { grade, sectionLetter, classPeriod, id } = req.query as Record<string, string | undefined>;
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
              { className: { contains: q, mode: 'insensitive' as const } },
              { grade: { contains: q, mode: 'insensitive' as const } },
              { subject: { contains: q, mode: 'insensitive' as const } },
              { tipoClase: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const orderBy = [
      { grade: 'asc' as const },
      { sectionLetter: 'asc' as const },
      { subject: 'asc' as const },
      { tipoClase: 'asc' as const },
    ];

    if (!paginated) {
      const rows = await prisma.section.findMany({ where, orderBy, take: 300 });
      res.json({ sections: rows.map(mapSection) });
      return;
    }

    const [total, rows] = await Promise.all([
      prisma.section.count({ where }),
      prisma.section.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ sections: rows.map(mapSection), total, page, pageSize });
  })
);

// POST /api/admin/sections/import (multipart, campo "file")
router.post(
  '/admin/sections/import',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Falta el archivo CSV (campo "file").' });
      return;
    }
    try {
      const csvContent = req.file.buffer.toString('utf-8');
      const summary = await applySectionsImport(prisma, csvContent);
      res.json({ ok: true, summary });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sections/import]', err);
      res.status(400).json({ error: 'No se pudo procesar el archivo CSV. Verifica el formato.' });
    }
  })
);

export default router;
