import React from 'react';
import DatePicker, { DatePickerProps } from '../ui/DatePicker';
import DateRangePicker, { DateRangePickerProps } from '../ui/DateRangePicker';

export { DatePicker, DateRangePicker };
export type { DatePickerProps, DateRangePickerProps };

/**
 * Standard Liquid Glass DatePicker component for WanderGrid.
 * Automatically wraps single-date and date-range pickers in the liquid glass design system.
 */
export const GlassDatePicker: React.FC<DatePickerProps> = (props) => {
  return <DatePicker {...props} />;
};

export const GlassDateRangePicker: React.FC<DateRangePickerProps> = (props) => {
  return <DateRangePicker {...props} />;
};

export default GlassDatePicker;
