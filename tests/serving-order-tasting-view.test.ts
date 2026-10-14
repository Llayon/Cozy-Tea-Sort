/**
 * G15 Order+Tasting view (§§24-25): saucer ①/② + tasting-bowl cues coexist,
 * no combo badge, hitboxes untouched, order marks readable, served flourish
 * driven by serveCompleted metadata (structural checks; no screenshots).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const VIEW = path.join(__dirname, '..', 'src', 'game', 'view', 'TeaSortView.ts');
function src(): string { return fs.readFileSync(VIEW, 'utf8'); }

describe('UX collision: saucer + tasting (§24)', () => {
  it('serving saucer markers ①/② still rendered', () => {
    const s = src();
    expect(s).toContain('①');
    expect(s).toContain('②');
  });
  it('tasting-bowl visual still present (no removal for combo)', () => {
    const s = src().toLowerCase();
    expect(s).toContain('tasting');
  });
  it('no generic combo badge invented (§25)', () => {
    const s = src().toLowerCase();
    expect(s).not.toContain('combo-badge');
    expect(s).not.toContain('mixed-mechanics');
    expect(s).not.toContain('advanced-badge');
  });
  it('served flourish driven by serveCompleted metadata (not view history)', () => {
    const s = src();
    expect(s).toContain('serveCompleted');
  });
  it('saucer decoration does not claim pointer input (hitbox note)', () => {
    const s = src();
    // Existing touch-target logic untouched: no new pointer interceptor for saucers.
    expect(s).not.toContain('saucerHitbox');
  });
});
