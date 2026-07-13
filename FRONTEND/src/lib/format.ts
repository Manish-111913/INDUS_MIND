/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSettingsStore } from '../stores/settingsStore';

export function formatDate(dateVal: string | Date | number | undefined | null): string {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '';

  const settings = useSettingsStore.getState().settings;
  const format = settings['locale.date_format'] || 'dd MMM yyyy';

  const day = String(date.getDate()).padStart(2, '0');
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthShort = monthNamesShort[date.getMonth()];
  const monthNumeric = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  if (format === 'yyyy-MM-dd') {
    return `${year}-${monthNumeric}-${day}`;
  }
  if (format === 'MM/dd/yyyy') {
    return `${monthNumeric}/${day}/${year}`;
  }
  return `${day} ${monthShort} ${year}`;
}

export function formatDateTime(dateVal: string | Date | number | undefined | null): string {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  if (isNaN(date.getTime())) return '';

  const dateStr = formatDate(dateVal);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${dateStr} ${hours}:${minutes}`;
}

export function formatCurrency(value: number | string | undefined | null, currencyCode?: string): string {
  if (value === undefined || value === null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';

  const settings = useSettingsStore.getState().settings;
  const currency = currencyCode || settings['locale.currency'] || 'INR';

  try {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(num);
  } catch (e) {
    return `${currency} ${num.toFixed(0)}`;
  }
}

export function formatNumber(value: number | string | undefined | null, decimals: number = 0): string {
  if (value === undefined || value === null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';

  const settings = useSettingsStore.getState().settings;
  const currency = settings['locale.currency'] || 'INR';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatUnit(value: number | string | undefined | null, kind: 'pressure' | 'temperature' | 'dimension' | 'weight' | 'time'): string {
  if (value === undefined || value === null) return '';
  let num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';

  const settings = useSettingsStore.getState().settings;

  if (kind === 'pressure') {
    const unit = settings['units.pressure'] || 'bar';
    if (unit === 'psi') {
      num = num * 14.5038;
    } else if (unit === 'kPa') {
      num = num * 100;
    }
    return `${formatNumber(num, 1)} ${unit}`;
  }

  if (kind === 'temperature') {
    const unit = settings['units.temperature'] || 'C';
    if (unit === 'F') {
      num = num * 1.8 + 32;
    }
    return `${formatNumber(num, 1)} °${unit}`;
  }

  if (kind === 'dimension') {
    const system = settings['units.system'] || 'metric';
    const unit = system === 'metric' ? 'mm' : 'in';
    if (system === 'imperial') {
      num = num / 25.4;
    }
    return `${formatNumber(num, 1)} ${unit}`;
  }

  if (kind === 'weight') {
    const system = settings['units.system'] || 'metric';
    const unit = system === 'metric' ? 'kg' : 'lbs';
    if (system === 'imperial') {
      num = num * 2.20462;
    }
    return `${formatNumber(num, 1)} ${unit}`;
  }

  if (kind === 'time') {
    return `${formatNumber(num, 1)} hrs`;
  }

  return String(num);
}
