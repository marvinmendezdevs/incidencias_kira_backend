-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "google_sub" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'reportante',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" SERIAL NOT NULL,
    "school_code" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "grade" TEXT,
    "track" TEXT,
    "subtrack" TEXT,
    "section_letter" TEXT,
    "subject" TEXT,
    "class_period" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_types" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT,
    "requiere_seccion" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" SERIAL NOT NULL,
    "incident_type_id" INTEGER NOT NULL,
    "school_code" TEXT NOT NULL,
    "section_id" INTEGER,
    "descripcion" TEXT NOT NULL,
    "docente_nombre" TEXT,
    "estudiantes" TEXT,
    "contenido_detalle" TEXT,
    "prioridad" TEXT NOT NULL DEFAULT 'media',
    "estado" TEXT NOT NULL DEFAULT 'nueva',
    "reportante_user_id" INTEGER,
    "reportante_nombre" TEXT,
    "reportante_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sections_school_code_idx" ON "sections"("school_code");

-- CreateIndex
CREATE INDEX "sections_active_idx" ON "sections"("active");

-- CreateIndex
CREATE UNIQUE INDEX "sections_school_code_class_name_key" ON "sections"("school_code", "class_name");

-- CreateIndex
CREATE UNIQUE INDEX "incident_types_nombre_key" ON "incident_types"("nombre");

-- CreateIndex
CREATE INDEX "incidents_school_code_idx" ON "incidents"("school_code");

-- CreateIndex
CREATE INDEX "incidents_estado_idx" ON "incidents"("estado");

-- CreateIndex
CREATE INDEX "incidents_incident_type_id_idx" ON "incidents"("incident_type_id");

-- CreateIndex
CREATE INDEX "incidents_created_at_idx" ON "incidents"("created_at");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_school_code_fkey" FOREIGN KEY ("school_code") REFERENCES "schools"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_incident_type_id_fkey" FOREIGN KEY ("incident_type_id") REFERENCES "incident_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_school_code_fkey" FOREIGN KEY ("school_code") REFERENCES "schools"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportante_user_id_fkey" FOREIGN KEY ("reportante_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
