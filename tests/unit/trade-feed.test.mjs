import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatAssetList, renderOfferCard } from '../../src/trade/feed-ui.js';

describe('trade feed UI', () => {
  it('formats asset lists readably', () => {
    assert.equal(formatAssetList([{ asset: 'RB', qty: 1 }]), '1× RB');
  });

  it('renders offer cards without JSON blobs', () => {
    const html = renderOfferCard(
      {
        id: 'o1',
        fromParticipantId: 'p1',
        give: [{ asset: 'RB', qty: 1 }],
        want: [{ asset: 'WR', qty: 1 }],
        state: 'agreed',
      },
      { p1: { name: 'Alpha Bot' } },
    );
    assert.match(html, /Alpha Bot/);
    assert.match(html, /1× RB/);
    assert.match(html, /Agreed/);
    assert.doesNotMatch(html, /\[\{/);
  });
});
