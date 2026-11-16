import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { I18nProvider } from 'react-aria-components';
import { getActiveDateFormat } from '../../../utils/formatters';
import { firstDayOfWeekFor, localeForDateFormat, readWeekStart, type FirstDayOfWeek } from '../../../utils/datePicker';

/**
 * The user's date preferences for the pickers: the date format from Settings (the typed segments follow its
 * order) and the week start from the Calendar page (the grids start on that day).
 */
interface PickerPrefs {
    dateFormat: string;
    firstDayOfWeek: FirstDayOfWeek;
}

const PickerPrefsContext = createContext<PickerPrefs | null>(null);

/** Reads the preferences once per picker and sets the React Aria locale that orders the date segments. */
export const PickerPrefsProvider = ({ children }: PropsWithChildren) => {
    const dateFormat = getActiveDateFormat();
    const weekStart = readWeekStart();
    const prefs = useMemo<PickerPrefs>(() => ({ dateFormat, firstDayOfWeek: firstDayOfWeekFor(weekStart) }), [dateFormat, weekStart]);
    return (
        <PickerPrefsContext.Provider value={prefs}>
            <I18nProvider locale={localeForDateFormat(dateFormat)}>{children}</I18nProvider>
        </PickerPrefsContext.Provider>
    );
};

export const usePickerPrefs = (): PickerPrefs => {
    const prefs = useContext(PickerPrefsContext);
    return prefs ?? { dateFormat: getActiveDateFormat(), firstDayOfWeek: firstDayOfWeekFor(readWeekStart()) };
};
