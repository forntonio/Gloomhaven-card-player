const http = require('http');
const fs = require('fs');
const path = require('path');

let server;
let port;

beforeAll(done => {
  process.env.PORT = '0';
  server = require('./server');
  server.on('listening', () => {
    port = server.address().port;
    done();
  });
});

afterAll(done => {
  server.close(done);
});

test('serves static file when query string present', done => {
  const expected = fs.readFileSync(path.join(__dirname, 'public', 'character.html'), 'utf8');
  http.get(`http://localhost:${port}/public/character.html?id=123`, res => {
    let data = '';
    res.on('data', chunk => {
      data += chunk;
    });
    res.on('end', () => {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/html');
      expect(data).toBe(expected);
      done();
    });
  });
});
