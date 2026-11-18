import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { TripMenu, type TripMenuItem } from '../../components/new/trips/TripMenu';
import { Suitcase } from '../../components/ui/hugeicons';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const items = (n = 12): TripMenuItem[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `item-${i}`,
        label: `Action ${i + 1}`,
        icon: Suitcase,
        onSelect: vi.fn(),
    }));

const mount = (el: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(el); });
    return {
        container,
        unmount: () => {
            act(() => { root.unmount(); });
            container.remove();
        },
    };
};

describe('TripMenu scrolling behavior', () => {
    it('stays open when scrolling inside the menu and prevents wheel scroll chaining at boundaries', () => {
        const { container, unmount } = mount(
            React.createElement(TripMenu, { label: 'Trip actions', items: items(12) }),
        );

        const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement;
        act(() => { trigger.click(); });

        const menu = document.body.querySelector('[role="menu"]') as HTMLElement | null;
        expect(menu).toBeTruthy();

        // Simulate scrolling inside the menu itself: menu must stay open
        Object.defineProperty(menu!, 'scrollHeight', { value: 600, configurable: true });
        Object.defineProperty(menu!, 'clientHeight', { value: 400, configurable: true });
        Object.defineProperty(menu!, 'scrollTop', { value: 50, writable: true, configurable: true });

        act(() => {
            menu!.dispatchEvent(new Event('scroll', { bubbles: false }));
        });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        // Wheel inside scrollable room: allowed (not prevented)
        const midWheel = new WheelEvent('wheel', { deltaY: 40, cancelable: true });
        act(() => { menu!.dispatchEvent(midWheel); });
        expect(midWheel.defaultPrevented).toBe(false);

        // Wheel past bottom edge: prevented so the page underneath never scrolls
        menu!.scrollTop = 200;
        const bottomWheel = new WheelEvent('wheel', { deltaY: 40, cancelable: true });
        act(() => { menu!.dispatchEvent(bottomWheel); });
        expect(bottomWheel.defaultPrevented).toBe(true);

        // Scrolling an external page container still closes the menu
        const page = document.createElement('div');
        document.body.appendChild(page);
        act(() => {
            page.dispatchEvent(new Event('scroll', { bubbles: false }));
        });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        page.remove();
        unmount();
    });
});
