// Structured one-line JSON logs. Fields hold codes, counts and timings only;
// callers never pass secrets, connection strings or request bodies.

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogFields = Record<string, string | number | boolean>;
export type LogSink = (level: LogLevel, line: string) => void;

const RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  log(level: LogLevel, event: string, fields?: LogFields): void;
}

const consoleSink: LogSink = (level, line) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export function createLogger(threshold: LogLevel, sink: LogSink = consoleSink): Logger {
  return {
    log(level, event, fields = {}) {
      if (RANK[level] > RANK[threshold]) return;
      sink(level, JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
    },
  };
}

export function defaultLogLevel(nodeEnv: string | undefined): LogLevel {
  return nodeEnv === 'production' ? 'info' : 'debug';
}
