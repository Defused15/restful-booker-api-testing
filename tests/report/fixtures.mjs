// Newman-shaped report fixtures for the report page tests. They are generated,
// not recorded, so they contain no real credentials and stay deterministic.

export const SECRETS = {
  password: 'fixture-pass-9f3k2',
  token: 'tok3n-fixture-a81c',
  basic: Buffer.from('admin:fixture-pass-9f3k2').toString('base64'),
  apiKey: 'key-fixture-77d1',
};

export const HOSTILE_NAME = '</script><img src=x onerror=alert(1)> $& $\' $` <!--   end';

const buf = s => ({ type: 'Buffer', data: [...Buffer.from(s, 'utf8')] });
let seq = 0;
const id = () => 'item-' + (++seq);

function exec(item, { method = 'GET', path = ['booking'], code = 200, status = 'OK', time = 120, reqHeaders = [], reqBody, resBody = '{}', resHeaders, assertions }) {
  const res = typeof resBody === 'string' ? resBody : JSON.stringify(resBody);
  return {
    cursor: {},
    item: { id: item.id, name: item.name },
    request: {
      url: { protocol: 'https', host: ['api', 'example', 'test'], path, query: item.query || [] },
      method,
      header: [{ key: 'Accept', value: 'application/json' }, ...reqHeaders],
      body: reqBody == null ? undefined : { mode: 'raw', raw: typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody, null, 4) },
    },
    response: code == null ? undefined : {
      id: 'r-' + item.id, status, code,
      header: resHeaders || [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }, { key: 'Content-Length', value: String(res.length) }],
      stream: buf(res), responseTime: time, responseSize: res.length,
    },
    assertions,
  };
}

const ok = names => names.map(n => ({ assertion: n, skipped: false }));
const bad = (name, message) => ({ assertion: name, skipped: false, error: { name: 'AssertionError', message } });

/**
 * A mixed run: 34 requests in nested folders (two pages in the table),
 * three failing requests, a skipped assertion, long bodies and secrets.
 */
