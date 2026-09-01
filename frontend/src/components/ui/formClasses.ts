// Shared className tokens for native form controls. Kept as plain strings (not components) so
// existing `<input {...register("field")} className={inputClass} />` call sites need only a
// className swap - react-hook-form's ref/onChange wiring on the native element is untouched.

export const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 " +
  "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export const selectClass = inputClass;

export const textareaClass = inputClass;

export const inputSmClass =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 " +
  "focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30";

export const errorTextClass = "mt-1 text-xs text-red-600";

export const helperTextClass = "mt-1 text-xs text-slate-400";
