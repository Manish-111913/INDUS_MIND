/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Admin' | 'Plant Manager' | 'Maintenance Engineer' | 'Field Technician' | 'Compliance Officer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: string[];
  featureFlags: Record<string, boolean>;
  plant: string;
}

export interface NavigationItem {
  id: string;
  title: string;
  path: string;
  icon: string; // Lucide icon name
  requiredPermission?: string;
}

export interface ApiResponseEnvelope<T> {
  data: T;
  meta?: {
    page?: number;
    page_size?: number;
    total?: number;
  };
}

export interface ExtractedEntity {
  key: string;
  value: string;
  confidence: number;
  category: 'Equipment Tag' | 'Standard Reference' | 'Failure Mode' | 'Safety Directive';
}

export interface DocumentFile {
  id: string;
  name: string;
  type: string;
  tags: string[];
  plant: string;
  area: string;
  uploader: string;
  date: string;
  version: string;
  status: 'pending' | 'ocr' | 'parsing' | 'chunking' | 'embedding' | 'extracting' | 'graphing' | 'completed' | 'failed';
  confidence: number;
  fileSize: string;
  content: string;
  extractedEntities: ExtractedEntity[];
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
}
