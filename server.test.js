const http = require('http');
const fs = require('fs');
const path = require('path');

let server;
let port;
let dbBackup;

beforeAll(done => {
  dbBackup = fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8');
  process.env.PORT = '0';
  server = require('./server');
  server.on('listening', () => {
    port = server.address().port;
    done();
  });
});

afterAll(done => {
  fs.writeFileSync(path.join(__dirname, 'db.json'), dbBackup);
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

test('allows setting password on first login', done => {
  const postData = JSON.stringify({ username: 'admin', password: 'newpass' });

  const req = http.request({
    method: 'POST',
    hostname: 'localhost',
    port,
    path: '/api/login',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, res => {
    res.on('data', () => {});
    res.on('end', () => {
      expect(res.statusCode).toBe(200);

      const req2 = http.request({
        method: 'POST',
        hostname: 'localhost',
        port,
        path: '/api/login',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res2 => {
        res2.on('data', () => {});
        res2.on('end', () => {
          expect(res2.statusCode).toBe(200);
          done();
        });
      });
      req2.write(postData);
      req2.end();
    });
  });
  req.on('error', done);
  req.write(postData);
  req.end();
});
