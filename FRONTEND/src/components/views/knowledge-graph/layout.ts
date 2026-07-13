import { GraphNodeData, GraphEdgeData } from './mockData';

export interface PositionedNode {
  id: string;
  data: GraphNodeData;
  position: { x: number; y: number };
}

export function computeLayout(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  type: 'force' | 'hierarchical' | 'grid'
): PositionedNode[] {
  if (type === 'hierarchical') {
    return computeHierarchicalLayout(nodes, edges);
  } else if (type === 'grid') {
    return computeGridLayout(nodes);
  } else {
    return computeForceLayout(nodes, edges);
  }
}

// 1. Hierarchical Level-Based Layout
function computeHierarchicalLayout(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[]
): PositionedNode[] {
  // Determine ranks/layers based on Node Type (Industrial Flow)
  // Top-to-Bottom structure:
  // Layer 0: People
  // Layer 1: Regulation / Codes
  // Layer 2: Equipment (Core physical layer)
  // Layer 3: Parameters & Procedures
  // Layer 4: FailureEvents & Document reports
  // Layer 5: FailureModes & Lessons Learned
  const typeLayers: Record<string, number> = {
    Person: 0,
    Regulation: 1,
    Equipment: 2,
    Parameter: 3,
    Procedure: 3,
    FailureEvent: 4,
    Document: 4,
    FailureMode: 5,
    Lesson: 5,
  };

  const layers: Record<number, GraphNodeData[]> = {};
  for (let i = 0; i <= 5; i++) {
    layers[i] = [];
  }

  nodes.forEach(node => {
    const layerIdx = typeLayers[node.type] !== undefined ? typeLayers[node.type] : 2;
    layers[layerIdx].push(node);
  });

  const positioned: PositionedNode[] = [];
  const startY = 100;
  const rowHeight = 160;
  const colWidth = 240;

  Object.keys(layers).forEach(layerStr => {
    const layerIdx = parseInt(layerStr, 10);
    const rowNodes = layers[layerIdx];
    const totalRowWidth = (rowNodes.length - 1) * colWidth;
    const startX = -totalRowWidth / 2;

    rowNodes.forEach((node, colIdx) => {
      positioned.push({
        id: node.id,
        data: node,
        position: {
          x: startX + colIdx * colWidth,
          y: startY + layerIdx * rowHeight,
        },
      });
    });
  });

  return positioned;
}

// 2. Simple Grid Layout
function computeGridLayout(nodes: GraphNodeData[]): PositionedNode[] {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacingX = 260;
  const spacingY = 150;

  return nodes.map((node, idx) => {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    return {
      id: node.id,
      data: node,
      position: {
        x: (col - cols / 2) * spacingX,
        y: row * spacingY,
      },
    };
  });
}

// 3. Organic Force-Directed Layout Simulation
function computeForceLayout(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[]
): PositionedNode[] {
  // Initialize nodes randomly in a central cluster
  const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
  
  nodes.forEach((node, idx) => {
    // Distribute initially in a small spiral
    const angle = idx * 0.4;
    const r = 40 + idx * 12;
    pos[node.id] = {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      vx: 0,
      vy: 0,
    };
  });

  const iterations = 80;
  const kRepulsion = 140000; // Repulsion constant
  const kAttraction = 0.08;   // Spring constant
  const d0 = 180;             // Desired spring length
  const gravity = 0.03;       // Gravity toward center (0,0)
  const damping = 0.85;       // Friction

  for (let iter = 0; iter < iterations; iter++) {
    // A. Node Repulsion (push away from each other)
    for (let i = 0; i < nodes.length; i++) {
      const uId = nodes[i].id;
      const u = pos[uId];
      if (!u) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const vId = nodes[j].id;
        const v = pos[vId];
        if (!v) continue;

        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const distSq = dx * dx + dy * dy + 0.1; // avoid divide by zero
        const dist = Math.sqrt(distSq);

        if (dist < 500) {
          // Stronger repulsion when closer
          const force = kRepulsion / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          u.vx += fx;
          u.vy += fy;
          v.vx -= fx;
          v.vy -= fy;
        }
      }
    }

    // B. Edge Attraction (connected nodes pull together)
    edges.forEach(edge => {
      const u = pos[edge.source];
      const v = pos[edge.target];
      if (!u || !v) return;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
      
      const force = kAttraction * (dist - d0);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      u.vx += fx;
      u.vy += fy;
      v.vx -= fx;
      v.vy -= fy;
    });

    // C. Gravity & Position Updates
    for (const id in pos) {
      const p = pos[id];
      
      // Pull toward center (0, 0)
      p.vx -= p.x * gravity;
      p.vy -= p.y * gravity;

      // Update positions with damping
      p.x += p.vx;
      p.y += p.vy;
      
      p.vx *= damping;
      p.vy *= damping;
    }
  }

  // Map back to react flow positioned format
  return nodes.map(node => {
    const p = pos[node.id];
    return {
      id: node.id,
      data: node,
      position: {
        x: Math.round(p.x * 1.5),
        y: Math.round(p.y * 1.5),
      },
    };
  });
}
