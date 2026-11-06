// 官方政府辦公日曆僅作「日期標記」參考，不改變兩人實際輪班、休假或薪資認定。
// 2026: https://www.dgpa.gov.tw/information?pid=12574&uid=82
// 2027: https://www.dgpa.gov.tw/information?pid=12983&uid=2
// 只收錄全國性放假紀念日、節日與政府公告之補假；不將所有週末標為國定假日。
export const FIRST_YEAR = 2025;
export const LAST_YEAR = 2027;

function holiday(name, label = name) {
    return { name, label };
}

export const HOLIDAYS = Object.freeze({
    // 舊版已存在的 2025 標記，維持既有顯示，不在本次變更中重寫歷史資料。
    '2025-01-01': holiday('元旦'), '2025-01-28': holiday('除夕'),
    '2025-01-29': holiday('春節'), '2025-02-28': holiday('和平紀念日', '228'),
    '2025-04-04': holiday('兒童節'), '2025-04-05': holiday('清明節'),
    '2025-05-31': holiday('端午節'), '2025-10-10': holiday('國慶日'),

    // 2026（民國 115 年）行政院辦公日曆
    '2026-01-01': holiday('元旦'),
    '2026-02-15': holiday('除夕前一日', '小年夜'),
    '2026-02-16': holiday('除夕'),
    '2026-02-17': holiday('春節初一', '春節'),
    '2026-02-18': holiday('春節初二', '春節'),
    '2026-02-19': holiday('春節初三', '春節'),
    '2026-02-20': holiday('春節補假'),
    '2026-02-27': holiday('和平紀念日補假', '228補假'),
    '2026-02-28': holiday('和平紀念日', '228'),
    '2026-04-03': holiday('兒童節補假'),
    '2026-04-04': holiday('兒童節'),
    '2026-04-05': holiday('清明節'),
    '2026-04-06': holiday('清明節補假'),
    '2026-05-01': holiday('勞動節'),
    '2026-06-19': holiday('端午節'),
    '2026-09-25': holiday('中秋節'),
    '2026-09-28': holiday('孔子誕辰紀念日／教師節', '教師節'),
    '2026-10-09': holiday('國慶日補假', '國慶補假'),
    '2026-10-10': holiday('國慶日'),
    '2026-10-25': holiday('臺灣光復暨金門古寧頭大捷紀念日', '光復節'),
    '2026-10-26': holiday('臺灣光復暨金門古寧頭大捷紀念日補假', '光復補假'),
    '2026-12-25': holiday('行憲紀念日'),

    // 2027（民國 116 年）行政院 2026-05-21 核定辦公日曆
    '2027-01-01': holiday('元旦'),
    '2027-02-04': holiday('除夕前一日', '小年夜'),
    '2027-02-05': holiday('除夕'),
    '2027-02-06': holiday('春節初一', '春節'),
    '2027-02-07': holiday('春節初二', '春節'),
    '2027-02-08': holiday('春節初三', '春節'),
    '2027-02-09': holiday('春節補假（初一）', '春節補假'),
    '2027-02-10': holiday('春節補假（初二）', '春節補假'),
    '2027-02-28': holiday('和平紀念日', '228'),
    '2027-03-01': holiday('和平紀念日補假', '228補假'),
    '2027-04-04': holiday('兒童節'),
    '2027-04-05': holiday('清明節'),
    '2027-04-06': holiday('兒童節補假'),
    '2027-04-30': holiday('勞動節補假'),
    '2027-05-01': holiday('勞動節'),
    '2027-06-09': holiday('端午節'),
    '2027-09-15': holiday('中秋節'),
    '2027-09-28': holiday('孔子誕辰紀念日／教師節', '教師節'),
    '2027-10-10': holiday('國慶日'),
    '2027-10-11': holiday('國慶日補假', '國慶補假'),
    '2027-10-25': holiday('臺灣光復暨金門古寧頭大捷紀念日', '光復節'),
    '2027-12-24': holiday('行憲紀念日補假', '行憲補假'),
    '2027-12-25': holiday('行憲紀念日'),
    '2027-12-31': holiday('2028 年元旦補假', '元旦補假'),
});

// 2025-10-02 起依「靖翰、靖翰、宇軒、宇軒」連續循環。
// 用 UTC 的整日序數避免跨年、DST 或使用者裝置時區造成偏移。
// 已經存進 Firebase 的實際排班紀錄，仍由 App 的資料庫覆蓋此預設班表。
export function generateInitialShifts() {
    const schedule = {};
    const anchor = Date.UTC(2025, 9, 2);
    const pattern = ['靖翰', '靖翰', '宇軒', '宇軒'];
    const first = Date.UTC(FIRST_YEAR, 0, 1);
    const last = Date.UTC(LAST_YEAR, 11, 31);
    for (let time = first; time <= last; time += 86400000) {
        const date = new Date(time);
        const key = date.toISOString().slice(0, 10);
        const index = ((((time - anchor) / 86400000) % 4) + 4) % 4;
        schedule[key] = pattern[index];
    }
    return schedule;
}
