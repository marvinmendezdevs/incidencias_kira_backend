import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { requireAuth, requireAdmin } from '../auth';
import { asyncHandler } from '../lib/asyncHandler';
import {
  AiClassifierConfigurationError,
  AiClassifierProviderError,
  geminiModel,
} from '../services/ai-incidence-classifier.service';
import {
  IncidentNotFoundError,
  InvalidClassificationReviewError,
  classifyStoredIncident,
  reviewAiClassification,
} from '../services/incidence.service';

const router = Router();

const PRIORIDADES = new Set(['baja', 'media', 'alta']);
// "no_aplica": para incidencias que no se pueden resolver (ej. ya no aplica
// por cambios externos, duplicada, fuera de alcance, etc.).
const ESTADOS = new Set(['nueva', 'en_proceso', 'resuelta', 'no_aplica']);

function filteredNewIncidentsWhere(filters: Record<string, unknown>): Prisma.IncidentWhereInput {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const tipo = Number(filters.tipo);
  const q = text(filters.q);
  return {
    estado: 'nueva',
    ...(Number.isInteger(tipo) && tipo > 0 ? { incidentTypeId: tipo } : {}),
    ...(text(filters.prioridad) ? { prioridad: text(filters.prioridad) } : {}),
    ...(text(filters.escuelaNombre)
      ? { school: { name: { contains: text(filters.escuelaNombre), mode: 'insensitive' } } }
      : {}),
    ...(text(filters.turno)
      ? { section: { classPeriod: { equals: text(filters.turno), mode: 'insensitive' } } }
      : {}),
    ...(text(filters.motivo)
      ? { descripcion: { contains: text(filters.motivo), mode: 'insensitive' } }
      : {}),
    ...(q
      ? {
          OR: [
            { descripcion: { contains: q, mode: 'insensitive' } },
            { contenidoDetalle: { contains: q, mode: 'insensitive' } },
            { reportanteNombre: { contains: q, mode: 'insensitive' } },
            { reportanteEmail: { contains: q, mode: 'insensitive' } },
            { incidentType: { nombre: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

function excelCell(value: unknown): unknown {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return `'${value}`;
  return value ?? '';
}

function pendingAnalysisWhere(base: Prisma.IncidentWhereInput): Prisma.IncidentWhereInput {
  return {
    AND: [base, { OR: [{ aiClassification: null }, { aiClassification: 'REQUIERE_REVISION' }] }],
  };
}

// GET /api/incidents?escuela=&escuelaNombre=&tipo=&estado=&prioridad=&turno=&motivo=&desde=&hasta=&q=&page=&pageSize=
// Quien no es administrador solo ve las incidencias que el mismo reporto.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      escuela,
      escuelaNombre,
      tipo,
      estado,
      prioridad,
      turno,
      motivo,
      desde,
      hasta,
      q,
    } = req.query as Record<string, string | undefined>;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '25'), 10) || 25, 1), 100);

    // Búsqueda accent+case insensitive via unaccent (raw SQL → IDs)
    // Cubre: motivo (descripcion), contenido_detalle, tipo de incidencia,
    // nombre del reportante y correo del reportante.
    let searchIds: number[] | null = null;
    if (q && q.trim()) {
      const pattern = `%${q.trim()}%`;
      const rows = await prisma.$queryRaw<{ id: number }[]>`
        SELECT DISTINCT i.id
        FROM incidents i
        JOIN incident_types it ON i.incident_type_id = it.id
        WHERE
          unaccent(i.descripcion)                          ILIKE unaccent(${pattern})
          OR unaccent(COALESCE(i.contenido_detalle, ''))   ILIKE unaccent(${pattern})
          OR unaccent(it.nombre)                           ILIKE unaccent(${pattern})
          OR unaccent(COALESCE(i.reportante_nombre, ''))   ILIKE unaccent(${pattern})
          OR unaccent(COALESCE(i.reportante_email,  ''))   ILIKE unaccent(${pattern})
      `;
      searchIds = rows.map((r) => Number(r.id));
    }

    const where: Prisma.IncidentWhereInput = {
      // Restricción por rol (reportante solo ve las suyas)
      ...(req.user!.role !== 'administrador' ? { reportanteUserId: req.user!.id } : {}),
      // Filtros de selección
      ...(escuela ? { schoolCode: escuela } : {}),
      ...(escuelaNombre ? { school: { name: { contains: escuelaNombre, mode: 'insensitive' } } } : {}),
      ...(tipo ? { incidentTypeId: Number(tipo) } : {}),
      ...(estado ? { estado } : {}),
      ...(prioridad ? { prioridad } : {}),
      // Filtro por turno → aplica sobre la sección relacionada
      ...(turno ? { section: { classPeriod: { equals: turno, mode: 'insensitive' } } } : {}),
      // Filtro específico de motivo (descripcion)
      ...(motivo ? { descripcion: { contains: motivo, mode: 'insensitive' } } : {}),
      // Rango de fechas
      ...(desde || hasta
        ? {
            createdAt: {
              ...(desde ? { gte: new Date(desde) } : {}),
              ...(hasta ? { lte: new Date(hasta) } : {}),
            },
          }
        : {}),
      // IDs resultantes de la búsqueda accent-insensitive
      ...(searchIds !== null ? { id: { in: searchIds } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.incident.count({ where }),
      prisma.incident.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          incidentType: true,
          school: true,
          section: true,
          aiIncidentType: true,
          humanIncidentType: true,
        },
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
  '/:id(\\d+)',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const incident = await prisma.incident.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        incidentType: true,
        school: true,
        section: true,
        aiIncidentType: true,
        humanIncidentType: true,
      },
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

// POST /api/incidents/:id/classify (admin)
// Genera y guarda una recomendacion. No modifica el tipo elegido ni el estado.
router.post(
  '/:id/classify',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const classification = await classifyStoredIncident(Number(req.params.id));
      res.json({ classification });
    } catch (error) {
      if (error instanceof IncidentNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof AiClassifierConfigurationError) {
        res.status(503).json({ error: error.message });
        return;
      }
      if (error instanceof AiClassifierProviderError) {
        console.error('[ai-classifier]', error.message);
        res.status(502).json({ error: 'No fue posible obtener la clasificacion de IA. Intenta nuevamente.' });
        return;
      }
      throw error;
    }
  })
);

