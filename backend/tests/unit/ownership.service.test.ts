import {
  assertOwnedReferences,
  findUnownedIds,
  ForeignReferenceError,
  invalidReferenceBody,
  isUuid,
  ownsRow,
} from '../../src/services/ownership.service';
import { getDbClient } from '../../src/utils/database';
import { TEST_USER_ID } from '../setup';

/**
 * The tenant check every create/update path relies on before it stores an id
 * taken from a request body.
 */
describe('ownership service', () => {
  const OTHER_ID = '223e4567-e89b-42d3-a456-426614174998';
  let ownClientId: string;
  let foreignClientId: string;

  beforeAll(async () => {
    const db = getDbClient();
    await db.query('DELETE FROM clients WHERE user_id = $1', [OTHER_ID]);
    ownClientId = (
      await db.query(`INSERT INTO clients (user_id, name) VALUES ($1, 'Own') RETURNING id`, [TEST_USER_ID])
    ).rows[0].id;
    foreignClientId = (
      await db.query(`INSERT INTO clients (user_id, name) VALUES ($1, 'Foreign') RETURNING id`, [OTHER_ID])
    ).rows[0].id;
  });

  afterAll(async () => {
    await getDbClient().query('DELETE FROM clients WHERE user_id = $1', [OTHER_ID]);
  });

  it('recognises UUIDs', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('reports foreign, unknown and malformed ids as not owned', async () => {
    const unowned = await findUnownedIds(
      'clients',
      [ownClientId, foreignClientId, '00000000-0000-4000-8000-000000000000', 'garbage', ownClientId],
      TEST_USER_ID
    );
    expect(unowned).toEqual([foreignClientId, '00000000-0000-4000-8000-000000000000', 'garbage']);
  });

  it('matches ids case-insensitively', async () => {
    expect(await ownsRow('clients', ownClientId.toUpperCase(), TEST_USER_ID)).toBe(true);
  });

  it('answers per user', async () => {
    expect(await ownsRow('clients', ownClientId, TEST_USER_ID)).toBe(true);
    expect(await ownsRow('clients', ownClientId, OTHER_ID)).toBe(false);
    expect(await ownsRow('clients', foreignClientId, OTHER_ID)).toBe(true);
  });

  it('skips empty references and names the first foreign one', async () => {
    await expect(
      assertOwnedReferences(
        [
          { table: 'clients', id: ownClientId, field: 'client_id' },
          { table: 'projects', id: null, field: 'project_id' },
          { table: 'tax_rates', id: undefined, field: 'tax_rate_id' },
          { table: 'invoice_text_templates', id: '', field: 'header_template_id' },
        ],
        TEST_USER_ID
      )
    ).resolves.toBeUndefined();

    const error = await assertOwnedReferences(
      [
        { table: 'clients', id: ownClientId, field: 'client_id' },
        { table: 'clients', id: foreignClientId, field: 'billing_client_id' },
      ],
      TEST_USER_ID
    ).catch((err) => err);

    expect(error).toBeInstanceOf(ForeignReferenceError);
    expect(invalidReferenceBody(error)).toEqual({
      error: 'Invalid reference',
      message: 'Invalid billing_client_id: referenced record not found',
      code: 'INVALID_REFERENCE',
      field: 'billing_client_id',
    });
  });
});
