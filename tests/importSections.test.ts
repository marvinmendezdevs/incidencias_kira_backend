import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSectionsCsv,
  normalizePeriod,
  extractTipoClase,
  extractSectionLetterFallback,
  extractClassPeriodFallback,
} from '../src/lib/importSections';

const SAMPLE_CSV = `code,school_name,class_name,grade,track,subtrack,section,subject,type,class_period,access_teacher,student_access_percentage,percentage_tasks_completed,percentage_correct_answers,recent_date_access,start_class,end_class,date
10001,CENTRO ESCOLAR ISIDRO MENÉNDEZ,2 - - A Matutino Clase Lenguaje,2nd Grade,,,A,ENGLISH_LANGUAGE_ARTS,,Matutino,0,0.0,,,,,,2026-07-01
10001,CENTRO ESCOLAR ISIDRO MENÉNDEZ,2 - - A Matutino Clase Lenguaje,2nd Grade,,,A,ENGLISH_LANGUAGE_ARTS,,Matutino,0,0.0,,,,,,2026-06-01
10001,CENTRO ESCOLAR ISIDRO MENÉNDEZ,2 - - A Matutino Clase Matematica,2nd Grade,,,A,MATHEMATICS,,matutino,0,0.0,,,,,,2026-07-01
10002,CENTRO ESCOLAR ALFREDO ESPINO,3 - - B vespertino Refuerzo,3rd Grade,,,B,,,vespertino,0,0.0,,,,,,2026-07-01
,ESCUELA SIN CODIGO,X,1st Grade,,,A,MATHEMATICS,,Matutino,0,0.0,,,,,,2026-07-01
`;

test('parseSectionsCsv agrupa escuelas únicas por código', () => {
  const { schools } = parseSectionsCsv(SAMPLE_CSV);
  assert.equal(schools.size, 2);
  assert.equal(schools.get('10001'), 'CENTRO ESCOLAR ISIDRO MENÉNDEZ');
  assert.equal(schools.get('10002'), 'CENTRO ESCOLAR ALFREDO ESPINO');
});

test('parseSectionsCsv deduplica la misma sección repetida en distintas fechas de corte', () => {
  const { sections } = parseSectionsCsv(SAMPLE_CSV);
  const lenguajeRows = sections.filter(
    (s) => s.school_code === '10001' && s.class_name === '2 - - A Matutino Clase Lenguaje'
  );
  assert.equal(lenguajeRows.length, 1);
});

test('parseSectionsCsv descarta filas sin código de escuela o sin class_name', () => {
  const { sections } = parseSectionsCsv(SAMPLE_CSV);
  const bad = sections.find((s) => s.class_name === 'X');
  assert.equal(bad, undefined);
  assert.equal(sections.length, 3);
});

test('parseSectionsCsv normaliza campos vacíos a null', () => {
  const { sections } = parseSectionsCsv(SAMPLE_CSV);
  const refuerzo = sections.find((s) => s.class_name === '3 - - B vespertino Refuerzo');
  assert.equal(refuerzo?.subject, null);
});

test('normalizePeriod unifica variantes de mayúsculas/minúsculas de KIRA', () => {
  assert.equal(normalizePeriod('Matutino'), 'Matutino');
  assert.equal(normalizePeriod('matutino'), 'Matutino');
  assert.equal(normalizePeriod('vespertino'), 'Vespertino');
  assert.equal(normalizePeriod('Vespertino'), 'Vespertino');
  assert.equal(normalizePeriod(''), null);
  assert.equal(normalizePeriod(undefined), null);
});

test('extractTipoClase reconoce Clase/Refuerzo/Remediación después del turno', () => {
  assert.equal(extractTipoClase('2 - - A Matutino Clase Lenguaje'), 'Clase');
  assert.equal(extractTipoClase('2 - - A Matutino Refuerzo Matemática'), 'Refuerzo');
  assert.equal(extractTipoClase('2 - - A Matutino Remediación Lenguaje'), 'Remediación');
  assert.equal(extractTipoClase('3 - - B vespertino Refuerzo'), 'Refuerzo');
  assert.equal(extractTipoClase('sin turno reconocible'), null);
});

