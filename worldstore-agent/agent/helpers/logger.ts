/* eslint-disable no-unused-vars */
// ANSI Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export class Logger {
  private level: LogLevel;
  private context: string;

  constructor(context = "App", level: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.level = level;
  }

  private formatTime(): string {
    return new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = `${colors.gray}${this.formatTime()}${colors.reset}`;
    const contextStr = `${colors.cyan}[${this.context}]${colors.reset}`;
    const levelStr = level;
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : "";

    return `${timestamp} ${levelStr} ${contextStr} ${message}${dataStr}`;
  }

  debug(message: string, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      const levelStr = `${colors.gray}DEBUG${colors.reset}`;
      console.log(this.formatMessage(levelStr, message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      const levelStr = `${colors.blue}INFO ${colors.reset}`;
      console.log(this.formatMessage(levelStr, message, data));
    }
  }

  success(message: string, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      const levelStr = `${colors.green}✓${colors.reset}   `;
      console.log(this.formatMessage(levelStr, message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.level <= LogLevel.WARN) {
      const levelStr = `${colors.yellow}WARN ${colors.reset}`;
      console.warn(this.formatMessage(levelStr, message, data));
    }
  }

  error(message: string, error?: any): void {
    if (this.level <= LogLevel.ERROR) {
      const levelStr = `${colors.red}ERROR${colors.reset}`;
      const errorData =
        error instanceof Error
          ? {
              stack: error.stack,
              ...error,
            }
          : error;
      console.error(this.formatMessage(levelStr, message, errorData));
    }
  }

  user(action: string, inboxId: string, message?: string): void {
    const shortId = `${inboxId.slice(0, 8)}...`;
    const fullMessage = message ? `${action} - ${message}` : action;
    this.info(`👤 ${fullMessage}`, { userId: shortId });
  }

  agent(action: string, data?: any): void {
    this.info(`🤖 ${action}`, data);
  }

  tool(toolName: string, action: string, data?: any): void {
    this.debug(`🔧 ${toolName}: ${action}`, data);
  }

  xmtp(action: string, data?: any): void {
    this.debug(`📡 XMTP: ${action}`, data);
  }

  profile(action: string, data?: any): void {
    this.info(`👤 Profile: ${action}`, data);
  }

  timing(operation: string, duration: number): void {
    const durationStr =
      duration > 1000 ? `${(duration / 1000).toFixed(2)}s` : `${duration}ms`;
    this.debug(`⏱️  ${operation} completed in ${durationStr}`);
  }

  separator(): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${colors.gray}${"─".repeat(80)}${colors.reset}`);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  createChild(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.level);
  }
}

// Create default logger instance
export const logger = new Logger("XMTPBot", LogLevel.DEBUG);
