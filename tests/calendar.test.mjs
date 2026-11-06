import test from 'node:test';
import assert from 'node:assert/strict';
import { generateInitialShifts, HOLIDAYS, FIRST_YEAR, LAST_YEAR } from '../src/calendarData.js';

const shifts = generateInitialShifts();
const people = ['宇軒', '靖翰'];
const oneDay = 86400000;
test('預設班表完整涵蓋 2025 到 2027，沒有提前限制在 2026', () => {
    assert.equal(FIRST_YEAR, 2025);
    assert.equal(LAST_YEAR, 2027);
    assert.equal(Object.keys(shifts).length, 365 + 365 + 365);
    assert.equal(shifts['2025-01-01'] !== undefined, true);
    assert.equal(shifts['2027-12-31'] !== undefined, true);
    assert.equal(shifts['2028-01-01'], undefined);
});
test('每日兩人交替，四日循環跨 2026/2027 不重置', () => {
    for (let current = Date.UTC(2026, 11, 25); current <= Date.UTC(2027, 0, 8); current += oneDay) {
        const key = new Date(current).toISOString().slice(0, 10);
        const nextKey = new Date(current + oneDay).toISOString().slice(0, 10);
        assert.ok(people.includes(shifts[key]));
        assert.ok(people.includes(shifts[nextKey]));
        const prev2Key = new Date(current + 2 * oneDay).toISOString().slice(0, 10);
        const prev4Key = new Date(current + 4 * oneDay).toISOString().slice(0, 10);
        assert.notEqual(shifts[key], shifts[prev2Key]);
        assert.equal(shifts[key], shifts[prev4Key]);
    }
    assert.equal(shifts['2026-12-31'], '宇軒');
    assert.equal(shifts['2027-01-01'], '靖翰');
    assert.equal(shifts['2027-01-02'], '靖翰');
    assert.equal(shifts['2027-01-03'], '宇軒');
});
test('116年行政院假期重點含春節、補假與 2028 元旦提前補假', () => {
    for (const key of ['2027-01-01', '2027-02-04', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-03-01', '2027-04-06', '2027-04-30', '2027-06-09', '2027-09-15', '2027-09-28', '2027-10-11', '2027-12-24', '2027-12-31']) {
        assert.ok(HOLIDAYS[key]?.label, 'Missing holiday ' + key);
    }
    assert.match(HOLIDAYS['2027-12-31'].name, /2028/);
    assert.equal(HOLIDAYS['2027-07-14'], undefined);
});
