import test from 'node:test';
import assert from 'node:assert/strict';

import { getQuote } from '../src/vinlinkAssistantGateway.js';

test('quote preserves multiple destinations in caller order', async () => {
  process.env.VINLINK_ASSISTANT_MODE = 'mock';
  const response = await getQuote({
    tool_name: 'vinlink_get_quote',
    invocation_id: 'test-multi-destination',
    arguments: {
      service_id: 1,
      pickup_address: '90 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
      destination_addresses: [
        '136 Hồ Tùng Mậu, Hà Nội',
        'Sân bay Nội Bài, Sóc Sơn, Hà Nội',
      ],
    },
  });

  assert.equal(response.success, true);
  assert.deepEqual(
    response.result.dropoffs.map((place) => place.address),
    ['136 Hồ Tùng Mậu, Hà Nội', 'Sân bay Nội Bài, Sóc Sơn, Hà Nội'],
  );
});

test('quote remains backward compatible with one destination', async () => {
  process.env.VINLINK_ASSISTANT_MODE = 'mock';
  const response = await getQuote({
    tool_name: 'vinlink_get_quote',
    invocation_id: 'test-single-destination',
    arguments: {
      service_id: 2,
      pickup_address: '90 Hoàng Quốc Việt, Cầu Giấy, Hà Nội',
      destination_address: '136 Hồ Tùng Mậu, Hà Nội',
    },
  });

  assert.equal(response.success, true);
  assert.equal(response.result.dropoffs.length, 1);
  assert.equal(response.result.dropoffs[0].address, '136 Hồ Tùng Mậu, Hà Nội');
});
