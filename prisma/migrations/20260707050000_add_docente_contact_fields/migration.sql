-- Datos de contacto del docente (nombre ya existia); vienen de teachers.csv
-- (email, telephone, dui) para poder identificar/contactar al docente real
-- en KIRA cuando se reporta una incidencia relacionada a el.
ALTER TABLE "incidents" ADD COLUMN "docente_email" TEXT;
ALTER TABLE "incidents" ADD COLUMN "docente_telefono" TEXT;
ALTER TABLE "incidents" ADD COLUMN "docente_dui" TEXT;
