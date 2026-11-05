import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

type LogLevel = 'info' | 'error';

const logDir = path.join(process.cwd(), 'logs');
const logFile = path.join(logDir, 'runtime.log');
// Serverless filesystems are read-only; log to stdout there so entries show up in the platform logs.
const useFileLog = !process.env.VERCEL;

export async function writeLog(level: LogLevel, scope: string, message: string, details?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    details,
  };

  if (!useFileLog) {
    if (level === 'error') console.error(JSON.stringify(payload));
    return;
  }

  try {
    await mkdir(logDir, { recursive: true });
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
