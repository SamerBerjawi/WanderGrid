export const COLORS = ['blue', 'green', 'amber', 'purple', 'red', 'indigo', 'gray', 'pink', 'teal', 'cyan'];

export const getEntitlementColorClass = (color?: string) => {
    const map: any = { 
        blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500', 
        purple: 'bg-purple-500', red: 'bg-rose-500', indigo: 'bg-indigo-500', 
        gray: 'bg-gray-500', pink: 'bg-pink-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500'
    };
    return map[color || 'gray'] || 'bg-gray-500';
};

export const getEntitlementTextClass = (color?: string) => {
    const map: any = { 
        blue: 'text-blue-600 dark:text-blue-400', green: 'text-emerald-600 dark:text-emerald-400', 
        amber: 'text-amber-600 dark:text-amber-400', purple: 'text-purple-600 dark:text-purple-400', 
        red: 'text-rose-600 dark:text-rose-400', indigo: 'text-indigo-600 dark:text-indigo-400', 
        gray: 'text-gray-600 dark:text-gray-400', pink: 'text-pink-600 dark:text-pink-400', 
        teal: 'text-teal-600 dark:text-teal-400', cyan: 'text-cyan-600 dark:text-cyan-400'
    };
    return map[color || 'gray'] || 'text-gray-600';
};

export const getCategoryClasses = (color?: string, isFullDay = true) => {
    const map: any = {
        blue: isFullDay ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100 border-l-4 border-blue-500' : 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
        green: isFullDay ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100 border-l-4 border-emerald-500' : 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
        amber: isFullDay ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100 border-l-4 border-amber-500' : 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
        purple: isFullDay ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-100 border-l-4 border-purple-500' : 'bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
        red: isFullDay ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-100 border-l-4 border-rose-500' : 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800',
        indigo: isFullDay ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-100 border-l-4 border-indigo-500' : 'bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800',
        gray: isFullDay ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100 border-l-4 border-gray-500' : 'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
        pink: isFullDay ? 'bg-pink-100 text-pink-800 dark:bg-pink-900/60 dark:text-pink-100 border-l-4 border-pink-500' : 'bg-pink-100 text-pink-700 border border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
        teal: isFullDay ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-100 border-l-4 border-teal-500' : 'bg-teal-100 text-teal-700 border border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
        cyan: isFullDay ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-100 border-l-4 border-cyan-500' : 'bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-800',
    };
    return map[color || ''] || map.gray;
};

export const getColorClasses = (color?: string) => {
    const map: any = {
        blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        red: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700',
        pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200 dark:border-pink-800',
        teal: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
        cyan: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    };
    return map[color || 'gray'] || map.gray;
};
