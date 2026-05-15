import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss.SSS' }),
  errors({ stack: true }),
  printf((info) => {
    const { timestamp: ts, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level} ${message}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'drop-api' },
  transports: [new winston.transports.Console()],
});

export const httpLogStream = {
  write: (message: string) => logger.http(message.trim()),
};
