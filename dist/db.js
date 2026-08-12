"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Cliente Prisma unico para toda la app. En pruebas, DATABASE_URL se
// configura (apuntando a un Postgres embebido efimero) ANTES de importar
// este modulo, asi que el mismo PrismaClient sirve para produccion y pruebas.
exports.prisma = new client_1.PrismaClient();
