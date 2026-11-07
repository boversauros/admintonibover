import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FILTERS,
  FIRST_PAGE,
  postListQuery,
  turnPage,
} from '../components/admin/postListQuery';

test('default filters ask for the newest posts with no other constraint', () => {
  assert.deepEqual(postListQuery(DEFAULT_FILTERS, '', undefined, 10), {
    limit: 10,
    cursor: undefined,
    direction: 'descending',
  });
});

test('each filter maps to its list parameter', () => {
  assert.deepEqual(
    postListQuery(
      {
        status: 'draft',
        category: 'category-1',
        imageStatus: 'missing-main',
        sort: 'asc',
      },
      'mar',
      'cursor-2',
      10
    ),
    {
      limit: 10,
      cursor: 'cursor-2',
      direction: 'ascending',
      title: 'mar',
      published: false,
      categoryId: 'category-1',
      imageStatus: 'missing-main',
    }
  );
  assert.equal(
    postListQuery(
      { ...DEFAULT_FILTERS, status: 'published' },
      '',
      undefined,
      10
    ).published,
    true
  );
});

test('pages move forward only with a next cursor and back to pages already seen', () => {
  assert.equal(turnPage(FIRST_PAGE, 2, null), null);
  assert.equal(turnPage(FIRST_PAGE, 0, 'b'), null);

  const second = turnPage(FIRST_PAGE, 2, 'b');
  assert.deepEqual(second, { page: 2, cursors: [undefined, 'b'] });

  const third = turnPage(second!, 3, 'c');
  assert.deepEqual(third, { page: 3, cursors: [undefined, 'b', 'c'] });
  assert.equal(turnPage(third!, 5, 'd'), null);

  const back = turnPage(third!, 2, 'c');
  assert.deepEqual(back, { page: 2, cursors: [undefined, 'b', 'c'] });

  // Going forward again from a revisited page drops the cursors after it.
  assert.deepEqual(turnPage(back!, 3, 'c2'), {
    page: 3,
    cursors: [undefined, 'b', 'c2'],
  });
});
