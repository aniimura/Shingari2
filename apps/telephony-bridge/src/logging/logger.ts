import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'telephony-bridge' },
  redact: {
    paths: [
      'caller_phone',
      '*.caller_phone',
      'patient.callback_phone',
      'patient.kana',
      'patient.date_of_birth',
    ],
    censor: '[REDACTED]',
  },
});
