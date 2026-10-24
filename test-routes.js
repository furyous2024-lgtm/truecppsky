const http = require('http');

const tests = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/index',
  '/home',
  '/nonexistent'
];

let completed = 0;

tests.forEach(path => {
  const options = {
    method: 'GET',
    host: 'localhost',
    port: 3000,
    path
  };

  const req = http.request(options, res => {
    console.log(`PATH: ${path.padEnd(20)} | STATUS: ${res.statusCode} | TYPE: ${res.headers['content-type']}`);
    res.on('data', () => {});
    res.on('end', () => {
      completed++;
      if (completed === tests.length) process.exit(0);
    });
  });

  req.on('error', err => {
    console.error(`ERROR ${path}: ${err.message}`);
    completed++;
    if (completed === tests.length) process.exit(1);
  });

  req.end();
});
