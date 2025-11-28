import { render, screen } from '@testing-library/react';
import {
  SkeletonItem,
  SkeletonText,
  SkeletonCard,
  SkeletonCardList,
} from '../../src/components/common/Skeleton';

describe('Skeleton Components', () => {
  describe('SkeletonItem', () => {
    it('renders a skeleton item', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;

      expect(item).toBeInTheDocument();
      expect(item.tagName).toBe('DIV');
    });

    it('has animate-pulse class', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;

      expect(item.className).toContain('animate-pulse');
    });

    it('has default height and width classes', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;

      expect(item.className).toContain('h-4');
      expect(item.className).toContain('w-full');
    });

    it('accepts custom className', () => {
      const { container } = render(<SkeletonItem className="h-8 w-1/2" />);
      const item = container.firstChild as HTMLElement;

      expect(item.className).toContain('h-8');
      expect(item.className).toContain('w-1/2');
    });

    it('has rounded corners', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;

      expect(item.className).toContain('rounded');
    });

    it('has background color classes', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;

      expect(item.className).toContain('bg-gray-200');
      expect(item.className).toContain('dark:bg-gray-700');
    });
  });

  describe('SkeletonText', () => {
    it('renders default 3 lines', () => {
      const { container } = render(<SkeletonText />);
      const items = container.querySelectorAll('.animate-pulse');

      expect(items).toHaveLength(3);
    });

    it('renders custom number of lines', () => {
      const { container } = render(<SkeletonText lines={5} />);
      const items = container.querySelectorAll('.animate-pulse');

      expect(items).toHaveLength(5);
    });

    it('last line is shorter (3/4 width)', () => {
      const { container } = render(<SkeletonText lines={3} />);
      const items = container.querySelectorAll('.animate-pulse');
      const lastItem = items[items.length - 1] as HTMLElement;

      expect(lastItem.className).toContain('w-3/4');
    });

    it('non-last lines are full width', () => {
      const { container } = render(<SkeletonText lines={3} />);
      const items = container.querySelectorAll('.animate-pulse');
      const firstItem = items[0] as HTMLElement;
      const secondItem = items[1] as HTMLElement;

      expect(firstItem.className).toContain('w-full');
      expect(secondItem.className).toContain('w-full');
    });

    it('has default space-y-2 className', () => {
      const { container } = render(<SkeletonText />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper.className).toContain('space-y-2');
    });

    it('accepts custom className', () => {
      const { container } = render(<SkeletonText className="space-y-4 p-4" />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper.className).toContain('space-y-4');
      expect(wrapper.className).toContain('p-4');
    });
  });

  describe('SkeletonCard', () => {
    it('renders a skeleton card', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstChild as HTMLElement;

      expect(card).toBeInTheDocument();
    });

    it('has card styling classes', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstChild as HTMLElement;

      expect(card.className).toContain('bg-white');
      expect(card.className).toContain('dark:bg-gray-800');
      expect(card.className).toContain('shadow');
      expect(card.className).toContain('rounded-lg');
    });

    it('renders card header skeleton', () => {
      const { container } = render(<SkeletonCard />);
      const header = container.querySelector('.border-b');

      expect(header).toBeInTheDocument();
      expect(header?.className).toContain('px-6');
      expect(header?.className).toContain('py-4');
    });

    it('renders card body skeleton with 3 text lines', () => {
      const { container } = render(<SkeletonCard />);
      const body = container.querySelectorAll('.px-6.py-4')[1]; // Second px-6 py-4 is the body

      expect(body).toBeInTheDocument();
      
      // Body should contain SkeletonText with 3 lines
      const skeletonItems = body.querySelectorAll('.animate-pulse');
      expect(skeletonItems.length).toBeGreaterThan(0);
    });

    it('renders card footer skeleton', () => {
      const { container } = render(<SkeletonCard />);
      const footer = container.querySelector('.border-t');

      expect(footer).toBeInTheDocument();
      expect(footer?.className).toContain('bg-gray-50');
      expect(footer?.className).toContain('dark:bg-gray-900\\/30');
    });

    it('footer contains button skeletons', () => {
      const { container } = render(<SkeletonCard />);
      const footer = container.querySelector('.border-t');
      const buttons = footer?.querySelectorAll('.h-8');

      expect(buttons?.length).toBe(2);
    });

    it('accepts custom className', () => {
      const { container } = render(<SkeletonCard className="custom-class" />);
      const card = container.firstChild as HTMLElement;

      expect(card.className).toContain('custom-class');
    });

    it('header has border styling', () => {
      const { container } = render(<SkeletonCard />);
      const header = container.querySelector('.border-b');

      expect(header?.className).toContain('border-gray-200');
      expect(header?.className).toContain('dark:border-gray-700');
    });
  });

  describe('SkeletonCardList', () => {
    it('renders default 3 skeleton cards', () => {
      const { container } = render(<SkeletonCardList />);
      const cards = container.querySelectorAll('.shadow.rounded-lg');

      expect(cards).toHaveLength(3);
    });

    it('renders custom number of cards', () => {
      const { container } = render(<SkeletonCardList count={5} />);
      const cards = container.querySelectorAll('.shadow.rounded-lg');

      expect(cards).toHaveLength(5);
    });

    it('renders single card', () => {
      const { container } = render(<SkeletonCardList count={1} />);
      const cards = container.querySelectorAll('.shadow.rounded-lg');

      expect(cards).toHaveLength(1);
    });

    it('has default space-y-6 className', () => {
      const { container } = render(<SkeletonCardList />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper.className).toContain('space-y-6');
    });

    it('accepts custom className', () => {
      const { container } = render(<SkeletonCardList className="space-y-4 p-4" />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper.className).toContain('space-y-4');
      expect(wrapper.className).toContain('p-4');
    });

    it('each card has proper spacing', () => {
      const { container } = render(<SkeletonCardList count={2} />);
      const wrapper = container.firstChild as HTMLElement;

      expect(wrapper.className).toContain('space-y-6');
    });

    it('renders no cards when count is 0', () => {
      const { container } = render(<SkeletonCardList count={0} />);
      const cards = container.querySelectorAll('.shadow.rounded-lg');

      expect(cards).toHaveLength(0);
    });
  });

  describe('Dark mode support', () => {
    it('SkeletonItem has dark mode background', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;

      expect(item.className).toContain('dark:bg-gray-700');
    });

    it('SkeletonCard has dark mode styling', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstChild as HTMLElement;

      expect(card.className).toContain('dark:bg-gray-800');
    });

    it('SkeletonCard header has dark border', () => {
      const { container } = render(<SkeletonCard />);
      const header = container.querySelector('.border-b');

      expect(header?.className).toContain('dark:border-gray-700');
    });

    it('SkeletonCard footer has dark background', () => {
      const { container } = render(<SkeletonCard />);
      const footer = container.querySelector('.border-t');

      expect(footer?.className).toContain('dark:bg-gray-900\\/30');
    });
  });
});
