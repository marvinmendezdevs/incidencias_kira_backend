"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Reimporta el catalogo de secciones desde un CSV directamente contra
// DATABASE_URL usando Prisma. Util para actualizar manualmente sin pasar
// por el panel de admin.
// Uso: npm run import-csv -- /ruta/a/sections.csv
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const importSections_1 = require("../src/lib/importSections");
async function main() {
    const filePath = process.argv[2];
    if (!filePath) {
        console.error('Uso: npm run import-csv -- /ruta/a/sections.csv');
        process.exit(1);
    }
    const prisma = new client_1.PrismaClient();
    const csvContent = fs_1.default.readFileSync(filePath, 'utf-8');
    console.log(`Importando secciones desde ${filePath}...`);
    const summary = await (0, importSections_1.applySectionsImport)(prisma, csvContent);
    console.log('Resumen de importación:', summary);
    await prisma.$disconnect();
}
main().catch((err) => {
    console.error('Error al importar secciones:', err);
    process.exit(1);
});
