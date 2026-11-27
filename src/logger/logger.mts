import { pino, type Logger } from 'pino';

const parentLogger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

export const getLogger = (context: string, kind = 'file') =>
  parentLogger.child({ [kind]: context });

export type LoggingVariables = {
  requestId: string;
  requestLogger: Logger;
};