export function mixedReport({ hostile = false } = {}) {
  seq = 0;
  const folders = [
    ['Auth', '00 - Setup'], ['Auth', '01 - Happy Path'], ['Auth', '02 - Negative Cases'],
    ['Booking', '01 - Happy Path'], ['Booking', '02 - Negative Cases'], ['Booking', '03 - Edge Cases'],
  ];
  const tree = folders.map(([a, b]) => ({ a, b, items: [] }));
  const executions = [];
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  const add = (folderIdx, name, opts) => {
    const item = { id: id(), name, query: opts.query };
    tree[folderIdx].items.push({ id: item.id, name, request: {} });
    executions.push(exec(item, opts));
  };

  add(0, 'Generate Token', {
    method: 'POST', path: ['auth'],
    reqHeaders: [{ key: 'Content-Type', value: 'application/json' }],
    reqBody: { username: 'admin', password: SECRETS.password },
    resBody: { token: SECRETS.token },
    assertions: ok(['Setup - Status 200', 'Setup - Token exists']),
  });
  add(1, hostile ? HOSTILE_NAME : 'Login valid', {
    method: 'POST', path: ['auth'],
    reqBody: { username: 'admin', password: SECRETS.password },
    resBody: { token: SECRETS.token },
    assertions: ok(['Status 200', 'Response has token', hostile ? 'Assertion with $& and </script>' : 'Token is a non-empty string']),
  });
  add(2, 'Wrong password', {
    method: 'POST', path: ['auth'], reqBody: { username: 'admin', password: 'nope-wrong' },
    resBody: { reason: 'Bad credentials' },
    assertions: [...ok(['Status 200', 'Token does not exist']), bad('Error message is Bad credentials', "expected 'Bad credentialz' to equal 'Bad credentials'")],
  });
  add(1, 'Fetch with API key', {
    path: ['booking'], query: [{ key: 'api_key', value: SECRETS.apiKey }, { key: 'page', value: '2' }],
    resBody: [{ bookingid: 1 }],
    assertions: ok(['Status code is 200']),
  });

  for (let i = 0; i < 26; i++) {
    const m = methods[i % methods.length];
    const long = i === 3;
    add(3 + (i % 3), 'Booking request ' + String(i + 1).padStart(2, '0') + ' ' + m.toLowerCase(), {
      method: m, path: ['booking', String(1000 + i)], time: 90 + i * 7,
      reqHeaders: m === 'GET' ? [] : [
        { key: 'Content-Type', value: 'application/json' },
        i % 2 ? { key: 'Cookie', value: 'token=' + SECRETS.token } : { key: 'Authorization', value: 'Basic ' + SECRETS.basic },
      ],
      reqBody: m === 'GET' || m === 'DELETE' ? undefined : { firstname: 'Guest ' + i, lastname: 'Example', totalprice: 100 + i, depositpaid: i % 2 === 0, bookingdates: { checkin: '2026-01-01', checkout: '2026-01-05' } },
      code: m === 'DELETE' ? 201 : 200, status: m === 'DELETE' ? 'Created' : 'OK',
      resBody: long
        ? Array.from({ length: 60 }, (_, k) => ({ bookingid: k + 1, note: 'row ' + (k + 1) }))
        : { firstname: 'Guest ' + i, lastname: 'Example', totalprice: 100 + i, depositpaid: i % 2 === 0, bookingdates: { checkin: '2026-01-01', checkout: '2026-01-05' } },
      assertions: i === 9
        ? [...ok(['Status code is 200']), bad('Schema is valid', 'data/totalprice must be number'), bad('Response time < 500ms', 'expected 812 to be below 500')]
        : i === 12
          ? [...ok(['Status code is 200']), { assertion: 'Optional header present', skipped: true }]
          : ok(['Status code is ' + (m === 'DELETE' ? 201 : 200), 'Response time < 500ms']),
    });
  }

  add(4, 'Update booking - invalid token', {
    method: 'PUT', path: ['booking', '1001'], code: 403, status: 'Forbidden',
    reqHeaders: [{ key: 'Cookie', value: 'token=invalid-token-123' }],
    reqBody: { firstname: 'Hacker' }, resBody: 'Forbidden',
    resHeaders: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
    assertions: ok(['Status code is 403 - invalid token rejected']),
  });
  add(5, 'Get booking - server error', {
    path: ['booking', 'oops'], code: 500, status: 'Internal Server Error', resBody: 'Internal Server Error',
    resHeaders: [{ key: 'Content-Type', value: 'text/plain' }],
    assertions: [bad('Status code is 200', 'expected response to have status code 200 but got 500')],
  });
  add(5, 'Get booking as XML', {
    path: ['booking', '1'], resBody: "<?xml version='1.0'?><booking><firstname>Guest</firstname></booking>",
    resHeaders: [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }],
    assertions: ok(['Status code is 200', 'Body is XML with a booking root']),
  });
  add(5, 'Health check - ping', { path: ['ping'], code: 201, status: 'Created', resBody: 'Created', assertions: ok(['API is up - status 201']) });

  const total = executions.reduce((n, e) => n + e.assertions.length, 0);
  const failed = executions.reduce((n, e) => n + e.assertions.filter(a => a.error).length, 0);
  const times = executions.map(e => e.response ? e.response.responseTime : 0);
  const started = Date.now() - 3 * 3600 * 1000;

  // Rebuild the collection tree with nested folders.
  const top = {};
  tree.forEach(f => {
    top[f.a] = top[f.a] || { name: f.a, item: [] };
    top[f.a].item.push({ name: f.b, item: f.items });
  });

  return {
    collection: { info: { name: 'Restful-Booker' }, item: Object.values(top), variable: [] },
    environment: {
      name: 'Fixture', values: [
        { key: 'base_url', value: 'https://api.example.test' },
        { key: 'username', value: 'admin' },
        { key: 'password', value: SECRETS.password },
        { key: 'token', value: SECRETS.token },
      ],
    },
    globals: {},
    run: {
      stats: { requests: { total: executions.length, failed: 0 }, assertions: { total, failed, pending: 1 } },
      timings: {
        responseAverage: times.reduce((a, b) => a + b, 0) / times.length,
        responseMin: Math.min(...times), responseMax: Math.max(...times),
        started, completed: started + 9400,
      },
      executions,
      failures: [],
      error: null,
    },
  };
}

/** A run where every request passes (hides "Needs attention"). */
export function passingReport() {
  const r = mixedReport();
  for (const e of r.run.executions) {
    e.assertions = e.assertions.filter(a => !a.error && !a.skipped);
    if (e.response && e.response.code === 500) { e.response.code = 200; e.response.status = 'OK'; }
  }
  r.run.stats.assertions.failed = 0;
  return r;
}
