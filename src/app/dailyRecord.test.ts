import { describe, expect, it } from 'vitest';
import { DAILY_EPOCH, MS_PER_DAY } from '../game/daily.ts';
import { encodeLogText, MAX_LOG_TEXT, MAX_RUN_TICKS } from '../game/inputLog.ts';
import { SIMULATION_VERSION } from '../game/version.ts';
import {
  DAILY_KEY,
  dailyTry,
  didNotFinishRecord,
  finishedRecord,
  DAILY_STATUSES,
  loadDailyRecord,
  MAX_DAYS_AHEAD,
  mergeForStore,
  millisecondsToDay,
  newerRecord,
  readableRecord,
  parseDailyRecord,
  saveDailyRecord,
  serialiseDailyRecord,
  recordTicks,
  settleRecord,
  startedRecord,
  type DailyRecord,
} from './dailyRecord.ts';
import { SETTINGS_KEY } from './settings.ts';

const DAY = 330;
const LOG = encodeLogText(new Uint8Array([4, 4, 4, 5, 5, 1]));
const FINISHED = finishedRecord(DAY, 6, LOG);

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

const throwing = () => {
  throw new Error('no storage');
};

describe('daily record', () => {
  it('reads back what it writes, for every status', () => {
    for (const record of [startedRecord(DAY), FINISHED, didNotFinishRecord(-3)]) {
      expect(parseDailyRecord(serialiseDailyRecord(record))).toEqual(record);
    }
    expect(FINISHED).toEqual({ day: DAY, status: 'finished', ticks: 6, log: LOG, version: SIMULATION_VERSION, sent: null });
    expect(startedRecord(DAY)).toEqual({ day: DAY, status: 'started', ticks: null, log: null, version: SIMULATION_VERSION, sent: null });
  });

  it('knows no try from nothing, junk, or a record without a day or status', () => {
    for (const text of [null, '', 'not json', '[]', '42', 'null', '"x"', '{}']) expect(parseDailyRecord(text)).toBeNull();
    const fields = JSON.parse(serialiseDailyRecord(FINISHED));
    for (const day of [undefined, 1.5, '330', null, Number.MAX_SAFE_INTEGER + 2]) {
      expect(parseDailyRecord(JSON.stringify({ ...fields, day }))).toBeNull();
    }
    for (const status of [undefined, 'won', 3, 'toString']) expect(parseDailyRecord(JSON.stringify({ ...fields, status }))).toBeNull();
  });

  it('keeps a finished try without a valid time as used, but not finished', () => {
    const fields = JSON.parse(serialiseDailyRecord(FINISHED));
    for (const ticks of [undefined, 0, -5, 1.5, '6', MAX_RUN_TICKS + 1]) {
      expect(parseDailyRecord(JSON.stringify({ ...fields, ticks }))).toEqual({ ...didNotFinishRecord(DAY), version: SIMULATION_VERSION });
    }
  });

  it('drops a log that is not one of the time, and keeps the time', () => {
    const fields = JSON.parse(serialiseDailyRecord(FINISHED));
    for (const log of [undefined, 5, 'not a log!', encodeLogText(new Uint8Array([4, 4])), 'A'.repeat(MAX_LOG_TEXT + 1)]) {
      expect(parseDailyRecord(JSON.stringify({ ...fields, log }))).toEqual({ ...FINISHED, log: null });
    }
  });

  it('keeps times and logs only on finished tries', () => {
    const started = JSON.parse(serialiseDailyRecord(startedRecord(DAY)));
    expect(parseDailyRecord(JSON.stringify({ ...started, ticks: 6, log: LOG }))).toEqual(startedRecord(DAY));
  });

  it('drops an unreadable version on its own', () => {
    const fields = JSON.parse(serialiseDailyRecord(FINISHED));
    for (const version of [undefined, 0, 1.5, '1']) expect(parseDailyRecord(JSON.stringify({ ...fields, version }))).toEqual({ ...FINISHED, version: null });
    expect(parseDailyRecord(JSON.stringify({ ...fields, version: 7 }))).toEqual({ ...FINISHED, version: 7 });
  });

  it("reads the server's answer to a finished run, and loads records stored before it existed", () => {
    const fields = JSON.parse(serialiseDailyRecord(FINISHED));
    const { sent: _, ...old } = fields;
    expect(parseDailyRecord(JSON.stringify(old))).toEqual(FINISHED);
    const stored = { ...FINISHED, sent: { status: 'stored' as const, ticks: 7 } };
    const refused = { ...FINISHED, sent: { status: 'refused' as const, reason: 'tooLate' } };
    for (const record of [stored, refused]) expect(parseDailyRecord(serialiseDailyRecord(record))).toEqual(record);
    for (const sent of [{ status: 'stored', ticks: 0 }, { status: 'stored', ticks: MAX_RUN_TICKS + 1 }, { status: 'stored' }, { status: 'refused', reason: 'no way' }, { status: 'refused', reason: 4 }, { status: 'sent' }, 'stored', [], 3]) {
      expect(parseDailyRecord(JSON.stringify({ ...fields, sent })), JSON.stringify(sent)).toEqual(FINISHED);
    }
    const dnf = JSON.parse(serialiseDailyRecord(didNotFinishRecord(DAY)));
    expect(parseDailyRecord(JSON.stringify({ ...dnf, sent: { status: 'stored', ticks: 7 } }))?.sent).toBeNull();
  });

  it("shows the server's time once it stored the run", () => {
    expect(recordTicks(FINISHED)).toBe(6);
    expect(recordTicks({ ...FINISHED, sent: { status: 'stored', ticks: 9 } })).toBe(9);
    expect(recordTicks({ ...FINISHED, sent: { status: 'refused', reason: 'badLog' } })).toBe(6);
    expect(recordTicks(didNotFinishRecord(DAY))).toBeNull();
    expect(dailyTry({ ...FINISHED, sent: { status: 'stored', ticks: 9 } }, DAY)).toEqual({ day: DAY, used: true, ticks: 9 });
  });

  it('turns a try that started and never finished into did not finish', () => {
    expect(settleRecord(startedRecord(DAY))).toEqual({ ...startedRecord(DAY), status: 'didNotFinish' });
    expect(settleRecord(FINISHED)).toBe(FINISHED);
    expect(settleRecord(null)).toBeNull();
  });

  it('prefers the later day, then the further status', () => {
    const earlier = finishedRecord(DAY - 1, 6, LOG);
    expect(newerRecord(earlier, startedRecord(DAY))).toEqual(startedRecord(DAY));
    expect(newerRecord(startedRecord(DAY), earlier)).toEqual(startedRecord(DAY));
    expect(newerRecord(startedRecord(DAY), didNotFinishRecord(DAY))).toEqual(didNotFinishRecord(DAY));
    expect(newerRecord(FINISHED, didNotFinishRecord(DAY))).toBe(FINISHED);
    expect(newerRecord(didNotFinishRecord(DAY), FINISHED)).toBe(FINISHED);
    expect(newerRecord(null, FINISHED)).toBe(FINISHED);
    expect(newerRecord(FINISHED, null)).toBe(FINISHED);
    expect(newerRecord(null, null)).toBeNull();
  });
});

