'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

/**
 * Input – flat design.
 * Normal: gray-100 bg, no border.
 * Focus: white bg, 2px solid primary border.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-600 text-gray-700 tracking-wide">{label}</label>}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`
              w-full h-11 bg-gray-100 text-gray-900 rounded-lg
              ${icon ? 'pl-10' : 'pl-3'} pr-3
              border-2 border-transparent
              transition-all duration-200
              placeholder:text-gray-400 text-sm
              focus:outline-none focus:bg-white focus:border-blue-500
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-red-500 bg-red-50' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-semibold text-gray-700">{label}</label>}
        <textarea
          ref={ref}
          className={`
            w-full bg-gray-100 text-gray-900 rounded-lg
            px-3 py-2.5
            border-2 border-transparent
            transition-all duration-200
            placeholder:text-gray-400 text-sm
            focus:outline-none focus:bg-white focus:border-blue-500
            disabled:opacity-50 resize-none
            ${error ? 'border-red-500 bg-red-50' : ''}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
