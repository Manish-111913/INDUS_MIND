/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** Optional plain-text label used for the trigger when `label` is a node. */
  text?: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Extra classes applied to the trigger button. */
  className?: string;
  /** Extra classes applied to the popover panel. */
  contentClassName?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * A shadcn-style dropdown select that replaces the native <select> element.
 * Fully themed via design tokens, keyboard accessible, and closes on
 * click-outside / Escape.
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  contentClassName = '',
  id,
  'aria-label': ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const triggerLabel = selected ? (selected.text ?? selected.label) : placeholder;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Sync active index to selection when opening
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const commit = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onValueChange(opt.value);
      setOpen(false);
    },
    [onValueChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) commit(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between w-full gap-2 bg-bg border border-border-custom rounded text-text-primary hover:border-primary/60 focus:outline-none focus:border-primary focus:ring-1 focus:ring-focus-ring transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
          className || 'px-2.5 py-1.5 text-xs'
        }`}
      >
        <span className={`truncate text-left ${selected ? '' : 'text-text-muted'}`}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className={`absolute left-0 top-full mt-1 w-full min-w-[8rem] max-h-60 overflow-y-auto z-50 rounded-md bg-surface border border-border-custom shadow-pop p-1 scrollbar-thin animate-in fade-in-0 zoom-in-95 ${contentClassName}`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIndex;
            return (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(opt)}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-text-secondary'
                } ${isSelected ? 'font-semibold text-primary' : ''}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
