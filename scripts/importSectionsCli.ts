// Reimporta el catalogo de secciones desde un CSV directamente contra
// DATABASE_URL usando Prisma. Util para actualizar manualmente sin pasar
// por el panel de admin.
// Uso: npm run import-csv -- /ruta/a/sections.csv
import 'dotenv/config';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { applySectionsImport } from '../src/lib/importSections';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: npm run import-csv -- /ruta/a/sections.csv');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  console.log(`Importando secciones desde ${filePath}...`);
  const summary = await applySectionsImport(prisma, csvContent);
  console.log('Resumen de importación:', summary);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error al importar secciones:', err);
  process.exit(1);
});
