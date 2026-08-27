import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countImageInventory,
  imageInventoryStatus,
} from '../lib/domain/media/contracts';

const present = { key: 'present' };

test('image inventory states are exclusive for every slot combination', () => {
  assert.equal(
    imageInventoryStatus({ mainImage: present, thumbImage: present }),
    'complete'
  );
  assert.equal(
    imageInventoryStatus({ mainImage: null, thumbImage: present }),
    'missing-main'
  );
  assert.equal(
    imageInventoryStatus({ mainImage: present, thumbImage: null }),
    'missing-thumbnail'
  );
  assert.equal(
    imageInventoryStatus({ mainImage: null, thumbImage: null }),
    'missing-both'
  );
});

test('image inventory counts exactly match the four fixture combinations', () => {
  assert.deepEqual(
    countImageInventory([
      { mainImage: present, thumbImage: present },
      { mainImage: null, thumbImage: present },
      { mainImage: present, thumbImage: null },
      { mainImage: null, thumbImage: null },
      { mainImage: null, thumbImage: null },
    ]),
    {
      complete: 1,
      'missing-main': 1,
      'missing-thumbnail': 1,
      'missing-both': 2,
    }
  );
});
