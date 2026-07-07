// Catalogo inicial de tipos de incidencia (13 tipos, 4 categorias).
// Vive aca (en vez de en prisma/seed.ts) para poder importarse sin efectos
// secundarios, tanto desde el seed real como desde las pruebas.
export interface IncidentTypeSeed {
  nombre: string;
  categoria: 'secciones' | 'estudiantes' | 'docentes' | 'contenido' | 'otro';
  descripcion: string;
  requiereSeccion: boolean;
  orden: number;
}

export const INCIDENT_TYPES: IncidentTypeSeed[] = [
  { nombre: 'Faltan estudiantes en la sección', categoria: 'estudiantes', descripcion: 'La sección tiene menos estudiantes matriculados de los que debería.', requiereSeccion: true, orden: 10 },
  { nombre: 'Matricular estudiantes en la sección', categoria: 'estudiantes', descripcion: 'Hay que dar de alta uno o más estudiantes en la sección.', requiereSeccion: true, orden: 20 },
  { nombre: 'Eliminar estudiantes de una sección', categoria: 'estudiantes', descripcion: 'Hay que retirar/dar de baja uno o más estudiantes de la sección.', requiereSeccion: true, orden: 30 },
  { nombre: 'Corregir datos de un estudiante', categoria: 'estudiantes', descripcion: 'Nombre, correo u otro dato del estudiante está mal registrado.', requiereSeccion: true, orden: 40 },
  { nombre: 'Falta docente en la sección', categoria: 'docentes', descripcion: 'La sección no tiene un docente asignado en KIRA.', requiereSeccion: true, orden: 50 },
  { nombre: 'Cambiar docente de una sección a otra', categoria: 'docentes', descripcion: 'Hay que mover a un docente de una sección/escuela a otra.', requiereSeccion: true, orden: 60 },
  { nombre: 'Eliminar docente de una sección', categoria: 'docentes', descripcion: 'Hay que retirar al docente asignado actualmente a la sección.', requiereSeccion: true, orden: 70 },
  { nombre: 'Docente con problemas de acceso a la plataforma', categoria: 'docentes', descripcion: 'El docente no puede ingresar (p. ej. correo mal registrado).', requiereSeccion: true, orden: 80 },
  { nombre: 'Agregar sección nueva', categoria: 'secciones', descripcion: 'Falta crear una sección que aún no existe en KIRA.', requiereSeccion: false, orden: 90 },
  { nombre: 'Eliminar sección', categoria: 'secciones', descripcion: 'Hay que dar de baja una sección existente.', requiereSeccion: true, orden: 100 },
  { nombre: 'Contenido duplicado o no corresponde', categoria: 'contenido', descripcion: 'El contenido de la sección está repetido o no es el correcto.', requiereSeccion: true, orden: 110 },
  { nombre: 'Falta contenido en la sección', categoria: 'contenido', descripcion: 'A la sección le falta contenido asignado.', requiereSeccion: true, orden: 120 },
  { nombre: 'Contenido con error', categoria: 'contenido', descripcion: 'El contenido tiene errores (ortográficos, técnicos o desactualizados).', requiereSeccion: true, orden: 130 },
];
