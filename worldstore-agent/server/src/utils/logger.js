/**
 * Structured logging utility for the x402 application
 * Provides consistent log formatting with timestamps, file/function names, and orderId
 */

const config = require('../config');
const DEBUG = config.server.debug;

class Logger {
  constructor() {
    this.debugMode = DEBUG;
  }

  /**
   * Get current timestamp in ISO format
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Get caller information (file and function name)
   */
  getCallerInfo() {
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[3]; // Skip Error, getCallerInfo, and log method
    const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    
    if (match) {
      const functionName = match[1];
      const filePath = match[2];
      const fileName = filePath.split('/').pop().split('\\').pop();
      return `${fileName}.${functionName}`;
    }
    
    return 'unknown.caller';
  }

  /**
   * Format log message with timestamp, orderId, caller info, and message
   */
  formatMessage(level, message, orderId = null) {
    const timestamp = this.getTimestamp();
    const caller = this.getCallerInfo();
    const orderPrefix = orderId ? `[OrderId: ${orderId}]` : '';
    
    return `[${timestamp}] ${orderPrefix} [${caller}] ${level}: ${message}`;
  }

  /**
   * Log info message
   */
  info(message, orderId = null, data = null) {
    const formattedMessage = this.formatMessage('INFO', message, orderId);
    console.log(formattedMessage);
    
    if (this.debugMode && data) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Log warning message
   */
  warn(message, orderId = null, data = null) {
    const formattedMessage = this.formatMessage('WARN', message, orderId);
    console.warn(formattedMessage);
    
    if (this.debugMode && data) {
      console.warn('  Data:', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Log error message
   */
  error(message, orderId = null, error = null) {
    const formattedMessage = this.formatMessage('ERROR', message, orderId);
    console.error(formattedMessage);
    
    if (error) {
      if (this.debugMode) {
        console.error('  Error details:', error);
        if (error.stack) {
          console.error('  Stack trace:', error.stack);
        }
      } else {
        console.error('  Error:', error.message || error);
      }
    }
  }

  /**
   * Log debug message (only if DEBUG=true)
   */
  debug(message, orderId = null, data = null) {
    if (!this.debugMode) return;
    
    const formattedMessage = this.formatMessage('DEBUG', message, orderId);
    console.log(formattedMessage);
    
    if (data) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Log success message
   */
  success(message, orderId = null, data = null) {
    const formattedMessage = this.formatMessage('SUCCESS', message, orderId);
    console.log(formattedMessage);
    
    if (this.debugMode && data) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  }

  /**
   * Log critical/urgent message
   */
  critical(message, orderId = null, data = null) {
    const formattedMessage = this.formatMessage('CRITICAL', message, orderId);
    console.error(formattedMessage);
    
    if (this.debugMode && data) {
      console.error('  Data:', JSON.stringify(data, null, 2));
    }
  }
}

module.exports = new Logger(); 