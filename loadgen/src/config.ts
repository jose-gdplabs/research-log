export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export const LEVELS: Level[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

const num = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  return Number.isFinite(v) ? v : def;
};

const bool = (key: string, def: boolean): boolean => {
  const raw = process.env[key]?.toLowerCase();
  if (raw === undefined || raw === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

// "debug:10,info:70,warn:15,error:5" -> [{level, weight}, ...]
function parseMix(raw: string): Array<{ level: Level; weight: number }> {
  const mix = raw
    .split(',')
    .map((part) => part.trim().split(':'))
    .map(([level, weight]) => ({ level: level as Level, weight: Number(weight) }))
    .filter((m) => LEVELS.includes(m.level) && Number.isFinite(m.weight) && m.weight > 0);
  return mix.length > 0 ? mix : [{ level: 'info', weight: 1 }];
}

export const config = {
  port: num('PORT', 3000),
  // > 0 starts the background generator at boot
  ratePerSec: num('LOG_RATE_PER_SEC', 0),
  levelMix: parseMix(process.env.LOG_LEVEL_MIX ?? 'debug:10,info:70,warn:15,error:5'),
  // extra text attached to each generated log, to control average log size
  padBytes: num('LOG_PAD_BYTES', 0),
  // also print every log as JSON on stdout (off by default: costly at high rates)
  toConsole: bool('LOG_TO_CONSOLE', false),
};
