import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireAdmin } from '../auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const PRIORIDADES = new Set(['baja', 'media', 'alta']);
// "no_aplica": para incidencias que no se pueden resolver (ej. ya no aplica
// por cambios externos, duplicada, fuera de alcance, etc.).
const ESTADOS = new Set(['nueva', 'en_proceso', 'resuelta', 'no_aplica']);

// GET /api/incidents?escuela=&tipo=&estado=&prioridad=&desde=&hasta=&q=&page=&pageSize=
// Quien no es administrador solo ve las incidencias que el mismo reporto.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { escuela, tipo, estado, prioridad, desde, hasta, q } = req.query as Record<string, string | undefined>;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '25'), 10) || 25, 1), 100);

    const where: Prisma.IncidentWhereInput = {
      ...(req.user!.role !== 'administrador' ? { reportanteUserId: req.user!.id } : {}),
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
              { docenteEmail: { contains: q, mode: 'insensitive' } },
              { estudiantes: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { incidentType: true, school: true, section: true },
      }),
    ]);

    const incidents = rows.map(mapIncident);
    res.json({ incidents, total, page, pageSize });
  })
);

// GET /api/incidents/:id
// Quien no es administrador solo puede ver el detalle si la reporto el mismo
// (404 en vez de 403 para no confirmar que la incidencia existe).
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const incident = await prisma.incident.findUnique({
      where: { id: Number(req.params.id) },
      include: { incidentType: true, school: true, section: true },
    });
    if (!incident) {
      res.status(404).json({ error: 'No encontrada.' });
      return;
    }
    if (req.user!.role !== 'administrador' && incident.reportanteUserId !== req.user!.id) {
      res.status(404).json({ error: 'No encontrada.' });
      return;
    }
    res.json({ incident: mapIncident(incident) });
  })
);

// POST /api/incidents
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      incident_type_id,
      school_code,
      section_id,
      descripcion,
      docente_nombre,
      docente_email,
      docente_telefono,
      docente_dui,
      estudiantes,
      contenido_detalle,
      prioridad,
      reportante_nombre,
    } = req.body || {};

    if (!incident_type_id || !school_code || !descripcion) {
      res.status(400).json({ error: 'Faltan campos obligatorios: incident_type_id, school_code, descripcion.' });
      return;
    }

    const tipo = await prisma.incidentType.findFirst({ where: { id: Number(incident_type_id), activo: true } });
    if (!tipo) {
      res.status(400).json({ error: 'Tipo de incidencia invalido o inactivo.' });
      return;
    }

    if (tipo.requiereSeccion && !section_id) {
      res.status(400).json({ error: 'Este tipo de incidencia requiere seleccionar una seccion.' });
      return;
    }

    const prioridadFinal = PRIORIDADES.has(prioridad) ? prioridad : 'media';

    const incident = await prisma.incident.create({
      data: {
        incidentTypeId: Number(incident_type_id),
        schoolCode: school_code,
        sectionId: section_id ? Number(section_id) : null,
        descripcion,
        docenteNombre: docente_nombre || null,
        docenteEmail: docente_email || null,
        docenteTelefono: docente_telefono || null,
        docenteDui: docente_dui || null,
        estudiantes: estudiantes || null,
        contenidoDetalle: contenido_detalle || null,
        prioridad: prioridadFinal,
        reportanteUserId: req.user!.id,
        reportanteNombre: reportante_nombre || req.user!.name,
        reportanteEmail: req.user!.email,
      },
    });

    res.status(201).json({ id: incident.id });
  })
);

// PATCH /api/incidents/:id (admin) { estado, prioridad }
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { estado, prioridad } = req.body || {};
    const data: Prisma.IncidentUpdateInput = {};

    if (estado !== undefined) {
      if (!ESTADOS.has(estado)) {
        res.status(400).json({ error: 'Estado invalido.' });
        return;
      }
      data.estado = estado;
      // Solo "resuelta" marca resolved_at; "no_aplica" es un cierre distinto
      // (la incidencia no se resolvio, simplemente ya no aplica).
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
      const incident = await prisma.incident.update({ where: { id: Number(req.params.id) }, data });
      res.json({ incident: { id: incident.id, estado: incident.estado, prioridad: incident.prioridad } });
    } catch {
      res.status(404).json({ error: 'No encontrada.' });
    }
  })
);

// Aplana los datos incluidos (incidentType/school/section) al formato plano
// que ya consume el frontend (tipo_nombre, school_name, class_name, etc.).
function mapIncident(row: any) {
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
    docente_email: row.docenteEmail,
    docente_telefono: row.docenteTelefono,
    docente_dui: row.docenteDui,
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

export default router;
