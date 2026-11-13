import { z } from 'zod';
import { InfraiClient } from './infrai_client.js';

export const publishCreatorAssetSchema = z.object({
  creatorId: z.string().min(1),
  dropId: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  imageBase64: z.string().min(1),
  incumbentAssetKey: z.string().min(1),
  publishMode: z.enum(['shadow', 'replace-live'])
});

export type PublishCreatorAssetInput = z.infer<typeof publishCreatorAssetSchema>;

export type PublishCreatorAssetResult = {
  assetStatus: 'shadow' | 'ready';
  optimizedAssetKey: string;
  deliveryUrl: string;
  subscriberMessage: {
    topic: 'creator-asset-updates';
    action: 'review_shadow_asset' | 'refresh_listing_image';
    creatorId: string;
    dropId: string;
    assetKey: string;
  };
  cutover: {
    provider: 'infrai';
    rollbackAssetKey: string;
  };
};

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'img';
}

function buildOptimizedAssetKey(input: PublishCreatorAssetInput): string {
  const extension = input.mimeType === 'image/webp' ? 'webp' : extensionFromMime(input.mimeType);
  return `${input.creatorId}/${input.dropId}/hero.${extension}`;
}

function makeIdempotencyKey(input: PublishCreatorAssetInput, assetKey: string): string {
  return `${input.creatorId}:${input.dropId}:${input.publishMode}:${assetKey}`;
}

export async function publishCreatorAsset(
  rawInput: unknown,
  deps: { infrai: InfraiClient; deliveryBucket: string }
): Promise<PublishCreatorAssetResult> {
  const input = publishCreatorAssetSchema.parse(rawInput);
  const optimizedAssetKey = buildOptimizedAssetKey(input);
  const idempotencyKey = makeIdempotencyKey(input, optimizedAssetKey);

  const compressed = await deps.infrai.image.compress({ image: input.imageBase64 });

  await deps.infrai.storage.object.put(deps.deliveryBucket, optimizedAssetKey, {
    data_base64: compressed.data.image,
    content_type: input.mimeType,
    idempotency_key: idempotencyKey
  });

  const signed = await deps.infrai.storage.object.presign(deps.deliveryBucket, optimizedAssetKey, {
    op: 'get',
    expires_seconds: 900,
    response_disposition: `inline; filename="${input.filename}"`,
    idempotency_key: idempotencyKey
  });

  const live = input.publishMode === 'replace-live';

  return {
    assetStatus: live ? 'ready' : 'shadow',
    optimizedAssetKey,
    deliveryUrl: signed.data.url,
    subscriberMessage: {
      topic: 'creator-asset-updates',
      action: live ? 'refresh_listing_image' : 'review_shadow_asset',
      creatorId: input.creatorId,
      dropId: input.dropId,
      assetKey: optimizedAssetKey
    },
    cutover: {
      provider: 'infrai',
      rollbackAssetKey: input.incumbentAssetKey
    }
  };
}