// POST /api/incidents/:id/classification-review (admin)
// Guarda la confirmacion/correccion humana sin alterar la incidencia original.
router.post(
  '/:id/classification-review',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { clasificacion, tipoIncidenciaId, motivo } = req.body || {};
    try {
      await reviewAiClassification({
        incidentId: Number(req.params.id),
        reviewerUserId: req.user!.id,
        clasificacion,
        tipoIncidenciaId: tipoIncidenciaId == null ? null : Number(tipoIncidenciaId),
        motivo,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof IncidentNotFoundError) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidClassificationReviewError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  })
);

// POST /api/incidents/bulk-classify-new (admin)
// Procesa un lote del filtro actual. El frontend repite usando afterId para
// evitar una unica peticion larga y hacer visible el progreso.
router.post(
  '/bulk-classify-new',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const filters = (req.body?.filters || {}) as Record<string, unknown>;
    const afterId = Math.max(Number(req.body?.afterId) || 0, 0);
    const batchSize = Math.min(Math.max(Number(req.body?.batchSize) || 10, 1), 20);
    const baseWhere = filteredNewIncidentsWhere(filters);
    const candidates = await prisma.incident.findMany({
      where: { AND: [pendingAnalysisWhere(baseWhere), { id: { gt: afterId } }] },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });

    const results: Array<{ id: number; classification?: string; error?: string }> = [];
    let halted = false;
    let errorReason: string | null = null;
    let retryAt: string | null = null;
    // Concurrencia baja para respetar mejor los limites del Free Tier.
    for (let index = 0; index < candidates.length; index += 2) {
      const chunk = candidates.slice(index, index + 2);
      const settled = await Promise.allSettled(
        chunk.map(async ({ id }) => {
          const classification = await classifyStoredIncident(id);
          return { id, classification: classification.clasificacion };
        })
      );
      settled.forEach((result, offset) => {
        const id = chunk[offset].id;
        if (result.status === 'fulfilled') results.push(result.value);
        else {
          console.error(`[ai-bulk-classifier] incidencia ${id}:`, result.reason);
          results.push({ id, error: 'No se pudo analizar.' });
          if (!errorReason) {
            const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
            if (result.reason instanceof AiClassifierConfigurationError) {
              errorReason = message;
            } else if (/429|quota|l[ií]mite|resource_exhausted/i.test(message)) {
              const retryMatch = message.match(/(?:retry\s*(?:in|delay)[^0-9]*|retryDelay["']?\s*[:=]\s*["']?)(\d+(?:\.\d+)?)\s*s/i);
              if (retryMatch) {
                const retrySeconds = Math.max(1, Math.ceil(Number(retryMatch[1])));
                retryAt = new Date(Date.now() + retrySeconds * 1000).toISOString();
                errorReason = 'Gemini alcanzó temporalmente el límite de solicitudes.';
              } else if (/per.?day|requestsperday|tokensperday|daily|quota_exceeded/i.test(message)) {
                errorReason = 'Gemini agotó la cuota diaria. Revisa el panel de uso para conocer cuándo se restablece.';
              } else {
                errorReason = 'Gemini alcanzó el límite de solicitudes y no indicó una hora exacta de reintento.';
              }
            } else if (/401|403|api.?key|permission_denied/i.test(message)) {
              errorReason = 'Gemini rechazó la credencial configurada. Revisa GEMINI_API_KEY.';
            } else if (/404|not found|modelo/i.test(message)) {
              errorReason = `El modelo de Gemini configurado no está disponible (${geminiModel()}).`;
            } else {
              errorReason = 'Gemini no está respondiendo correctamente. Revisa el registro del backend para ver el detalle.';
            }
          }
        }
      });
      // Si falla todo un grupo, normalmente es un problema general de clave,
      // modelo o cuota. No repetimos el mismo error para cientos de registros.
      if (settled.every((result) => result.status === 'rejected')) {
        halted = true;
        break;
      }
    }

    const nextAfterId = candidates.at(-1)?.id || afterId;
    const remaining = await prisma.incident.count({
      where: { AND: [pendingAnalysisWhere(baseWhere), { id: { gt: nextAfterId } }] },
    });
    res.json({
      processed: results.filter((result) => !result.error).length,
      failed: results.filter((result) => result.error).length,
      noAplica: results.filter((result) => result.classification === 'NO_APLICA').length,
      nextAfterId,
      hasMore: !halted && remaining > 0,
      halted,
      errorReason,
      retryAt,
      results,
    });
  })
);

// GET /api/incidents/analysis-status (admin)
router.get('/analysis-status', requireAuth, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const where = filteredNewIncidentsWhere(req.query as Record<string, unknown>);
  const [total, pending] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.count({ where: pendingAnalysisWhere(where) }),
  ]);
  res.json({ total, analyzed: total - pending, pending, ready: pending === 0 && total > 0 });
}));

