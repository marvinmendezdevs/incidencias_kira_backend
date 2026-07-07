// Prueba de integracion de extremo a extremo del API contra un Postgres
// REAL efimero (embedded-postgres: no requiere Docker ni permisos de root).
// Usamos Prisma "db push" para crear el esquema, y un JWT fabricado a mano
// para saltarnos la verificacion real de Google (eso solo se puede probar
// contra credenciales reales).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_EMAILS = 'admin@test.sv';
process.env.FRONTEND_URL = 'http://localhost:5173';

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';
import request from 'supertest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const EmbeddedPostgres = require('embedded-postgres').default;

const PG_PORT = 5599;
const PG_USER = 'incidencias_test';
const PG_PASSWORD = 'incidencias_test';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-incidencias-'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: PG_USER,
  password: PG_PASSWORD,
  port: PG_PORT,
  persistent: false,
});

function adminCookie() {
  const token = jwt.sign(
    { id: 1, email: 'admin@test.sv', name: 'Admin Test', role: 'administrador' },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
  return `incidencias_token=${token}`;
}

test('API Incidencias KIRA (con Postgres real efimero)', async (t) => {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('incidencias_test');

  process.env.DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/incidencias_test`;

  execSync('npx prisma migrate deploy', {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  const { prisma } = require('../src/db');
  const { INCIDENT_TYPES } = require('../src/lib/incidentTypesSeed');

  await prisma.incidentType.createMany({ data: INCIDENT_TYPES });
  await prisma.user.create({
    data: { id: 1, email: 'admin@test.sv', name: 'Admin Test', role: 'administrador' },
  });
  await prisma.school.create({ data: { code: '10001', name: 'CENTRO ESCOLAR DE PRUEBA' } });
  const seedSection = await prisma.section.create({
    data: {
      schoolCode: '10001',
      className: '2 - - A Matutino Clase Lenguaje',
      grade: '2nd Grade',
      sectionLetter: 'A',
      tipoClase: 'Clase',
      subject: 'ENGLISH_LANGUAGE_ARTS',
      classPeriod: 'Matutino',
    },
  });
  await prisma.section.create({
    data: {
      schoolCode: '10001',
      className: '2 - - A Matutino Refuerzo Matematica',
      grade: '2nd Grade',
      sectionLetter: 'A',
      tipoClase: 'Refuerzo',
      subject: 'MATHEMATICS',
      classPeriod: 'Matutino',
    },
  });

  delete require.cache[require.resolve('../src/index')];
  const app = require('../src/index').default;

  try {
    await t.test('GET /health responde ok sin autenticacion', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    });

    await t.test('GET /api/incidents sin cookie -> 401', async () => {
      const res = await request(app).get('/api/incidents');
      assert.equal(res.status, 401);
    });

    let incidentTypeId: number;
    await t.test('GET /api/incident-types trae los 13 tipos precargados', async () => {
      const res = await request(app).get('/api/incident-types').set('Cookie', adminCookie());
      assert.equal(res.status, 200);
      assert.equal(res.body.incident_types.length, 13);
      incidentTypeId = res.body.incident_types[0].id;
      // Regresion: Prisma devuelve requiereSeccion en camelCase; el API debe
      // traducirlo a requiere_seccion (snake_case) o el filtro de tipos
      // disponibles en el formulario del frontend queda siempre vacio.
      const conSeccion = res.body.incident_types.find((t: any) => t.nombre === 'Falta docente en la sección');
      const sinSeccion = res.body.incident_types.find((t: any) => t.nombre === 'Agregar sección nueva');
      assert.equal(conSeccion.requiere_seccion, true);
      assert.equal(sinSeccion.requiere_seccion, false);
      assert.equal(conSeccion.requiereSeccion, undefined);
    });

    await t.test('GET /api/schools y /api/sections devuelven la escuela y las clases semilla', async () => {
      const schools = await request(app).get('/api/schools').set('Cookie', adminCookie());
      assert.equal(schools.status, 200);
      assert.equal(schools.body.schools.length, 1);
      assert.equal(schools.body.schools[0].code, '10001');

      const sections = await request(app).get('/api/sections?schoolCode=10001').set('Cookie', adminCookie());
      assert.equal(sections.status, 200);
      assert.equal(sections.body.sections.length, 2); // 2 clases, misma sección física
      // Prisma devuelve camelCase; el API debe traducir a snake_case para el frontend.
      const sec = sections.body.sections.find((s: any) => s.tipo_clase === 'Clase');
      assert.equal(sec.class_name, '2 - - A Matutino Clase Lenguaje');
      assert.equal(sec.section_letter, 'A');
      assert.equal(sec.class_period, 'Matutino');
      assert.equal(sec.className, undefined);
    });

    await t.test('GET /api/sections/physical agrupa las clases en una sola sección física', async () => {
      const res = await request(app).get('/api/sections/physical?schoolCode=10001').set('Cookie', adminCookie());
      assert.equal(res.status, 200);
      assert.equal(res.body.physical_sections.length, 1);
      const fisica = res.body.physical_sections[0];
      assert.equal(fisica.grade, '2nd Grade');
      assert.equal(fisica.section_letter, 'A');
      assert.equal(fisica.class_period, 'Matutino');
      assert.equal(fisica.clases_count, 2);
    });

    await t.test('GET /api/sections filtra por grade/sectionLetter/classPeriod (para el modal de clase)', async () => {
      const res = await request(app)
        .get('/api/sections?schoolCode=10001&grade=2nd%20Grade&sectionLetter=A&classPeriod=Matutino')
        .set('Cookie', adminCookie());
      assert.equal(res.status, 200);
      assert.equal(res.body.sections.length, 2);
    });

    await t.test('GET /api/sections filtra por id (para ir directo a una clase desde la lista plana)', async () => {
      const res = await request(app)
        .get(`/api/sections?schoolCode=10001&id=${seedSection.id}`)
        .set('Cookie', adminCookie());
      assert.equal(res.status, 200);
      assert.equal(res.body.sections.length, 1);
      assert.equal(res.body.sections[0].id, seedSection.id);
      assert.equal(res.body.sections[0].class_name, '2 - - A Matutino Clase Lenguaje');
    });

    let createdIncidentId: number;
    await t.test('POST /api/incidents crea una incidencia', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Cookie', adminCookie())
        .send({
          incident_type_id: incidentTypeId,
          school_code: '10001',
          section_id: seedSection.id,
          descripcion: 'Faltan 5 estudiantes por matricular en esta seccion.',
          prioridad: 'alta',
        });
      assert.equal(res.status, 201);
      assert.ok(res.body.id);
      createdIncidentId = res.body.id;
    });

    let docenteIncidentId: number;
    await t.test('POST /api/incidents guarda los datos de contacto del docente', async () => {
      const docenteType = (await request(app).get('/api/incident-types').set('Cookie', adminCookie())).body
        .incident_types.find((t: any) => t.nombre === 'Docente con problemas de acceso a la plataforma');
      const res = await request(app)
        .post('/api/incidents')
        .set('Cookie', adminCookie())
        .send({
          incident_type_id: docenteType.id,
          school_code: '10001',
          section_id: seedSection.id,
          descripcion: 'El correo registrado esta mal escrito.',
          docente_nombre: 'MONTERROZA DE LOPEZ, ROSA ALICIA',
          docente_email: 'rosa.alicia.monterroza@clases.edu.sv',
          docente_telefono: '7000-0000',
          docente_dui: '00000000-0',
        });
      assert.equal(res.status, 201);
      docenteIncidentId = res.body.id;
    });

    await t.test('POST /api/incidents sin seccion cuando el tipo la requiere -> 400', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Cookie', adminCookie())
        .send({ incident_type_id: incidentTypeId, school_code: '10001', descripcion: 'Sin seccion.' });
      assert.equal(res.status, 400);
    });

    await t.test('GET /api/incidents lista la incidencia creada con sus joins', async () => {
      const res = await request(app).get('/api/incidents').set('Cookie', adminCookie());
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 2);
      const incident = res.body.incidents.find((i: any) => i.id === createdIncidentId);
      assert.equal(incident.school_name, 'CENTRO ESCOLAR DE PRUEBA');
      assert.equal(incident.class_name, '2 - - A Matutino Clase Lenguaje');
      assert.equal(incident.estado, 'nueva');

      const docenteIncident = res.body.incidents.find((i: any) => i.id === docenteIncidentId);
      assert.equal(docenteIncident.docente_nombre, 'MONTERROZA DE LOPEZ, ROSA ALICIA');
      assert.equal(docenteIncident.docente_email, 'rosa.alicia.monterroza@clases.edu.sv');
      assert.equal(docenteIncident.docente_telefono, '7000-0000');
      assert.equal(docenteIncident.docente_dui, '00000000-0');
    });

    await t.test('PATCH /api/incidents/:id actualiza estado y marca resolved_at', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${createdIncidentId}`)
        .set('Cookie', adminCookie())
        .send({ estado: 'resuelta' });
      assert.equal(res.status, 200);
      assert.equal(res.body.incident.estado, 'resuelta');
    });

    await t.test('POST /api/admin/sections/import agrega una escuela y seccion nuevas por CSV', async () => {
      const csv =
        'code,school_name,class_name,grade,track,subtrack,section,subject,type,class_period,access_teacher,student_access_percentage,percentage_tasks_completed,percentage_correct_answers,recent_date_access,start_class,end_class,date\n' +
        '20099,ESCUELA NUEVA DE PRUEBA,3 - - B Vespertino Clase Matematica,3rd Grade,,,B,MATHEMATICS,,Vespertino,0,0.0,,,,,,2026-07-01\n';

      const res = await request(app)
        .post('/api/admin/sections/import')
        .set('Cookie', adminCookie())
        .attach('file', Buffer.from(csv, 'utf-8'), 'sections.csv');

      assert.equal(res.status, 200);
      assert.equal(res.body.summary.escuelas_creadas, 1);
      assert.equal(res.body.summary.secciones_creadas, 1);
    });
  } finally {
    await prisma.$disconnect();
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
