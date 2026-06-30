/**
 * End-of-run overlay: shows the haul, offers to save the score (opens lead
 * capture), to share a branded OG card, and to play again. Also resolves a
 * head-to-head challenge ("beat 4,200") if the run answered one.
 */
import { palette, fonts, copy } from '../../brand/theme';
import type { CatchDef } from '../../content/catches';

export interface EndScreenModel {
  score: number;
  catches: number;
  topCatch?: CatchDef;
  saved: boolean;
  rank?: number;
  catchOfTheWeek?: boolean;
  challengeTarget?: number;
}

export interface EndScreenHandlers {
  onSave(): void;
  onShare(): void;
  onPlayAgain(): void;
}

export function renderEndScreen(
  host: HTMLElement,
  model: EndScreenModel,
  handlers: EndScreenHandlers,
): () => void {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    padding: '24px',
    background: 'rgba(31,52,63,0.6)',
    color: palette.mist,
    fontFamily: fonts.body,
    zIndex: '15',
    textAlign: 'center',
  });

  const title = document.createElement('h2');
  title.textContent = 'Your haul';
  Object.assign(title.style, { fontFamily: fonts.headline, fontSize: '24px', margin: '0' });
  overlay.appendChild(title);

  const score = document.createElement('div');
  score.textContent = model.score.toLocaleString();
  Object.assign(score.style, { fontFamily: fonts.headline, fontSize: '52px', lineHeight: '1', color: '#fff' });
  overlay.appendChild(score);

  const meta = document.createElement('div');
  meta.textContent = `${model.catches} catches${model.topCatch ? ` · best: ${model.topCatch.label}` : ''}`;
  Object.assign(meta.style, { fontSize: '14px', color: palette.powder });
  overlay.appendChild(meta);

  if (model.challengeTarget !== undefined) {
    const beat = model.score > model.challengeTarget;
    const ch = document.createElement('div');
    ch.textContent = beat
      ? `You beat the challenge of ${model.challengeTarget.toLocaleString()}.`
      : `${model.challengeTarget.toLocaleString()} to beat — so close. Cast again.`;
    Object.assign(ch.style, { fontSize: '14px', color: beat ? palette.sand : palette.powder });
    overlay.appendChild(ch);
  }

  if (model.saved) {
    const savedLine = document.createElement('div');
    savedLine.textContent = model.catchOfTheWeek
      ? 'Catch of the week — you top the board.'
      : model.rank
        ? `Saved · weekly rank #${model.rank}`
        : 'Saved to the weekly board.';
    Object.assign(savedLine.style, { fontSize: '15px', color: palette.sand, fontFamily: fonts.headline });
    overlay.appendChild(savedLine);
  } else {
    overlay.appendChild(
      diamondCta('Save my score', () => handlers.onSave()),
    );
    const hint = document.createElement('div');
    hint.textContent = 'Opt in to claim your spot on the weekly leaderboard.';
    Object.assign(hint.style, { fontSize: '12px', color: palette.powder, maxWidth: '260px' });
    overlay.appendChild(hint);
  }

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '12px', marginTop: '6px' });
  row.appendChild(ghostBtn('Share', () => handlers.onShare()));
  row.appendChild(ghostBtn('Play again', () => handlers.onPlayAgain()));
  overlay.appendChild(row);

  const footer = document.createElement('div');
  footer.textContent = copy.campaign;
  Object.assign(footer.style, { marginTop: '10px', fontFamily: fonts.headline, fontSize: '13px', color: palette.powder });
  overlay.appendChild(footer);

  host.appendChild(overlay);
  return () => overlay.remove();
}

function diamondCta(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  Object.assign(btn.style, {
    position: 'relative',
    padding: '15px 34px',
    border: 'none',
    cursor: 'pointer',
    background: palette.salmon,
    color: '#fff',
    fontFamily: fonts.headline,
    fontWeight: '600',
    fontSize: '16px',
    borderRadius: '8px',
    transform: 'skewX(-8deg)',
    boxShadow: '0 10px 24px rgba(255,120,122,0.4)',
  });
  const inner = document.createElement('span');
  inner.textContent = text;
  inner.style.display = 'inline-block';
  inner.style.transform = 'skewX(8deg)';
  btn.appendChild(inner);
  btn.addEventListener('click', onClick);
  return btn;
}

function ghostBtn(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  Object.assign(btn.style, {
    padding: '12px 20px',
    border: `1px solid ${palette.powder}`,
    background: 'transparent',
    color: palette.mist,
    fontFamily: fonts.body,
    fontSize: '15px',
    borderRadius: '9px',
    cursor: 'pointer',
  });
  btn.addEventListener('click', onClick);
  return btn;
}
