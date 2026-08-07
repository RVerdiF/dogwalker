import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const deleteElements = vi.fn();

// Stub React Flow so the edge renders without the provider's node-measurement
// gate (which never runs in jsdom); we only care about the delete control's
// behavior, not the geometry.
vi.mock('@xyflow/react', () => ({
  BaseEdge: () => null,
  EdgeLabelRenderer: ({ children }: { children: ReactNode }) => <>{children}</>,
  getStraightPath: () => ['M0 0 L10 10', 5, 5],
  useInternalNode: () => ({
    internals: { positionAbsolute: { x: 0, y: 0 } },
    measured: { width: 100, height: 60 },
  }),
  useReactFlow: () => ({ deleteElements }),
}));

import { FloatingLeash } from './FloatingLeash';

const props = { id: 'e1', source: 'a', target: 'b' } as unknown as Parameters<typeof FloatingLeash>[0];

describe('FloatingLeash', () => {
  it('offers a remove control that deletes the connection', () => {
    render(<FloatingLeash {...props} />);
    const btn = screen.getByRole('button', { name: /remove connection/i });
    fireEvent.click(btn);
    // Routing deletion through React Flow fires onEdgesDelete, which disconnects
    // the pair in the broker.
    expect(deleteElements).toHaveBeenCalledWith({ edges: [{ id: 'e1' }] });
  });
});
