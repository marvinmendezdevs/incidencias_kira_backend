"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const importSections_1 = require("../src/lib/importSections");
const incidentTypesSeed_1 = require("../src/lib/incidentTypesSeed");
const prisma = new client_1.PrismaClient();
async function seedIncidentTypes() {
    for (const t of incidentTypesSeed_1.INCIDENT_TYPES) {
        await prisma.incidentType.upsert({ where: { nombre: t.nombre }, create: t, update: {} });
    }
    console.log(`Tipos de incidencia: ${incidentTypesSeed_1.INCIDENT_TYPES.length} listos.`);
}
async function chunk(items, size, fn) {
    for (let i = 0; i < items.length; i += size) {
        await fn(items.slice(i, i + size));
    }
}
async function seedSectionsFromCsv() {
    const csvPath = path_1.default.join(__dirname, 'seed-data', 'sections.csv');
    if (!fs_1.default.existsSync(csvPath)) {
        console.log('No se encontró prisma/seed-data/sections.csv; se omite la carga masiva de secciones.');
        console.log('(Puedes importarla luego desde el panel de admin o con "npm run import-csv".)');
        return;
    }
    const csvContent = fs_1.default.readFileSync(csvPath, 'utf-8');
    const { schools, sections } = (0, importSections_1.parseSectionsCsv)(csvContent);
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
