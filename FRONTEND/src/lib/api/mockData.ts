/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, NavigationItem } from '../../types';

export interface MockUserDbEntry {
  user: User;
  passwordHash: string;
}

export const MOCK_USERS: Record<string, MockUserDbEntry> = {
  'admin@indusmind.io': {
    passwordHash: 'Demo@1234',
    user: {
      id: 'usr-admin',
      email: 'admin@indusmind.io',
      name: 'Aditya Vardhan',
      role: 'Admin',
      plant: 'Reliance Jamnagar Refinery - Sector A',
      featureFlags: {
        lessons_learned: true,
        predictive_maintenance: true,
        compliance_evidence_pack: true,
        advanced_analytics: true,
      },
      permissions: [
        'doc.read', 'doc.create', 'doc.delete', 'doc.reprocess', 'doc.export',
        'equip.read', 'equip.manage',
        'wo.read', 'wo.create', 'wo.assign', 'wo.close', 'wo.export',
        'maint.schedule', 'predict.act',
        'rca.run', 'rca.publish',
        'comp.read', 'comp.map', 'comp.gap.manage', 'comp.evidence.generate',
        'qual.read', 'qual.manage',
        'lesson.read', 'lesson.publish',
        'copilot.use', 'copilot.scope.all',
        'graph.read',
        'analytics.read', 'analytics.export',
        'notif.manage',
        'user.manage', 'role.manage', 'ai.config', 'flag.manage', 'audit.read', 'tenant.manage'
      ]
    }
  },
  'manager@indusmind.io': {
    passwordHash: 'Demo@1234',
    user: {
      id: 'usr-manager',
      email: 'manager@indusmind.io',
      name: 'Rajesh Nair',
      role: 'Plant Manager',
      plant: 'Reliance Jamnagar Refinery - Sector A',
      featureFlags: {
        lessons_learned: true,
        predictive_maintenance: true,
        compliance_evidence_pack: true,
        advanced_analytics: false,
      },
      permissions: [
        'doc.read', 'doc.create',
        'equip.read',
        'wo.read', 'wo.create', 'wo.assign', 'wo.close', 'wo.export',
        'maint.schedule', 'predict.act',
        'rca.run',
        'comp.read',
        'qual.read',
        'lesson.read',
        'copilot.use',
        'graph.read',
        'analytics.read',
        'audit.read'
      ]
    }
  },
  'engineer@indusmind.io': {
    passwordHash: 'Demo@1234',
    user: {
      id: 'usr-engineer',
      email: 'engineer@indusmind.io',
      name: 'Priya Sharma',
      role: 'Maintenance Engineer',
      plant: 'Reliance Jamnagar Refinery - Sector A',
      featureFlags: {
        lessons_learned: true,
        predictive_maintenance: true,
        compliance_evidence_pack: false,
        advanced_analytics: false,
      },
      permissions: [
        'doc.read', 'doc.create',
        'equip.read',
        'wo.read', 'wo.create', 'wo.assign', 'wo.close',
        'maint.schedule', 'predict.act',
        'rca.run', 'rca.publish',
        'comp.read',
        'qual.read',
        'lesson.read',
        'copilot.use',
        'graph.read',
        'analytics.read'
      ]
    }
  },
  'tech@indusmind.io': {
    passwordHash: 'Demo@1234',
    user: {
      id: 'usr-tech',
      email: 'tech@indusmind.io',
      name: 'Arun Kumar',
      role: 'Field Technician',
      plant: 'Reliance Jamnagar Refinery - Sector A',
      featureFlags: {
        lessons_learned: true,
        predictive_maintenance: false,
        compliance_evidence_pack: false,
        advanced_analytics: false,
      },
      permissions: [
        'doc.read', 'doc.create',
        'equip.read',
        'wo.read', 'wo.close',
        'comp.read',
        'lesson.read',
        'copilot.use',
        'graph.read',
        'readings.record',
        'imports.run'
      ]
    }
  },
  'compliance@indusmind.io': {
    passwordHash: 'Demo@1234',
    user: {
      id: 'usr-compliance',
      email: 'compliance@indusmind.io',
      name: 'Meena Iyer',
      role: 'Compliance Officer',
      plant: 'Reliance Jamnagar Refinery - Sector A',
      featureFlags: {
        lessons_learned: false,
        predictive_maintenance: false,
        compliance_evidence_pack: true,
        advanced_analytics: false,
      },
      permissions: [
        'doc.read', 'doc.create',
        'equip.read',
        'wo.read',
        'comp.read', 'comp.map', 'comp.gap.manage', 'comp.evidence.generate',
        'qual.read',
        'lesson.read',
        'copilot.use',
        'graph.read',
        'audit.read'
      ]
    }
  }
};

export const MOCK_NAV_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    path: '/dashboard',
    icon: 'LayoutDashboard',
  },
  {
    id: 'copilot',
    title: 'Expert Copilot',
    path: '/copilot',
    icon: 'Bot',
    requiredPermission: 'copilot.use',
  },
  {
    id: 'documents',
    title: 'Documents Library',
    path: '/documents',
    icon: 'FileText',
    requiredPermission: 'doc.read',
  },
  {
    id: 'knowledge-graph',
    title: 'Knowledge Graph',
    path: '/knowledge-graph',
    icon: 'Network',
    requiredPermission: 'graph.read',
  },
  {
    id: 'equipment',
    title: 'Equipment 360°',
    path: '/equipment',
    icon: 'Cpu',
    requiredPermission: 'equip.read',
  },
  {
    id: 'maintenance',
    title: 'Work Orders',
    path: '/maintenance',
    icon: 'Wrench',
    requiredPermission: 'wo.read',
  },
  {
    id: 'compliance',
    title: 'Compliance Hub',
    path: '/compliance',
    icon: 'ShieldCheck',
    requiredPermission: 'comp.read',
  },
  {
    id: 'lessons-learned',
    title: 'Lessons Learned',
    path: '/lessons-learned',
    icon: 'Compass',
    requiredPermission: 'lesson.read',
  },
  {
    id: 'quality',
    title: 'Quality Management',
    path: '/quality',
    icon: 'ShieldAlert',
    requiredPermission: 'qual.read',
  },
  {
    id: 'notifications',
    title: 'Notifications Center',
    path: '/notifications',
    icon: 'Bell',
    requiredPermission: 'notif.manage',
  },
  {
    id: 'analytics',
    title: 'Operational Analytics',
    path: '/analytics',
    icon: 'BarChart3',
    requiredPermission: 'analytics.read',
  },
  {
    id: 'audit-log',
    title: 'Audit Logs',
    path: '/admin/audit-log',
    icon: 'History',
    requiredPermission: 'audit.read',
  }
];