describe("the day's try", () => {
  it('is open without a record, and with one from an earlier day', () => {
    expect(dailyTry(null, DAY)).toEqual({ day: DAY, used: false });
    expect(dailyTry(FINISHED, DAY + 1)).toEqual({ day: DAY + 1, used: false });
    expect(dailyTry(startedRecord(DAY - 1), DAY)).toEqual({ day: DAY, used: false });
  });

  it("is used by today's record, with the time only when finished", () => {
    expect(dailyTry(FINISHED, DAY)).toEqual({ day: DAY, used: true, ticks: 6 });
    expect(dailyTry(didNotFinishRecord(DAY), DAY)).toEqual({ day: DAY, used: true, ticks: null });
    expect(dailyTry(startedRecord(DAY), DAY)).toEqual({ day: DAY, used: true, ticks: null });
  });

  it('stays used whatever simulation version it was driven with', () => {
    expect(dailyTry({ ...FINISHED, version: SIMULATION_VERSION + 1 }, DAY)).toEqual({ day: DAY, used: true, ticks: 6 });
    expect(dailyTry({ ...FINISHED, version: null }, DAY)).toEqual({ day: DAY, used: true, ticks: 6 });
  });

  it('keeps showing the next day when the clock was set back a little, so it gets no second try', () => {
    expect(MAX_DAYS_AHEAD).toBe(1);
    expect(dailyTry(FINISHED, DAY - 1)).toEqual({ day: DAY, used: true, ticks: 6 });
    expect(millisecondsToDay(DAY + 1, DAILY_EPOCH + (DAY - 1) * MS_PER_DAY)).toBe(2 * MS_PER_DAY);
  });

  it('opens the try under a record further ahead than that, which is unreadable', () => {
    expect(dailyTry(FINISHED, DAY - 2)).toEqual({ day: DAY - 2, used: false });
    expect(dailyTry(didNotFinishRecord(DAY + 3650), DAY)).toEqual({ day: DAY, used: false });
    expect(readableRecord(FINISHED, DAY - 2)).toBeNull();
    expect(readableRecord(FINISHED, DAY - 1)).toBe(FINISHED);
    expect(readableRecord(null, DAY)).toBeNull();
  });

  it('counts the milliseconds to the start of a day', () => {
    expect(millisecondsToDay(DAY + 1, DAILY_EPOCH + DAY * MS_PER_DAY)).toBe(MS_PER_DAY);
    expect(millisecondsToDay(1, DAILY_EPOCH + MS_PER_DAY - 1)).toBe(1);
    expect(millisecondsToDay(1, DAILY_EPOCH + MS_PER_DAY + 5)).toBe(-5);
    expect(millisecondsToDay(0, DAILY_EPOCH - 10)).toBe(10);
  });
});

