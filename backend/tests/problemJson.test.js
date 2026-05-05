const { ProblemError, problemResponse, problemHandler, typeUri } = require('../src/lib/problemJson');

describe('RFC 9457 problem+json', () => {
  test('typeUri produces stable URI', () => {
    expect(typeUri('scheduled_at_in_past')).toMatch(/^https?:\/\//);
    expect(typeUri('scheduled_at_in_past')).toContain('/errors/scheduled_at_in_past');
  });

  test('ProblemError carries structured payload', () => {
    const err = new ProblemError({
      type: 'foo_bar',
      title: 'Foo Bar',
      status: 400,
      detail: 'Detailed reason',
      extensions: { field: 'x' },
    });
    expect(err.status).toBe(400);
    expect(err.problem.type).toContain('/errors/foo_bar');
    expect(err.problem.title).toBe('Foo Bar');
    expect(err.problem.detail).toBe('Detailed reason');
    expect(err.problem.extensions).toEqual({ field: 'x' });
  });

  test('problemResponse writes structured body with backward-compat error field', () => {
    let captured = {};
    const res = {
      _status: null, _headers: {}, _body: null,
      status(s) { this._status = s; return this; },
      type(t) { this._headers['Content-Type'] = t; return this; },
      json(b) { this._body = b; captured = { status: this._status, type: this._headers['Content-Type'], body: b }; return this; },
    };
    problemResponse(res, {
      type: 'thing_missing', title: 'Thing missing', status: 404,
      detail: 'No thing with that id', instance: '/api/thing/123',
    });
    expect(captured.status).toBe(404);
    expect(captured.type).toBe('application/problem+json');
    expect(captured.body.type).toContain('/errors/thing_missing');
    expect(captured.body.title).toBe('Thing missing');
    expect(captured.body.detail).toBe('No thing with that id');
    expect(captured.body.instance).toBe('/api/thing/123');
    expect(captured.body.error).toBe('Thing missing'); // backward-compat
  });

  test('problemHandler renders ProblemError correctly', () => {
    const err = new ProblemError({
      type: 'forbidden_op', title: 'Forbidden', status: 403,
      extensions: { reason: 'role_mismatch' },
    });
    const req = { originalUrl: '/api/whatever' };
    let capturedBody = null;
    let capturedStatus = null;
    let capturedType = null;
    const res = {
      status(s) { capturedStatus = s; return this; },
      type(t) { capturedType = t; return this; },
      json(b) { capturedBody = b; return this; },
    };
    problemHandler(err, req, res, () => {});
    expect(capturedStatus).toBe(403);
    expect(capturedType).toBe('application/problem+json');
    expect(capturedBody.type).toContain('/errors/forbidden_op');
    expect(capturedBody.instance).toBe('/api/whatever');
    expect(capturedBody.extensions).toEqual({ reason: 'role_mismatch' });
    expect(capturedBody.error).toBe('Forbidden');
  });

  test('problemHandler turns unexpected errors into 500 with internal_server_error type', () => {
    const err = new Error('something exploded');
    const req = { originalUrl: '/api/x' };
    let capturedBody = null, capturedStatus = null;
    const res = {
      status(s) { capturedStatus = s; return this; },
      type() { return this; },
      json(b) { capturedBody = b; return this; },
    };
    problemHandler(err, req, res, () => {});
    expect(capturedStatus).toBe(500);
    expect(capturedBody.type).toContain('/errors/internal_server_error');
    expect(capturedBody.title).toBe('Internal server error');
  });
});