// Regresion: en el export real de KIRA (sections.csv), un puñado de filas
// (4 de 43,019 en el ultimo archivo compartido) traen las columnas "section"
// y "class_period" vacias, aunque el dato SI esta presente dentro del propio
// class_name (ej. escuela 10411, 2do grado: "Matemática 2 A Matutino" con
// section="" y class_period=""). Sin este respaldo, esa fila terminaba
// agrupada como una "sección física" fantasma sin letra ni turno en vez de
// unirse a la sección A/Matutino real.
test('extractSectionLetterFallback y extractClassPeriodFallback recuperan datos de class_name cuando las columnas vienen vacías', () => {
  assert.equal(extractSectionLetterFallback('Matemática 2 A Matutino'), 'A');
  assert.equal(extractClassPeriodFallback('Matemática 2 A Matutino'), 'Matutino');
  assert.equal(extractSectionLetterFallback('sin letra reconocible'), null);
  assert.equal(extractClassPeriodFallback('sin turno reconocible'), null);
});

test('parseSectionsCsv usa el respaldo cuando section/class_period vienen vacías en el CSV', () => {
  const csv = `code,school_name,class_name,grade,track,subtrack,section,subject,type,class_period,access_teacher,student_access_percentage,percentage_tasks_completed,percentage_correct_answers,recent_date_access,start_class,end_class,date
10411,ESCUELA REAL,Lenguaje 2 A Matutino,2nd Grade,,,A,ENGLISH_LANGUAGE_ARTS,,Matutino,0,0.0,,,,,,2026-07-06
10411,ESCUELA REAL,Matemática 2 A Matutino,2nd Grade,,,,,,,0,0.0,,,,,,2026-07-06
`;
  const { sections } = parseSectionsCsv(csv);
  const matematica = sections.find((s) => s.class_name === 'Matemática 2 A Matutino');
  assert.equal(matematica?.section_letter, 'A');
  assert.equal(matematica?.class_period, 'Matutino');
  // Ambas filas deben terminar en la misma sección física (A / Matutino),
  // no en dos "secciones fantasma" distintas.
  const lenguaje = sections.find((s) => s.class_name === 'Lenguaje 2 A Matutino');
  assert.equal(lenguaje?.section_letter, matematica?.section_letter);
  assert.equal(lenguaje?.class_period, matematica?.class_period);
});

// Regresion: el archivo real de KIRA a veces trae una linea final truncada
// (ej. "74015," sin el resto de columnas) que antes hacia que csv-parse
// lanzara un error y abortara la carga completa de las 43,018 filas buenas.
test('parseSectionsCsv no aborta todo el import por una linea final truncada/corrupta', () => {
  const csv = `code,school_name,class_name,grade,track,subtrack,section,subject,type,class_period,access_teacher,student_access_percentage,percentage_tasks_completed,percentage_correct_answers,recent_date_access,start_class,end_class,date
10001,ESCUELA X,2 - - A Matutino Clase Lenguaje,2nd Grade,,,A,ENGLISH_LANGUAGE_ARTS,,Matutino,0,0.0,,,,,,2026-07-01
74015,
`;
  const { sections } = parseSectionsCsv(csv);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].class_name, '2 - - A Matutino Clase Lenguaje');
});

test('parseSectionsCsv distingue secciones físicas repetidas por materia/tipo de clase', () => {
  const csv = `code,school_name,class_name,grade,track,subtrack,section,subject,type,class_period,access_teacher,student_access_percentage,percentage_tasks_completed,percentage_correct_answers,recent_date_access,start_class,end_class,date
10001,ESCUELA X,2 - - A Matutino Clase Lenguaje,2nd Grade,,,A,ENGLISH_LANGUAGE_ARTS,,Matutino,0,0.0,,,,,,2026-07-01
10001,ESCUELA X,2 - - A Matutino Refuerzo Matemática,2nd Grade,,,A,MATHEMATICS,,Matutino,0,0.0,,,,,,2026-07-01
`;
  const { sections } = parseSectionsCsv(csv);
  assert.equal(sections.length, 2);
  const fisicas = new Set(sections.map((s) => `${s.school_code}::${s.grade}::${s.section_letter}::${s.class_period}`));
  assert.equal(fisicas.size, 1); // misma sección física (2°A Matutino), 2 filas por materia/tipo
  assert.equal(sections[0].tipo_clase, 'Clase');
  assert.equal(sections[1].tipo_clase, 'Refuerzo');
});
