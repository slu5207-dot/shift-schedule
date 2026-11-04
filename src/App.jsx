import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Repeat, X, Menu, Wifi, WifiOff, Lock } from 'lucide-react';

import { db as database, auth, authReady } from './firebase';
import { EDITOR_UID } from './firebaseConfig';

function generateInitialShifts() {
    const schedule = {};
    const knownBaseDate = new Date(2025, 9, 2); 
    const pattern = ['靖翰', '靖翰', '宇軒', '宇軒'];
    const startDate = new Date(2025, 0, 1);
    const endDate = new Date(2026, 11, 31);
    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        const timeDiff = currentDate.getTime() - knownBaseDate.getTime();
        const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        const patternIndex = ((daysDiff % 4) + 4) % 4;
        schedule[dateKey] = pattern[patternIndex];
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return schedule;
}

const ShiftScheduleManager = () => {
    const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('currentUser') || '宇軒');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [shifts, setShifts] = useState({});
    const [modifiedDates, setModifiedDates] = useState({});
    const [pendingDates, setPendingDates] = useState({});
    const [lockedDates, setLockedDates] = useState({});
    const [selectedDate, setSelectedDate] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [toast, setToast] = useState({ message: '', visible: false, type: 'success' });
    const [isConnected, setIsConnected] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isPasswordOpen, setIsPasswordOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const editEnabled = useRef(false);
    const editorEmail = import.meta.env.VITE_EDITOR_EMAIL?.trim();
    const [isStatsVisible, setIsStatsVisible] = useState(true);

    const holidays = useMemo(() => ({
        '2025-01-01': '元旦', '2025-01-28': '除夕', '2025-01-29': '春節', '2025-02-28': '和平紀念日',
        '2025-04-04': '兒童節', '2025-04-05': '清明節', '2025-05-31': '端午節', '2025-10-10': '國慶日'
    }), []);

    const originalShifts = useMemo(() => generateInitialShifts(), []);
    const daysInMonth = useMemo(() => new Date(selectedYear, selectedMonth, 0).getDate(), [selectedYear, selectedMonth]);
    const firstDayOfMonth = useMemo(() => {
        const day = new Date(selectedYear, selectedMonth - 1, 1).getDay();
        return (day + 1) % 7;
    }, [selectedYear, selectedMonth]);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, visible: true, type });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    }, []);

    useEffect(() => {
        let active = true;
        let unsubscribe = () => {};
        authReady.then(() => {
            if (!active) return;
            unsubscribe = auth.onAuthStateChanged(user => {
                const allowed = user?.uid === EDITOR_UID;
                editEnabled.current = allowed;
                setIsEditing(allowed);
                if (!allowed) setSelectedDate(null);
            });
        }).catch(() => {
            if (active) showToast('驗證功能無法初始化，目前僅供瀏覽', 'error');
        });
        return () => { active = false; unsubscribe(); };
    }, [showToast]);

    useEffect(() => {
        const connectedRef = database.ref('.info/connected');
        const onConnected = snapshot => setIsConnected(snapshot.val() === true);
        connectedRef.on('value', onConnected);
        const onReadError = () => {
            showToast('班表讀取失敗，請檢查網路與讀取權限', 'error');
        };
        const shiftsRef = database.ref('shifts');
        shiftsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            // 保留舊的平面格式，巢狀資料優先；可安全讀取兩種格式混合的資料。
            const flatShifts = Object.fromEntries(
                Object.entries(data || {}).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key))
            );
            Object.entries(data || {}).forEach(([year, months]) => {
                if (/^\d{4}$/.test(year) && months) {
                    Object.values(months).forEach(dates => Object.assign(flatShifts, dates));
                }
            });
            // 原始班表只作畫面預設值，空白資料庫也不會自動寫入。
            setShifts({ ...originalShifts, ...flatShifts });
            setIsInitialized(true);
        }, onReadError);

        const modifiedRef = database.ref('modifiedDates');
        modifiedRef.on('value', (snapshot) => {
            const data = snapshot.val();
            setModifiedDates(data || {});
        }, onReadError);

        const pendingRef = database.ref('pendingDates');
        pendingRef.on('value', (snapshot) => {
            const data = snapshot.val();
            setPendingDates(data || {});
        }, onReadError);

        const lockedRef = database.ref('lockedDates');
        lockedRef.on('value', (snapshot) => {
            const data = snapshot.val();
            setLockedDates(data || {});
        }, onReadError);

        return () => {
            connectedRef.off('value', onConnected);
            shiftsRef.off();
            modifiedRef.off();
            pendingRef.off();
            lockedRef.off();
        };
    }, [showToast, originalShifts]);

    useEffect(() => {
        localStorage.setItem('currentUser', currentUser);
    }, [currentUser]);

    const login = async (event) => {
        event.preventDefault();
        if (isAuthenticating) return;
        setLoginError('');
        if (!editorEmail) {
            setLoginError('尚未設定編輯帳號，請聯絡網站管理者。');
            setPassword('');
            return;
        }
        setIsAuthenticating(true);
        try {
            await authReady;
            const credential = await auth.signInWithEmailAndPassword(editorEmail, password);
            if (credential.user.uid !== EDITOR_UID) {
                await auth.signOut();
                setLoginError('此帳號沒有編輯權限。');
                return;
            }
            setIsPasswordOpen(false);
            showToast('已進入編輯模式');
        } catch (error) {
            const messages = {
                'auth/too-many-requests': '嘗試次數過多，請稍後再試。',
                'auth/network-request-failed': '無法連線，請檢查網路後再試。',
            };
            setLoginError(messages[error.code] || '密碼錯誤或帳號無法使用，請重新輸入。');
        } finally {
            setPassword('');
            setIsAuthenticating(false);
        }
    };

    const logout = async () => {
        // 先關閉前端寫入入口，再等待 Firebase 清除登入狀態。
        editEnabled.current = false;
        setIsEditing(false);
        setSelectedDate(null);
        setPassword('');
        setIsSigningOut(true);
        try {
            await auth.signOut();
            showToast('已回到唯讀模式');
        } catch {
            showToast('已停止編輯，但登出失敗，請重新整理頁面', 'error');
        } finally {
            setIsSigningOut(false);
        }
    };

    const canWrite = () => {
        if (!editEnabled.current || auth.currentUser?.uid !== EDITOR_UID) {
            showToast('請先點選「編輯班表」並輸入密碼', 'error');
            return false;
        }
        if (!isConnected) {
            showToast('尚未連線到資料庫', 'error');
            return false;
        }
        return true;
    };

    const toggleShift = async (date) => {
        if (!canWrite()) return;

        try {
            const currentPerson = shifts[date];
            const newPerson = currentPerson === '宇軒' ? '靖翰' : '宇軒';
            
            // --- 修正：寫入時使用分層路徑 ---
            const [year, month] = date.split('-');
            await database.ref().update({
                [`shifts/${year}/${month}/${date}`]: newPerson,
                [`modifiedDates/${date}`]: originalShifts[date] !== newPerson ? {
                    from: originalShifts[date],
                    to: newPerson,
                    modifiedBy: currentUser,
                    timestamp: new Date().toISOString()
                } : null,
                [`pendingDates/${date}`]: null,
            });

            showToast(`已調整班別為 ${newPerson}`, 'info');
        } catch (error) {
            console.error('更新失敗:', error);
            showToast('更新失敗，請稍後再試', 'error');
        }
    };

    const togglePending = async (date) => {
        if (!canWrite()) return;

        try {
            const isCurrentlyPending = !!pendingDates[date];
            
            if (isCurrentlyPending) {
                await database.ref(`pendingDates/${date}`).remove();
                showToast('已解除待確認狀態', 'info');
            } else {
                await database.ref(`pendingDates/${date}`).set({
                    requestedBy: currentUser,
                    timestamp: new Date().toISOString()
                });
                showToast('已標記為待確認', 'info');
            }
        } catch (error) {
            console.error('更新失敗:', error);
            showToast('更新失敗，請稍後再試', 'error');
        }
    };

    const toggleLocked = async (date) => {
        if (!canWrite()) return;

        try {
            const isCurrentlyLocked = !!lockedDates[date];
            
            if (isCurrentlyLocked) {
                await database.ref(`lockedDates/${date}`).remove();
                showToast('已解除不能換班標記', 'info');
            } else {
                await database.ref(`lockedDates/${date}`).set({
                    lockedBy: currentUser,
                    timestamp: new Date().toISOString()
                });
                showToast('已標記為不能換班', 'info');
            }
        } catch (error) {
            console.error('更新失敗:', error);
            showToast('更新失敗，請稍後再試', 'error');
        }
    };

    const getStats = () => {
        const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
        let yuxuanCount = 0, jinghanCount = 0, modifiedCount = 0, pendingCount = 0, lockedCount = 0;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
            const person = shifts[dateKey];
            if (person === '宇軒') yuxuanCount++;
            else if (person === '靖翰') jinghanCount++;
            if (modifiedDates[dateKey]) modifiedCount++;
            if (pendingDates[dateKey]) pendingCount++;
            if (lockedDates[dateKey]) lockedCount++;
        }
        return { yuxuanCount, jinghanCount, modifiedCount, pendingCount, lockedCount };
    };

    const stats = getStats();

    const changeMonth = (delta) => {
        let newMonth = selectedMonth + delta;
        let newYear = selectedYear;
        if (newMonth > 12) { newMonth = 1; newYear++; }
        else if (newMonth < 1) { newMonth = 12; newYear--; }
        if (newYear < 2025) { newYear = 2025; newMonth = 1; }
        else if (newYear > 2026) { newYear = 2026; newMonth = 12; }
        setSelectedMonth(newMonth);
        setSelectedYear(newYear);
    };

    const renderCalendar = () => {
        const days = [];
        const weekDays = ['六', '日', '一', '二', '三', '四', '五'];
        
        weekDays.forEach((day, index) => {
            const isWeekend = index === 0 || index === 1;
            days.push(
                <div key={`header-${day}`} className={`text-center font-bold py-1 text-xs ${isWeekend ? 'bg-red-600 text-white' : 'bg-slate-700 text-white'}`}>
                    {day}
                </div>
            );
        });
        
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(<div key={`empty-${i}`} className="bg-gray-50 border border-gray-200"></div>);
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const person = shifts[dateKey] || '載入中';
            const isYuxuan = person === '宇軒';
            const isModified = modifiedDates[dateKey];
            const isPending = pendingDates[dateKey];
            const isLocked = lockedDates[dateKey];
            const holiday = holidays[dateKey];
            const date = new Date(selectedYear, selectedMonth - 1, day);
            const isToday = new Date().toDateString() === date.toDateString();
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            days.push(
                <div 
                    key={dateKey} 
                    className={`relative h-16 sm:h-24 border flex flex-col justify-center items-center cursor-pointer hover:shadow-lg transition-all ${
                        isToday ? 'ring-2 ring-amber-500 bg-amber-50' : (isWeekend || holiday) ? 'bg-red-50' : 'bg-white'
                    } ${isModified ? 'border-red-600 border-2 sm:border-4' : isPending ? 'border-yellow-500 border-2 sm:border-4' : isLocked ? 'border-purple-600 border-2 sm:border-4' : 'border-gray-200'}`}
                    onClick={() => setSelectedDate(dateKey)}
                >
                    <div className={`absolute top-0.5 right-1 text-xs sm:text-sm font-bold ${(holiday || isWeekend) ? 'text-red-700' : 'text-gray-700'}`}>
                        {day}
                    </div>

                    <div className={`text-xs sm:text-sm font-bold px-2 py-0.5 rounded-full ${isYuxuan ? 'bg-blue-600 text-white' : person === '靖翰' ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'}`}>
                        {person}
                    </div>

                    {holiday && <div className="absolute bottom-0.5 right-1 text-xs">🎉</div>}

                    {(isModified || isPending || isLocked) && (
                        <div className="absolute top-0.5 left-0.5 flex gap-0.5">
                            {isModified && (
                                <div className="bg-red-600 text-white rounded-full p-0.5 shadow-sm" title="已調班">
                                    <Repeat size={12} strokeWidth={3} />
                                </div>
                            )}
                            {isPending && (
                                <div className="bg-yellow-500 text-white rounded-full p-0.5 shadow-sm" title="待確認">
                                    <AlertCircle size={12} strokeWidth={3} />
                                </div>
                            )}
                            {isLocked && (
                                <div className="bg-purple-600 text-white rounded-full p-0.5 shadow-sm" title="不能換班">
                                    <Lock size={12} strokeWidth={3} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }
        return days;
    };

    return (
        <div className="min-h-screen bg-gray-100 sm:p-4 pb-20">
            {isPasswordOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <form onSubmit={login} role="dialog" aria-modal="true" aria-labelledby="editor-title" className="bg-white rounded-xl w-full max-w-sm p-6">
                        <h2 id="editor-title" className="text-xl font-bold mb-4">編輯班表</h2>
                        <label htmlFor="editor-password" className="block text-sm mb-2">編輯密碼</label>
                        <input id="editor-password" type="password" autoComplete="current-password" autoFocus required
                            value={password} onChange={event => setPassword(event.target.value)} disabled={isAuthenticating}
                            className="w-full p-2 border rounded mb-3" />
                        {loginError && <p role="alert" className="text-sm text-red-700 mb-3">{loginError}</p>}
                        <div className="flex gap-2">
                            <button type="submit" disabled={isAuthenticating} className="flex-1 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">
                                {isAuthenticating ? '驗證中…' : '確認編輯'}
                            </button>
                            <button type="button" disabled={isAuthenticating} onClick={() => { setIsPasswordOpen(false); setPassword(''); setLoginError(''); }} className="flex-1 py-2 border rounded">取消</button>
                        </div>
                    </form>
                </div>
            )}
            {isMenuOpen && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsMenuOpen(false)}></div>
                    <div className="relative w-64 bg-white h-full shadow-2xl overflow-y-auto">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h2 className="text-lg font-bold">輪班管理</h2>
                            <button onClick={() => setIsMenuOpen(false)} className="p-2"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold mb-2">當前使用者</h3>
                                <select value={currentUser} onChange={(e) => setCurrentUser(e.target.value)} className="w-full p-2 border rounded">
                                    <option value="宇軒">宇軒</option>
                                    <option value="靖翰">靖翰</option>
                                </select>
                            </div>
                            <div className="pt-4 border-t">
                                <h3 className="text-sm font-semibold mb-2">顯示設定</h3>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={isStatsVisible} onChange={(e) => setIsStatsVisible(e.target.checked)} />
                                    <span className="text-sm">顯示統計數據</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {selectedDate && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDate(null)}>
                    <div className="bg-white rounded-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-2xl font-bold">{selectedDate}</h3>
                            <button onClick={() => setSelectedDate(null)} className="p-2"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-gray-600">當前值班：</p>
                            <p className="text-3xl font-bold">{shifts[selectedDate]}</p>
                            {modifiedDates[selectedDate] && (
                                <div className="mt-3 p-3 bg-red-100 border-l-4 border-red-600 rounded">
                                    <div className="flex items-center gap-2 text-red-800 font-bold">
                                        <Repeat size={18} />
                                        <span>已調班記錄</span>
                                    </div>
                                    <p className="text-sm text-red-700 mt-1">
                                        {modifiedDates[selectedDate].from} → {modifiedDates[selectedDate].to}
                                    </p>
                                </div>
                            )}
                            {pendingDates[selectedDate] && (
                                <div className="mt-3 p-3 bg-yellow-100 border-l-4 border-yellow-600 rounded">
                                    <div className="flex items-center gap-2 text-yellow-800 font-bold">
                                        <AlertCircle size={18} />
                                        <span>待確認標記</span>
                                    </div>
                                </div>
                            )}
                            {lockedDates[selectedDate] && (
                                <div className="mt-3 p-3 bg-purple-100 border-l-4 border-purple-600 rounded">
                                    <div className="flex items-center gap-2 text-purple-800 font-bold">
                                        <Lock size={18} />
                                        <span>不能換班標記</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-3">
                            {!isEditing && <p className="text-sm text-gray-600">目前為唯讀模式，請點選「編輯班表」以修改。</p>}
                            <button 
                                onClick={() => { toggleShift(selectedDate); setSelectedDate(null); }} 
                                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:bg-gray-400"
                                disabled={!isConnected || !isEditing}
                            >
                                換班
                            </button>
                            <button 
                                onClick={() => { togglePending(selectedDate); setSelectedDate(null); }} 
                                className="w-full py-3 bg-yellow-400 text-gray-900 rounded-lg font-bold hover:bg-yellow-500 transition-colors disabled:bg-gray-400"
                                disabled={!isConnected || !isEditing}
                            >
                                {pendingDates[selectedDate] ? '取消待確認' : '標記待確認'}
                            </button>
                            <button 
                                onClick={() => { toggleLocked(selectedDate); setSelectedDate(null); }} 
                                className="w-full py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 transition-colors disabled:bg-gray-400"
                                disabled={!isConnected || !isEditing}
                            >
                                {lockedDates[selectedDate] ? '解除不能換班' : '標記不能換班'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {toast.visible && (
                <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full text-white shadow-xl z-50 ${
                    toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
                }`}>
                    {toast.message}
                </div>
            )}
            
            <div className="max-w-4xl mx-auto bg-white sm:rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-600 to-blue-700 p-3 text-white sticky top-0 z-10">
                    <div className="flex justify-between items-center mb-2">
                        <button onClick={() => setIsMenuOpen(true)} className="p-1 rounded-full hover:bg-indigo-500">
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold">值班表</h1>
                            {isConnected ? (
                                <Wifi className="w-4 h-4 text-green-300" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-red-300" />
                            )}
                        </div>
                        <button
                            onClick={isEditing ? logout : () => { setLoginError(''); setPassword(''); setIsPasswordOpen(true); }}
                            disabled={isSigningOut}
                            className="text-xs sm:text-sm px-2 py-1 border border-white rounded hover:bg-indigo-500 disabled:opacity-50"
                        >
                            {isSigningOut ? '登出中…' : isEditing ? '完成編輯／登出' : '編輯班表'}
                        </button>
                    </div>
                    <div className="flex justify-center items-center gap-4">
                        <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-indigo-500 rounded">
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="bg-white text-gray-800 px-4 py-1 rounded-lg font-bold text-lg shadow-sm">
                            {selectedYear}年{selectedMonth}月
                        </div>
                        <button onClick={() => changeMonth(1)} className="p-1 hover:bg-indigo-500 rounded">
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                
                {isStatsVisible && (
                    <div className="p-2 bg-gray-50 grid grid-cols-5 gap-2 text-center text-xs sm:text-sm">
                        <div className="bg-white p-1 rounded shadow">
                            <div className="text-lg font-bold text-blue-600">{stats.yuxuanCount}</div>
                            <div className="text-gray-500 scale-90">宇軒</div>
                        </div>
                        <div className="bg-white p-1 rounded shadow">
                            <div className="text-lg font-bold text-green-600">{stats.jinghanCount}</div>
                            <div className="text-gray-500 scale-90">靖翰</div>
                        </div>
                        <div className="bg-white p-1 rounded shadow">
                            <div className="text-lg font-bold text-red-600">{stats.modifiedCount}</div>
                            <div className="text-gray-500 scale-90">已調</div>
                        </div>
                        <div className="bg-white p-1 rounded shadow">
                            <div className="text-lg font-bold text-yellow-600">{stats.pendingCount}</div>
                            <div className="text-gray-500 scale-90">待確</div>
                        </div>
                        <div className="bg-white p-1 rounded shadow">
                            <div className="text-lg font-bold text-purple-600">{stats.lockedCount}</div>
                            <div className="text-gray-500 scale-90">鎖定</div>
                        </div>
                    </div>
                )}
                
                <div className="p-1 sm:p-4">
                    {!isInitialized ? (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                            <p className="text-gray-600">正在載入資料...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 border border-gray-200 bg-gray-200">
                            {renderCalendar()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShiftScheduleManager;
