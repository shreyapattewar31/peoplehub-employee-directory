import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: true,
  decimalNumbers: true,
  timezone: 'Z',
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'", (error) => {
    if (error) {
      console.error('Unable to set the database session time zone:', error.message);
    }
  });
});
