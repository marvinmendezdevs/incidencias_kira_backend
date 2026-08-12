import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AiClassifierProviderError,
  validateClassification,
} from '../src/services/ai-incidence-classifier.service';

const activeTypes = [
  {
    id: 4,
    name: 'Contenido no disponible',
    category: 'contenido',
    description: 'Contenido academico ausente.',
    requiresSection: true,
  },
];

test('normaliza una clasificacion APLICA contra el catalogo activo', () => {
  const result = validateClassification(
    {
      clasificacion: 'APLICA',
      tipoIncidenciaId: 4,
      tipoIncidencia: 'nombre inventado por el modelo',
      confianza: 0.94,
      motivo: 'Coincide con contenido ausente.',
    },
    activeTypes
  );
  assert.equal(result.tipoIncidencia, 'Contenido no disponible');
  assert.equal(result.confianza, 0.94);
});

test('rechaza un ID inexistente o inactivo para APLICA', () => {
  assert.throws(
    () =>
      validateClassification(
        {
          clasificacion: 'APLICA',
          tipoIncidenciaId: 999,
          tipoIncidencia: 'Inventado',
          confianza: 0.8,
          motivo: 'No importa.',
        },
        activeTypes
      ),
    AiClassifierProviderError
  );
});

test('fuerza tipo null cuando la clasificacion no aplica', () => {
  const result = validateClassification(
    {
      clasificacion: 'NO_APLICA',
      tipoIncidenciaId: 4,
      tipoIncidencia: 'Contenido no disponible',
      confianza: 0.97,
      motivo: 'Fuera de alcance.',
    },
    activeTypes
  );
  assert.equal(result.tipoIncidenciaId, null);
  assert.equal(result.tipoIncidencia, null);
});
