import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

type LogLevel = 'info' | 'error';

const logDir = path.join(process.cwd(), 'logs');
const logFile = path.join(logDir, 'runtime.log');

export async function writeLog(level: LogLevel, scope: string, message: string, details?: Record<string, unknown>) {
  try {
    await mkdir(logDir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      message,
      details,
    };
    await appendFile(logFile, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (error) {
    console.error('Failed to write runtime log', error);
  }
}

export function logInfo(scope: string, message: string, details?: Record<string, unknown>) {
  return writeLog('info', scope, message, details);
}

export function logError(scope: string, message: string, details?: Record<string, unknown>) {
  return writeLog('error', scope, message, details);
}