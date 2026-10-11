import { render, screen } from '@testing-library/react';
import { MarkdownText } from '../../src/components/ai/MarkdownText';

describe('MarkdownText', () => {
  it('renders bold, italic and code inline', () => {
    const { container } = render(<MarkdownText text="Sie haben **8,5 Stunden** in *KW 40* mit `get_time_summary` erfasst." />);
    expect(screen.getByText('8,5 Stunden').tagName).toBe('STRONG');
    expect(screen.getByText('KW 40').tagName).toBe('EM');
    expect(screen.getByText('get_time_summary').tagName).toBe('CODE');
    expect(container.textContent).toContain('erfasst.');
  });

  it('renders bullet and numbered lists', () => {
    const { container } = render(<MarkdownText text={'Projekte:\n- Website\n- Wartung\n\n1. Erstens\n2. Zweitens'} />);
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('never renders HTML from the text', () => {
    const { container } = render(<MarkdownText text={'<img src=x onerror=alert(1)> **<b>x</b>**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
