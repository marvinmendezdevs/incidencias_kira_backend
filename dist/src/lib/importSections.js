"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePeriod = normalizePeriod;
exports.clean = clean;
exports.extractTipoClase = extractTipoClase;
exports.parseSectionsCsv = parseSectionsCsv;
exports.applySectionsImport = applySectionsImport;
const sync_1 = require("csv-parse/sync");
/**
 * Normaliza valores de turno (class_period) que llegan con casing inconsistente
 * desde KIRA (Matutino / matutino / Vespertino / vespertino / vacio).
 */
function normalizePeriod(value) {
    const v = (value || '').trim();
    if (!v)
        return null;
    const lower = v.toLowerCase();
    if (lower === 'matutino')
        return 'Matutino';
    if (lower === 'vespertino')
        return 'Vespertino';
    return v;
}
function clean(value) {
    const v = (value || '').trim();
    return v === '' ? null : v;
}
const TIPOS_CLASE_CONOCIDOS = ['Clase', 'Refuerzo', 'Remediación'];
/**
 * class_name viene con el formato "<grado> - - <letra> <turno> <tipo> <materia...>"
 * (ej. "2 - - A Matutino Refuerzo Matemática"). El "tipo" (Clase/Refuerzo/Remediación)
 * no viene en una columna separada del CSV de KIRA, hay que extraerlo de aca.
 * Cada seccion fisica (escuela+grado+letra+turno) tiene varias filas en el CSV,
 * una por cada combinacion de materia y tipo de clase.
 */
function extractTipoClase(className) {
    const parts = className.trim().split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].toLowerCase() === 'matutino' || parts[i].toLowerCase() === 'vespertino') {
            const next = parts[i + 1];
            return next && TIPOS_CLASE_CONOCIDOS.includes(next) ? next : null;
        }
    }
    return null;
}
/**
 * Parsea el contenido CSV de sections.csv (formato compartido por KIRA) y
 * devuelve { schools: Map<code, name>, sections: ParsedSection[] }.
 * No toca la base de datos: es puro parseo + normalizacion.
 */
function parseSectionsCsv(csvContent) {
    const records = (0, sync_1.parse)(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    const schools = new Map();
    const sections = [];
    const seen = new Set();
    for (const row of records) {
        const code = clean(row.code);
        const schoolName = clean(row.school_name);
        const className = clean(row.class_name);
        if (!code || !className)
            continue; // fila invalida, no se puede identificar la seccion
        if (schoolName && !schools.has(code)) {
            schools.set(code, schoolName);
        }
        const key = `${code}::${className}`;
        if (seen.has(key))
            continue; // sections.csv puede repetir la misma seccion en distintas fechas de corte
        seen.add(key);
        sections.push({
            school_code: code,
            class_name: className,
            grade: clean(row.grade),
            track: clean(row.track),
            subtrack: clean(row.subtrack),
            section_letter: clean(row.section),
            tipo_clase: extractTipoClase(className),
            subject: clean(row.subject),
            class_period: normalizePeriod(row.class_period),
        });
    }
    return { schools, sections };
}
/**
 * Aplica un import de secciones usando Prisma (upsert por escuela y por
 * seccion). Pensado para archivos incrementales que comparte KIRA
 * periodicamente (no para la carga inicial masiva, ver prisma/seed.ts que
 * usa createMany para eso).
 */
async function applySectionsImport(prisma, csvContent) {
    const { schools, sections } = parseSectionsCsv(csvContent);
    let escuelasCreadas = 0;
    let escuelasActualizadas = 0;
    for (const [code, name] of schools.entries()) {
        const existing = await prisma.school.findUnique({ where: { code } });
        await prisma.school.upsert({
            where: { code },
            create: { code, name },
            update: { name },
        });
        if (existing)
            escuelasActualizadas += 1;
        else
            escuelasCreadas += 1;
    }
    let seccionesCreadas = 0;
    let seccionesActualizadas = 0;
    for (const s of sections) {
        const existing = await prisma.section.findUnique({
            where: { schoolCode_className: { schoolCode: s.school_code, className: s.class_name } },
        });
        await prisma.section.upsert({
            where: { schoolCode_className: { schoolCode: s.school_code, className: s.class_name } },
            create: {
                schoolCode: s.school_code,
                className: s.class_name,
                grade: s.grade,
                track: s.track,
                subtrack: s.subtrack,
                sectionLetter: s.section_letter,
                tipoClase: s.tipo_clase,
                subject: s.subject,
                classPeriod: s.class_period,
                active: true,
            },
            update: {
                grade: s.grade,
                track: s.track,
                subtrack: s.subtrack,
                sectionLetter: s.section_letter,
                tipoClase: s.tipo_clase,
                subject: s.subject,
                classPeriod: s.class_period,
                active: true,
            },
        });
        if (existing)
            seccionesActualizadas += 1;
        else
            seccionesCreadas += 1;
    }
    return {
        escuelas_creadas: escuelasCreadas,
        escuelas_actualizadas: escuelasActualizadas,
        secciones_creadas: seccionesCreadas,
        secciones_actualizadas: seccionesActualizadas,
        total_escuelas_en_archivo: schools.size,
        total_secciones_en_archivo: sections.length,
    };
}
