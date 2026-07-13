// Catalogo inicial de tipos de incidencia (13 tipos, 4 categorias; 6 activos
// y 7 desactivados a proposito). Vive aca (en vez de en prisma/seed.ts) para
// poder importarse sin efectos secundarios, tanto desde el seed real como
// desde las pruebas.
export interface IncidentTypeSeed {
  nombre: string;
  categoria: 'secciones' | 'estudiantes' | 'docentes' | 'contenido' | 'otro';
  descripcion: string;
  requiereSeccion: boolean;
  orden: number;
  activo?: boolean; // default true (ver @default en el schema) si se omite
}

export const INCIDENT_TYPES: IncidentTypeSeed[] = [
  // Desactivados: ya no se pueden reportar, pero las incidencias historicas
  // que los usan se conservan igual (el filtro "activo" solo aplica a la
  // lista de tipos disponibles para reportar, no borra nada).
  { nombre: 'Faltan estudiantes en la sección', categoria: 'estudiantes', descripcion: 'La sección tiene menos estudiantes matriculados de los que debería.', requiereSeccion: true, orden: 10, activo: false },
  { nombre: 'Eliminar estudiantes de una sección', categoria: 'estudiantes', descripcion: 'Hay que retirar/dar de baja uno o más estudiantes de la sección.', requiereSeccion: true, orden: 30, activo: false },
  { nombre: 'Corregir datos de un estudiante', categoria: 'estudiantes', descripcion: 'Nombre, correo u otro dato del estudiante está mal registrado.', requiereSeccion: true, orden: 40, activo: false },
  { nombre: 'Falta docente en la sección', categoria: 'docentes', descripcion: 'La sección no tiene un docente asignado en KIRA.', requiereSeccion: true, orden: 50, activo: false },
  { nombre: 'Cambiar docente de una sección a otra', categoria: 'docentes', descripcion: 'Hay que mover a un docente de una sección/escuela a otra.', requiereSeccion: true, orden: 60, activo: false },
  { nombre: 'Eliminar docente de una sección', categoria: 'docentes', descripcion: 'Hay que retirar al docente asignado actualmente a la sección.', requiereSeccion: true, orden: 70, activo: false },
  { nombre: 'Docente con problemas de acceso a la plataforma', categoria: 'docentes', descripcion: 'El docente no puede ingresar (p. ej. correo mal registrado).', requiereSeccion: true, orden: 80, activo: false },

  // Activos.
  { nombre: 'Agregar lista de estudiantes', categoria: 'estudiantes', descripcion: 'Matricular una lista de 11 o más estudiantes en la sección (menos de 11, lo hace el mismo centro en KIRA).', requiereSeccion: true, orden: 20 },
  { nombre: 'Crear sección', categoria: 'secciones', descripcion: 'Falta crear una sección que aún no existe en KIRA.', requiereSeccion: false, orden: 90 },
  { nombre: 'Eliminar sección', categoria: 'secciones', descripcion: 'Hay que dar de baja una sección existente.', requiereSeccion: true, orden: 100 },
  { nombre: 'Contenido duplicado o no corresponde', categoria: 'contenido', descripcion: 'El contenido de la sección está repetido o no es el correcto.', requiereSeccion: false, orden: 110 },
  { nombre: 'Falta contenido en la sección', categoria: 'contenido', descripcion: 'A la sección le falta contenido asignado.', requiereSeccion: false, orden: 120 },
  { nombre: 'Contenido con error', categoria: 'contenido', descripcion: 'El contenido tiene errores (ortográficos, técnicos o desactualizados).', requiereSeccion: false, orden: 130 },
];