describe('daily record storage', () => {
  it('saves under its own key and loads it back', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{"volume":3}' });
    expect(saveDailyRecord(() => storage, FINISHED)).toBe(true);
    expect(storage.items.get(DAILY_KEY)).toBe(serialiseDailyRecord(FINISHED));
    expect(storage.items.get(SETTINGS_KEY)).toBe('{"volume":3}');
    expect(loadDailyRecord(() => storage)).toEqual(FINISHED);
  });

  it('keeps only the latest day', () => {
    const storage = memoryStorage();
    saveDailyRecord(() => storage, FINISHED);
    saveDailyRecord(() => storage, startedRecord(DAY + 1));
    expect(storage.items.size).toBe(1);
    expect(loadDailyRecord(() => storage)).toEqual(startedRecord(DAY + 1));
  });

  it('never throws without storage, and says the record was not saved', () => {
    expect(loadDailyRecord(throwing)).toBeNull();
    expect(saveDailyRecord(throwing, FINISHED)).toBe(false);
    const broken = { getItem: throwing, setItem: throwing };
    expect(loadDailyRecord(() => broken)).toBeNull();
    expect(saveDailyRecord(() => broken, FINISHED)).toBe(false);
  });

  it('knows no try from corrupt storage', () => {
    const storage = memoryStorage({ [DAILY_KEY]: '{"day":330,"status":' });
    expect(loadDailyRecord(() => storage)).toBeNull();
    const record: DailyRecord | null = loadDailyRecord(() => memoryStorage({ [DAILY_KEY]: '{"day":330,"status":"finished"}' }));
    expect(record?.status).toBe('didNotFinish');
  });
});

describe('writing over the stored try', () => {
  const record = (day: number, status: DailyRecord['status']): DailyRecord =>
    status === 'finished' ? finishedRecord(day, 6, LOG) : status === 'started' ? startedRecord(day) : didNotFinishRecord(day);
  const RANK = { started: 0, didNotFinish: 1, finished: 2 };

  it('writes into empty or unreadable storage', () => {
    expect(mergeForStore(null, startedRecord(DAY), DAY)).toEqual(startedRecord(DAY));
    expect(mergeForStore(FINISHED, startedRecord(DAY - 3), DAY - 3)).toEqual(startedRecord(DAY - 3)); // FINISHED is 3 days ahead
  });

  it('never puts an older day over a newer one, nor a lower or equal status over the same day', () => {
    for (const storedDay of [DAY - 1, DAY, DAY + 1]) {
      for (const writtenDay of [DAY - 1, DAY]) {
        for (const storedStatus of DAILY_STATUSES) {
          for (const writtenStatus of DAILY_STATUSES) {
            const stored = record(storedDay, storedStatus);
            const written = record(writtenDay, writtenStatus);
            const kept = mergeForStore(stored, written, DAY);
            const takes = writtenDay > storedDay || (writtenDay === storedDay && RANK[writtenStatus] > RANK[storedStatus]);
            expect(kept, `${storedDay} ${storedStatus} <- ${writtenDay} ${writtenStatus}`).toBe(takes ? written : stored);
          }
        }
      }
    }
  });

  it('keeps the first finish of a day', () => {
    const first = finishedRecord(DAY, 6000, LOG);
    expect(mergeForStore(first, finishedRecord(DAY, 6, LOG), DAY)).toBe(first);
  });

  it("takes the server's answer to the stored finish, only to that one and only once", () => {
    const stored = { ...FINISHED, sent: { status: 'stored' as const, ticks: 6 } };
    const refused = { ...FINISHED, sent: { status: 'refused' as const, reason: 'tooLate' } };
    expect(mergeForStore(FINISHED, stored, DAY)).toBe(stored);
    expect(mergeForStore(stored, FINISHED, DAY)).toBe(stored);
    expect(mergeForStore(stored, refused, DAY)).toBe(stored);
    expect(mergeForStore(refused, stored, DAY)).toBe(refused);
    const other = finishedRecord(DAY, 6, encodeLogText(new Uint8Array([4, 4, 4, 5, 5, 2])));
    expect(mergeForStore(other, stored, DAY)).toBe(other);
    expect(mergeForStore(finishedRecord(DAY, 6000, LOG), stored, DAY).sent).toBeNull();
    expect(mergeForStore(stored, didNotFinishRecord(DAY), DAY)).toBe(stored);
  });
});