// GET /api/incidents/export-applicable-new (admin)
// Genera un XLSX real con hojas separadas. No permite exportar resultados parciales.
router.get(
  '/export-applicable-new',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const where = filteredNewIncidentsWhere(req.query as Record<string, unknown>);
    const pending = await prisma.incident.count({
      where: pendingAnalysisWhere(where),
    });
    if (pending > 0) {
      res.status(409).json({ error: `Falta analizar ${pending} incidencia${pending === 1 ? '' : 's'} antes de descargar el Excel.` });
      return;
    }
    const rows = await prisma.incident.findMany({
      where: { ...where, aiClassification: { in: ['APLICA', 'NO_APLICA'] } },
      orderBy: { createdAt: 'asc' },
      include: { incidentType: true, aiIncidentType: true, school: true, section: true },
    });
    const header = [
      'ID', 'Tipo seleccionado', 'Tipo sugerido IA', 'Confianza IA', 'Motivo IA',
      'Escuela', 'Codigo escuela', 'Grado', 'Seccion', 'Turno', 'Asignatura',
      'Descripcion', 'Detalle', 'Estudiantes', 'Reportante', 'Correo', 'Fecha',
    ];
    const toValues = (row: (typeof rows)[number]) => [
        row.id, row.incidentType.nombre, row.aiIncidentType?.nombre, row.aiConfidence,
        row.aiReason, row.school.name, row.schoolCode, row.section?.grade,
        row.section?.sectionLetter, row.section?.classPeriod, row.section?.subject,
        row.descripcion, row.contenidoDetalle, row.estudiantes, row.reportanteNombre,
        row.reportanteEmail, row.createdAt.toISOString(),
      ].map(excelCell);
    const workbook = XLSX.utils.book_new();
    const addSheet = (name: string, classification: 'APLICA' | 'NO_APLICA') => {
      const sheet = XLSX.utils.aoa_to_sheet([header, ...rows.filter((row) => row.aiClassification === classification).map(toValues)]);
      sheet['!autofilter'] = { ref: `A1:Q${Math.max(1, rows.length + 1)}` };
      sheet['!cols'] = header.map((title) => ({ wch: Math.max(14, title.length + 2) }));
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };
    addSheet('Aplican', 'APLICA');
    addSheet('No aplican', 'NO_APLICA');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="analisis-incidencias-${date}.xlsx"`);
    res.send(buffer);
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
    ai_classification: row.aiClassification,
    ai_incident_type_id: row.aiIncidentTypeId,
    ai_incident_type: row.aiIncidentType?.nombre || null,
    ai_confidence: row.aiConfidence,
    ai_reason: row.aiReason,
    ai_analyzed_at: row.aiAnalyzedAt,
    ai_model: row.aiModel,
    ai_reviewed: row.aiReviewed,
    human_classification: row.humanClassification,
    human_incident_type_id: row.humanIncidentTypeId,
    human_incident_type: row.humanIncidentType?.nombre || null,
    human_reason: row.humanReason,
    ai_reviewed_at: row.aiReviewedAt,
  };
}

export default router;
