import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parseSectionsCsv } from '../src/lib/importSections';
import { INCIDENT_TYPES } from '../src/lib/incidentTypesSeed';

const prisma = new PrismaClient();

async function seedIncidentTypes() {
  for (const t of INCIDENT_TYPES) {
    await prisma.incidentType.upsert({ where: { nombre: t.nombre }, create: t, update: {} });
  }
  console.log(`Tipos de incidencia: ${INCIDENT_TYPES.length} listos.`);
}

async function chunk<T>(items: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
  }
}

async function seedSectionsFromCsv() {
  const csvPath = path.join(__dirname, 'seed-data', 'sections.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('No se encontró prisma/seed-data/sections.csv; se omite la carga masiva de secciones.');
    console.log('(Puedes importarla luego desde el panel de admin o con "npm run import-csv".)');
    return;
  }

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const { schools, sections } = parseSectionsCsv(csvContent);

  const schoolRows = Array.from(schools.entries()).map(([code, name]) => ({ code, name }));
  await chunk(schoolRows, 500, (batch) => prisma.school.createMany({ data: batch, skipDuplicates: true }));
  console.log(`Escuelas: ${schoolRows.length} procesadas.`);

  const sectionRows = sections.map((s) => ({
    schoolCode: s.school_code,
    className: s.class_name,
    grade: s.grade,
    track: s.track,
    subtrack: s.subtrack,
    sectionLetter: s.section_letter,
    tipoClase: s.tipo_clase,
    subject: s.subject,
    classPeriod: s.class_period,
  }));
  await chunk(sectionRows, 1000, (batch) => prisma.section.createMany({ data: batch, skipDuplicates: true }));
  console.log(`Secciones: ${sectionRows.length} procesadas.`);
}

async function main() {
  await seedIncidentTypes();
  await seedSectionsFromCsv();
}

main()
  .catch((err) => {
    console.error('Error en el seed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
