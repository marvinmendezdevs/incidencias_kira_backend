-- Restringe el login a usuarios pre-registrados: un usuario desactivado
-- (activo = false) ya no puede iniciar sesion aunque su correo exista.
ALTER TABLE "users" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
