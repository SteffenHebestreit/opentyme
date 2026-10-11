import { render } from '@testing-library/react';
import {
  SkeletonItem,
  SkeletonText,
  SkeletonCard,
  SkeletonCardList,
} from '../../src/components/common/Skeleton';

describe('Skeleton Components', () => {
  describe('SkeletonItem', () => {
    it('renders a hidden-from-assistive-tech placeholder div', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;
      expect(item.tagName).toBe('DIV');
      expect(item).toHaveAttribute('aria-hidden', 'true');
    });

    it('uses the shimmering skeleton style', () => {
      const { container } = render(<SkeletonItem />);
      expect((container.firstChild as HTMLElement).className).toContain('skeleton');
    });

    it('defaults to one text line', () => {
      const { container } = render(<SkeletonItem />);
      const item = container.firstChild as HTMLElement;
      expect(item.className).toContain('h-4');
      expect(item.className).toContain('w-full');
    });

    it('accepts custom size classes', () => {
      const { container } = render(<SkeletonItem className="h-8 w-1/2" />);
      const item = container.firstChild as HTMLElement;
      expect(item.className).toContain('h-8');
      expect(item.className).toContain('w-1/2');
      expect(item.className).not.toContain('w-full');
    });
  });

  describe('SkeletonText', () => {
    it('renders 3 lines by default', () => {
      const { container } = render(<SkeletonText />);
      expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
    });

    it('renders a custom number of lines', () => {
      const { container } = render(<SkeletonText lines={5} />);
      expect(container.querySelectorAll('.skeleton')).toHaveLength(5);
    });

    it('makes the last line shorter', () => {
      const { container } = render(<SkeletonText lines={3} />);
      const items = container.querySelectorAll('.skeleton');
      expect(items[2].className).toContain('w-3/4');
      expect(items[0].className).toContain('w-full');
      expect(items[1].className).toContain('w-full');
    });

    it('has default space-y-2 spacing and accepts a custom className', () => {
      const { container, rerender } = render(<SkeletonText />);
      expect((container.firstChild as HTMLElement).className).toContain('space-y-2');
      rerender(<SkeletonText className="space-y-4 p-4" />);
      expect((container.firstChild as HTMLElement).className).toContain('space-y-4');
      expect((container.firstChild as HTMLElement).className).toContain('p-4');
    });
  });

  describe('SkeletonCard', () => {
    it('renders a busy surface card', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('surface');
      expect(card).toHaveAttribute('aria-busy', 'true');
    });

    it('has a header, a 3-line body and a footer with two button placeholders', () => {
      const { container } = render(<SkeletonCard />);
      const card = container.firstChild as HTMLElement;
      const [header, body, footer] = Array.from(card.children) as HTMLElement[];
      expect(header.className).toContain('border-b');
      expect(body.querySelectorAll('.skeleton')).toHaveLength(3);
      expect(footer.className).toContain('border-t');
      expect(footer.querySelectorAll('.skeleton')).toHaveLength(2);
    });

    it('accepts custom className', () => {
      const { container } = render(<SkeletonCard className="custom-class" />);
      expect((container.firstChild as HTMLElement).className).toContain('custom-class');
    });
  });

  describe('SkeletonCardList', () => {
    it('renders 3 cards by default', () => {
      const { container } = render(<SkeletonCardList />);
      expect(container.querySelectorAll('.surface')).toHaveLength(3);
    });

    it('renders a custom number of cards, including none', () => {
      const { container, rerender } = render(<SkeletonCardList count={5} />);
      expect(container.querySelectorAll('.surface')).toHaveLength(5);
      rerender(<SkeletonCardList count={1} />);
      expect(container.querySelectorAll('.surface')).toHaveLength(1);
      rerender(<SkeletonCardList count={0} />);
      expect(container.querySelectorAll('.surface')).toHaveLength(0);
    });

    it('has default space-y-6 spacing and accepts a custom className', () => {
      const { container, rerender } = render(<SkeletonCardList />);
      expect((container.firstChild as HTMLElement).className).toContain('space-y-6');
      rerender(<SkeletonCardList className="space-y-4 p-4" />);
      expect((container.firstChild as HTMLElement).className).toContain('space-y-4');
    });
  });
});
