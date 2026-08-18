import { prisma } from '../db';
import {
  AiIncidenceClassification,
  IncidenceClassification,
  classifyIncidenceWithAi,
  aiModel,
} from './ai-incidence-classifier.service';

const CLASSIFICATIONS = new Set<IncidenceClassification>(['APLICA', 'NO_APLICA', 'REQUIERE_REVISION']);

export class IncidentNotFoundError extends Error {}
export class InvalidClassificationReviewError extends Error {}

export async function classifyStoredIncident(incidentId: number): Promise<AiIncidenceClassification> {
  const [incident, activeTypes] = await Promise.all([
    prisma.incident.findUnique({
      where: { id: incidentId },
      include: { incidentType: true, school: true, section: true },
    }),
    prisma.incidentType.findMany({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    }),
  ]);
  if (!incident) throw new IncidentNotFoundError('Incidencia no encontrada.');

  const result = await classifyIncidenceWithAi({
    description: incident.descripcion,
    selectedIncidentType: {
      id: incident.incidentType.id,
      name: incident.incidentType.nombre,
      category: incident.incidentType.categoria,
      description: incident.incidentType.descripcion,
    },
    school: incident.school.name,
    grade: incident.section?.grade || null,
    section: incident.section?.sectionLetter || null,
    subject: incident.section?.subject || null,
    classPeriod: incident.section?.classPeriod || null,
    additionalDetails: {
      content: incident.contenidoDetalle,
      students: incident.estudiantes,
      teacherName: incident.docenteNombre,
    },
    availableIncidentTypes: activeTypes.map((type) => ({
      id: type.id,
      name: type.nombre,
      category: type.categoria,
      description: type.descripcion,
      requiresSection: type.requiereSeccion,
    })),
  });

  await prisma.incident.update({
    where: { id: incidentId },
    data: {
      aiClassification: result.clasificacion,
      aiIncidentTypeId: result.tipoIncidenciaId,
      aiConfidence: result.confianza,
      aiReason: result.motivo,
      aiAnalyzedAt: new Date(),
      aiModel: aiModel(),
      aiReviewed: false,
      humanClassification: null,
      humanIncidentTypeId: null,
      humanReason: null,
      aiReviewedAt: null,
      aiReviewedByUserId: null,
    },
  });

  return result;
}

export async function reviewAiClassification(input: {
  incidentId: number;
  reviewerUserId: number;
  clasificacion: IncidenceClassification;
  tipoIncidenciaId: number | null;
  motivo?: string | null;
}) {
  if (!CLASSIFICATIONS.has(input.clasificacion)) {
    throw new InvalidClassificationReviewError('Clasificacion humana invalida.');
  }

  const incident = await prisma.incident.findUnique({ where: { id: input.incidentId } });
  if (!incident) throw new IncidentNotFoundError('Incidencia no encontrada.');
  if (!incident.aiClassification) {
    throw new InvalidClassificationReviewError('La incidencia aun no tiene una clasificacion de IA.');
  }

  let typeId: number | null = null;
  if (input.clasificacion === 'APLICA') {
    if (!input.tipoIncidenciaId) {
      throw new InvalidClassificationReviewError('APLICA requiere indicar el tipo correcto.');
    }
    const activeType = await prisma.incidentType.findFirst({
      where: { id: input.tipoIncidenciaId, activo: true },
    });
    if (!activeType) throw new InvalidClassificationReviewError('El tipo indicado no existe o esta inactivo.');
    typeId = activeType.id;
  }

  return prisma.incident.update({
    where: { id: input.incidentId },
    data: {
      aiReviewed: true,
      humanClassification: input.clasificacion,
      humanIncidentTypeId: typeId,
      humanReason: input.motivo?.trim().slice(0, 1000) || null,
      aiReviewedAt: new Date(),
      aiReviewedByUserId: input.reviewerUserId,
    },
  });
}
