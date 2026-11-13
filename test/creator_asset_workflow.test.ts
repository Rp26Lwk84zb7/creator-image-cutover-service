import { describe, expect, it } from 'vitest';
import { publishCreatorAsset } from '../src/creator_asset_workflow.js';
import { InfraiClient } from '../src/infrai_client.js';

describe('publishCreatorAsset', () => {
  it('marks a replace-live cutover as ready and points rollback at the incumbent asset', async () => {
    const calls: Array<{ name: string; args: unknown[] }> = [];

    const infrai = {
      image: {
        compress: async (body: { image: string }) => {
          calls.push({ name: 'image.compress', args: [body] });
          return { data: { image: 'compressed-base64' }, metadata: {} };
        }
      },
      storage: {
        object: {
          put: async (bucket: string, key: string, body: { data_base64: string; content_type?: string; idempotency_key?: string }) => {
            calls.push({ name: 'storage.object.put', args: [bucket, key, body] });
            return { data: { bucket, key }, metadata: {} };
          },
          presign: async (bucket: string, key: string, body: { op: 'get' | 'put'; expires_seconds?: number; response_disposition?: string; idempotency_key?: string }) => {
            calls.push({ name: 'storage.object.presign', args: [bucket, key, body] });
            return { data: { url: `https://signed.example/${bucket}/${key}` }, metadata: {} };
          }
        }
      }
    } as unknown as InfraiClient;

    const result = await publishCreatorAsset(
      {
        creatorId: 'creator_77',
        dropId: 'drop_2048',
        filename: 'hero.webp',
        mimeType: 'image/webp',
        imageBase64: 'raw-base64',
        incumbentAssetKey: 'legacy/creator_77/drop_2048/hero.webp',
        publishMode: 'replace-live'
      },
      { infrai, deliveryBucket: 'creator-assets' }
    );

    expect(result.assetStatus).toBe('ready');
    expect(result.optimizedAssetKey).toBe('creator_77/drop_2048/hero.webp');
    expect(result.subscriberMessage.action).toBe('refresh_listing_image');
    expect(result.cutover.rollbackAssetKey).toBe('legacy/creator_77/drop_2048/hero.webp');

    expect(calls).toEqual([
      { name: 'image.compress', args: [{ image: 'raw-base64' }] },
      {
        name: 'storage.object.put',
        args: [
          'creator-assets',
          'creator_77/drop_2048/hero.webp',
          {
            data_base64: 'compressed-base64',
            content_type: 'image/webp',
            idempotency_key: 'creator_77:drop_2048:replace-live:creator_77/drop_2048/hero.webp'
          }
        ]
      },
      {
        name: 'storage.object.presign',
        args: [
          'creator-assets',
          'creator_77/drop_2048/hero.webp',
          {
            op: 'get',
            expires_seconds: 900,
            response_disposition: 'inline; filename="hero.webp"',
            idempotency_key: 'creator_77:drop_2048:replace-live:creator_77/drop_2048/hero.webp'
          }
        ]
      }
    ]);
  });
});
