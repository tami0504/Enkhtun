const app = require('./app');
const { Pool } = require('pg');
const dbConfig = require('./dbconfig');

const port = 8000;

const pool = new Pool(dbConfig);

pool.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database');
  
  app.listen(port, () => {
    console.log("Server listening on port " + port);
  });
});

process.on('exit', () => {
  pool.end();
});
