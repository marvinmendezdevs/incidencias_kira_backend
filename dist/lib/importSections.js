"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePeriod = normalizePeriod;
exports.clean = clean;
exports.extractTipoClase = extractTipoClase;
exports.extractSectionLetterFallback = extractSectionLetterFallback;
exports.extractClassPeriodFallback = extractClassPeriodFallback;
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
 * Respaldo para cuando la columna "section" del CSV viene vacia (pasa en un
 * puñado de filas del export real de KIRA). Busca un token que sea una sola
 * letra mayuscula (A-Z) dentro del class_name, ej. "Matemática 2 A Matutino" -> "A".
 * No es infalible (formatos muy distintos como los de bachillerato tecnico no
 * siempre tienen un token asi), pero cubre el caso real observado.
 */
function extractSectionLetterFallback(className) {
    const parts = className.trim().split(/\s+/);
    const letter = parts.find((p) => /^[A-Z]$/.test(p));
    return letter || null;
}
/**
 * Respaldo para cuando la columna "class_period" del CSV viene vacia: busca
 * "Matutino"/"Vespertino" como substring dentro del class_name.
 */
function extractClassPeriodFallback(className) {
    const lower = className.toLowerCase();
    if (lower.includes('matutino'))
        return 'Matutino';
    if (lower.includes('vespertino'))
        return 'Vespertino';
    return null;
}
/**
 * Parsea el contenido CSV de sections.csv (formato compartido por KIRA) y
 * devuelve { schools: Map<code, name>, sections: ParsedSection[] }.
 * No toca la base de datos: es puro parseo + normalizacion.
 */
function parseSectionsCsv(csvContent) {
    // relax_column_count: el export real de KIRA a veces trae una linea final
    // truncada (ej. una fila cortada a mitad de escritura, con menos columnas
    // de las esperadas). Sin esto, csv-parse lanza y aborta TODO el import por
    // una sola linea corrupta al final del archivo. Con esto, esa fila llega
    // con columnas faltantes (undefined) y el filtro "sin code o class_name"
    // de mas abajo la descarta igual que a cualquier otra fila invalida.
    const records = (0, sync_1.parse)(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
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
        const sectionLetter = clean(row.section) || extractSectionLetterFallback(className);
        const classPeriod = normalizePeriod(row.class_period) || extractClassPeriodFallback(className);
        sections.push({
            school_code: code,
            class_name: className,
            grade: clean(row.grade),
            track: clean(row.track),
            subtrack: clean(row.subtrack),
            section_letter: sectionLetter,
            tipo_clase: extractTipoClase(className),
            subject: clean(row.subject),
            class_period: classPeriod,
        });
    }
    return { schools, sections };
}
/**
 * Aplica un import de secciones. SOLO AGREGA: las escuelas/secciones que ya
 * existen se dejan exactamente como estan (no se actualiza ningun campo) y
 * solo se cuentan como "existentes"; unicamente lo que todavia no existe se
 * crea. Esto es a proposito (pedido explicito): un sections.csv nuevo nunca
 * debe pisar datos ya cargados. Pensado para archivos incrementales que
 * comparte KIRA periodicamente (no para la carga inicial masiva, ver
 * prisma/seed.ts que usa createMany para eso).
 */
async function applySectionsImport(prisma, csvContent) {
    const { schools, sections } = parseSectionsCsv(csvContent);
    let escuelasCreadas = 0;
    let escuelasExistentes = 0;
    for (const [code, name] of schools.entries()) {
        const existing = await prisma.school.findUnique({ where: { code } });
        if (existing) {
            escuelasExistentes += 1;
            continue;
        }
        await prisma.school.create({ data: { code, name } });
        escuelasCreadas += 1;
    }
    let seccionesCreadas = 0;
    let seccionesExistentes = 0;
    for (const s of sections) {
        const existing = await prisma.section.findUnique({
            where: { schoolCode_className: { schoolCode: s.school_code, className: s.class_name } },
        });
        if (existing) {
            seccionesExistentes += 1;
            continue;
        }
        await prisma.section.create({
            data: {
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
        });
        seccionesCreadas += 1;
    }
    return {
        escuelas_creadas: escuelasCreadas,
        escuelas_existentes: escuelasExistentes,
        secciones_creadas: seccionesCreadas,
        secciones_existentes: seccionesExistentes,
        total_escuelas_en_archivo: schools.size,
        total_secciones_en_archivo: sections.length,
    };
}
