import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { logger, httpLogStream } from './lib/logger';
import { inc } from './lib/metrics';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import reservationRoutes from './routes/reservations';
import metricsRoutes from './routes/metrics';
import { startCleanupScheduler, stopCleanupScheduler } from './services/cleanupService';

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

// Morgan piped into Winston for structured logs.
const morganFormat =
  ':remote-addr :method :url :status :res[content-length] - :response-time ms';
app.use(morgan(morganFormat, { stream: httpLogStream }));

app.use((req, _res, next) => {
  inc('http_requests_total');
  next();
});

// Global baseline limiter — protects against accidental floods.
app.use(rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api',          reservationRoutes); // /reserve and /checkout
app.use('/api/metrics',  metricsRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on :${env.PORT}`, { env: env.NODE_ENV });
  startCleanupScheduler();
});

const shutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down...`);
  stopCleanupScheduler();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
