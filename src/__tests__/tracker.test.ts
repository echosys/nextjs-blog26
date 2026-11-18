import { describe, expect, it } from 'vitest';
import {
    addDays,
    bucketTodos,
    buildHeatmap,
    categoryStats,
    isDateKey,
    sanitizeCategoryInput,
    sanitizeEntryInput,
    TrackerInputError,
    type TrackerCategory,
    type TrackerEntry,
    type TrackerTodo,
} from '../lib/tracker/model';

const steps: TrackerCategory = { id: 's', key: 'steps', name: 'Steps', type: 'amount', unit: 'steps', goal: 10000, createdAt: '' };
const workout: TrackerCategory = { id: 'w', key: 'workout', name: 'Workout', type: 'boolean', createdAt: '' };

function entry(date: string, metrics: TrackerEntry['metrics'], notes = ''): TrackerEntry {
    return { id: date, date, notes, metrics, createdAt: '' };
}

describe('tracker dates', () => {
    it('validates calendar days and crosses month boundaries', () => {
        expect(isDateKey('2026-02-28')).toBe(true);
        expect(isDateKey('2026-02-30')).toBe(false);
        expect(isDateKey('2026-2-01')).toBe(false);
        expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });
});

describe('categoryStats', () => {
    const byDate = new Map([
        entry('2026-11-10', { steps: 12000, workout: true }),
        entry('2026-11-11', { steps: 4000, workout: true }),
        entry('2026-11-13', { workout: true }),
        entry('2026-11-14', { steps: 10000, workout: true }),
    ].map((item) => [item.date, item]));

    it('totals amounts and counts goal days', () => {
        const stats = categoryStats(steps, byDate, '2026-11-10', '2026-11-16');
        expect(stats.days).toBe(7);
        expect(stats.activeDays).toBe(3);
        expect(stats.total).toBe(26000);
        expect(stats.best).toBe(12000);
        expect(stats.goalDays).toBe(2);
        expect(stats.series.find((point) => point.date === '2026-11-12')?.value).toBe(0);
    });

    it('computes streaks, treating an unlogged "today" as not breaking the streak', () => {
        const stats = categoryStats(workout, byDate, '2026-11-10', '2026-11-15');
        expect(stats.longestStreak).toBe(2);
        expect(stats.currentStreak).toBe(2);
        expect(categoryStats(workout, byDate, '2026-11-10', '2026-11-16').currentStreak).toBe(0);
    });
});

describe('buildHeatmap', () => {
    it('ends on the given day with Sunday-first weeks and nulls for future days', () => {
        const columns = buildHeatmap(new Map([['2026-11-17', 2], ['2026-11-16', 9]]), '2026-11-17', 3);
        expect(columns).toHaveLength(3);
        const last = columns[2];
        expect(last[0]?.date).toBe('2026-11-15');
        expect(last[2]).toMatchObject({ date: '2026-11-17', level: 2 });
        expect(last[1]).toMatchObject({ date: '2026-11-16', level: 4 });
        expect(last[3]).toBeNull();
        expect(columns[0][0]?.date).toBe('2026-11-01');
    });
});

describe('bucketTodos', () => {
    const now = Date.parse('2026-11-17T12:00:00Z');
    const day = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString();
    const todo = (id: string, extra: Partial<TrackerTodo>): TrackerTodo => ({ id, title: id, kind: 'regular', tier: 2, createdAt: day(-1), ...extra });
    const todos = [
        todo('open', { dueAt: day(2) }),
        todo('done-in-window', { dueAt: day(1), doneAt: day(-0.5), doneDate: '2026-11-17' }),
        todo('expired', { dueAt: day(-1) }),
        todo('done-late', { dueAt: day(-2), doneAt: day(-3), doneDate: '2026-11-14' }),
        todo('t1', { kind: 'longterm', tier: 1, createdAt: day(-10) }),
        todo('t2', { kind: 'longterm', tier: 2 }),
        todo('t2-done', { kind: 'longterm', tier: 2, doneAt: day(-40), doneDate: '2026-10-08' }),
    ];

    it('splits into now, tiers, and month history', () => {
        const buckets = bucketTodos(todos, now, 10, (iso) => iso.slice(0, 10));
        expect(buckets.now.map((item) => item.id)).toEqual(['open', 'done-in-window']);
        expect(buckets.tier1.map((item) => item.id)).toEqual(['t1']);
        expect(buckets.tier2.map((item) => item.id)).toEqual(['t2']);
        expect(buckets.history.map((group) => group.month)).toEqual(['2026-11', '2026-10']);
        expect(buckets.history[0].items.map((item) => [item.id, item.status])).toEqual([['expired', 'expired'], ['done-late', 'done']]);
        expect(buckets.expiredCount).toBe(1);
    });

    it('caps the Now list and reports how many are hidden', () => {
        const many = Array.from({ length: 5 }, (_, index) => todo(`n${index}`, { dueAt: day(1 + index) }));
        const buckets = bucketTodos(many, now, 3);
        expect(buckets.now).toHaveLength(3);
        expect(buckets.nowHidden).toBe(2);
    });
});

describe('input validation', () => {
    it('keeps only known categories with valid values', () => {
        const value = sanitizeEntryInput({ date: '2026-11-17', notes: 'hi', metrics: { steps: '8500', workout: true, unknown: 5 } }, [steps, workout]);
        expect(value.metrics).toEqual({ steps: 8500, workout: true });
        expect(() => sanitizeEntryInput({ date: '2026-11-17', metrics: { steps: -1 } }, [steps])).toThrow(TrackerInputError);
        expect(() => sanitizeEntryInput({ date: 'nope' }, [])).toThrow(TrackerInputError);
    });

    it('slugifies category names and only keeps unit/goal for amounts', () => {
        expect(sanitizeCategoryInput({ name: 'Water Intake', type: 'amount', unit: 'ml', goal: '2000' })).toEqual({ key: 'water-intake', name: 'Water Intake', type: 'amount', unit: 'ml', goal: 2000 });
        expect(sanitizeCategoryInput({ name: 'Stretch', type: 'boolean', unit: 'x' })).toEqual({ key: 'stretch', name: 'Stretch', type: 'boolean' });
        expect(() => sanitizeCategoryInput({ name: '!!!' })).toThrow(TrackerInputError);
    });
});
