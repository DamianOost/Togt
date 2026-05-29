const spec = require('../src/openapi');

describe('OpenAPI customer data safety docs', () => {
  test('documents privacy reveal policy in agent conventions', () => {
    expect(spec.info.description).toContain('Customer data safety');
    expect(spec.info.description).toContain('accepted');
    expect(spec.info.description).toContain('in_progress');
  });

  test('labourer candidate schema uses approximate coordinates instead of exact current coordinates', () => {
    const schema = spec.components.schemas.LabourerCandidate;

    expect(schema.description).toContain('Exact live coordinates');
    expect(schema.properties.current_lat).toBeUndefined();
    expect(schema.properties.current_lng).toBeUndefined();
    expect(schema.properties.approx_lat).toBeDefined();
    expect(schema.properties.approx_lng).toBeDefined();
  });

  test('booking schema and examples show hidden pending fields and accepted reveal fields', () => {
    const schema = spec.components.schemas.Booking;
    const pending = spec.components.examples.BookingPendingForLabourer.value;
    const accepted = spec.components.examples.BookingAcceptedForLabourer.value;

    expect(schema.description).toContain('Viewer-dependent');
    expect(schema.properties.customer_phone.description).toContain('accepted');
    expect(pending.address).toBeUndefined();
    expect(pending.customer_phone).toBeUndefined();
    expect(pending.location_precision).toBe('approximate');
    expect(accepted.address).toBeDefined();
    expect(accepted.customer_phone).toBeDefined();
  });
});
