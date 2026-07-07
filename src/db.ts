import { PrismaClient } from '@prisma/client';

// Cliente Prisma unico para toda la app. En pruebas, DATABASE_URL se
// configura (apuntando a un Postgres embebido efimero) ANTES de importar
// este modulo, asi que el mismo PrismaClient sirve para produccion y pruebas.
export const prisma = new PrismaClient();
