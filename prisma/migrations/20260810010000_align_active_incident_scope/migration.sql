UPDATE "incident_types"
SET "descripcion" = 'Agregar alumnos a una clase solo cuando la matrícula sea mayor a 25. Con 25 o menos debe hacerlo el tutor de la escuela.',
    "activo" = true
WHERE "nombre" = 'Agregar lista de estudiantes';

UPDATE "incident_types"
SET "descripcion" = 'Habilitar y configurar una nueva clase para la asignatura correspondiente.',
    "activo" = true
WHERE "nombre" = 'Crear sección';

UPDATE "incident_types"
SET "descripcion" = 'Archivar una sección únicamente cuando no cumple con la nomenclatura establecida.',
    "activo" = true
WHERE "nombre" = 'Eliminar sección';

UPDATE "incident_types"
SET "descripcion" = 'Depurar contenido duplicado o que no corresponde a la clase.',
    "activo" = true
WHERE "nombre" = 'Contenido duplicado o no corresponde';

UPDATE "incident_types"
SET "descripcion" = 'Tipo histórico fuera del alcance operativo actual.',
    "activo" = false
WHERE "nombre" = 'Falta contenido en la sección';

UPDATE "incident_types"
SET "descripcion" = 'Rectificar información o contenido erróneo asignado a una clase.',
    "activo" = true
WHERE "nombre" = 'Contenido con error';
